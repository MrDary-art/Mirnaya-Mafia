import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.db import Base, get_db
from app.main import app
from app.models import ArenaRoom, User
from app.routers import rooms


def test_human_room_two_users_and_private_access(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([User(id=101, username="host-test", password_hash="unused"), User(id=102, username="guest-test", password_hash="unused"), User(id=103, username="other-test", password_hash="unused")])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    monkeypatch.setattr(rooms, "generate_roles", AsyncMock(return_value={
        "host_role": "Заказчик", "guest_role": "Исполнитель", "host_brief": "Согласуйте бюджет", "guest_brief": "Защитите сроки",
    }))
    monkeypatch.setattr(rooms, "analyze_block", AsyncMock(return_value={
        "tki_style": "сотрудничество", "techniques": ["вопросы"], "comment": "Открытый вопрос",
        "trust_delta": 2, "goal_delta": 1, "control_delta": 3, "eq_delta": 0,
    }))
    headers = {uid: {"Authorization": f"Bearer {create_token(uid, name)}"} for uid, name in [(101, "host-test"), (102, "guest-test"), (103, "other-test")]}
    try:
        client = TestClient(app)
        created = client.post("/api/rooms", headers=headers[101], json={
            "mode": "human", "display_name": "Аня", "problem": "Согласовать бюджет", "goal": "Найти общие условия",
        })
        assert created.status_code == 200
        room = created.json()
        assert room["status"] == "waiting"
        assert room["your_role"] == "Заказчик"
        joined = client.post("/api/rooms/join", headers=headers[102], json={"code": room["code"], "display_name": "Борис"})
        assert joined.status_code == 200
        assert joined.json()["your_role"] == "Исполнитель"
        assert client.post(f"/api/rooms/{room['id']}/ready", headers=headers[101]).status_code == 200
        assert client.post(f"/api/rooms/{room['id']}/ready", headers=headers[102]).status_code == 200
        assert client.get(f"/api/rooms/{room['id']}", headers=headers[103]).status_code == 404
        posted = client.post(f"/api/rooms/{room['id']}/message", headers=headers[101], json={"text": "Какая цель для вас важнее?"})
        assert posted.status_code == 200
        view = client.get(f"/api/rooms/{room['id']}", headers=headers[102]).json()
        assert view["messages"][0]["user_id"] == 101
        assert view["metrics"]["trust"] == 50
        own = client.get(f"/api/rooms/{room['id']}", headers=headers[101]).json()
        assert own["metrics"]["trust"] == 52
        assert client.post(f"/api/rooms/{room['id']}/signal", headers=headers[103], json={"kind": "offer", "data": {}}).status_code == 404
        assert client.post(f"/api/rooms/{room['id']}/signal", headers=headers[101], json={"kind": "candidate", "data": {"candidate": "test"}}).status_code == 200
        assert len(client.get(f"/api/rooms/{room['id']}/signals", headers=headers[102]).json()) == 1
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def test_human_metrics_stay_bounded_after_many_turns():
    rows = [SimpleNamespace(user_id=1, text="Давайте обсудим", analysis='{"trust_delta":1000,"goal_delta":-1000,"control_delta":3,"eq_delta":0,"tki_style":"сотрудничество"}') for _ in range(12)]
    values = rooms.human_metrics(rows, 1)["metrics"]
    assert set(values) == {"trust", "goal", "control", "eq"}
    assert all(0 <= value <= 100 for value in values.values())


def test_duel_opens_with_same_question_and_enforces_deadline(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([User(id=201, username="first", password_hash="unused"), User(id=202, username="second", password_hash="unused")])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    async def expire(room_id):
        async with factory() as db:
            room = await db.get(ArenaRoom, room_id)
            room.started_at = datetime.now(timezone.utc) - timedelta(minutes=16)
            await db.commit()

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    monkeypatch.setattr(rooms, "generate_interview_questions", AsyncMock(return_value=["Первый вопрос?", "Второй?", "Третий?", "Четвёртый?"]))
    monkeypatch.setattr(rooms, "call_with_fallback_detailed", AsyncMock(return_value=('{"reason":"Оба участника получили одинаковое задание."}', "gigachat")))
    headers = {uid: {"Authorization": f"Bearer {create_token(uid, name)}"} for uid, name in [(201, "first"), (202, "second")]}
    try:
        client = TestClient(app)
        created = client.post("/api/rooms", headers=headers[201], json={"mode": "duel", "display_name": "Первый", "problem": "Собеседование на разработчика", "goal": "Получить работу"})
        assert created.status_code == 200
        room = created.json()
        joined = client.post("/api/rooms/join", headers=headers[202], json={"code": room["code"], "display_name": "Второй"})
        assert joined.status_code == 200
        assert client.post(f"/api/rooms/{room['id']}/ready", headers=headers[201]).status_code == 200
        assert client.post(f"/api/rooms/{room['id']}/ready", headers=headers[202]).status_code == 200
        own = client.get(f"/api/sessions/{room['your_session_id']}", headers=headers[201]).json()
        peer = client.get(f"/api/sessions/{joined.json()['your_session_id']}", headers=headers[202]).json()
        assert "Первый вопрос?" in own["messages"][0]["text"]
        assert "Первый вопрос?" in peer["messages"][0]["text"]
        assert client.get(f"/api/sessions/{joined.json()['your_session_id']}", headers=headers[201]).status_code == 404
        asyncio.run(expire(room["id"]))
        rejected = client.post(f"/api/sessions/{room['your_session_id']}/message", headers=headers[201], json={"text": "Продолжим после времени"})
        assert rejected.status_code == 400
        result = client.get(f"/api/rooms/{room['id']}", headers=headers[201]).json()
        assert result["status"] == "finished"
        assert set(result["comparison"]["verdicts"].values()) == {"НЕ ПРИНЯТ"}
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
