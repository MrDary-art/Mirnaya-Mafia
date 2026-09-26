import asyncio

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token, seed_users, verify_password
from app.db import Base, get_db
from app.main import app
from app.models import DirectMessage, Friendship, Notification, User


def test_guest_demo_chat_seed_is_idempotent_and_badge_counts_only_text():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            await seed_users(db)
            await seed_users(db)
            demo = await db.scalar(select(User).where(User.username == "demo"))
            guest = await db.scalar(select(User).where(User.username == "guest_demo"))
            assert verify_password("demo", guest.password_hash)
            assert await db.scalar(select(Friendship.id).where(
                Friendship.user_id == demo.id, Friendship.friend_id == guest.id,
                Friendship.status == "FRIENDS",
            ))
            assert await db.scalar(select(func.count()).select_from(DirectMessage).where(
                DirectMessage.sender_id == guest.id, DirectMessage.receiver_id == demo.id,
                DirectMessage.type == "TEXT",
            )) == 2
            db.add(DirectMessage(sender_id=guest.id, receiver_id=demo.id, text="Приглашение", type="ROOM_INVITATION"))
            await db.commit()
            return demo.id, guest.id

    async def provide_db():
        async with factory() as db:
            yield db

    demo_id, guest_id = asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    try:
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {create_token(demo_id, 'demo')}"}
        assert client.get("/api/social/unread-count", headers=headers).json() == {"count": 2}
        assert client.get(f"/api/social/messages/{guest_id}", headers=headers).status_code == 200
        assert client.get("/api/social/unread-count", headers=headers).json() == {"count": 0}

        async def notifications_read():
            async with factory() as db:
                return await db.scalar(select(func.count()).select_from(Notification).where(
                    Notification.user_id == demo_id, Notification.type == "MESSAGE_RECEIVED",
                    Notification.is_read == 0,
                ))

        assert asyncio.run(notifications_read()) == 0
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
