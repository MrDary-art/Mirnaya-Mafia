import time

import pytest
from sqlalchemy import update

from app import server_status as telemetry
from app.deployment_models import SpeechWorker
from app.routers import deployment
from app.voice import local_engine
from .test_installation_security import admin_token, client, storage


def test_cpu_percent_uses_elapsed_ticks_and_handles_counter_reset():
    assert telemetry.cpu_percent((100, 200), (125, 300)) == 25
    assert telemetry.cpu_percent((100, 200), (100, 200)) is None
    assert telemetry.cpu_percent((100, 200), (20, 300)) == 0


def test_resource_failure_is_unavailable_not_zero(monkeypatch, tmp_path):
    def unavailable():
        raise OSError("unsupported host")
    monkeypatch.setattr(telemetry, "_cpu_times", unavailable)
    monkeypatch.setattr(telemetry, "_memory", unavailable)
    result = telemetry.resource_snapshot(tmp_path)
    assert result["cpu_percent"] is None and result["memory"] is None
    assert result["unavailable"] == ["cpu", "memory"]
    assert 0 <= result["disk"]["percent"] <= 100


async def test_server_status_requires_admin(client):
    from app.auth import create_token
    assert (await client.get("/api/admin/server-status")).status_code == 401
    assert (await client.get("/api/admin/server-status", headers={
        "Authorization": "Bearer " + create_token(1, "alice", "unused")})).status_code == 403


async def test_status_uses_worker_heartbeat_and_does_not_load_model(client, storage, monkeypatch):
    headers = await admin_token(storage)
    async def config(_db):
        return 1, {"stt_policy": "remote"}
    monkeypatch.setattr(deployment, "read_config", config)
    monkeypatch.setattr(telemetry, "resource_snapshot", lambda _path: {
        "cpu_percent": 42, "memory": None, "disk": None, "unavailable": ["memory", "disk"]})
    monkeypatch.setattr(local_engine, "_model", None)
    async with storage() as db:
        await db.execute(update(SpeechWorker).where(SpeechWorker.id == "worker-a").values(last_seen=time.time(), ready=1))
        await db.execute(update(SpeechWorker).where(SpeechWorker.id == "worker-b").values(last_seen=time.time() - 90, ready=1))
        await db.commit()
    response = await client.get("/api/admin/server-status", headers=headers)
    assert response.status_code == 200
    value = response.json()
    assert value["refresh_seconds"] == 60 and value["resources"]["cpu_percent"] == 42
    assert value["whisper"]["ready"] is True and value["whisper"]["remote_ready"] == 1
    assert value["whisper"]["remote_total"] == 2
    assert value["api_uptime_seconds"] >= 0
    assert local_engine._model is None
    async with storage() as db:
        await db.execute(update(SpeechWorker).values(revoked=1))
        await db.commit()
    value = (await client.get("/api/admin/server-status", headers=headers)).json()
    assert value["whisper"]["ready"] is False and value["whisper"]["remote_ready"] == 0
