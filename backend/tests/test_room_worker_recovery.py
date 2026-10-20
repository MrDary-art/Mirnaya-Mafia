import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app  # Register all model tables, as in the room API tests.
from app.models import ArenaRoom, ArenaRoomJob, User
from app.routers import rooms
from tests.test_room_bookings import booking_env, body


def test_room_worker_recovers_interrupted_jobs_and_isolates_bad_lobbies(monkeypatch):
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        monkeypatch.setattr(rooms, "SessionLocal", factory)
        monkeypatch.setattr(rooms, "update_booking_notifications", AsyncMock(side_effect=RuntimeError("bad lobby")))
        completed = AsyncMock()
        monkeypatch.setattr(rooms, "process_room", completed)
        async with factory() as db:
            db.add(User(id=1, username="worker-test", password_hash="unused"))
            db.add_all([ArenaRoom(id=1, code="bad-lobby", host_id=1, mode="human", status="lobby", state="{}"),
                        ArenaRoom(id=2, code="recover-room", host_id=1, mode="human", status="processing", state="{}")])
            db.add(ArenaRoomJob(id=1, room_id=2, kind="finalize", status="running", attempts=1,
                               available_at=rooms.utcnow() - timedelta(minutes=10)))
            await db.commit()
        await rooms.room_worker_once()
        assert completed.await_count == 1
        async with factory() as db:
            job = await db.get(ArenaRoomJob, 1)
            assert job.status == "done"
            assert job.attempts == 2
        await engine.dispose()
    asyncio.run(run())


@pytest.mark.parametrize("cause", [RuntimeError("provider failed"), None])
def test_job_failure_survives_rollback_and_eventually_exposes_retry(monkeypatch, cause):
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        monkeypatch.setattr(rooms, "SessionLocal", factory)
        if cause is None:
            async def slow_report(*args):
                await asyncio.sleep(1)
            monkeypatch.setattr(rooms, "ROOM_JOB_TIMEOUT", 0.01)
            monkeypatch.setattr(rooms, "process_room", slow_report)
        else:
            monkeypatch.setattr(rooms, "process_room", AsyncMock(side_effect=cause))
        async with factory() as db:
            db.add(User(id=1, username="worker-failure", password_hash="unused"))
            db.add(ArenaRoom(id=1, code="failed-room", host_id=1, mode="human", status="processing", state='{"phase":"processing"}'))
            db.add(ArenaRoomJob(id=1, room_id=1, kind="finalize", status="pending", attempts=2,
                               available_at=rooms.utcnow() - timedelta(seconds=1)))
            await db.commit()
        await rooms.room_worker_once()
        async with factory() as db:
            job = await db.get(ArenaRoomJob, 1)
            room = await db.get(ArenaRoom, 1)
            assert job.status == "failed"
            assert job.error
            assert rooms.loads(room.state, {})["processing_status"] == "failed"
        await engine.dispose()
    asyncio.run(run())


def test_worker_loop_survives_iteration_error_and_keeps_cancellation(monkeypatch):
    async def run():
        once = AsyncMock(side_effect=[RuntimeError("database locked"), asyncio.CancelledError()])
        monkeypatch.setattr(rooms, "room_worker_once", once)
        monkeypatch.setattr(rooms.asyncio, "sleep", AsyncMock())
        with pytest.raises(asyncio.CancelledError):
            await rooms.room_worker_loop()
        assert once.await_count == 2
    asyncio.run(run())


def test_human_call_finishes_through_the_worker_and_exposes_personal_reports(booking_env, monkeypatch):
    client, headers, factory = booking_env
    monkeypatch.setattr(rooms, "SessionLocal", factory)
    monkeypatch.setattr(rooms, "analyze_block", AsyncMock(return_value={
        "trust_delta": 0, "goal_delta": 0, "control_delta": 0, "eq_delta": 0}))
    async def keep_evidence(report, state, settings):
        report["transcript"] = [{"text": item["text"]} for item in state["history"]]
        return report
    monkeypatch.setattr(rooms, "enrich_online_report", keep_evidence)
    request = body()
    request["scheduled_at"] = None
    response = client.post("/api/rooms", headers=headers[1], json=request)
    assert response.status_code == 200, response.text
    room = response.json()
    path = f"/api/rooms/{room['id']}"
    preview = client.get("/api/rooms/preview/" + room["code"], headers=headers[2]).json()
    joined = client.post("/api/rooms/join", headers=headers[2], json={
        "code": room["code"], "display_name": "Второй", "role_id": preview["available_roles"][0]["id"]})
    assert joined.status_code == 200, joined.text
    for uid in (1, 2):
        assert client.post(path + "/ready", headers=headers[uid], json={"ready": True, "text_only": True}).status_code == 200
    for uid, text in [(1, "Предлагаю обсудить бюджет поставки"), (2, "Согласен обсудить сроки и стоимость")]:
        assert client.post(path + "/message", headers=headers[uid], json={"text": text}).status_code == 200
    finished = client.post(path + "/finish", headers=headers[1])
    assert finished.json()["processing_status"] == "queued"
    asyncio.run(rooms.room_worker_once())
    for uid in (1, 2):
        result = client.get(path, headers=headers[uid]).json()
        assert result["phase"] == "finished"
        assert result["processing_status"] == "ready"
        assert result["your_report"]["transcript"]
