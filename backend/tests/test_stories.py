"""Story behavior is deterministic, private, durable, and published only after review."""

import asyncio
import copy
import json
from collections import OrderedDict
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import deployment_security
from app.auth import create_token, hash_password
from app.db import Base, get_db
from app.features.stories import StoryGraph, seed_stories
from app.models import Friendship, User
from app.routers.stories import admin_router, router
from app.story_models import Story, StoryAttempt, StoryFollow, StoryLike, StoryReport, StorySave


def graph():
    effect = {"trust": 20, "goal": -20, "control": 20, "eq": -20}
    option = lambda key, target: {"id": key, "text": f"Ответ {key}", "next": target,
                                 "effect": effect.copy(), "explanation": "Последствия конкретного решения"}
    return {"roles": [{"id": "employee", "label": "Сотрудник", "brief": "Обсудите условия", "start": "start"}],
            "nodes": {"start": {"speaker": "Коллега", "text": "Как поступим?",
                                "options": [option("talk", "step"), option("leave", "bad")]},
                      "step": {"speaker": "Коллега", "text": "Давайте уточним условия",
                               "options": [option("agree", "good"), option("stop", "bad")]}},
            "endings": {key: {"title": key, "text": f"Результат {key}", "lesson": "Оценка решений в этой истории"}
                        for key in ("good", "bad")}}


def story_body():
    return {"title": "Тестовая история", "hook": "Как договориться об условиях совместного проекта?",
            "topic": "team", "theme": "mint", "duration_seconds": 90, "graph": graph()}


@pytest.fixture
async def api(tmp_path, monkeypatch):
    monkeypatch.setattr(deployment_security, "_limits", OrderedDict())
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'stories-test.db').as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    admin_hash = hash_password("strong-story-admin-password")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        db.add_all([User(id=1, username="author", password_hash="unused", display_name="Автор"),
                    User(id=2, username="reader", password_hash="unused", display_name="Читатель"),
                    User(id=3, username="other", password_hash="unused", display_name="Закрытое имя", profile_visibility="private"),
                    User(id=4, username="moderator", password_hash=admin_hash, is_admin=1)])
        await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.include_router(admin_router, prefix="/api")

    async def provide_db():
        async with factory() as db:
            yield db

    app.dependency_overrides[get_db] = provide_db
    headers = {uid: {"Authorization": "Bearer " + create_token(uid, name, admin_hash if uid == 4 else "")}
               for uid, name in [(1, "author"), (2, "reader"), (3, "other"), (4, "moderator")]}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, factory=factory, headers=headers)
    await engine.dispose()


async def request(api, method, path, user=1, **kwargs):
    return await api.client.request(method, "/api" + path, headers=api.headers[user], **kwargs)


async def create(api, user=1):
    response = await request(api, "POST", "/stories", user, json=story_body())
    assert response.status_code == 200, response.text
    return response.json()


async def publish(api, user=1):
    story = await create(api, user)
    assert (await request(api, "POST", f"/stories/{story['id']}/submit", user)).status_code == 200
    result = await request(api, "POST", f"/admin/stories/{story['id']}/moderate", 4, json={"action": "publish"})
    assert result.status_code == 200, result.text
    return result.json()


@pytest.mark.parametrize("mutation", ["cycle", "missing", "unreachable", "duplicate_option", "duplicate_role",
                                      "overlap", "one_ending", "extra_metric", "wrong_type", "excess_nodes"])
def test_graph_rejects_invalid_paths_and_untrusted_fields(mutation):
    value = graph()
    if mutation == "cycle":
        value["nodes"]["step"]["options"][0]["next"] = "start"
    elif mutation == "missing":
        value["nodes"]["step"]["options"][0]["next"] = "missing"
    elif mutation == "unreachable":
        value["nodes"]["unused"] = copy.deepcopy(value["nodes"]["step"])
    elif mutation == "duplicate_option":
        value["nodes"]["step"]["options"][1]["id"] = "agree"
    elif mutation == "duplicate_role":
        value["roles"].append(value["roles"][0].copy())
    elif mutation == "overlap":
        value["endings"]["start"] = value["endings"].pop("good")
    elif mutation == "one_ending":
        value["endings"].pop("good")
    elif mutation == "extra_metric":
        value["nodes"]["step"]["options"][0]["effect"]["personality"] = 3
    elif mutation == "wrong_type":
        value["nodes"]["step"]["options"][0]["effect"]["eq"] = True
    else:
        value["nodes"].update({f"extra{n}": copy.deepcopy(value["nodes"]["step"]) for n in range(30)})
    with pytest.raises(ValidationError):
        StoryGraph.model_validate(value)


async def test_seed_idempotence_no_fake_activity_and_feed_pagination(api):
    from app.data.stories import SEED_STORIES

    assert len(SEED_STORIES) >= 6
    async with api.factory() as db:
        await seed_stories(db)
        row = await db.scalar(select(Story).order_by(Story.id).limit(1))
        row.title = "Сохранённая редакционная правка"
        await db.commit()
        await seed_stories(db)
        assert await db.scalar(select(func.count()).select_from(Story)) == len(SEED_STORIES)
        await db.refresh(row)
        assert row.title == "Сохранённая редакционная правка"
    first = (await request(api, "GET", "/stories?limit=2")).json()
    second = (await request(api, "GET", f"/stories?limit=2&offset={first['next_offset']}")).json()
    assert first["next_offset"] == 2
    assert not ({x["id"] for x in first["items"]} & {x["id"] for x in second["items"]})
    assert all(row["counts"] == {"likes": 0, "comments": 0, "plays": 0} for row in first["items"])
    assert all(row["author"]["id"] is None for row in first["items"])
    assert first["stats"] == {"completed": 0, "saved": 0, "following": 0}
    assert "graph" not in first["items"][0]
    assert "start" not in first["items"][0]["roles"][0]
    assert (await request(api, "GET", "/stories?tab=following")).json()["items"] == []
    assert (await request(api, "GET", "/stories?limit=21")).status_code == 422


async def test_auth_draft_privacy_and_moderated_publication(api):
    assert (await api.client.get("/api/stories")).status_code == 401
    story = await create(api)
    sid = story["id"]
    assert story["status"] == "draft"
    assert (await request(api, "GET", "/stories")).json()["items"] == []
    assert (await request(api, "GET", "/stories?tab=mine")).json()["items"][0]["id"] == sid
    for suffix in ("", "/draft", "/comments"):
        assert (await request(api, "GET", f"/stories/{sid}{suffix}", 2)).status_code == 404
    assert (await request(api, "POST", f"/stories/{sid}/attempts", 2, json={"role_id": "employee"})).status_code == 404
    assert (await request(api, "GET", "/admin/stories/queue")).status_code == 403
    assert (await request(api, "POST", f"/admin/stories/{sid}/moderate", json={"action": "publish"})).status_code == 403
    assert (await request(api, "POST", f"/stories/{sid}/submit")).json()["status"] == "pending"
    assert (await request(api, "PUT", f"/stories/{sid}", json=story_body())).status_code == 409
    assert (await request(api, "GET", "/stories", 2)).json()["items"] == []
    queue = (await request(api, "GET", "/admin/stories/queue", 4)).json()["items"]
    assert len(queue) == 1 and "graph" in queue[0]
    assert (await request(api, "POST", f"/admin/stories/{sid}/moderate", 4,
                          json={"action": "reject", "note": "Уточните условия"})).json()["status"] == "rejected"
    assert (await request(api, "PUT", f"/stories/{sid}", json=story_body())).json()["status"] == "draft"
    assert (await request(api, "POST", f"/stories/{sid}/submit")).status_code == 200
    assert (await request(api, "POST", f"/admin/stories/{sid}/moderate", 4,
                          json={"action": "publish", "note": "Проверено"})).json()["status"] == "published"
    public = (await request(api, "GET", f"/stories/{sid}", 2)).json()["story"]
    assert public["moderation_note"] is None
    assert (await request(api, "GET", f"/stories/{sid}/draft", 2)).status_code == 403
    assert (await request(api, "PUT", f"/stories/{sid}", json=story_body())).status_code == 409
    assert (await request(api, "POST", f"/stories/{sid}/submit")).status_code == 409
    assert (await request(api, "GET", "/stories", 4)).status_code == 403


async def test_attempt_clamps_once_private_snapshot_and_finished_conflict(api):
    story = await create(api)
    sid = story["id"]
    attempt = (await request(api, "POST", f"/stories/{sid}/attempts", json={"role_id": "employee"})).json()
    aid = attempt["id"]
    assert attempt["metrics"] == {key: 50 for key in ("trust", "goal", "control", "eq")}
    assert attempt["node"]["options"] == [{"id": "talk", "text": "Ответ talk"}, {"id": "leave", "text": "Ответ leave"}]
    assert "effect" not in json.dumps(attempt) and "next" not in json.dumps(attempt)
    resumed = (await request(api, "POST", f"/stories/{sid}/attempts", json={"role_id": "employee"})).json()
    assert resumed["id"] == aid
    assert (await request(api, "GET", f"/stories/attempts/{aid}", 2)).status_code == 404
    assert (await request(api, "POST", f"/stories/attempts/{aid}/choices", 2,
                          json={"node_id": "start", "option_id": "talk", "revision": 0})).status_code == 404
    changed = story_body()
    changed["graph"]["nodes"]["start"]["options"][0]["effect"]["trust"] = -20
    assert (await request(api, "PUT", f"/stories/{sid}", json=changed)).status_code == 200
    async with api.factory() as db:
        row = await db.get(StoryAttempt, aid)
        state = json.loads(row.state)
        state["metrics"] = {"trust": 90, "goal": 10, "control": 95, "eq": 5}
        row.state = json.dumps(state)
        await db.commit()
    invalid = await request(api, "POST", f"/stories/attempts/{aid}/choices",
                            json={"node_id": "start", "option_id": "hacked", "revision": 0})
    assert invalid.status_code == 422
    first = await request(api, "POST", f"/stories/attempts/{aid}/choices",
                          json={"node_id": "start", "option_id": "talk", "revision": 0})
    assert first.status_code == 200, first.text
    result = first.json()
    assert result["revision"] == 1 and result["status"] == "active"
    assert result["metrics"] == {"trust": 100, "goal": 0, "control": 100, "eq": 0}
    assert result["history"][0]["delta"] == {"trust": 10, "goal": -10, "control": 5, "eq": -5}
    assert (await request(api, "POST", f"/stories/attempts/{aid}/choices",
                          json={"node_id": "start", "option_id": "talk", "revision": 0})).status_code == 409
    assert (await request(api, "POST", f"/stories/attempts/{aid}/choices",
                          json={"node_id": "start", "option_id": "talk", "revision": 1})).status_code == 409
    final = (await request(api, "POST", f"/stories/attempts/{aid}/choices",
                           json={"node_id": "step", "option_id": "agree", "revision": 1})).json()
    assert final["status"] == "finished" and final["ending"]["id"] == "good" and final["node"] is None
    assert len(final["history"]) == 2 and set(final["history"][-1]["delta"].values()) == {0}
    assert (await request(api, "POST", f"/stories/attempts/{aid}/choices",
                          json={"node_id": "step", "option_id": "agree", "revision": 2})).status_code == 409
    assert (await request(api, "GET", f"/stories/attempts/{aid}")).json() == final
    assert (await request(api, "GET", f"/stories/{sid}")).json()["attempt"] == final
    retry = (await request(api, "POST", f"/stories/{sid}/attempts", json={"role_id": "employee"})).json()
    assert retry["id"] != aid and retry["metrics"]["trust"] == 50
    assert (await request(api, "GET", f"/stories/{sid}")).json()["attempt"]["id"] == retry["id"]


async def test_finished_report_survives_reload_without_leaking_to_other_user(api):
    story = await publish(api)
    sid = story["id"]
    attempt = (await request(api, "POST", f"/stories/{sid}/attempts", 2, json={"role_id": "employee"})).json()
    final = (await request(api, "POST", f"/stories/attempts/{attempt['id']}/choices", 2,
                           json={"node_id": "start", "option_id": "leave", "revision": 0})).json()
    assert final["status"] == "finished"
    restored = (await request(api, "GET", f"/stories/{sid}", 2)).json()
    assert restored["attempt"] == final
    assert (await request(api, "GET", f"/stories/{sid}", 3)).json()["attempt"] is None


async def test_concurrent_choices_only_one_commit(api):
    story = await publish(api)
    attempt = (await request(api, "POST", f"/stories/{story['id']}/attempts", 2, json={"role_id": "employee"})).json()
    responses = await asyncio.gather(*[request(api, "POST", f"/stories/attempts/{attempt['id']}/choices", 2,
                                              json={"node_id": "start", "option_id": option, "revision": 0})
                                      for option in ("talk", "leave")])
    assert sorted(response.status_code for response in responses) == [200, 409]
    final = (await request(api, "GET", f"/stories/attempts/{attempt['id']}", 2)).json()
    assert final["revision"] == 1 and len(final["history"]) == 1


async def test_concurrent_starts_resume_single_active_attempt(api):
    story = await publish(api)
    responses = await asyncio.gather(*[
        request(api, "POST", f"/stories/{story['id']}/attempts", 2, json={"role_id": "employee"})
        for _ in range(2)
    ])
    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(StoryAttempt)) == 1


async def test_likes_saves_follow_are_idempotent_and_real(api):
    story = await publish(api)
    sid = story["id"]
    for _ in range(2):
        liked = (await request(api, "PUT", f"/stories/{sid}/like", 2, json={"active": True})).json()
        saved = (await request(api, "PUT", f"/stories/{sid}/save", 2, json={"active": True})).json()
        followed = await request(api, "PUT", "/stories/authors/1/follow", 2, json={"active": True})
        assert followed.status_code == 200
    assert liked["counts"]["likes"] == 1 and liked["liked"] and saved["saved"]
    async with api.factory() as db:
        for model in (StoryLike, StorySave, StoryFollow):
            assert await db.scalar(select(func.count()).select_from(model)) == 1
    following = (await request(api, "GET", "/stories?tab=following", 2)).json()
    assert following["items"][0]["id"] == sid and following["items"][0]["author"]["following"]
    assert following["stats"] == {"completed": 0, "saved": 1, "following": 1}
    assert (await request(api, "GET", "/stories?tab=saved", 2)).json()["items"][0]["id"] == sid
    for _ in range(2):
        assert (await request(api, "PUT", f"/stories/{sid}/like", 2, json={"active": False})).json()["counts"]["likes"] == 0
        assert (await request(api, "PUT", f"/stories/{sid}/save", 2, json={"active": False})).json()["saved"] is False
        assert (await request(api, "PUT", "/stories/authors/1/follow", 2, json={"active": False})).json() == {"following": False}
    assert (await request(api, "PUT", "/stories/authors/2/follow", 2, json={"active": True})).status_code == 404


async def test_comments_permissions_privacy_bounds_and_blocks(api):
    story = await publish(api)
    sid = story["id"]
    for value in ("   ", "x" * 1001):
        assert (await request(api, "POST", f"/stories/{sid}/comments", 2, json={"text": value})).status_code == 422
    first = (await request(api, "POST", f"/stories/{sid}/comments", 3, json={"text": "  Мой вариант  "})).json()
    assert first["text"] == "Мой вариант" and first["can_delete"]
    visible = (await request(api, "GET", f"/stories/{sid}/comments", 2)).json()["items"][0]
    assert visible["author"]["display_name"] == "other" and not visible["can_delete"]
    assert (await request(api, "DELETE", f"/stories/comments/{first['id']}", 2)).status_code == 403
    async with api.factory() as db:
        db.add(Friendship(user_id=3, friend_id=2, status="BLOCKED"))
        await db.commit()
    assert (await request(api, "GET", f"/stories/{sid}/comments", 2)).json()["items"] == []
    assert (await request(api, "DELETE", f"/stories/comments/{first['id']}", 3)).json() == {"ok": True}
    second = (await request(api, "POST", f"/stories/{sid}/comments", 2, json={"text": "Вторая реплика"})).json()
    review = (await request(api, "GET", f"/admin/stories/{sid}/comments", 4)).json()["items"]
    assert review[0]["id"] == second["id"] and review[0]["can_delete"]
    assert (await request(api, "DELETE", f"/admin/stories/comments/{second['id']}", 4)).json() == {"ok": True}
    assert (await request(api, "GET", f"/stories/{sid}", 2)).json()["story"]["counts"]["comments"] == 0


async def test_report_dedup_hide_and_author_block_visibility(api):
    story = await publish(api)
    sid = story["id"]
    for _ in range(2):
        assert (await request(api, "POST", f"/stories/{sid}/report", 2, json={"reason": "Нужна проверка"})).status_code == 200
    queue = (await request(api, "GET", "/admin/stories/queue", 4)).json()["items"]
    assert len(queue) == 1 and queue[0]["reports_count"] == 1
    assert queue[0]["reports"][0]["reason"] == "Нужна проверка"
    assert set(queue[0]["reports"][0]) == {"id", "reason", "created_at"}
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(StoryReport)) == 1
        db.add(Friendship(user_id=1, friend_id=2, status="BLOCKED"))
        await db.commit()
    assert (await request(api, "GET", "/stories", 2)).json()["items"] == []
    for suffix in ("", "/comments"):
        assert (await request(api, "GET", f"/stories/{sid}{suffix}", 2)).status_code == 404
    assert (await request(api, "PUT", "/stories/authors/1/follow", 2, json={"active": True})).status_code == 404
    hidden = await request(api, "POST", f"/admin/stories/{sid}/moderate", 4, json={"action": "hide", "note": "Скрыта после проверки"})
    assert hidden.json()["status"] == "hidden"
    assert (await request(api, "GET", f"/stories/{sid}", 3)).status_code == 404
    assert (await request(api, "GET", "/stories?tab=mine")).json()["items"][0]["status"] == "hidden"
    assert (await request(api, "PUT", f"/stories/{sid}", json=story_body())).status_code == 409


async def test_russian_casefold_search_and_dismiss_report(api):
    story = await publish(api)
    sid = story["id"]
    for query in ("ТЕСТОВАЯ", "тестовая", "СоВмЕсТнОгО"):
        result = await request(api, "GET", "/stories", 2, params={"q": query})
        assert result.json()["items"][0]["id"] == sid
    assert (await request(api, "GET", "/stories", 2, params={"q": "%"})).json()["items"] == []
    assert (await request(api, "POST", f"/stories/{sid}/report", 2, json={"reason": "Проверить"})).status_code == 200
    assert (await request(api, "POST", f"/admin/stories/{sid}/moderate", 4,
                          json={"action": "dismiss"})).json()["status"] == "published"
    assert (await request(api, "GET", "/admin/stories/queue", 4)).json()["items"] == []
    assert (await request(api, "GET", f"/stories/{sid}", 2)).status_code == 200


async def test_moderation_report_details_are_bounded_without_identity(api):
    story = await publish(api)
    async with api.factory() as db:
        for number in range(10, 22):
            db.add(User(id=number, username=f"reporter-{number}", password_hash="unused"))
        await db.flush()
        db.add_all([StoryReport(story_id=story["id"], user_id=number, reason=f"Причина {number}")
                    for number in range(10, 22)])
        await db.commit()
    item = (await request(api, "GET", "/admin/stories/queue", 4)).json()["items"][0]
    assert item["reports_count"] == 12 and len(item["reports"]) == 10
    assert all(set(report) == {"id", "reason", "created_at"} for report in item["reports"])


async def test_can_unfollow_hidden_or_blocked_author(api):
    story = await publish(api)
    sid = story["id"]
    assert (await request(api, "PUT", "/stories/authors/1/follow", 2, json={"active": True})).status_code == 200
    async with api.factory() as db:
        db.add(Friendship(user_id=1, friend_id=2, status="BLOCKED"))
        await db.commit()
    assert (await request(api, "POST", f"/admin/stories/{sid}/moderate", 4, json={"action": "hide"})).status_code == 200
    assert (await request(api, "PUT", "/stories/authors/1/follow", 2, json={"active": False})).json() == {"following": False}
    async with api.factory() as db:
        assert await db.scalar(select(func.count()).select_from(StoryFollow)) == 0


def test_every_role_needs_alternative_endings():
    value = graph()
    value["nodes"]["single"] = copy.deepcopy(value["nodes"]["step"])
    for option in value["nodes"]["single"]["options"]:
        option["next"] = "good"
    value["roles"].append({"id": "boss", "label": "Руководитель", "brief": "Вторая сторона", "start": "single"})
    with pytest.raises(ValidationError, match="две достижимые"):
        StoryGraph.model_validate(value)


async def test_invalid_body_cannot_inject_server_state_or_publication(api):
    for extra in ({"status": "published"}, {"author_id": 4}, {"metrics": {"goal": 100}}):
        assert (await request(api, "POST", "/stories", json={**story_body(), **extra})).status_code == 422
    body = story_body()
    body["graph"]["nodes"]["start"]["options"][0]["next"] = "absent"
    assert (await request(api, "POST", "/stories", json=body)).status_code == 422


async def test_story_follow_cannot_bypass_closed_profile_policy(api):
    await publish(api, 3)
    assert (await request(api, "PUT", "/stories/authors/3/follow", 2, json={"active": True})).status_code == 403
    assert (await request(api, "PUT", "/stories/authors/3/follow", 2, json={"active": False})).status_code == 200
