"""Installation administration and scoped outbound speech worker protocol."""
import asyncio
import json
import secrets
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update, func, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin
from app.config import settings
from app.db import get_db, SessionLocal
from app.models import User, Session, Message, ArenaRoom, ArenaRoomMessage
from app.company_models import Company, CompanyMembership
from app.deployment_models import AdminAudit, SpeechEnrollment, SpeechWorker, SpeechJob
from app.deployment_security import rate_limit
from app.installation import (read_config, public_config, save_config, config_lock, cipher,
                              normalize_key, check_gigachat)
from app.speech_service import PROTOCOL, digest, claim, owned_job, finish_remote, audio_path, speech_context, speech_policy_override

router = APIRouter(tags=["installation"])
_claim_lock = asyncio.Lock()


@router.get("/installation/status")
async def installation_status(db: AsyncSession = Depends(get_db)):
    _, value = await read_config(db)
    return {"needs_setup": bool(value.get("fresh_install") and not value.get("onboarding_completed"))}


@router.get("/admin/installation")
async def config(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    revision, value = await read_config(db)
    return public_config(revision, value)


class Revision(BaseModel):
    revision: int = Field(ge=1)


@router.post("/admin/installation/complete")
async def complete(body: Revision, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    async with config_lock:
        return await save_config(db, body.revision, {"onboarding_completed": time.time()}, admin.id, "onboarding.completed")


class AIConfig(Revision):
    key: str = Field(default="", max_length=2048, repr=False)
    scope: Literal["GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"] = "GIGACHAT_API_PERS"
    model: str = Field(min_length=1, max_length=100)


async def ai_candidate(body, db):
    _, current = await read_config(db)
    key = normalize_key(body.key) if body.key.strip() else cipher().decrypt(current["credential"].encode()).decode() if current.get("credential") else ""
    if not key:
        raise HTTPException(422, "Введите Authorization Key")
    checked = await check_gigachat(key, body.scope, body.model)
    return key, checked


@router.post("/admin/installation/ai/check")
async def check_ai(body: AIConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("ai-check", admin.id, 6)
    _, checked = await ai_candidate(body, db)
    return checked


@router.put("/admin/installation/ai")
async def save_ai(body: AIConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("ai-save", admin.id, 6)
    key, checked = await ai_candidate(body, db)
    async with config_lock:
        return await save_config(db, body.revision, {"credential": cipher().encrypt(key.encode()).decode(),
            "scope": body.scope, "model": body.model, "ai_check": checked}, admin.id, "ai.updated")


class SpeechConfig(Revision):
    policy: Literal["local", "auto", "remote"]
    model: Literal["tiny", "base", "small"]


@router.put("/admin/installation/speech")
async def save_speech(body: SpeechConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.voice import local_engine, SpeechUnavailable
    from app.speech_service import _submission_lock
    async with config_lock, _submission_lock:
        revision, _ = await read_config(db)
        if revision != body.revision:
            raise HTTPException(409, "Обновите настройки перед сохранением")
        active = await db.scalar(select(func.count()).select_from(SpeechJob).where(
            SpeechJob.state.in_(["queued", "leased", "local", "local_running"])))
        if body.model != settings.stt_model:
            if active:
                raise HTTPException(409, "Дождитесь окончания локального распознавания")
            try:
                await local_engine.select_model(body.model)
            except SpeechUnavailable as exc:
                raise HTTPException(409, str(exc)) from None
        try:
            return await save_config(db, body.revision, {"stt_policy": body.policy, "stt_model": body.model}, admin.id, "speech.updated")
        except Exception:
            # A failed database write must not activate an unpersisted model.
            await db.rollback()
            _, stored = await read_config(db)
            settings.stt_model = stored["stt_model"]
            local_engine._model = None
            local_engine._model_name = None
            raise


@router.get("/admin/models")
async def models(admin=Depends(get_admin)):
    from app import model_downloads
    from app.voice import local_engine
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parents[3]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    from install.resources import MANIFEST
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["resources"]
    return {"download": dict(model_downloads.state), "loaded": local_engine._model_name,
            "items": [{"name": name, "bytes": sum(x["bytes"] for x in manifest[name]["files"]),
                       "present": all((Path(settings.models_dir) / manifest[name]["directory"] / f["path"]).is_file() and
                                      (Path(settings.models_dir) / manifest[name]["directory"] / f["path"]).stat().st_size == f["bytes"]
                                      for f in manifest[name]["files"])} for name in ("tiny", "base", "small", "piper")]}


@router.post("/admin/models/{name}/download")
async def download_model(name: Literal["tiny", "base", "small", "piper"], admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app import model_downloads
    if not await model_downloads.start(name):
        raise HTTPException(409, "Уже идёт загрузка другой модели")
    db.add(AdminAudit(actor_id=admin.id, action="model.download", detail=json.dumps({"name": name}), created=time.time()))
    await db.commit()
    return {"accepted": True}


@router.post("/admin/stt/test")
async def test_speech(request: Request, policy: Literal["local", "remote"] = "local", admin=Depends(get_admin)):
    from app.voice import local_stt, SpeechUnavailable
    data = bytearray()
    if request.headers.get("x-audio-format") != "pcm_s16le" or request.headers.get("x-audio-rate") != "16000":
        raise HTTPException(415, "Нужна запись PCM16 mono 16 кГц")
    async for block in request.stream():
        data.extend(block)
        if len(data) > 1280000:
            raise HTTPException(413, "Запись длиннее 40 секунд")
    key = request.headers.get("x-utterance-id") or str(uuid.uuid4())
    context = speech_context.set((admin.id, "/api/admin/stt/test", key))
    override = speech_policy_override.set(policy)
    started = time.monotonic()
    try:
        text = await local_stt.transcribe(bytes(data))
        return {"transcript": text, "silence": not bool(text), "provider": policy, "seconds": round(time.monotonic() - started, 2)}
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from None
    finally:
        speech_context.reset(context)
        speech_policy_override.reset(override)


@router.post("/admin/tts/test")
async def test_voice(admin=Depends(get_admin)):
    from app.voice import local_tts, SpeechUnavailable
    try:
        wav = await local_tts.synthesize("Здравствуйте. Это голос мастера переговоров. Запишите ответ, чтобы проверить распознавание.")
        return Response(wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from None


class EnrollmentName(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@router.post("/admin/stt/enrollment")
async def enrollment(body: EnrollmentName, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("enrollment", admin.id, 6)
    from urllib.parse import urlsplit
    parsed = urlsplit(settings.public_base_url)
    if not settings.allow_local_worker and (parsed.scheme != "https" or not parsed.hostname or parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise HTTPException(409, "Сначала задайте публичный HTTPS-адрес установки. Локальная ссылка недоступна из МИРЭА.")
    code = secrets.token_urlsafe(32)
    await db.execute(update(SpeechEnrollment).values(used=1))
    db.add(SpeechEnrollment(code_hash=digest(code), name=body.name, expires=time.time() + 600, used=0))
    db.add(AdminAudit(actor_id=admin.id, action="worker.enrollment", detail="{}", created=time.time()))
    await db.commit()
    return {"code": code, "expires_in": 600, "backend_url": settings.public_base_url, "protocol": PROTOCOL}


@router.get("/admin/stt/workers")
async def workers(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(SpeechWorker).order_by(SpeechWorker.name))).all()
    return [{"id": w.id, "name": w.name, "revoked": bool(w.revoked), "last_seen": w.last_seen,
             "ready": bool(w.ready and not w.revoked and w.last_seen > time.time() - 30),
             "diagnostic": json.loads(w.diagnostic)} for w in rows]


@router.post("/admin/stt/workers/{worker_id}/revoke")
async def revoke(worker_id: str, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    await db.execute(update(SpeechWorker).where(SpeechWorker.id == worker_id).values(revoked=1, ready=0))
    db.add(AdminAudit(actor_id=admin.id, action="worker.revoked", detail=json.dumps({"worker": worker_id}), created=time.time()))
    await db.commit()
    return {"ok": True}


class Enroll(BaseModel):
    code: str = Field(min_length=20, max_length=100, repr=False)
    protocol: int


@router.post("/stt-workers/enroll")
async def enroll(body: Enroll, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("worker-enroll", request.client.host if request.client else "unknown", 6)
    if body.protocol != PROTOCOL:
        raise HTTPException(426, "Обновите worker: несовместимая версия протокола")
    row = await db.scalar(select(SpeechEnrollment).where(SpeechEnrollment.code_hash == digest(body.code),
        SpeechEnrollment.used == 0, SpeechEnrollment.expires > time.time()))
    if not row:
        raise HTTPException(403, "Код недействителен или истёк")
    result = await db.execute(update(SpeechEnrollment).where(SpeechEnrollment.id == row.id,
        SpeechEnrollment.used == 0, SpeechEnrollment.expires > time.time()).values(used=1))
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Код уже использован")
    token, worker_id = secrets.token_urlsafe(48), str(uuid.uuid4())
    db.add(SpeechWorker(id=worker_id, name=row.name, token_hash=digest(token), last_seen=time.time()))
    await db.commit()
    return {"token": token, "id": worker_id, "protocol": PROTOCOL, "heartbeat_seconds": 10}


async def worker_auth(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Worker token required")
    async with SessionLocal() as db:
        worker = await db.scalar(select(SpeechWorker).where(SpeechWorker.token_hash == digest(authorization[7:]), SpeechWorker.revoked == 0))
        if not worker:
            raise HTTPException(401, "Worker token revoked or invalid")
        return worker.id


class Heartbeat(BaseModel):
    protocol: int = PROTOCOL
    ready: bool
    model: str = Field(default="", max_length=100)
    gpu: str = Field(default="", max_length=200)
    error: str = Field(default="", max_length=200)
    smoke_passed: bool = False


@router.get("/stt-workers/status")
async def worker_status(worker_id=Depends(worker_auth), db: AsyncSession = Depends(get_db)):
    worker = await db.get(SpeechWorker, worker_id)
    return {"protocol": PROTOCOL, "name": worker.name, "ready": bool(worker.ready and not worker.revoked and worker.last_seen > time.time()-30),
            "last_seen": worker.last_seen, "diagnostic": json.loads(worker.diagnostic)}


@router.post("/stt-workers/heartbeat")
async def heartbeat(body: Heartbeat, worker_id=Depends(worker_auth), db: AsyncSession = Depends(get_db)):
    if body.protocol != PROTOCOL:
        raise HTTPException(426, "Protocol mismatch")
    await db.execute(update(SpeechWorker).where(SpeechWorker.id == worker_id, SpeechWorker.revoked == 0).values(
        last_seen=time.time(), ready=int(body.ready and body.smoke_passed and bool(body.model)), diagnostic=json.dumps(body.model_dump())))
    await db.commit()
    return {"ok": True}


@router.post("/stt-workers/jobs/claim")
async def claim_job(request: Request, worker_id=Depends(worker_auth)):
    end = time.monotonic() + 25
    while time.monotonic() < end:
        if await request.is_disconnected():
            return {"job": None}
        async with _claim_lock:
            job = await claim(worker_id)
        if job:
            return {"job": job}
        await asyncio.sleep(0.5)
    return {"job": None}
    return {"job": None}


@router.get("/stt-workers/jobs/{job_id}/audio")
async def job_audio(job_id: str, x_lease: str = Header(), worker_id=Depends(worker_auth), db: AsyncSession = Depends(get_db)):
    await owned_job(db, worker_id, job_id, x_lease)
    path = audio_path(job_id)
    if not path.is_file():
        raise HTTPException(410, "Audio expired")
    return FileResponse(path, media_type="application/octet-stream", headers={"Cache-Control": "no-store"})


class Lease(BaseModel):
    lease: str = Field(min_length=64, max_length=64, repr=False)


@router.post("/stt-workers/jobs/{job_id}/heartbeat")
async def lease_heartbeat(job_id: str, body: Lease, worker_id=Depends(worker_auth), db: AsyncSession = Depends(get_db)):
    job = await owned_job(db, worker_id, job_id, body.lease)
    await db.execute(update(SpeechJob).where(SpeechJob.id == job_id, SpeechJob.state == "leased", SpeechJob.lease_token == body.lease).values(
        lease_until=min(time.time() + 60, job.deadline)))
    await db.commit()
    return {"ok": True}


class Result(Lease):
    text: str = Field(max_length=10000)
    model: Literal["large-v3-turbo", "large-v3"]


@router.post("/stt-workers/jobs/{job_id}/result")
async def job_result(job_id: str, body: Result, worker_id=Depends(worker_auth)):
    return await finish_remote(worker_id, job_id, body.lease, body.text, body.model)


class Failure(Lease):
    error: Literal["decode_failed", "model_unavailable", "audio_corrupt", "timeout"]


@router.post("/stt-workers/jobs/{job_id}/fail")
async def job_failure(job_id: str, body: Failure, worker_id=Depends(worker_auth)):
    return await finish_remote(worker_id, job_id, body.lease, "", "", body.error)


def period(start, end):
    zone = ZoneInfo("Europe/Moscow")
    today = datetime.now(zone).date()
    start, end = start or today - timedelta(days=29), end or today
    if end < start or (end - start).days > 366:
        raise HTTPException(422, "Выберите период до 366 дней")
    return (datetime.combine(start, datetime.min.time(), zone).astimezone(timezone.utc).replace(tzinfo=None),
            datetime.combine(end + timedelta(days=1), datetime.min.time(), zone).astimezone(timezone.utc).replace(tzinfo=None))


def parse(value):
    try:
        return json.loads(value) if value else None
    except (ValueError, TypeError):
        return None


def ordinary_users(company_id=None):
    filters = [User.is_admin == 0, User.is_demo == 0]
    if company_id is not None:
        filters.append(User.id.in_(select(CompanyMembership.user_id).where(
            CompanyMembership.company_id == company_id, CompanyMembership.status == "ACTIVE")))
    return filters


def session_report_status(session):
    job = (parse(session.state) or {}).get("report_job") or {}
    return "ready" if session.report else "error" if job.get("status") in {"failed", "error"} else "pending" if job.get("status") in {"pending", "queued", "running", "processing"} else "not_requested"


@router.get("/admin/analytics/companies")
async def companies(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(Company).order_by(Company.name))).all()
    return [{"id": c.id, "name": c.name} for c in rows]


@router.get("/admin/analytics/overview")
async def overview(start: date | None = None, end: date | None = None, mode: str | None = None, company_id: int | None = None,
                   admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    begin, stop = period(start, end)
    filters = ordinary_users(company_id)
    ordinary = select(User.id).where(*filters)
    query = select(Session).where(Session.user_id.in_(ordinary), Session.created_at >= begin, Session.created_at < stop)
    if mode:
        query = query.where(Session.mode == mode)
    sessions = (await db.scalars(query)).all()
    modes, finished_modes, days, statuses = {}, {}, {}, {"ready": 0, "pending": 0, "error": 0, "not_requested": 0}
    for s in sessions:
        modes[s.mode] = modes.get(s.mode, 0) + 1
        if s.finished_at:
            finished_modes[s.mode] = finished_modes.get(s.mode, 0) + 1
        day = s.created_at.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Europe/Moscow")).date().isoformat()
        days[day] = days.get(day, 0) + 1
        status = session_report_status(s)
        statuses[status] += 1
    total = await db.scalar(select(func.count()).select_from(User).where(*filters))
    new = await db.scalar(select(func.count()).select_from(User).where(*filters, User.created_at >= begin, User.created_at < stop))
    rooms = await db.scalar(select(func.count()).select_from(ArenaRoom).where(ArenaRoom.host_id.in_(ordinary), ArenaRoom.created_at >= begin, ArenaRoom.created_at < stop))
    speech = (await db.scalars(select(SpeechJob).where(SpeechJob.owner_id.in_(ordinary), SpeechJob.created >= begin.replace(tzinfo=timezone.utc).timestamp(), SpeechJob.created < stop.replace(tzinfo=timezone.utc).timestamp()))).all()
    latency = [j.finished - j.created for j in speech if j.finished and j.state in {"ready", "no_speech"}]
    return {"registered": total, "new": new, "active": len({s.user_id for s in sessions}), "started": len(sessions),
        "finished": sum(s.finished_at is not None for s in sessions), "stopped": sum(s.status in {"stopped", "cancelled", "error", "failed"} for s in sessions), "rooms": rooms, "modes": modes, "finished_modes": finished_modes,
        "daily": days, "reports": statuses, "timezone": "Europe/Moscow",
        "definitions": {"active": "Пользователь, начавший тренировку в выбранном периоде", "started": "Сессии по дате начала; личные попытки в 1×1 считаются отдельно", "finished": "Завершённые сессии имеют сохранённое время окончания; отдельные комнаты считаются отдельно", "rooms": "Встречи по дате создания, без повторного счёта участников. Здесь отчёты личных сессий; общий разбор комнаты хранится в её истории", "company": "Фильтр по текущему подтверждённому членству в организации, включая личные тренировки её участников", "demo": "Исключены администраторы и явно помеченные демо-аккаунты; старые неподмеченные аккаунты включены", "speech": "Время STT включает ожидание очереди. Учитываются только измеренные успешные задания после установки этого обновления; старые записи не восстановлены"},
        "technical": {"stt_jobs": len(speech), "stt_failed": sum(j.state == "failed" for j in speech),
            "stt_mean_seconds": sum(latency) / len(latency) if latency else None, "stt_sample": len(latency),
            "stt_fallback": sum(j.policy == "auto" and j.attempt > 0 and j.provider == "local" for j in speech),
            "stt_queue": sum(j.state in {"queued", "leased", "local", "local_running"} for j in speech),
            "measured_since": await db.scalar(select(func.min(SpeechJob.created))),
            "gigachat_latency": None, "gigachat_usage": None}}


@router.get("/admin/analytics/users")
async def users(q: str = "", page: int = 1, start: date | None = None, end: date | None = None,
                mode: str | None = None, company_id: int | None = None,
                sort: Literal["newest", "name", "activity", "completed"] = "newest",
                admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    if page < 1 or len(q) > 100:
        raise HTTPException(422, "Неверные параметры поиска")
    begin, stop = period(start, end)
    filters = ordinary_users(company_id)
    if q:
        filters.append(or_(User.username.contains(q, autoescape=True), User.display_name.contains(q, autoescape=True)))
    count = await db.scalar(select(func.count()).select_from(User).where(*filters))
    session_filters = [Session.created_at >= begin, Session.created_at < stop]
    if mode:
        session_filters.append(Session.mode == mode)
    stats = select(Session.user_id.label("uid"), func.max(Session.created_at).label("activity"),
        func.sum(case((Session.finished_at.is_not(None), 1), else_=0)).label("completed"),
        func.sum(case((Session.report.is_not(None), 1), else_=0)).label("reports"),
        func.group_concat(func.distinct(Session.mode)).label("modes")).where(*session_filters).group_by(Session.user_id).subquery()
    ordering = {"newest": User.created_at.desc(), "name": User.username.asc(), "activity": stats.c.activity.desc(), "completed": stats.c.completed.desc()}[sort]
    rows = (await db.execute(select(User, stats.c.activity, stats.c.completed, stats.c.reports, stats.c.modes)
        .outerjoin(stats, stats.c.uid == User.id).where(*filters).order_by(ordering, User.id.desc()).offset((page - 1) * 25).limit(25))).all()
    return {"total": count, "page": page, "items": [{"id": u.id, "username": u.username, "name": u.display_name,
        "created_at": u.created_at, "activity": activity, "completed": completed or 0, "reports": reports or 0,
        "modes": modes.split(",") if modes else []} for u, activity, completed, reports, modes in rows]}


@router.get("/admin/analytics/sessions")
async def sessions(user_id: int | None = None, page: int = 1, mode: str | None = None, start: date | None = None, end: date | None = None,
                   company_id: int | None = None, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    if page < 1:
        raise HTTPException(422, "Неверная страница")
    begin, stop = period(start, end)
    filters = [*ordinary_users(company_id), Session.created_at >= begin, Session.created_at < stop]
    if user_id is not None:
        filters.append(Session.user_id == user_id)
    if mode:
        filters.append(Session.mode == mode)
    count = await db.scalar(select(func.count()).select_from(Session).join(User).where(*filters))
    rows = (await db.execute(select(Session, User.username).join(User).where(*filters).order_by(Session.created_at.desc(), Session.id.desc()).offset((page - 1) * 25).limit(25))).all()
    return {"total": count, "page": page, "items": [{"id": s.id, "username": name, "mode": s.mode,
        "created_at": s.created_at, "finished_at": s.finished_at, "status": s.status,
        "verdict": s.verdict, "metrics": parse(s.metrics), "scenario_id": s.scenario_id,
        "report_status": session_report_status(s), "report_ready": bool(s.report)} for s, name in rows]}


@router.get("/admin/analytics/sessions/{session_id}")
async def saved_report(session_id: int, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Сессия не найдена")
    messages = (await db.scalars(select(Message).where(Message.session_id == session_id).order_by(Message.id))).all()
    return {"id": session.id, "mode": session.mode, "status": session.status, "verdict": session.verdict,
        "metrics": parse(session.metrics), "report": parse(session.report), "state": parse(session.state), "report_status": session_report_status(session),
        "messages": [{"sender": m.sender, "text": m.text, "created_at": m.created_at} for m in messages]}


@router.post("/admin/analytics/sessions/{session_id}/retry")
async def retry_report(session_id: int, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.report_jobs import session_locks, queue_report
    async with session_locks[session_id]:
        session = await db.get(Session, session_id)
        if not session:
            raise HTTPException(404, "Сессия не найдена")
        status = session_report_status(session)
        if status != "error":
            return {"report_status": status, "queued": False}
        rate_limit("report-retry", admin.id, 10)
        db.add(AdminAudit(actor_id=admin.id, action="report.retry", detail=json.dumps({"session_id": session_id}), created=time.time()))
        return {**await queue_report(db, session, retry=True), "queued": True}


@router.get("/admin/installation/audit")
async def audit(page: int = 1, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    if page < 1:
        raise HTTPException(422, "Неверная страница")
    rows = (await db.scalars(select(AdminAudit).order_by(AdminAudit.id.desc()).offset((page-1)*25).limit(25))).all()
    return [{"id": row.id, "actor_id": row.actor_id, "action": row.action, "created": row.created, "detail": parse(row.detail)} for row in rows]


@router.get("/admin/analytics/rooms")
async def room_reports(page: int = 1, start: date | None = None, end: date | None = None,
                       company_id: int | None = None, user_id: int | None = None,
                       admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    if page < 1:
        raise HTTPException(422, "Неверная страница")
    begin, stop = period(start, end)
    ordinary = select(User.id).where(*ordinary_users(company_id))
    filters = [ArenaRoom.created_at >= begin, ArenaRoom.created_at < stop,
               or_(ArenaRoom.host_id.in_(ordinary), ArenaRoom.guest_id.in_(ordinary))]
    if user_id is not None:
        filters.append(or_(ArenaRoom.host_id == user_id, ArenaRoom.guest_id == user_id))
    count = await db.scalar(select(func.count()).select_from(ArenaRoom).where(*filters))
    rows = (await db.scalars(select(ArenaRoom).where(*filters).order_by(ArenaRoom.created_at.desc(), ArenaRoom.id.desc()).offset((page-1)*25).limit(25))).all()
    ids = {uid for r in rows for uid in (r.host_id, r.guest_id) if uid}
    people = {u.id: u.display_name or u.username for u in (await db.scalars(select(User).where(User.id.in_(ids)))).all()}
    return {"total": count, "page": page, "items": [{"id": r.id, "mode": r.mode, "created_at": r.created_at,
        "status": r.status, "participants": [people.get(uid, str(uid)) for uid in (r.host_id, r.guest_id) if uid],
        "report_status": (parse(r.state) or {}).get("processing_status", "not_requested"),
        "report_count": len((parse(r.state) or {}).get("reports", {}))} for r in rows]}


@router.get("/admin/analytics/rooms/{room_id}")
async def room_report(room_id: int, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    room = await db.get(ArenaRoom, room_id)
    if not room:
        raise HTTPException(404, "Комната не найдена")
    state = parse(room.state) or {}
    ids = [uid for uid in (room.host_id, room.guest_id) if uid]
    people = {str(u.id): u.display_name or u.username for u in (await db.scalars(select(User).where(User.id.in_(ids)))).all()}
    messages = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id).order_by(ArenaRoomMessage.id))).all()
    return {"id": room.id, "mode": room.mode, "status": room.status, "report_status": state.get("processing_status"),
        "participants": people, "reports": state.get("reports", {}), "session_ids": state.get("sessions", {}),
        "comparison": state.get("competition"), "agreement": state.get("shared_result"),
        "messages": [{"user_id": m.user_id, "text": m.text} for m in messages]}


@router.post("/admin/analytics/rooms/{room_id}/retry")
async def retry_room_report(room_id: int, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.routers.rooms import room_lock, retry_processing
    async with room_lock(room_id):
        room = await db.get(ArenaRoom, room_id)
        if not room:
            raise HTTPException(404, "Комната не найдена")
        state = parse(room.state) or {}
        if state.get("processing_status") != "failed" and (state.get("competition") or {}).get("status") != "unavailable":
            return {"queued": False}
        rate_limit("room-report-retry", admin.id, 10)
        host = await db.get(User, room.host_id)
        db.add(AdminAudit(actor_id=admin.id, action="room.report.retry", detail=json.dumps({"room_id": room_id}), created=time.time()))
        # Reuse the existing finalized-room queue; no dialogue or scoring is replayed here.
        await retry_processing(room_id, db, host)
        return {"queued": True}
