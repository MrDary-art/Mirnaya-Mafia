"""End-to-end API invariants for the shared social graph and live content ACL."""
import asyncio
import json
from collections import OrderedDict
from datetime import datetime
from types import SimpleNamespace
import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app import deployment_security, support_models
# Register company FK targets before creating the isolated SQLite schema.
from app import company_advanced_models, company_episode_models, company_meeting_models, company_completion_models
from app.auth import create_token, hash_password
from app.db import Base, get_db
from app.models import Achievement, DirectMessage, Friendship, Notification, Session, User
from app.company_models import Company, CompanyMembership
from app.routers.social_feed import admin_router, router
from app.social_models import (SocialBookmark, SocialCollectionItem, SocialComment, SocialMedia, SocialPost,
    SocialPostLike, SocialUserFollow)
from app.social_service import hydrate_post_previews


@pytest.fixture
async def api(tmp_path, monkeypatch):
    monkeypatch.setattr(deployment_security, "_limits", OrderedDict())
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'social.db').as_posix()}")
    @event.listens_for(engine.sync_engine, "connect")
    def fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    admin_hash = hash_password("secure-social-admin")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        db.add_all([User(id=i, username=f"user{i}", password_hash=admin_hash if i == 4 else "unused", is_admin=int(i == 4),
                         display_name=f"Person {i}", profile_visibility="private" if i == 5 else "public", messages_visibility="all") for i in range(1, 6)])
        await db.flush()
        db.add_all([Company(id=1, name="Company One", slug="one", created_by=1), Company(id=2, name="Company Two", slug="two", created_by=3)])
        await db.flush()
        db.add_all([CompanyMembership(company_id=1, user_id=1, corporate_role="COMPANY_OWNER", status="ACTIVE"),
                    CompanyMembership(company_id=1, user_id=2, corporate_role="EMPLOYEE", status="ACTIVE"),
                    CompanyMembership(company_id=2, user_id=3, corporate_role="COMPANY_OWNER", status="ACTIVE")])
        await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.include_router(admin_router, prefix="/api")
    async def provide_db():
        async with factory() as db: yield db
    app.dependency_overrides[get_db] = provide_db
    headers = {i: {"Authorization": "Bearer " + create_token(i, f"user{i}", admin_hash if i == 4 else "")} for i in range(1, 6)}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, factory=factory, headers=headers)
    await engine.dispose()


async def call(api, method, path, user=1, **kwargs):
    return await api.client.request(method, "/api/social" + path, headers=api.headers[user], **kwargs)


async def post(api, user=1, **kwargs):
    response = await call(api, "POST", "/posts", user, json={"body": "Текст настоящей публикации", **kwargs})
    assert response.status_code == 200, response.text
    return response.json()


async def test_post_crud_draft_auth_and_pin(api):
    assert (await api.client.get("/api/social/feed")).status_code == 401
    draft = await post(api, status="DRAFT")
    assert (await call(api, "GET", f"/posts/{draft['id']}", 2)).status_code == 404
    assert (await call(api, "GET", "/feed", 1)).json()["items"] == []
    assert (await call(api, "GET", "/users/1/posts")).json()["items"][0]["id"] == draft["id"]
    live = (await call(api, "PATCH", f"/posts/{draft['id']}", json={"status": "PUBLISHED", "pinned": True})).json()
    assert live["pinned"]
    assert (await call(api, "GET", f"/posts/{draft['id']}", 2)).json()["body"] == live["body"]
    assert (await call(api, "PATCH", f"/posts/{draft['id']}", 2, json={"body": "hacked"})).status_code == 403
    assert (await call(api, "DELETE", f"/posts/{draft['id']}", 2)).status_code == 404
    next_post = await post(api)
    await call(api, "PATCH", f"/posts/{next_post['id']}", json={"pinned": True})
    assert not (await call(api, "GET", f"/posts/{draft['id']}")).json()["pinned"]
    assert (await call(api, "GET", "/users/1/posts")).json()["pinned_post"]["id"] == next_post["id"]
    assert (await call(api, "DELETE", f"/posts/{next_post['id']}")).json()["ok"]
    assert (await call(api, "GET", f"/posts/{next_post['id']}")).status_code == 404


async def test_like_bookmark_idempotence_no_self_notifications(api):
    row = await post(api)
    path = f"/posts/{row['id']}"
    for _ in range(2):
        assert (await call(api, "POST", path + "/like", 2)).json()["counts"]["likes"] == 1
        assert (await call(api, "POST", path + "/bookmark", 2)).json()["viewer_state"]["bookmarked"]
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SocialPostLike)) == 1
        assert await db.scalar(select(func.count()).select_from(SocialBookmark)) == 1
        assert await db.scalar(select(func.count()).select_from(Notification)) == 1
    await call(api, "POST", path + "/like", 1)
    assert (await call(api, "GET", "/notifications/unread-count")).json()["count"] == 1
    await call(api, "POST", "/notifications/read-all")
    assert (await call(api, "GET", "/notifications/unread-count")).json()["count"] == 0
    for _ in range(2): await call(api, "DELETE", path + "/like", 2)
    assert (await call(api, "GET", path, 2)).json()["counts"]["likes"] == 1
    assert len((await call(api, "GET", path + "/likes", 2)).json()["items"]) == 1


async def test_friend_profile_follow_block_and_bookmark_acl_revocation(api):
    row = await post(api, audience="FRIENDS")
    path = f"/posts/{row['id']}"
    assert (await call(api, "GET", path, 2)).status_code == 404
    async with api.factory() as db:
        relation = Friendship(user_id=1, friend_id=2, status="FRIENDS")
        db.add(relation)
        await db.commit()
    assert (await call(api, "GET", path, 2)).status_code == 200
    await call(api, "POST", path + "/bookmark", 2)
    async with api.factory() as db:
        relation = await db.scalar(select(Friendship))
        relation.status = "REMOVED"
        await db.commit()
    assert (await call(api, "GET", "/bookmarks", 2)).json()["items"] == []
    await call(api, "PATCH", path, json={"audience": "FOLLOWERS"})
    assert (await call(api, "POST", "/follows/users/1", 2)).status_code == 200
    assert (await call(api, "GET", path, 2)).status_code == 200
    await call(api, "DELETE", "/follows/users/1", 2)
    assert (await call(api, "GET", path, 2)).status_code == 404
    await call(api, "PATCH", path, json={"audience": "PUBLIC"})
    async with api.factory() as db:
        relation = await db.scalar(select(Friendship))
        relation.status = "BLOCKED"
        await db.commit()
    assert (await call(api, "GET", path, 2)).status_code == 404
    assert (await call(api, "POST", path + "/like", 2)).status_code == 404
    assert (await call(api, "POST", "/follows/users/1", 2)).status_code == 404
    closed = await post(api, 5)
    assert (await call(api, "GET", f"/posts/{closed['id']}", 3)).status_code == 404
    assert (await call(api, "POST", "/follows/users/5", 3)).status_code == 403


async def test_company_role_and_live_membership_acl(api):
    denied = await call(api, "POST", "/posts", 2, json={"body": "spoof", "as_company_id": 1, "audience": "PUBLIC"})
    assert denied.status_code == 403
    row = await post(api, as_company_id=1, audience="COMPANY_INTERNAL")
    path = f"/posts/{row['id']}"
    assert row["company"]["id"] == 1
    assert (await call(api, "GET", path, 2)).status_code == 200
    assert (await call(api, "GET", path, 3)).status_code == 404
    await call(api, "POST", path + "/bookmark", 2)
    async with api.factory() as db:
        member = await db.scalar(select(CompanyMembership).where(CompanyMembership.user_id == 2))
        member.status = "REMOVED"
        await db.commit()
    assert (await call(api, "GET", path, 2)).status_code == 404
    assert (await call(api, "GET", "/bookmarks", 2)).json()["items"] == []
    assert (await call(api, "GET", "/publishers", 2)).json()["items"] == []
    assert (await call(api, "GET", "/publishers", 1)).json()["items"][0]["id"] == 1


async def test_comment_threads_edit_delete_and_disabled(api):
    row = await post(api)
    other = await post(api)
    path = f"/posts/{row['id']}/comments"
    first = (await call(api, "POST", path, 2, json={"text": "Мой ответ"})).json()
    reply = (await call(api, "POST", path, 1, json={"text": "Уточнение", "parent_id": first["id"]})).json()
    assert reply["parent_id"] == first["id"]
    assert (await call(api, "POST", f"/posts/{other['id']}/comments", json={"text": "invalid", "parent_id": first["id"]})).status_code == 422
    assert (await call(api, "POST", path, json={"text": "too deep", "parent_id": reply["id"]})).status_code == 422
    assert (await call(api, "PATCH", f"/comments/{first['id']}", 1, json={"text": "hacked"})).status_code == 403
    assert (await call(api, "PATCH", f"/comments/{first['id']}", 2, json={"text": "Исправлено"})).json()["text"] == "Исправлено"
    for _ in range(2): assert (await call(api, "POST", f"/comments/{reply['id']}/like", 2)).json()["likes"] == 1
    await call(api, "DELETE", f"/comments/{first['id']}", 2)
    items = (await call(api, "GET", path, 2)).json()["items"]
    assert len(items) == 2 and next(item for item in items if item["id"] == first["id"])["text"] == "Комментарий удалён"
    await call(api, "PATCH", f"/posts/{row['id']}", json={"comments_enabled": False})
    assert (await call(api, "POST", path, 2, json={"text": "not allowed"})).status_code == 403
    assert (await call(api, "GET", f"/posts/{row['id']}", 2)).json()["counts"]["comments"] == 1


async def test_repost_and_share_recheck_original_without_private_snapshot(api):
    row = await post(api, body="Секрет после изменения аудитории")
    path = f"/posts/{row['id']}"
    repost = (await call(api, "POST", path + "/repost", 2, json={"body": "Мой комментарий"})).json()
    duplicate = (await call(api, "POST", path + "/repost", 2, json={})).json()
    assert repost["id"] == duplicate["id"]
    assert repost["repost_original"]["body"] == row["body"]
    shared = await call(api, "POST", path + "/share-message", 2, json={"recipient_id": 3})
    assert shared.status_code == 200, shared.text
    async with api.factory() as db:
        message = await db.get(DirectMessage, shared.json()["message_id"])
        assert message.type == "POST_SHARE" and json.loads(message.payload) == {"post_id": row["id"]}
        assert row["body"] not in message.text
    await call(api, "PATCH", path, json={"audience": "ONLY_ME"})
    wrapper = (await call(api, "GET", f"/posts/{repost['id']}", 3)).json()
    assert wrapper["repost_original"] == {"id": row["id"], "available": False}
    assert row["body"] not in json.dumps(wrapper, ensure_ascii=False)
    async with api.factory() as db:
        viewer = await db.get(User, 3)
        assert await hydrate_post_previews(db, viewer, [row["id"]]) == {}


async def test_collections_private_multi_membership_and_live_acl(api):
    item = await post(api)
    collections = []
    for title in ("Первая", "Вторая"):
        row = (await call(api, "POST", "/collections", 2, json={"title": title})).json()
        collections.append(row)
        response = await call(api, "POST", f"/collections/{row['id']}/items", 2, json={"post_id": item["id"]})
        assert response.status_code == 200, response.text
        assert response.json()["items_count"] == 1
    assert (await call(api, "GET", f"/collections/{collections[0]['id']}", 3)).status_code == 404
    first = (await call(api, "GET", f"/collections/{collections[0]['id']}", 2)).json()
    await call(api, "DELETE", f"/collections/{first['id']}/items/{first['items'][0]['id']}", 2)
    second = (await call(api, "GET", f"/collections/{collections[1]['id']}", 2)).json()
    assert second["items_count"] == 1
    assert len((await call(api, "GET", "/bookmarks", 2)).json()["items"]) == 1
    await call(api, "PATCH", f"/collections/{second['id']}", 2, json={"title": "Общая", "audience": "PUBLIC"})
    assert (await call(api, "POST", f"/collections/{second['id']}/follow", 3)).json()["followed"]
    await call(api, "PATCH", f"/posts/{item['id']}", 1, json={"audience": "ONLY_ME"})
    assert (await call(api, "GET", f"/collections/{second['id']}", 3)).json()["items"] == []
    assert (await call(api, "GET", f"/collections/{second['id']}", 2)).json()["items"][0]["available"] is False


async def test_cursor_follows_mutes_and_cyrillic_search(api):
    for number in range(7): await post(api, body=f"ПЕРЕГОВОРЫ {number}")
    await call(api, "POST", "/follows/users/1", 2)
    await call(api, "POST", "/follows/users/1", 2)
    first = (await call(api, "GET", "/feed?scope=following&limit=3", 2)).json()
    await post(api, body="Новая запись после первой страницы")
    second = (await call(api, "GET", "/feed", 2, params={"scope": "following", "limit": 3, "cursor": first["next_cursor"]})).json()
    assert not ({row["id"] for row in first["items"]} & {row["id"] for row in second["items"]})
    assert len((await call(api, "GET", "/feed", 2, params={"q": "переговоры"})).json()["items"]) == 7
    assert (await call(api, "GET", "/users/1/stats", 2)).json()["followers"] == 1
    assert len((await call(api, "GET", "/users/1/followers", 2)).json()["items"]) == 1
    await call(api, "POST", "/mutes/users/1", 2)
    assert (await call(api, "GET", "/feed", 2)).json()["items"] == []
    assert (await call(api, "GET", "/feed?scope=following", 2)).json()["items"]
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SocialUserFollow)) == 1


async def test_feed_pins_precede_newer_posts_across_cursor_pages(api):
    older_pin = await post(api, 1, body="Важная старая запись")
    older_regular = await post(api, 2, body="Обычная запись")
    newer_pin = await post(api, 3, body="Вторая важная запись")
    newer_regular = await post(api, 2, body="Новая обычная запись")
    async with api.factory() as db:
        for row in (await db.scalars(select(SocialPost))).all():
            row.created_at = row.published_at = datetime(2020, 1, 1)
        await db.commit()
    for row, author in ((older_pin, 1), (newer_pin, 3)):
        assert (await call(api, "PATCH", f"/posts/{row['id']}", author, json={"pinned": True})).status_code == 200
    page = (await call(api, "GET", "/feed", 2, params={"limit": 1})).json()
    ids = [row["id"] for row in page["items"]]
    await post(api, 2, body="Опубликовано после первой страницы")
    while page["next_cursor"]:
        response = await call(api, "GET", "/feed", 2, params={"limit": 1, "cursor": page["next_cursor"]})
        assert response.status_code == 200, response.text
        page = response.json()
        ids.extend(row["id"] for row in page["items"])
        assert len(ids) <= 4
    assert ids == [newer_pin["id"], older_pin["id"], newer_regular["id"], older_regular["id"]]
    await call(api, "PATCH", f"/posts/{older_pin['id']}", json={"pinned": False})
    assert (await call(api, "GET", "/feed", 2)).json()["items"][0]["id"] == newer_pin["id"]


async def test_feed_pins_respect_search_scope_and_access(api):
    public = await post(api, body="Важные переговоры")
    private = await post(api, 3, body="Личные переговоры", audience="ONLY_ME")
    internal = await post(api, as_company_id=1, body="Внутренние переговоры", audience="COMPANY_INTERNAL")
    for row, author in ((public, 1), (private, 3), (internal, 1)):
        await call(api, "PATCH", f"/posts/{row['id']}", author, json={"pinned": True})
    regular = await post(api, 2, body="Новая открытая новость")
    visible = (await call(api, "GET", "/feed", 5)).json()["items"]
    assert [row["id"] for row in visible] == [public["id"], regular["id"]]
    searched = (await call(api, "GET", "/feed", 5, params={"q": "НОВОСТЬ"})).json()
    assert [row["id"] for row in searched["items"]] == [regular["id"]]
    await call(api, "POST", "/follows/users/1", 5)
    following = (await call(api, "GET", "/feed", 5, params={"scope": "following"})).json()
    assert [row["id"] for row in following["items"]] == [public["id"]]
    await call(api, "POST", "/mutes/users/1", 5)
    assert [row["id"] for row in (await call(api, "GET", "/feed", 5)).json()["items"]] == [regular["id"]]


async def test_popular_pins_precede_higher_scoring_posts(api):
    pinned = await post(api, body="Важная запись без реакций")
    popular = await post(api, 2, body="Популярная новая запись")
    for voter in (1, 3): await call(api, "POST", f"/posts/{popular['id']}/like", voter)
    await call(api, "PATCH", f"/posts/{pinned['id']}", json={"pinned": True})
    first = (await call(api, "GET", "/feed", 2, params={"scope": "popular", "limit": 1})).json()
    assert first["items"][0]["id"] == pinned["id"]
    second = (await call(api, "GET", "/feed", 2, params={"scope": "popular", "limit": 1, "cursor": first["next_cursor"]})).json()
    assert [row["id"] for row in second["items"]] == [popular["id"]]
    assert second["next_cursor"] is None


async def test_verified_cards_reject_forgery_and_never_expose_report(api):
    from app.engine.scenario import SCENARIOS
    scenario_id = next(iter(SCENARIOS))
    row = await post(api, linked_content={"kind": "SCENARIO", "id": scenario_id})
    assert row["linked_content"]["path"].startswith("/setup?preset=")
    assert (await call(api, "POST", "/posts", json={"linked_content": {"kind": "SCENARIO", "id": "fake"}})).status_code == 422
    async with api.factory() as db:
        db.add(Session(id=50, user_id=1, mode="scenario", role="a", opponent_role="b", scenario_id=scenario_id,
            status="finished", report='{"secret":"private-report"}', state='{"hidden_goal":"never-publish"}'))
        db.add(Achievement(id=50, user_id=1, code="first_session"))
        await db.commit()
    assert (await call(api, "POST", "/posts", 2, json={"linked_content": {"kind": "RESULT", "id": "50"}})).status_code == 422
    assert (await call(api, "POST", "/posts", 2, json={"linked_content": {"kind": "ACHIEVEMENT", "id": "50"}})).status_code == 422
    shared = await post(api, linked_content={"kind": "RESULT", "id": "50"})
    assert shared["linked_content"]["verified"]
    assert "private-report" not in json.dumps(shared) and "hidden_goal" not in json.dumps(shared)


async def test_poll_vote_single_choice_and_report_moderation(api):
    row = await post(api, poll={"options": ["Спросить", "Предложить"]})
    first, second = [item["id"] for item in row["poll"]["options"]]
    for option_id in (first, first, second):
        response = await call(api, "POST", f"/posts/{row['id']}/vote", 2, json={"option_id": option_id})
        assert response.json()["poll"]["total_votes"] == 1
    for _ in range(2):
        await call(api, "POST", "/reports", 2, json={"target_type": "POST", "target_id": row["id"], "reason": "Проверить текст"})
    queue = await api.client.get("/api/admin/social/reports", headers=api.headers[4])
    assert len(queue.json()["items"]) == 1
    assert queue.json()["items"][0]["status"] == "PENDING"
    report_id = queue.json()["items"][0]["id"]
    for user_id in (1, 2):
        assert (await api.client.get("/api/admin/social/reports?status=all", headers=api.headers[user_id])).status_code == 403
        assert (await api.client.post(f"/api/admin/social/reports/{report_id}/moderate", headers=api.headers[user_id], json={"action": "hide"})).status_code == 403
    hidden = await api.client.post(f"/api/admin/social/reports/{report_id}/moderate", headers=api.headers[4], json={"action": "hide"})
    assert hidden.status_code == 200
    assert (await call(api, "GET", f"/posts/{row['id']}", 2)).status_code == 404
    assert (await api.client.get("/api/admin/social/reports", headers=api.headers[4])).json()["items"] == []
    resolved = (await api.client.get("/api/admin/social/reports?status=resolved", headers=api.headers[4])).json()["items"]
    assert len(resolved) == 1 and resolved[0]["id"] == report_id
    assert resolved[0]["status"] == "RESOLVED" and resolved[0]["target_status"] == "HIDDEN"
    assert "reporter_user_id" not in resolved[0]
    assert (await api.client.get("/api/admin/social/reports?status=all", headers=api.headers[4])).json()["items"] == resolved
    assert (await api.client.get("/api/admin/social/reports?status=invalid", headers=api.headers[4])).status_code == 422
    assert (await api.client.post(f"/api/admin/social/reports/{report_id}/moderate", headers=api.headers[1], json={"action": "restore"})).status_code == 403
    restored = await api.client.post(f"/api/admin/social/reports/{report_id}/moderate", headers=api.headers[4], json={"action": "restore"})
    assert restored.status_code == 200
    assert (await call(api, "GET", f"/posts/{row['id']}", 2)).status_code == 200
    resolved = (await api.client.get("/api/admin/social/reports?status=resolved", headers=api.headers[4])).json()["items"]
    assert resolved[0]["target_status"] == "PUBLISHED"


async def test_media_ownership_attachment_and_detach(api):
    async with api.factory() as db:
        db.add(SocialMedia(id=1, owner_user_id=1, storage_key="random.webp", mime="image/webp", kind="IMAGE", bytes=20))
        await db.commit()
    assert (await call(api, "POST", "/posts", 2, json={"media_ids": [1]})).status_code == 422
    row = await post(api, media_ids=[1])
    assert row["media"][0]["id"] == 1 and "storage_key" not in row["media"][0]
    assert (await call(api, "POST", "/posts", 1, json={"media_ids": [1]})).status_code == 422
    updated = await call(api, "PATCH", f"/posts/{row['id']}", json={"media_ids": []})
    assert updated.json()["media"] == []


async def test_notification_preferences_persist_and_prevent_disabled_events(api):
    assert (await call(api, "GET", "/preferences")).json()["likes"]
    assert (await call(api, "PUT", "/preferences", json={"likes": False})).json()["likes"] is False
    row = await post(api)
    await call(api, "POST", f"/posts/{row['id']}/like", 2)
    assert (await call(api, "GET", "/notifications/unread-count")).json()["count"] == 0
    assert (await call(api, "GET", "/preferences")).json()["likes"] is False


async def test_attachment_catalog_has_only_safe_owned_cards(api):
    from app.engine.scenario import SCENARIOS
    async with api.factory() as db:
        db.add(Achievement(id=51, user_id=1, code="first_session"))
        db.add(Achievement(id=52, user_id=2, code="first_session"))
        await db.commit()
    cards = (await call(api, "GET", "/attachments")).json()["items"]
    assert any(card["kind"] == "SCENARIO" and card["id"] in SCENARIOS for card in cards)
    own = [card for card in cards if card["kind"] == "ACHIEVEMENT"]
    assert [card["id"] for card in own] == ["51"]
    assert all(card["available"] for card in cards)


async def test_company_publisher_can_read_followers_post_without_following(api):
    row = await post(api, as_company_id=1, audience="FOLLOWERS")
    assert (await call(api, "GET", f"/posts/{row['id']}")).status_code == 200
    assert (await call(api, "GET", f"/posts/{row['id']}", 2)).status_code == 404
    await call(api, "POST", "/follows/companies/1", 2)
    assert (await call(api, "GET", f"/posts/{row['id']}", 2)).status_code == 200


async def test_popular_snapshot_ranks_real_signals_and_stays_stable(api):
    older, middle, newest = [await post(api, body=f"Запись {i}") for i in range(3)]
    for voter in (2, 3): await call(api, "POST", f"/posts/{older['id']}/like", voter)
    await call(api, "POST", f"/posts/{middle['id']}/like", 2)
    first = (await call(api, "GET", "/feed?scope=popular&limit=1", 2)).json()
    assert first["items"][0]["id"] == older["id"]
    cursor = first["next_cursor"]
    for voter in (1, 2, 3): await call(api, "POST", f"/posts/{newest['id']}/like", voter)
    second = (await call(api, "GET", "/feed", 2, params={"scope": "popular", "limit": 1, "cursor": cursor})).json()
    assert second["items"][0]["id"] == middle["id"]
    fresh = (await call(api, "GET", "/feed?scope=popular&limit=1", 2)).json()
    assert fresh["items"][0]["id"] == newest["id"]
    assert (await call(api, "GET", "/feed", 3, params={"scope": "popular", "cursor": cursor})).status_code == 422
    await call(api, "PATCH", f"/posts/{newest['id']}", json={"audience": "ONLY_ME"})
    tail = (await call(api, "GET", "/feed", 2, params={"scope": "popular", "cursor": second["next_cursor"]})).json()
    assert tail["items"] == []


async def test_popular_comments_rank_across_pages_and_freeze_order(api):
    row = await post(api)
    path = f"/posts/{row['id']}/comments"
    older = (await call(api, "POST", path, 2, json={"text": "Старый полезный"})).json()
    newer = (await call(api, "POST", path, 3, json={"text": "Новый"})).json()
    await call(api, "POST", f"/comments/{older['id']}/like", 3)
    first = (await call(api, "GET", path, 2, params={"sort": "popular", "limit": 1})).json()
    assert first["items"][0]["id"] == older["id"]
    await call(api, "POST", f"/comments/{newer['id']}/like", 1)
    await call(api, "POST", f"/comments/{newer['id']}/like", 2)
    second = (await call(api, "GET", path, 2, params={"sort": "popular", "limit": 1, "cursor": first["next_cursor"]})).json()
    assert second["items"][0]["id"] == newer["id"]


async def test_wall_search_filters_pinned_posts_and_keeps_cursor_acl(api):
    unrelated = await post(api, body="Закреплённая заметка о расписании")
    await call(api, "PATCH", f"/posts/{unrelated['id']}", json={"pinned": True})
    older = await post(api, body="Переговоры с клиентом")
    newer = await post(api, body="ПЕРЕГОВОРЫ с командой")
    private = await post(api, body="Мои переговоры", audience="ONLY_ME")
    params = {"q": "  ПЕРЕГОВОРЫ  ", "limit": 1}
    first = (await call(api, "GET", "/users/1/posts", 2, params=params)).json()
    assert [row["id"] for row in first["items"]] == [newer["id"]]
    assert first["pinned_post"] is None
    assert first["next_cursor"]
    second = (await call(api, "GET", "/users/1/posts", 2, params={**params, "cursor": first["next_cursor"]})).json()
    assert [row["id"] for row in second["items"]] == [older["id"]]
    assert second["next_cursor"] is None
    own = (await call(api, "GET", "/users/1/posts", params={"q": "переговоры"})).json()
    assert {row["id"] for row in own["items"]} == {older["id"], newer["id"], private["id"]}
    assert (await call(api, "GET", "/users/1/posts", 2, params={"q": "несуществующий"})).json()["items"] == []


async def test_company_draft_reopens_only_for_its_author_in_company_feed(api):
    async with api.factory() as db:
        manager = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == 1, CompanyMembership.user_id == 2))
        manager.corporate_role = "COMPANY_ADMIN"
        await db.commit()
    draft = await post(api, as_company_id=1, audience="COMPANY_INTERNAL", status="DRAFT")
    own = (await call(api, "GET", "/feed", params={"scope": "company", "company_id": 1})).json()
    assert [row["id"] for row in own["items"]] == [draft["id"]]
    assert own["items"][0]["status"] == "DRAFT"
    for viewer in (2, 3):
        assert (await call(api, "GET", "/feed", viewer, params={"scope": "company", "company_id": 1})).json()["items"] == []
        assert (await call(api, "GET", f"/posts/{draft['id']}", viewer)).status_code == 404
    assert (await call(api, "GET", "/feed")).json()["items"] == []
    assert (await call(api, "GET", "/feed?scope=companies")).json()["items"] == []
    await call(api, "PATCH", f"/posts/{draft['id']}", json={"status": "PUBLISHED"})
    assert (await call(api, "GET", "/feed", 2, params={"scope": "company", "company_id": 1})).json()["items"][0]["id"] == draft["id"]
    assert (await call(api, "GET", "/feed", 3, params={"scope": "company", "company_id": 1})).json()["items"] == []


async def test_company_pinned_post_is_first_page_only_and_respects_search_acl(api):
    older = await post(api, as_company_id=1, audience="COMPANY_INTERNAL", body="Внутренние переговоры")
    newer = await post(api, as_company_id=1, body="Открытая новость")
    await call(api, "PATCH", f"/posts/{older['id']}", json={"pinned": True})
    params = {"scope": "company", "company_id": 1, "limit": 1}
    first = (await call(api, "GET", "/feed", 2, params=params)).json()
    assert first["pinned_post"]["id"] == older["id"]
    assert [row["id"] for row in first["items"]] == [newer["id"]]
    second = (await call(api, "GET", "/feed", 2, params={**params, "cursor": first["next_cursor"]})).json()
    assert "pinned_post" not in second
    assert [row["id"] for row in second["items"]] == [older["id"]]
    outsider = (await call(api, "GET", "/feed", 3, params=params)).json()
    assert outsider["pinned_post"] is None
    searched = (await call(api, "GET", "/feed", 2, params={**params, "q": "ОТКРЫТАЯ"})).json()
    assert searched["pinned_post"] is None and searched["items"][0]["id"] == newer["id"]
    assert (await call(api, "GET", "/feed", 2, params={**params, "q": "ПЕРЕГОВОРЫ"})).json()["pinned_post"]["id"] == older["id"]
    async with api.factory() as db:
        manager = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == 1, CompanyMembership.user_id == 2))
        manager.corporate_role = "COMPANY_ADMIN"
        await db.commit()
    draft = await post(api, as_company_id=1, status="DRAFT")
    await call(api, "PATCH", f"/posts/{draft['id']}", json={"pinned": True})
    manager_page = (await call(api, "GET", "/feed", 2, params=params)).json()
    assert manager_page["pinned_post"] is None
    assert all(row["id"] != draft["id"] for row in manager_page["items"])


async def test_collection_append_after_deletions_and_full_duplicate_is_idempotent(api):
    rows = [await post(api, body=f"Материал {index}") for index in range(5)]
    collection = (await call(api, "POST", "/collections", json={"title": "Порядок материалов"})).json()
    path = f"/collections/{collection['id']}"
    for row in rows[:4]:
        added = (await call(api, "POST", path + "/items", json={"post_id": row["id"]})).json()
    for item in added["items"][:2]:
        assert (await call(api, "DELETE", path + f"/items/{item['id']}")).status_code == 200
    appended = (await call(api, "POST", path + "/items", json={"post_id": rows[4]["id"]})).json()
    assert [item["post"]["id"] for item in appended["items"]] == [row["id"] for row in rows[2:]]
    async with api.factory() as db:
        extra = [SocialPost(author_user_id=1, body=f"Полная подборка {index}") for index in range(197)]
        db.add_all(extra)
        await db.flush()
        db.add_all(SocialCollectionItem(collection_id=collection["id"], post_id=row.id, position=index+5) for index, row in enumerate(extra))
        await db.commit()
    repeated = await call(api, "POST", path + "/items", json={"post_id": rows[4]["id"]})
    assert repeated.status_code == 200 and repeated.json()["items_count"] == 200
    overflow = await call(api, "POST", path + "/items", json={"post_id": rows[0]["id"]})
    assert overflow.status_code == 422
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SocialCollectionItem).where(SocialCollectionItem.collection_id == collection["id"])) == 200


async def test_company_editor_reuses_attached_media_without_borrowing_other_files(api):
    async with api.factory() as db:
        manager = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == 1, CompanyMembership.user_id == 2))
        manager.corporate_role = "COMPANY_ADMIN"
        db.add_all(SocialMedia(id=index, owner_user_id=owner, storage_key=f"owned-{index}.webp", mime="image/webp", kind="IMAGE", bytes=20)
                   for index, owner in ((11, 1), (12, 1), (13, 3), (14, 1), (15, 2)))
        await db.commit()
    original = await post(api, as_company_id=1, media_ids=[11, 12])
    elsewhere = await post(api, media_ids=[14])
    path = f"/posts/{original['id']}"
    changed = await call(api, "PATCH", path, 2, json={"body": "Правка другого управляющего", "media_ids": [12, 11, 15]})
    assert changed.status_code == 200, changed.text
    assert [item["id"] for item in changed.json()["media"]] == [12, 11, 15]
    assert changed.json()["author"]["id"] == 1
    for forbidden in (13, 14):
        response = await call(api, "PATCH", path, 2, json={"media_ids": [12, forbidden]})
        assert response.status_code == 422
    assert (await call(api, "PATCH", path, 3, json={"media_ids": [12, 11, 15]})).status_code == 403
    assert [item["id"] for item in (await call(api, "GET", path)).json()["media"]] == [12, 11, 15]
    assert [item["id"] for item in (await call(api, "GET", f"/posts/{elsewhere['id']}")).json()["media"]] == [14]


async def test_company_editor_preserves_link_without_publishing_someone_elses_award(api):
    from app.engine.scenario import SCENARIOS
    async with api.factory() as db:
        manager = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == 1, CompanyMembership.user_id == 2))
        manager.corporate_role = "COMPANY_ADMIN"
        db.add_all([Achievement(id=50, user_id=1, code="first_session"), Achievement(id=51, user_id=2, code="first_session")])
        await db.commit()
    linked = {"kind": "ACHIEVEMENT", "id": "50"}
    original = await post(api, as_company_id=1, linked_content=linked)
    path = f"/posts/{original['id']}"
    changed = await call(api, "PATCH", path, 2, json={"body": "Правка компании", "linked_content": linked})
    assert changed.status_code == 200 and changed.json()["linked_content"]["available"] is True
    forbidden = await call(api, "PATCH", path, 2, json={"linked_content": {"kind": "ACHIEVEMENT", "id": "51"}})
    assert forbidden.status_code == 403
    async with api.factory() as db:
        await db.delete(await db.get(Achievement, 50))
        await db.commit()
    for payload in ({"body": "Правка после отзыва"}, {"linked_content": linked}):
        changed = await call(api, "PATCH", path, 2, json=payload)
        assert changed.status_code == 200 and changed.json()["linked_content"]["available"] is False
    public_link = {"kind": "SCENARIO", "id": next(iter(SCENARIOS))}
    changed = await call(api, "PATCH", path, 2, json={"linked_content": public_link})
    assert changed.status_code == 200 and changed.json()["linked_content"]["available"] is True
    removed = await call(api, "PATCH", path, 2, json={"linked_content": None})
    assert removed.status_code == 200 and removed.json()["linked_content"] is None
