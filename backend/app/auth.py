import json
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import AppSetting, DirectMessage, Friendship, Notification, User, UserInventory

pwd = PasswordHash.recommended()
oauth2 = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def hash_password(password: str) -> str:
    return pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd.verify(password, password_hash)


def create_token(user_id: int, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


async def get_current_user(token: str = Depends(oauth2), db: AsyncSession = Depends(get_db)) -> User:
    cred = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не авторизован")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError) as exc:
        raise cred from exc
    user = await db.get(User, user_id)
    if not user:
        raise cred
    return user


async def get_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Нужны права администратора")
    return user


async def seed_users(db: AsyncSession) -> None:
    demo_users = (
        ("demo", "demo", 0, "Демо-переговорщик", "Практик", "HR", "Москва", "Арена Переговоров", 1, 500, 0),
        ("admin", "admin", 1, "Администратор", "Куратор Арены", "Руководитель", "Москва", "Арена Переговоров", 1, 3, 0),
        ("maria_sales", "demo", 0, "Мария Соколова", "Стратег", "Продажи", "Санкт-Петербург", "Северный контракт", 4, 18, 1200),
        ("alex_hr", "demo", 0, "Алексей Иванов", "Мастер переговоров", "HR", "Казань", "Команда развития", 5, 27, 1850),
        ("elena_pm", "demo", 0, "Елена Морозова", "Переговорщик", "PM", "Екатеринбург", "Проектный офис", 3, 11, 640),
        ("sergey_lavrov", "demo", 0, "Сергей Лавров", "Стратег", "Переговоры и дипломатия", "Москва", "Центр международных проектов", 4, 22, 1460),
        ("igor_buy", "demo", 0, "Игорь Власов", "Эксперт переговоров", "Закупщик", "Новосибирск", "Технопром", 6, 35, 3200),
        ("olga_founder", "demo", 0, "Ольга Белова", "Практик", "Предприниматель", "Самара", "Своё дело", 2, 8, 260),
        ("guest_demo", "demo", 0, "Гость демо", "Практик", "Переговоры", "Москва", "Арена Переговоров", 1, 15, 0),
    )
    for name, password, admin, display_name, title, specialization, city, organization, level, stars, xp in demo_users:
        exists = await db.scalar(select(User).where(User.username == name))
        if not exists:
            user = User(
                username=name, password_hash=hash_password(password), is_admin=admin, display_name=display_name,
                title=title, specialization=specialization, city=city, organization=organization,
                stars=stars, level=level, xp=xp,
            )
            db.add(user)
            await db.flush()
            user.arena_id = f"ARENA-{user.id:05d}"
            db.add_all([
                UserInventory(user_id=user.id, item_code="avatar_analyst", category="avatar"),
                UserInventory(user_id=user.id, item_code="frame_classic", category="frame"),
                UserInventory(user_id=user.id, item_code="theme_arena", category="theme"),
            ])
        elif not exists.arena_id:
            exists.arena_id = f"ARENA-{exists.id:05d}"
    if not await db.get(AppSetting, "guest_demo_chat_seed_v1"):
        demo = await db.scalar(select(User).where(User.username == "demo"))
        guest = await db.scalar(select(User).where(User.username == "guest_demo"))
        friendship = await db.scalar(select(Friendship).where(
            ((Friendship.user_id == demo.id) & (Friendship.friend_id == guest.id)) |
            ((Friendship.user_id == guest.id) & (Friendship.friend_id == demo.id))
        ))
        if friendship is None:
            db.add(Friendship(user_id=demo.id, friend_id=guest.id, status="FRIENDS"))
        if friendship is None or friendship.status == "FRIENDS":
            has_chat = await db.scalar(select(DirectMessage.id).where(
                DirectMessage.sender_id == guest.id, DirectMessage.receiver_id == demo.id,
            ))
            if not has_chat:
                for message in ("Привет! Давай проверим переписку на Арене.", "Если хочешь, пригласи меня в переговоры 1 на 1."):
                    db.add(DirectMessage(sender_id=guest.id, receiver_id=demo.id, text=message))
                    db.add(Notification(user_id=demo.id, type="MESSAGE_RECEIVED", payload=json.dumps({"from": guest.username, "user_id": guest.id})))
        db.add(AppSetting(key="guest_demo_chat_seed_v1", value="done"))
    await db.commit()
