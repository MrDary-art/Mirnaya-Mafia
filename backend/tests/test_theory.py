import asyncio

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.db import Base, get_db
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
        assert client.get("/api/theory", headers=headers).json()["total"] == 2
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
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
