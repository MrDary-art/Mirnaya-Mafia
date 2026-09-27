from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.deployment_security import rate_limit
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.models import User, UserInventory
from app.features.progression import FREE_AVATARS
from app.schemas import LoginIn, RegisterIn, TokenOut

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
    user = User(username=body.username, password_hash=hash_password(body.password), avatar_code=body.avatar_code)
    db.add(user)
    await db.flush()
    user.arena_id = f"ARENA-{user.id:05d}"
    db.add_all([
        UserInventory(user_id=user.id, item_code=body.avatar_code, category="avatar"),
        UserInventory(user_id=user.id, item_code="frame_classic", category="frame"),
        UserInventory(user_id=user.id, item_code="theme_arena", category="theme"),
    ])
    await db.commit()
    await db.refresh(user)
    return token_payload(user)


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("login", request.client.host if request.client else "unknown", 15, 60)
    user = await db.scalar(select(User).where(User.username == body.username))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    return token_payload(user)


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
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
