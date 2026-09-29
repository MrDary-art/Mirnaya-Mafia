import asyncio
import time
from types import SimpleNamespace
import httpx
import pytest
from sqlalchemy import select
from app.main import app
from app.auth import create_token, hash_password, seed_users
from app.config import settings
from app.db import get_db
from app.models import User
from app.deployment_models import SpeechEnrollment, SpeechWorker
from app.routers import deployment
from .test_installation_speech import storage


async def test_legacy_room_socket_rejects_admin_before_accept(storage, monkeypatch):
    from app.routers import social
    from unittest.mock import AsyncMock, MagicMock
    monkeypatch.setattr(social, "SessionLocal", storage)
    headers = await admin_token(storage)
    socket = MagicMock(headers={}, close=AsyncMock(), accept=AsyncMock())
    await social.room_ws(socket, 99, headers["Authorization"].removeprefix("Bearer "))
    socket.close.assert_awaited_once()
    socket.accept.assert_not_awaited()


async def test_analytics_excludes_demo_and_preserves_report(client, storage):
    import json
    from datetime import datetime
    from app.models import Session
    headers = await admin_token(storage)
    async with storage() as db:
        db.add(User(id=3, username="demo-test", password_hash="unused", is_demo=1))
        for uid in (1, 2, 3):
            db.add(Session(id=uid, user_id=uid, mode="scenario", role="a", opponent_role="b", status="finished", finished_at=datetime.utcnow(), report='{"original":true}'))
        db.add(Session(id=4, user_id=1, mode="online", role="a", opponent_role="b", status="processing", state=json.dumps({"report_job":{"status":"failed"}})))
        await db.commit()
    data = (await client.get("/api/admin/analytics/overview", headers=headers)).json()
    assert data["registered"] == 1 and data["started"] == 2 and data["finished"] == 1
    rows = (await client.get("/api/admin/analytics/users?sort=completed", headers=headers)).json()
    assert rows["items"][0]["completed"] == 1 and rows["items"][0]["reports"] == 1
    assert (await client.get("/api/admin/analytics/sessions/1", headers=headers)).json()["report"] == {"original": True}
    first = await client.post("/api/admin/analytics/sessions/4/retry", headers=headers)
    second = await client.post("/api/admin/analytics/sessions/4/retry", headers=headers)
    assert first.json()["queued"] and not second.json()["queued"]


async def test_admin_reads_human_room_reports_without_regenerating(client, storage):
    import json
    from app.models import ArenaRoom, ArenaRoomMessage
    headers = await admin_token(storage)
    async with storage() as db:
        db.add(ArenaRoom(id=10, code="saved-room", mode="human", host_id=1, state=json.dumps({"reports":{"1":{"summary":"Сохранённый разбор"}},"processing_status":"ready"}), status="finished"))
        db.add(ArenaRoomMessage(room_id=10, user_id=1, text="Предлагаю обсудить сроки"))
        await db.commit()
    listed = (await client.get("/api/admin/analytics/rooms", headers=headers)).json()
    assert listed["total"] == 1 and listed["items"][0]["report_count"] == 1
    report = (await client.get("/api/admin/analytics/rooms/10", headers=headers)).json()
    assert report["reports"]["1"]["summary"] == "Сохранённый разбор"
    assert (await client.post("/api/admin/analytics/rooms/10/retry", headers=headers)).json() == {"queued":False}


@pytest.fixture
async def client(storage, monkeypatch):
    monkeypatch.setattr(deployment, "SessionLocal", storage)
    async def db_provider():
        async with storage() as db:
            yield db
    app.dependency_overrides[get_db] = db_provider
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def admin_token(storage, password="secure-password-for-tests"):
    password_hash = hash_password(password)
    async with storage() as db:
        db.add(User(id=2, username="admin", password_hash=password_hash, is_admin=1))
        await db.commit()
    return {"Authorization": "Bearer " + create_token(2, "admin", password_hash)}


async def test_admin_cannot_enter_user_endpoints(client, storage):
    headers = await admin_token(storage)
    assert (await client.get("/api/admin/installation", headers=headers)).status_code == 200
    for method, path in [("GET", "/api/profile"), ("GET", "/api/social/unread-count"), ("POST", "/api/sessions"), ("POST", "/api/rooms")]:
        response = await client.request(method, path, headers=headers, json={})
        assert response.status_code == 403, (path, response.text)


async def test_normal_user_cannot_admin_or_worker(client):
    headers = {"Authorization": "Bearer " + create_token(1, "alice")}
    assert (await client.get("/api/admin/installation", headers=headers)).status_code == 403
    assert (await client.post("/api/stt-workers/jobs/claim", headers=headers)).status_code == 401
    assert (await client.post("/api/auth/register", json={"username": "ADMIN", "password": "example-password"})).status_code == 400


async def test_default_admin_must_change_password_and_old_token_revoked(client, storage):
    headers = await admin_token(storage, "admin")
    assert (await client.get("/api/auth/me", headers=headers)).json()["must_change_password"]
    assert (await client.get("/api/admin/installation", headers=headers)).status_code == 403
    response = await client.post("/api/auth/password", headers=headers, json={"current": "admin", "password": "new-password-1234"})
    assert response.status_code == 200
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401


async def test_enrollment_atomic_single_use(client, storage, monkeypatch):
    monkeypatch.setattr(settings, "public_base_url", "https://arena.example.org")
    headers = await admin_token(storage)
    enrolled = await client.post("/api/admin/stt/enrollment", headers=headers, json={"name": "VM"})
    assert enrolled.status_code == 200
    body = {"code": enrolled.json()["code"], "protocol": 1}
    results = await asyncio.gather(client.post("/api/stt-workers/enroll", json=body), client.post("/api/stt-workers/enroll", json=body))
    assert sum(r.status_code == 200 for r in results) == 1
    success = next(r.json() for r in results if r.status_code == 200)
    async with storage() as db:
        worker = await db.get(SpeechWorker, success["id"])
        assert worker.ready == 0
        assert worker.token_hash != success["token"]
    await client.post(f"/api/admin/stt/workers/{success['id']}/revoke", headers=headers)
    assert (await client.post("/api/stt-workers/heartbeat", headers={"Authorization": "Bearer " + success["token"]}, json={"ready": True})).status_code == 401


async def test_validation_never_echoes_secret(client, storage):
    headers = await admin_token(storage)
    secret = "sensitive-key-" * 200
    response = await client.put("/api/admin/installation/ai", headers=headers, json={"revision": 1, "key": secret, "model": "GigaChat"})
    assert response.status_code == 422
    assert "sensitive-key" not in response.text


async def test_no_demo_users_without_explicit_flag(storage, monkeypatch):
    monkeypatch.setattr(settings, "seed_demo_accounts", False)
    async with storage() as db:
        await seed_users(db)
        assert await db.scalar(select(User.id).where(User.username == "demo")) is None


async def test_old_database_preserved_by_migration(tmp_path, monkeypatch):
    import sqlite3
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    path = tmp_path / "legacy.db"
    monkeypatch.setattr(settings, "db_path", str(path))
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "0028")
    with sqlite3.connect(path) as db:
        db.execute("insert into users (id,username,password_hash,is_admin) values (1,'real-user','original-hash',0)")
        db.execute("insert into sessions (id,user_id,mode,role,opponent_role,report) values (1,1,'scenario','a','b',?)", ('{"original":true}',))
        db.commit()
    command.upgrade(cfg, "head")
    with sqlite3.connect(path) as db:
        assert db.execute("select username,password_hash,is_demo from users where id=1").fetchone() == ("real-user", "original-hash", 0)
        assert db.execute("select report from sessions where id=1").fetchone()[0] == '{"original":true}'
        assert db.execute("select version_num from alembic_version").fetchone()[0] == "0031"
