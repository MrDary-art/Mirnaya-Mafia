import asyncio

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.db import Base, get_db
from app.engine.theory import LESSONS
from app.main import app
from app.models import User


def test_theory_lesson_persists_progress_and_best_score():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add(User(id=901, username="theory-test", password_hash="unused"))
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    headers = {"Authorization": f"Bearer {create_token(901, 'theory-test')}"}
    try:
        client = TestClient(app)
        catalog = client.get("/api/theory", headers=headers).json()
        assert catalog["total"] == 10
        assert len(catalog["modules"]) == 4
        assert catalog["lessons"][0]["unlocked"] is True
        assert catalog["lessons"][1]["unlocked"] is False
        assert client.get("/api/theory/zopa", headers=headers).status_code == 403
        assert client.post("/api/theory/batna/start", headers=headers).status_code == 200
        assert client.put("/api/theory/batna/step", headers=headers, json={"current_step": 6}).json()["current_step"] == 6
        for exercise_id in ("batna-1", "batna-2", "batna-3", "batna-4", "batna-5", "batna-6"):
            reply = client.post(f"/api/theory/batna/practice/{exercise_id}", headers=headers, json={"option_id": "a"})
            assert reply.status_code == 200
        completed = client.post("/api/theory/batna/complete", headers=headers).json()
        assert completed["score"] == 100
        detail = client.get("/api/theory/batna", headers=headers).json()
        assert detail["progress"]["current_step"] == 13
        assert detail["progress"]["best_practice_score"] == 100
        replay = client.post("/api/theory/batna/start", headers=headers).json()
        assert replay["status"] == "in_progress"
        assert replay["current_step"] == 0
        assert replay["best_practice_score"] == 100
        assert client.get("/api/theory/batna", headers=headers).json()["answered"] == {}
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def test_theory_opens_lessons_in_order_and_completes_course():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add(User(id=902, username="theory-course", password_hash="unused"))
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    headers = {"Authorization": f"Bearer {create_token(902, 'theory-course')}"}
    try:
        client = TestClient(app)
        ordered = sorted(LESSONS.values(), key=lambda lesson: lesson["order"])
        for index, lesson in enumerate(ordered):
            detail = client.get(f"/api/theory/{lesson['id']}", headers=headers)
            assert detail.status_code == 200
            assert client.post(f"/api/theory/{lesson['id']}/start", headers=headers).status_code == 200
            for exercise in lesson["practice"]:
                reply = client.post(f"/api/theory/{lesson['id']}/practice/{exercise['id']}", headers=headers, json={"option_id": "a"})
                assert reply.status_code == 200
            completed = client.post(f"/api/theory/{lesson['id']}/complete", headers=headers)
            assert completed.status_code == 200
            assert completed.json()["score"] == 100
            if index + 1 < len(ordered):
                assert completed.json()["next_lesson_id"] == ordered[index + 1]["id"]
        catalog = client.get("/api/theory", headers=headers).json()
        assert catalog["completed"] == 10
        assert catalog["course"]["completed"] is True
        assert catalog["course"]["average_score"] == 100
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
