"""Shared posts use live source permissions without changing legacy chat contracts."""
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import create_token
from app.db import Base, get_db
from app.models import DirectMessage, Friendship, Notification, User
from app.routers.social import router
from app.social_models import SocialPost


@pytest.fixture
async def shared_chat(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'shares.db').as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        db.add_all([User(id=uid, username=f"share-{uid}", password_hash="unused", display_name=f"Пользователь {uid}") for uid in (1, 2, 3)])
        await db.flush()
        db.add(SocialPost(id=1, author_user_id=1, body="Исходный текст публикации", audience="PUBLIC", status="PUBLISHED", published_at=datetime.now(timezone.utc).replace(tzinfo=None)))
        db.add_all([
            DirectMessage(id=1, sender_id=2, receiver_id=3, type="POST_SHARE", text="Публикация", payload=json.dumps({"post_id": 1})),
            DirectMessage(id=2, sender_id=2, receiver_id=3, type="TEXT", text="Обычное сообщение"),
            DirectMessage(id=3, sender_id=2, receiver_id=3, type="ROOM_INVITATION", text="Приглашение", payload='{"room_id":999}'),
            Notification(user_id=3, type="SOCIAL_COMMENT", payload='{"actor_id":2,"post_id":1,"path":"/feed/post/1"}'),
        ])
        await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api")
    async def provide_db():
        async with factory() as db:
            yield db
    app.dependency_overrides[get_db] = provide_db
    headers = {"Authorization": "Bearer " + create_token(3, "share-3", "")}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        yield SimpleNamespace(client=client, factory=factory)
    await engine.dispose()


async def test_shared_preview_revoked_when_source_becomes_private(shared_chat):
    client = shared_chat.client
    visible = await client.get("/api/social/messages/2?mark_read=false")
    assert visible.status_code == 200
    assert visible.json()[0]["payload"]["post"]["body"] == "Исходный текст публикации"
    assert visible.json()[1]["text"] == "Обычное сообщение"
    assert visible.json()[2]["type"] == "ROOM_INVITATION"
    async with shared_chat.factory() as db:
        post = await db.get(SocialPost, 1)
        post.audience = "ONLY_ME"
        await db.commit()
    hidden = await client.get("/api/social/messages/2?mark_read=false")
    assert hidden.json()[0]["payload"] == {"post_id": 1, "available": False, "post": None}
    assert "Исходный текст" not in hidden.text
    notifications = await client.get("/api/social/notifications")
    assert notifications.json()[0]["payload"]["available"] is False
    assert notifications.json()[0]["payload"]["path"] is None
    async with shared_chat.factory() as db:
        # Make the share the newest dialog entry, without storing any source text.
        message = await db.get(DirectMessage, 1)
        message.created_at = datetime(2099, 1, 1)
        await db.commit()
    dialogs = await client.get("/api/social/dialogs")
    assert dialogs.json()[0]["preview"] == "Публикация недоступна"


async def test_unread_badge_counts_share_and_text_but_not_invitations(shared_chat):
    response = await shared_chat.client.get("/api/social/unread-count")
    assert response.json() == {"count": 2}
    assert (await shared_chat.client.get("/api/social/messages/2")).status_code == 200
    assert (await shared_chat.client.get("/api/social/unread-count")).json() == {"count": 0}


async def test_sender_comment_survives_without_copying_hidden_source(shared_chat):
    async with shared_chat.factory() as db:
        message = await db.get(DirectMessage, 1)
        message.text = "Мой комментарий к пересылке"
        await db.commit()
    visible = await shared_chat.client.get("/api/social/messages/2?mark_read=false")
    assert visible.json()[0]["text"] == "Мой комментарий к пересылке"
    async with shared_chat.factory() as db:
        post = await db.get(SocialPost, 1)
        post.audience = "ONLY_ME"
        await db.commit()
    hidden = await shared_chat.client.get("/api/social/messages/2?mark_read=false")
    assert hidden.json()[0]["text"] == "Мой комментарий к пересылке"
    assert hidden.json()[0]["payload"] == {"post_id": 1, "available": False, "post": None}
    assert "Исходный текст" not in hidden.text


async def test_disabled_messages_are_not_bypassed_by_friendship(shared_chat):
    async with shared_chat.factory() as db:
        recipient = await db.get(User, 3)
        recipient.messages_visibility = "none"
        db.add(Friendship(user_id=2, friend_id=3, status="FRIENDS"))
        await db.commit()
    sender = {"Authorization": "Bearer " + create_token(2, "share-2", "")}
    response = await shared_chat.client.post("/api/social/messages/3", headers=sender, json={"text": "Запрещённый контакт"})
    assert response.status_code == 403


async def test_dialog_preview_does_not_expand_obsolete_shared_posts(shared_chat, monkeypatch):
    from unittest.mock import AsyncMock
    from app.routers import social
    async with shared_chat.factory() as db:
        db.add(DirectMessage(id=4, sender_id=2, receiver_id=3, type="TEXT", text="Самое новое сообщение", created_at=datetime(2099, 1, 1)))
        await db.commit()
    hydrate = AsyncMock(return_value={})
    monkeypatch.setattr(social, "shared_post_previews", hydrate)
    response = await shared_chat.client.get("/api/social/dialogs")
    assert response.json()[0]["preview"] == "Самое новое сообщение"
    assert [row.id for row in hydrate.await_args.args[2]] == [4]


@pytest.mark.parametrize("change", ["block", "private_profile", "deleted"])
async def test_source_acl_also_applies_inside_existing_chat(shared_chat, change):
    async with shared_chat.factory() as db:
        if change == "block":
            db.add(Friendship(user_id=1, friend_id=3, status="BLOCKED"))
        elif change == "private_profile":
            author = await db.get(User, 1)
            author.profile_visibility = "private"
        else:
            post = await db.get(SocialPost, 1)
            post.status = "DELETED"
        await db.commit()
    response = await shared_chat.client.get("/api/social/messages/2?mark_read=false")
    assert response.status_code == 200
    assert response.json()[0]["payload"]["available"] is False
    assert "Исходный текст" not in response.text
