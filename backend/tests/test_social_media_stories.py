"""Real temporary SQLite/files: media ACL, decoding, expiry, highlights and DM privacy."""
import asyncio
import io
from collections import OrderedDict
from datetime import timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from PIL import Image
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import deployment_security, social_media_storage
from app.auth import create_token
from app.company_models import Company, CompanyMembership
from app.config import settings
from app.db import Base, get_db
from app.models import DirectMessage, Friendship, Notification, User
from app.routers.social_media import router as media_router
from app.routers.social_stories import router as stories_router
from app.social_media_storage import cleanup_social_media, media_path
from app.social_models import SocialMedia, SocialPost, SocialPreference, SocialStory, SocialStoryView, SocialUserFollow
from app.social_service import now


def picture(fmt="PNG", *, exif=False):
    image = Image.new("RGB", (64, 32), "green")
    output = io.BytesIO()
    metadata = Image.Exif()
    if exif:
        metadata[0x010E] = "private camera location"
    image.save(output, fmt, exif=metadata)
    return output.getvalue()


@pytest.fixture
async def api(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "social_media_path", str(tmp_path / "private" / "social-media"))
    monkeypatch.setattr(deployment_security, "_limits", OrderedDict())
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'social.db').as_posix()}")
    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        db.add_all([User(id=i, username=f"user{i}", password_hash="unused", display_name=f"Private name {i}",
                        profile_visibility="public", messages_visibility="all") for i in (1, 2, 3)])
        await db.flush()
        db.add(Company(id=1, name="Company", slug="company", created_by=1))
        await db.flush()
        db.add_all([CompanyMembership(company_id=1, user_id=1, corporate_role="COMPANY_OWNER", status="ACTIVE"),
                    CompanyMembership(company_id=1, user_id=2, corporate_role="EMPLOYEE", status="ACTIVE")])
        await db.commit()
    app = FastAPI()
    app.include_router(media_router, prefix="/api")
    app.include_router(stories_router, prefix="/api")
    async def provide_db():
        async with factory() as db:
            yield db
    app.dependency_overrides[get_db] = provide_db
    headers = {i: {"Authorization": "Bearer " + create_token(i, f"user{i}")} for i in (1, 2, 3)}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, factory=factory, headers=headers, root=tmp_path)
    await engine.dispose()


async def request(api, method, path, user=1, **kwargs):
    return await api.client.request(method, "/api/social" + path, headers=api.headers[user], **kwargs)


async def upload(api, user=1, content=None, mime="image/png"):
    result = await request(api, "POST", "/media/upload", user,
                           files={"file": ("../../client-controlled.png", content or picture(), mime)},
                           data={"alt_text": "A real test image"})
    assert result.status_code == 200, result.text
    return result.json()


async def story(api, user=1, **values):
    result = await request(api, "POST", "/stories", user,
                           json={"text": "A test story", "audience": "PUBLIC", **values})
    assert result.status_code == 200, result.text
    return result.json()


async def test_upload_decode_strip_metadata_private_preview_and_ranges(api):
    media = await upload(api, content=picture("JPEG", exif=True), mime="image/jpeg")
    assert media["mime"] == "image/webp" and media["width"] == 64
    assert "storage_key" not in media and "Private name" not in str(media)
    assert (await api.client.get(media["url"])).status_code == 401
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 404
    original = await request(api, "GET", f"/media/{media['id']}")
    assert original.status_code == 200 and original.headers["x-content-type-options"] == "nosniff"
    with Image.open(io.BytesIO(original.content)) as image:
        assert not image.getexif()
    thumb = await request(api, "GET", f"/media/{media['id']}?thumbnail=true")
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/webp"
    ranged = await api.client.get(media["url"], headers={**api.headers[1], "Range": "bytes=0-3"})
    assert ranged.status_code == 206 and ranged.content == b"RIFF"
    async with api.factory() as db:
        row = await db.get(SocialMedia, media["id"])
        assert media_path(row.storage_key).parent == social_media_storage.storage_root()
        row.storage_key = "../../private.key"
        await db.commit()
    assert (await request(api, "GET", f"/media/{media['id']}")).status_code == 404


@pytest.mark.parametrize("mime,content", [("image/svg+xml", b"<svg/>"), ("text/html", b"<script/>"),
    ("image/png", b"<script>alert(1)</script>"), ("image/jpeg", picture("PNG"))])
async def test_reject_unsafe_or_spoofed_image(api, mime, content):
    result = await request(api, "POST", "/media/upload", files={"file": ("photo.png", content, mime)})
    assert result.status_code == 415
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SocialMedia)) == 0


async def test_size_resolution_quota_and_video_unavailable_are_honest(api, monkeypatch):
    monkeypatch.setattr(settings, "social_media_max_image_bytes", 10)
    response = await request(api, "POST", "/media/upload", files={"file": ("x.png", picture(), "image/png")})
    assert response.status_code == 413
    monkeypatch.setattr(settings, "social_media_max_image_bytes", 12_000_000)
    monkeypatch.setattr(social_media_storage, "MAX_PIXELS", 100)
    assert (await request(api, "POST", "/media/upload", files={"file": ("x.png", picture(), "image/png")})).status_code == 413
    monkeypatch.setattr(social_media_storage, "MAX_PIXELS", 24_000_000)
    monkeypatch.setattr(settings, "social_media_user_quota_bytes", 1)
    assert (await request(api, "POST", "/media/upload", files={"file": ("x.png", picture(), "image/png")})).status_code == 413
    monkeypatch.setattr(social_media_storage.shutil, "which", lambda _: None)
    monkeypatch.setattr(settings, "social_media_ffprobe_path", "")
    monkeypatch.setattr(settings, "social_media_ffmpeg_path", "")
    assert (await request(api, "POST", "/media/upload", files={"file": ("x.mp4", b"0000ftypfake", "video/mp4")})).status_code == 503


async def test_story_media_acl_views_are_private_and_idempotent(api):
    media = await upload(api)
    created = await story(api, media_id=media["id"], audience="FRIENDS")
    assert (await request(api, "GET", f"/stories/{created['id']}", 2)).status_code == 404
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 404
    async with api.factory() as db:
        db.add(Friendship(user_id=1, friend_id=2, status="FRIENDS"))
        await db.commit()
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 200
    results = await asyncio.gather(*[request(api, "POST", f"/stories/{created['id']}/view", 2) for _ in range(2)])
    assert all(result.status_code == 200 for result in results)
    own = await request(api, "POST", f"/stories/{created['id']}/view")
    assert own.status_code == 200
    viewer = (await request(api, "GET", f"/stories/{created['id']}", 2)).json()
    assert viewer["viewed"] and "views_count" not in viewer
    counts = (await request(api, "GET", f"/stories/{created['id']}/viewers")).json()
    assert counts["count"] == 1 and len(counts["items"]) == 1
    assert (await request(api, "GET", f"/stories/{created['id']}/viewers", 2)).status_code == 404
    async with api.factory() as db:
        relation = await db.scalar(select(Friendship))
        relation.status = "BLOCKED"
        await db.commit()
    assert (await request(api, "GET", f"/media/{media['id']}?thumbnail=true", 2)).status_code == 404
    assert (await request(api, "GET", f"/stories/{created['id']}", 2)).status_code == 404


async def test_expiry_highlight_retention_and_cleanup(api):
    media = await upload(api)
    created = await story(api, media_id=media["id"])
    highlight = await request(api, "POST", "/highlights", json={"title": "Own archive", "story_ids": [created["id"]], "cover_media_id": media["id"]})
    assert highlight.status_code == 200, highlight.text
    assert (await request(api, "POST", "/highlights", 2, json={"title": "Stolen", "story_ids": [created["id"]]})).status_code == 404
    async with api.factory() as db:
        row = await db.get(SocialStory, created["id"])
        row.expires_at = now() - timedelta(days=10)
        await db.commit()
        assert await cleanup_social_media(db) == 0
        stored = await db.get(SocialMedia, media["id"])
        path = media_path(stored.storage_key)
        assert path.exists()
    assert (await request(api, "GET", "/stories", 2)).json()["items"] == []
    assert (await request(api, "GET", f"/stories/{created['id']}", 2)).status_code == 404
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 200
    saved = (await request(api, "GET", f"/highlights/{highlight.json()['id']}", 2)).json()
    assert saved["items"][0]["is_highlight"] and saved["items"][0]["id"] == created["id"]
    assert (await request(api, "PATCH", f"/highlights/{highlight.json()['id']}", 2, json={"title": "Stolen"})).status_code == 404
    assert (await request(api, "DELETE", f"/highlights/{highlight.json()['id']}")).status_code == 200
    async with api.factory() as db:
        assert await cleanup_social_media(db) == 1
        assert not path.exists()
        assert await cleanup_social_media(db) == 0
    assert (await request(api, "GET", f"/media/{media['id']}")).status_code == 404


async def test_story_reply_reuses_text_dm_permissions_and_never_copies_story(api):
    created = await story(api, text="Private source text never copied")
    async with api.factory() as db:
        author = await db.get(User, 1)
        author.messages_visibility = "friends"
        await db.commit()
    assert (await request(api, "POST", f"/stories/{created['id']}/reply", 2, json={"text": "Hello"})).status_code == 403
    async with api.factory() as db:
        db.add(Friendship(user_id=1, friend_id=2, status="FRIENDS"))
        await db.commit()
    response = await request(api, "POST", f"/stories/{created['id']}/reply", 2, json={"text": "Hello"})
    assert response.status_code == 200
    async with api.factory() as db:
        message = await db.get(DirectMessage, response.json()["message_id"])
        assert message.type == "TEXT" and message.is_read == 0
        assert message.receiver_id == 1 and message.sender_id == 2
        assert "Private source text" not in message.text + message.payload
        assert await db.scalar(select(func.count()).select_from(Notification).where(Notification.type == "MESSAGE_RECEIVED")) == 1
        db.add(SocialPreference(user_id=1, settings='{"stories":false}'))
        await db.commit()
    assert (await request(api, "POST", f"/stories/{created['id']}/reply", 2, json={"text": "A quiet reply"})).status_code == 200
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(Notification).where(Notification.type == "MESSAGE_RECEIVED")) == 1
        assert await db.scalar(select(func.count()).select_from(DirectMessage)) == 2
        author = await db.get(User, 1)
        author.messages_visibility = "none"
        await db.commit()
    assert (await request(api, "GET", f"/stories/{created['id']}", 2)).json()["can_reply"] is False
    assert (await request(api, "POST", f"/stories/{created['id']}/reply", 2, json={"text": "Again"})).status_code == 403


async def test_company_story_permissions_and_media_revocation(api):
    media = await upload(api)
    assert (await request(api, "POST", "/stories", 2, json={"text": "No authority", "as_company_id": 1, "audience": "PUBLIC"})).status_code == 403
    created = await story(api, media_id=media["id"], as_company_id=1, audience="COMPANY_INTERNAL")
    assert (await request(api, "GET", f"/stories/{created['id']}", 2)).status_code == 200
    assert (await request(api, "GET", f"/media/{media['id']}", 3)).status_code == 404
    async with api.factory() as db:
        membership = await db.scalar(select(CompanyMembership).where(CompanyMembership.user_id == 2))
        membership.status = "REMOVED"
        await db.commit()
    assert (await request(api, "GET", f"/stories/{created['id']}", 2)).status_code == 404
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 404


async def test_owner_profile_change_follow_revocation_and_deleted_post_media(api):
    media = await upload(api)
    created = await story(api, media_id=media["id"], audience="FOLLOWERS")
    async with api.factory() as db:
        db.add(SocialUserFollow(user_id=2, author_id=1))
        await db.commit()
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 200
    async with api.factory() as db:
        author = await db.get(User, 1)
        author.profile_visibility = "private"
        await db.commit()
    assert (await request(api, "GET", f"/media/{media['id']}", 2)).status_code == 404
    assert (await request(api, "DELETE", f"/stories/{created['id']}", 2)).status_code == 404
    assert (await request(api, "DELETE", f"/stories/{created['id']}")).status_code == 200
    assert (await request(api, "GET", f"/media/{media['id']}")).status_code == 404
    second = await upload(api)
    async with api.factory() as db:
        post = SocialPost(author_user_id=1, body="Secret", status="DRAFT", audience="ONLY_ME")
        db.add(post)
        await db.flush()
        attached = await db.get(SocialMedia, second["id"])
        attached.post_id = post.id
        await db.commit()
    assert (await request(api, "GET", f"/media/{second['id']}")).status_code == 200
    assert (await request(api, "GET", f"/media/{second['id']}", 2)).status_code == 404
    async with api.factory() as db:
        row = await db.get(SocialPost, post.id)
        row.status = "DELETED"
        await db.commit()
    assert (await request(api, "GET", f"/media/{second['id']}")).status_code == 404


async def test_upload_ownership_no_double_attachment_and_orphan_cleanup(api):
    media = await upload(api)
    assert (await request(api, "POST", "/stories", 2, json={"media_id": media["id"]})).status_code == 404
    assert (await request(api, "DELETE", f"/media/{media['id']}", 2)).status_code == 404
    await story(api, media_id=media["id"])
    assert (await request(api, "POST", "/stories", json={"media_id": media["id"]})).status_code == 409
    assert (await request(api, "DELETE", f"/media/{media['id']}")).status_code == 409
    orphan = await upload(api)
    async with api.factory() as db:
        row = await db.get(SocialMedia, orphan["id"])
        row.created_at = now() - timedelta(days=2)
        await db.commit()
        assert await cleanup_social_media(db) == 1
        assert (await db.get(SocialMedia, media["id"])).deleted_at is None


async def test_story_schema_duration_and_feed_keyset(api):
    assert (await request(api, "POST", "/stories", json={})).status_code == 422
    assert (await request(api, "POST", "/stories", json={"text": "x", "expires_at": "2100-01-01"})).status_code == 422
    async with api.factory() as db:
        row = SocialMedia(owner_user_id=1, storage_key="a" * 32 + ".mp4", kind="VIDEO", mime="video/mp4",
                          duration_seconds=31, bytes=100)
        db.add(row)
        await db.commit()
    assert (await request(api, "POST", "/stories", json={"media_id": row.id})).status_code == 422
    expected = [(await story(api))["id"] for _ in range(3)]
    first = (await request(api, "GET", "/stories?limit=2", 2)).json()
    second = (await request(api, "GET", "/stories", 2, params={"limit": 2, "cursor": first["next_cursor"]})).json()
    assert [row["id"] for row in first["items"] + second["items"]] == list(reversed(expected))
    assert second["next_cursor"] is None
    own_only = (await request(api, "GET", "/stories", 2, params={"user_id": 1})).json()
    assert [row["id"] for row in own_only["items"]] == list(reversed(expected))
    assert (await request(api, "GET", "/stories", 2, params={"user_id": 3})).json()["items"] == []
    assert (await request(api, "GET", "/stories", 2, params={"user_id": 0})).status_code == 422
