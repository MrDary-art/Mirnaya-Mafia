import asyncio
import base64
import json
import time
from threading import Event

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select, update

from app.db import Base
from app.models import User
from app.deployment_models import SpeechJob, SpeechWorker, InstallationConfig
from app import speech_service as speech
from app import installation
from app.config import settings
from app.voice import LocalSTT


@pytest.fixture
async def storage(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(speech, "SessionLocal", factory)
    monkeypatch.setattr(installation, "SessionLocal", factory)
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "installation_key_file", str(tmp_path / 'private/key'))
    monkeypatch.setattr(settings, "gigachat_credentials", "")
    await installation.initialize_config(True)
    async with factory() as db:
        db.add(User(id=1, username="alice", password_hash="unused"))
        db.add(SpeechWorker(id="worker-a", name="A", token_hash="a" * 64, ready=1, last_seen=time.time(), diagnostic="{}"))
        db.add(SpeechWorker(id="worker-b", name="B", token_hash="b" * 64, ready=1, last_seen=time.time(), diagnostic="{}"))
        await db.commit()
    yield factory
    await engine.dispose()


async def queued(factory, policy="auto"):
    import uuid
    job = SpeechJob(id=str(uuid.uuid4()), owner_id=1, context="/test", request_key=str(uuid.uuid4()),
        audio_hash="d" * 64, audio_size=9600, policy=policy, revision=1, state="queued", created=time.time(), deadline=time.time()+90)
    async with factory() as db:
        db.add(job); await db.commit()
    return job.id


async def test_only_one_claim_wins(storage):
    job_id = await queued(storage)
    results = await asyncio.gather(speech.claim("worker-a"), speech.claim("worker-b"))
    winners = [r for r in results if r]
    assert len(winners) == 1
    assert winners[0]["id"] == job_id


async def test_expired_local_job_keeps_physical_cpu_slot(storage):
    job_id = await queued(storage, "local")
    async with storage() as db:
        await db.execute(update(SpeechJob).where(SpeechJob.id == job_id).values(state="local_running", deadline=time.time()-1))
        await db.commit()
    service = speech.SpeechService(object())
    occupied = object()
    service._jobs[job_id] = occupied
    await service.tick()
    async with storage() as db:
        job = await db.get(SpeechJob, job_id)
        assert job.state == "failed" and job.error == "deadline_exceeded"
    assert service._jobs[job_id] is occupied


async def test_duplicate_result_and_revoke(storage):
    job_id = await queued(storage)
    lease = await speech.claim("worker-a")
    await speech.finish_remote("worker-a", job_id, lease["lease"], "Ответ", "large-v3-turbo")
    repeat = await speech.finish_remote("worker-a", job_id, lease["lease"], "Другой ответ", "large-v3-turbo")
    assert repeat["duplicate"]
    async with storage() as db:
        assert (await db.get(SpeechJob, job_id)).result == "Ответ"
        await db.execute(update(SpeechWorker).where(SpeechWorker.id == "worker-a").values(revoked=1)); await db.commit()
    with pytest.raises(HTTPException):
        await speech.finish_remote("worker-a", job_id, lease["lease"], "Поздно", "large-v3-turbo")


async def test_late_remote_cannot_override_fallback(storage):
    job_id = await queued(storage)
    lease = await speech.claim("worker-a")
    async with storage() as db:
        await db.execute(update(SpeechJob).where(SpeechJob.id == job_id).values(state="local", lease_token=None)); await db.commit()
    with pytest.raises(HTTPException) as caught:
        await speech.finish_remote("worker-a", job_id, lease["lease"], "Late", "large-v3-turbo")
    assert caught.value.status_code == 409


async def test_timeout_remote_only_never_falls_back(storage):
    job_id = await queued(storage, "remote")
    async with storage() as db:
        await db.execute(update(SpeechJob).where(SpeechJob.id == job_id).values(created=time.time()-11)); await db.commit()
    service = speech.SpeechService(None)
    await service.tick()
    async with storage() as db:
        assert (await db.get(SpeechJob, job_id)).state == "failed"


async def test_configuration_compare_and_swap_and_secret(storage):
    async with storage() as db:
        revision, value = await installation.read_config(db)
        encrypted = installation.cipher().encrypt(b"client:secret").decode()
        result = await installation.save_config(db, revision, {"credential": encrypted}, None, "test")
        assert result["key_configured"] and "credential" not in result
        assert settings.gigachat_credentials == "client:secret"
        with pytest.raises(HTTPException) as caught:
            await installation.save_config(db, revision, {"model": "wrong"}, None, "test")
        assert caught.value.status_code == 409
        row = await db.get(InstallationConfig, 1)
        assert "client:secret" not in row.value


def test_key_validation():
    key = base64.b64encode(b"client:secret").decode()
    assert installation.normalize_key("  Basic " + key + "  ") == key
    for bad in ("garbage", "Basic Basic " + key, base64.b64encode(b"no-colon").decode()):
        with pytest.raises(HTTPException): installation.normalize_key(bad)


async def test_cancel_does_not_release_actual_cpu_job(monkeypatch):
    engine = LocalSTT()
    started, release = Event(), Event()
    def run(pcm):
        started.set(); release.wait(3); return "done"
    monkeypatch.setattr(engine, "_run", run)
    monkeypatch.setattr(settings, "stt_queue_limit", 0)
    first = asyncio.create_task(engine.transcribe(b"\x00\x01" * 4800))
    await asyncio.to_thread(started.wait, 2)
    first.cancel()
    with pytest.raises(asyncio.CancelledError): await first
    assert len(engine._tasks) == 1
    from app.voice import SpeechUnavailable
    with pytest.raises(SpeechUnavailable): await engine.transcribe(b"\x00\x01" * 4800)
    release.set()
    await asyncio.gather(*engine._tasks)
    await asyncio.sleep(0)
    assert not engine._tasks


async def test_silence_does_not_call_decoder(monkeypatch):
    engine = LocalSTT()
    from types import SimpleNamespace
    def fail(*a, **k): raise AssertionError("Decoder must not run on silence")
    engine._model = SimpleNamespace(transcribe=fail)
    assert await engine.transcribe(b"\0" * 16000) == ""


async def test_audio_idempotency_and_hash_conflict(storage, monkeypatch):
    class Local:
        _model_name = "tiny"
        async def transcribe(self, pcm): return "Проверка"
    service = speech.SpeechService(Local())
    token = speech.speech_context.set((1, "/test", "same-utterance"))
    try:
        call = asyncio.create_task(service.transcribe(b"\x00\x01" * 4800))
        await asyncio.sleep(.1); await service.tick()
        assert await asyncio.wait_for(call, 3) == "Проверка"
        assert await service.transcribe(b"\x00\x01" * 4800) == "Проверка"
        with pytest.raises(HTTPException) as caught:
            await service.transcribe(b"\x00\x02" * 4800)
        assert caught.value.status_code == 409
        async with storage() as db:
            assert len((await db.scalars(select(SpeechJob))).all()) == 1
    finally:
        speech.speech_context.reset(token)
