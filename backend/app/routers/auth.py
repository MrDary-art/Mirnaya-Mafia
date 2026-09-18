from fastapi import APIRouter, Depends, HTTPException
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
        access_token=create_token(user.id, user.username),
        username=user.username,
        is_admin=bool(user.is_admin),
        level=user.level,
        stars=user.stars,
        xp=user.xp,
    )


@router.post("/register", response_model=TokenOut)
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    exists = await db.scalar(select(User).where(User.username == body.username))
    if exists:
        raise HTTPException(400, "Имя уже занято")
    if body.avatar_code not in FREE_AVATARS:
        raise HTTPException(400, "Выберите один из стартовых аватаров")
    user = User(username=body.username, password_hash=hash_password(body.password), avatar_code=body.avatar_code)
    db.add(user)
    await db.flush()
    user.arena_id = f"ARENA-{user.id:05d}"
    db.add(UserInventory(user_id=user.id, item_code=body.avatar_code, category="avatar"))
    await db.commit()
    await db.refresh(user)
    return token_payload(user)


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
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
        "level": user.level,
        "stars": user.stars,
        "xp": user.xp,
    }
