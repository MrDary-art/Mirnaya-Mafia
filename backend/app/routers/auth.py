from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.deployment_security import rate_limit
from sqlalchemy import and_, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.models import User, UserInventory, AppSetting
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
    identifiers = {body.username, body.login}
    if any(identifier.casefold() in {"admin", "administrator", "root"} for identifier in identifiers):
        raise HTTPException(400, "Это имя зарезервировано для администратора")
    exists = await db.scalar(select(User.id).where(or_(
        User.username.in_(identifiers),
        User.login.in_(identifiers),
        User.email.in_(identifiers),
    )))
    if exists:
        raise HTTPException(400, "Никнейм или логин уже занят")
    if body.avatar_code not in FREE_AVATARS:
        raise HTTPException(400, "Выберите один из стартовых аватаров")
    if body.company_details is not None and body.registration_kind != "company":
        raise HTTPException(422, "Выберите создание компании")
    if body.registration_kind == "company" and len((body.full_name or "").split()) < 2:
        raise HTTPException(422, "Укажите фамилию и имя; отчество — если есть")
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
        email = normalized_email(body.email) if body.email else None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    if email and await db.scalar(select(User.id).where(or_(
        User.email == email,
        User.username == email,
        User.login == email,
    ))):
        raise HTTPException(409, "Этот адрес уже занят")
    name_parts = (body.full_name or "").split(maxsplit=2)
    last_name = (body.last_name or "").strip() or (name_parts[0] if len(name_parts) > 1 else None)
    first_name = (body.first_name or "").strip() or (name_parts[1] if len(name_parts) > 1 else (name_parts[0] if name_parts else None))
    middle_name = (body.middle_name or "").strip() or (name_parts[2] if len(name_parts) > 2 else None)
    user = User(
        username=body.username,
        login=body.login,
        password_hash=hash_password(body.password),
        avatar_code=body.avatar_code,
        email=email,
        last_name=last_name,
        first_name=first_name,
        middle_name=middle_name,
        display_name=body.full_name or " ".join(filter(None, [last_name, first_name, middle_name])) or None,
    )
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
    identifier = body.username.strip()
    identity_match = or_(
        User.login == identifier,
        and_(User.login.is_(None), User.username == identifier),
    )
    user = await db.scalar(select(User).where(identity_match))
    if user is None and mail_enabled(config) and "@" in identifier:
        user = await db.scalar(select(User).where(
            User.email == identifier.casefold(),
            User.email_verified_at.is_not(None),
        ))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    if user.is_admin:
        request.state.admin_actor_id=user.id
        from app.admin_security import audit
        audit(db,user.id,"admin.login",request)
        await db.commit()
    if await db.get(AppSetting, f"account_deleted:{user.id}"):
        raise HTTPException(401, "Неверный логин или пароль")
    if body.portal:
        from app.company_models import CompanyMembership
        company_id = await db.scalar(select(CompanyMembership.company_id).join(
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
    challenge_id: str = Field(default="",max_length=36)
    code: str = Field(default="",max_length=6,repr=False)


@router.post("/password")
async def change_password(body: PasswordChange, request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rate_limit("password-change", user.id, 6, 60)
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(403, "Текущий пароль неверен")
    if user.is_admin and not verify_password("admin",user.password_hash):
        from app.routers.admin_settings import consume
        await consume(db,user,body.challenge_id,body.code,"password",password=body.password)
    if user.is_admin:
        from app.admin_security import audit
        audit(db,user.id,"admin.password_changed",request)
    user.password_hash = hash_password(body.password)
    await db.commit()
    return token_payload(user)
