"""Durable outbound speech protocol v1. No transaction spans network/long polling."""
import asyncio
import contextvars
import hashlib
import json
import os
import secrets
import time
import uuid
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select, update, func
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.db import SessionLocal
from app.deployment_models import SpeechJob, SpeechWorker
from app.installation import read_config

PROTOCOL = 1
speech_context = contextvars.ContextVar("speech_context", default=None)
speech_policy_override = contextvars.ContextVar("speech_policy_override", default=None)
_submission_lock = asyncio.Lock()


def audio_path(job_id):
    # Only server generated UUIDs are allowed as paths.
    return Path(settings.data_dir) / "private" / "speech" / (str(uuid.UUID(job_id)) + ".pcm")


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def now():
    return time.time()


async def ready_worker(db):
    return await db.scalar(select(SpeechWorker.id).where(
        SpeechWorker.revoked == 0, SpeechWorker.ready == 1, SpeechWorker.last_seen > now() - 30).limit(1))


async def claim(worker_id):
    async with SessionLocal() as db:
        worker = await db.get(SpeechWorker, worker_id)
        if not worker or worker.revoked or not worker.ready:
            return None
        # At most one outstanding lease per worker; one API process.
        busy = await db.scalar(select(SpeechJob.id).where(SpeechJob.worker_id == worker_id,
            SpeechJob.state == "leased", SpeechJob.lease_until > now()).limit(1))
        if busy:
            return None
        job_id = await db.scalar(select(SpeechJob.id).where(SpeechJob.state == "queued",
            SpeechJob.deadline > now()).order_by(SpeechJob.created).limit(1))
        if not job_id:
            return None
        token = secrets.token_hex(32)
        result = await db.execute(update(SpeechJob).where(SpeechJob.id == job_id, SpeechJob.state == "queued").values(
            state="leased", worker_id=worker_id, lease_token=token, lease_until=now() + 60,
            attempt=SpeechJob.attempt + 1))
        await db.commit()
        if result.rowcount != 1:
            return None
        job = await db.get(SpeechJob, job_id)
        return {"protocol": PROTOCOL, "id": job.id, "lease": token, "deadline": job.deadline,
                "audio_path": f"/api/stt-workers/jobs/{job.id}/audio", "format": "pcm_s16le",
                "sample_rate": 16000, "channels": 1, "bytes": job.audio_size, "sha256": job.audio_hash}


async def owned_job(db, worker_id, job_id, lease, *, completed=False):
    job = await db.get(SpeechJob, job_id)
    worker = await db.get(SpeechWorker, worker_id)
    if not worker or worker.revoked or not job or job.worker_id != worker_id or not secrets.compare_digest(job.lease_token or "", lease):
        raise HTTPException(409, "Задание больше не принадлежит этому worker")
    if completed and job.state in {"ready", "no_speech", "failed"} and job.provider == "remote":
        return job
    if job.state != "leased" or (job.lease_until or 0) <= now() or job.deadline <= now():
        raise HTTPException(409, "Срок задания истёк")
    return job


async def finish_remote(worker_id, job_id, lease, text, model, error=None):
    async with SessionLocal() as db:
        job = await owned_job(db, worker_id, job_id, lease, completed=True)
        if job.state != "leased":
            return {"accepted": True, "duplicate": True}
        if error and job.policy == "auto":
            state = "local"
            # Cool down a worker that cannot decode, don't route every next recording to it.
            await db.execute(update(SpeechWorker).where(SpeechWorker.id == worker_id).values(ready=0))
        else:
            state = "failed" if error else "ready" if text.strip() else "no_speech"
        result = await db.execute(update(SpeechJob).where(SpeechJob.id == job_id, SpeechJob.state == "leased",
            SpeechJob.lease_token == lease, SpeechJob.deadline > now(), SpeechJob.lease_until > now(),
            SpeechJob.worker_id.in_(select(SpeechWorker.id).where(SpeechWorker.revoked == 0))).values(state=state, result=text.strip() if not error else None,
            error=error, provider="remote", model=model, finished=now() if state != "local" else None))
        await db.commit()
        if result.rowcount != 1:
            raise HTTPException(409, "Результат уже обработан")
        if state != "local":
            audio_path(job_id).unlink(missing_ok=True)
        return {"accepted": True}


class SpeechService:
    def __init__(self, local):
        self.local = local
        self._jobs = {}
        self._claim_lock = asyncio.Lock()

    async def warm(self):
        await self.local.warm()

    async def transcribe(self, pcm):
        from app.voice import SpeechUnavailable
        if not 9600 <= len(pcm) <= 1_280_000 or len(pcm) % 2:
            raise SpeechUnavailable("Нужна запись PCM 16 кГц, моно, от 0,3 до 40 секунд")
        context = speech_context.get()
        if context is None:
            # Internal diagnostics/tests have no user transcript or remote scope.
            return await self.local.transcribe(pcm)
        owner, path, key = context
        key = key or str(uuid.uuid4())
        if len(key) > 100:
            raise HTTPException(422, "Слишком длинный идентификатор записи")
        audio_hash = hashlib.sha256(pcm).hexdigest()
        async with _submission_lock:
            async with SessionLocal() as db:
                job = await db.scalar(select(SpeechJob).where(SpeechJob.owner_id == owner,
                    SpeechJob.context == path, SpeechJob.request_key == key))
                if job and job.audio_hash != audio_hash:
                    raise HTTPException(409, "Этот идентификатор уже использован для другой записи")
                if not job:
                    pending = await db.scalar(select(func.count()).select_from(SpeechJob).where(
                        SpeechJob.state.in_(["queued", "leased", "local", "local_running"])))
                    if pending >= settings.stt_queue_limit:
                        raise HTTPException(429, "Очередь распознавания заполнена. Повторите позже.")
                    revision, cfg = await read_config(db)
                    policy = speech_policy_override.get() or cfg.get("stt_policy", "local")
                    remote = await ready_worker(db) if policy != "local" else None
                    if policy == "remote" and not remote:
                        raise HTTPException(503, "Внешнее распознавание сейчас недоступно")
                    job = SpeechJob(id=str(uuid.uuid4()), owner_id=owner, context=path, request_key=key,
                        audio_hash=audio_hash, audio_size=len(pcm), policy=policy, revision=revision,
                        state="queued" if remote else "local", created=now(), deadline=now() + 90)
                    target = audio_path(job.id)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
                        f.write(pcm)
                    db.add(job)
                    try:
                        await db.commit()
                    except Exception:
                        target.unlink(missing_ok=True)
                        raise
                job_id = job.id
        # A disconnected browser doesn't cancel decoding or discard a result.
        while True:
            async with SessionLocal() as db:
                job = await db.get(SpeechJob, job_id)
                if job.state == "ready":
                    return job.result
                if job.state == "no_speech":
                    return ""
                if job.state in {"failed", "cancelled"}:
                    raise SpeechUnavailable("Запись не распознана. Повторите попытку. " + (job.error or ""))
            await asyncio.sleep(0.25)

    async def stream_transcribe(self, pcm):
        # Remote service returns final text, not simulated partial tokens.
        text = await self.transcribe(pcm)
        if text:
            yield text

    async def _local_job(self, job_id):
        state, text, error = "failed", None, "local_unavailable"
        try:
            text = await self.local.transcribe(audio_path(job_id).read_bytes())
            state, error = ("ready" if text else "no_speech"), None
        except asyncio.CancelledError:
            # A restart recovers local_running. Do not falsely release a live worker.
            raise
        except Exception:
            pass
        async with SessionLocal() as db:
            await db.execute(update(SpeechJob).where(SpeechJob.id == job_id, SpeechJob.state == "local_running").values(
                state=state, result=text, error=error, provider="local", model=self.local._model_name, finished=now()))
            await db.commit()
        audio_path(job_id).unlink(missing_ok=True)

    async def recover(self):
        async with SessionLocal() as db:
            await db.execute(update(SpeechJob).where(SpeechJob.state == "local_running").values(state="local"))
            await db.commit()

    async def tick(self):
        async with SessionLocal() as db:
            jobs = (await db.scalars(select(SpeechJob).where(SpeechJob.state.in_(["queued", "leased", "local", "local_running"])))).all()
            for job in jobs:
                expired = job.deadline <= now()
                worker = await db.get(SpeechWorker, job.worker_id) if job.worker_id else None
                unavailable = job.state == "leased" and (not worker or worker.revoked or worker.last_seen <= now() - 30 or (job.lease_until or 0) <= now())
                assignment_timeout = job.state == "queued" and now() - job.created >= 10
                if expired or unavailable or assignment_timeout:
                    state = "local" if job.policy == "auto" and not expired else "failed"
                    await db.execute(update(SpeechJob).where(SpeechJob.id == job.id, SpeechJob.state == job.state).values(
                        state=state, lease_token=None, error="deadline_exceeded" if expired else "remote_timeout", finished=now() if state == "failed" else None))
            await db.commit()
            # Only one local job; this remains reserved until the thread really finishes.
            if not self._jobs:
                job = await db.scalar(select(SpeechJob).where(SpeechJob.state == "local").order_by(SpeechJob.created).limit(1))
                if job:
                    await db.execute(update(SpeechJob).where(SpeechJob.id == job.id, SpeechJob.state == "local").values(state="local_running"))
                    await db.commit()
                    task = asyncio.create_task(self._local_job(job.id))
                    self._jobs[job.id] = task
                    def finished(done, job_id=job.id):
                        self._jobs.pop(job_id, None)
                        if not done.cancelled():
                            done.exception()
                    task.add_done_callback(finished)
            old = (await db.scalars(select(SpeechJob.id).where(SpeechJob.state.in_(["ready", "no_speech", "failed", "cancelled"]),
                SpeechJob.created < now() - 86400))).all()
            for job_id in old:
                audio_path(job_id).unlink(missing_ok=True)

    async def run(self):
        await self.recover()
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                import logging
                logging.getLogger(__name__).warning("Speech queue retry after storage failure")
            await asyncio.sleep(0.5)
