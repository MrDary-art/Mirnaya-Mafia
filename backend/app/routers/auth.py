from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.deployment_security import rate_limit
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.models import User, UserInventory
from app.features.progression import FREE_AVATARS
from app.schemas import LoginIn, RegisterIn, TokenOut
from app.installation import read_config
from app.mail_service import issue_token, mail_enabled, normalized_email
from app.company_models import Company
from app.company_registration import submit_application, create_company_workspace

router = APIRouter(prefix="/auth", tags=["auth"])


def token_payload(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_token(user.id, user.username, user.password_hash),
        username=user.username,
        is_admin=bool(user.is_admin),
        level=user.level,
        stars=user.stars,
        xp=user.xp,
    )


@router.post("/register", response_model=TokenOut)
async def register(body: RegisterIn, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("register", request.client.host if request.client else "unknown", 6, 60)
    if body.username.strip().casefold() in {"admin", "administrator", "root"}:
        raise HTTPException(400, "Это имя зарезервировано для администратора")
    exists = await db.scalar(select(User).where(User.username == body.username))
    if exists:
        raise HTTPException(400, "Имя уже занято")
    if body.avatar_code not in FREE_AVATARS:
        raise HTTPException(400, "Выберите один из стартовых аватаров")
    if body.company_details is not None and body.registration_kind != "company":
        raise HTTPException(422, "Выберите создание компании")
    company = None
    if body.registration_kind == "company" and not (body.email or "").strip():
        raise HTTPException(422, "Для создания компании укажите электронную почту")
    if body.registration_kind == "participant":
        company = await db.scalar(select(Company).where(
            Company.join_code == (body.company_code or "").upper(), Company.status == "ACTIVE"))
        if company is None:
            raise HTTPException(422, "Проверьте код компании: он должен содержать 10 символов")
    _, config = await read_config(db)
    try:
        email = normalized_email(body.email) if body.email and (mail_enabled(config) or body.registration_kind == "company") else None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    if email and await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Этот адрес уже занят")
    name_parts = (body.full_name or "").split(maxsplit=2)
    user = User(username=body.username, password_hash=hash_password(body.password), avatar_code=body.avatar_code, email=email,
        display_name=body.full_name, first_name=name_parts[1] if len(name_parts) > 1 else (name_parts[0] if name_parts else None),
        last_name=name_parts[0] if len(name_parts) > 1 else None, middle_name=name_parts[2] if len(name_parts) > 2 else None)
    db.add(user)
    await db.flush()
    user.arena_id = f"ARENA-{user.id:05d}"
    db.add_all([
        UserInventory(user_id=user.id, item_code=body.avatar_code, category="avatar"),
        UserInventory(user_id=user.id, item_code="frame_classic", category="frame"),
        UserInventory(user_id=user.id, item_code="theme_arena", category="theme"),
    ])
    if company is not None:
        await submit_application(db, company, user)
    workspace = None
    if body.company_details is not None:
        workspace = await create_company_workspace(db, user, **body.company_details.model_dump())
    if email and mail_enabled(config):
        from app.config import settings
        await issue_token(db, user.id, "verify", email, settings.public_base_url or str(request.base_url))
    await db.commit()
    await db.refresh(user)
    return token_payload(user).model_copy(update={"company_id": workspace.id if workspace else None})


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("login", request.client.host if request.client else "unknown", 15, 60)
    _, config = await read_config(db)
    if mail_enabled(config) and "@" in body.username:
        user = await db.scalar(select(User).where(or_(User.username == body.username,
            (User.email == body.username.strip().casefold()) & User.email_verified_at.is_not(None))))
    else:
        user = await db.scalar(select(User).where(User.username == body.username))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    if body.portal:
        from app.company_models import CompanyMembership
        owned_company_id = await db.scalar(select(Company.id).join(CompanyMembership, CompanyMembership.company_id == Company.id).where(
            Company.created_by == user.id, Company.status == "ACTIVE", CompanyMembership.user_id == user.id,
            CompanyMembership.status == "ACTIVE").order_by(Company.id))
        if body.portal == "personal" and owned_company_id:
            raise HTTPException(403, "Вы создатель компании. Выберите вход для руководителей.")
        if body.portal == "company" and not owned_company_id:
            raise HTTPException(403, "Этот вход для создателей компаний. Для личной Арены и сотрудников выберите вход для участников.")
        company_id = owned_company_id if body.portal == "company" else await db.scalar(select(CompanyMembership.company_id).join(
            Company, Company.id == CompanyMembership.company_id).where(CompanyMembership.user_id == user.id,
            CompanyMembership.status == "ACTIVE", Company.status == "ACTIVE").order_by(CompanyMembership.is_primary.desc(), CompanyMembership.id))
        return token_payload(user).model_copy(update={"company_id": company_id})
    return token_payload(user)


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "middle_name": user.middle_name,
        "email": user.email,
        "email_verified": bool(user.email_verified_at),
        "is_admin": bool(user.is_admin),
        "must_change_password": bool(user.is_admin and verify_password("admin", user.password_hash)),
        "level": user.level,
        "stars": user.stars,
        "xp": user.xp,
        "avatar_code": user.avatar_code,
        "frame_code": user.frame_code,
    }


class PasswordChange(BaseModel):
    current: str = Field(max_length=512)
    password: str = Field(min_length=12, max_length=512)


@router.post("/password")
async def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rate_limit("password-change", user.id, 6, 60)
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(403, "Текущий пароль неверен")
    user.password_hash = hash_password(body.password)
    await db.commit()
    return token_payload(user)
