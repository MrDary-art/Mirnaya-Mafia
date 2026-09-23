"""Paired room V2: lobby, realtime call, private attempts, feedback and reports."""

from __future__ import annotations

import asyncio
import json
import secrets
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.db import SessionLocal, get_db
from app.engine.llm import LlmError, analyze_block, call_with_fallback_detailed
from app.engine.metrics import START_METRICS, apply_decay
from app.engine.online_report import enrich_online_report
from app.engine.parser import extract_json
from app.engine.room_v2 import (
    build_state, can_start, challenge_key, deadline_passed, end_state, normalize_legacy,
    parse_schedule, public_participant, start_state, team_result, utcnow,
)
from app.engine.scenario import SCENARIOS, build_report, match_scenario
from app.models import (
    ArenaRecording, ArenaRecordingChunk, ArenaRoom, ArenaRoomFeedback, ArenaRoomJob,
    ArenaRoomMessage, ArenaRoomSignal, ArenaTeamRecord, Session, User,
)
from app.room_realtime import authenticate_room_socket, broadcast, connect, disconnect
from app.room_storage import RecordingConflict, recording_storage
from app.services import apply_free_text, create_session, dumps, finish_session, loads
from app.voice import SpeechUnavailable, local_stt, local_tts

router = APIRouter(prefix="/rooms", tags=["rooms"])
MAX_AUDIO_BYTES = 1_280_000
booking_lock = asyncio.Lock()
RANKED_INTERVIEW_QUESTIONS = [
    "Кратко представьтесь и объясните, почему эта роль соответствует вашему опыту.",
    "Какой измеримый результат в похожей задаче вы считаете самым сильным?",
    "Опишите профильную задачу: как вы выбрали решение и проверили результат?",
    "Расскажите о рабочем разногласии и о том, как вы пришли к решению.",
    "Как вы действуете при неполных требованиях и зафиксированном сроке?",
    "Какую профессиональную ошибку вы совершили и что изменили после неё?",
    "Что вы сделаете в первые недели на этой позиции?",
    "Какой вопрос о роли или компании вы зададите работодателю?",
]


class RoomCreate(BaseModel):
    mode: str = Field(pattern="^(human|duel)$")
    display_name: str = Field(min_length=1, max_length=60)
    request_text: str | None = Field(default=None, max_length=1000)
    problem: str | None = Field(default=None, max_length=1000)  # V1 compatibility
    goal: str = Field(min_length=3, max_length=500)
    role: str | None = Field(default=None, max_length=120)
    specialization: str | None = Field(default=None, max_length=160)
    level: str = Field(default="начальный", pattern="^(начальный|средний|продвинутый)$")
    team_name: str | None = Field(default=None, max_length=80)
    scenario_id: str | None = Field(default=None, max_length=80)
    scheduled_at: str | None = None
    timezone: str = Field(default="Europe/Moscow", max_length=80)
    duration_minutes: int = Field(default=15, ge=2, le=30)
    ranked: bool = False


class RoomJoin(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    display_name: str = Field(min_length=1, max_length=60)
    role_id: str | None = Field(default=None, max_length=20)


class RoomReady(BaseModel):
    ready: bool = True
    transport_ready: bool = True
    recording_consent: bool = False


class RoomText(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class DemoSpeech(BaseModel):
    text: str = Field(min_length=1, max_length=1200)


class DemoTurn(BaseModel):
    mode: str = Field(pattern="^(human|duel)$")
    request_text: str = Field(min_length=3, max_length=1000)
    goal: str = Field(min_length=3, max_length=500)
    role: str | None = Field(default=None, max_length=120)
    specialization: str | None = Field(default=None, max_length=160)
    level: str = Field(default="начальный", max_length=40)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=30)
    text: str = Field(min_length=1, max_length=2000)


class DemoAnalyze(BaseModel):
    mode: str = Field(pattern="^(human|duel)$")
    request_text: str = Field(min_length=3, max_length=1000)
    goal: str = Field(min_length=3, max_length=500)
    role: str | None = Field(default=None, max_length=120)
    answers: list[str] = Field(default_factory=list, max_length=30)


class RoomSignal(BaseModel):
    kind: str = Field(pattern="^(offer|answer|candidate|ice-restart)$")
    data: dict[str, Any]
    generation: int = Field(default=0, ge=0, le=1000)
    event_id: str = Field(default_factory=lambda: secrets.token_hex(12), max_length=64)


class FeedbackIn(BaseModel):
    status: str = Field(pattern="^(submitted|skipped)$")
    outcome: str | None = Field(default=None, max_length=40)
    peer_feedback: str | None = Field(default=None, max_length=1200)
    self_reflection: str | None = Field(default=None, max_length=1200)
    usefulness: int | None = Field(default=None, ge=1, le=5)
    technical_issues: str | None = Field(default=None, max_length=600)
    repeat_together: bool | None = None
    share_with_peer: bool = False
    publish_team_result: bool = False


class RecordingStart(BaseModel):
    consent: bool
    mime_type: str = Field(default="audio/webm", max_length=120)


class RecordingFinalize(BaseModel):
    manifest: dict[str, Any]


async def require_room(db: AsyncSession, room_id: int, user: User) -> ArenaRoom:
    room = await db.get(ArenaRoom, room_id)
    if not room or user.id not in {room.host_id, room.guest_id}:
        raise HTTPException(404, "Комната не найдена")
    return room


async def participant_bookings(db: AsyncSession, user_id: int) -> list[dict[str, Any]]:
    rows = (await db.scalars(select(ArenaRoom).where(
        ArenaRoom.status.in_(["waiting", "lobby", "active"]),
        (ArenaRoom.host_id == user_id) | (ArenaRoom.guest_id == user_id),
    ))).all()
    result: list[dict[str, Any]] = []
    for room in rows:
        state = loads(room.state, {})
        scheduled = state.get("scheduled_at")
        if scheduled:
            start = datetime.fromisoformat(scheduled)
            result.append({"room_id": room.id, "start": start,
                           "end": start + timedelta(minutes=int(state.get("duration_minutes") or 15))})
    return result


async def has_participant_overlap(db: AsyncSession, user_id: int, start, duration_minutes: int) -> bool:
    end = start + timedelta(minutes=duration_minutes)
    return any(start < item["end"] and end > item["start"] for item in await participant_bookings(db, user_id))


def state_for(room: ArenaRoom) -> dict[str, Any]:
    state = normalize_legacy(loads(room.state, {}), room.host_id, room.guest_id, room.mode)
    room.state = dumps(state)
    return state


def room_deadline_passed(room: ArenaRoom, state: dict[str, Any]) -> bool:
    if deadline_passed(state):
        return True
    if not room.started_at:
        return False
    started = room.started_at.replace(tzinfo=utcnow().tzinfo)
    return utcnow() >= started + timedelta(minutes=int(state.get("duration_minutes") or 15))


async def generate_roles(problem: str, goal: str) -> dict[str, str]:
    fallback = {
        "host_role": "Инициатор переговоров", "guest_role": "Вторая сторона",
        "host_goal": goal, "guest_goal": "Защитить свои интересы и найти реалистичное соглашение",
        "host_brief": f"Ситуация: {problem}. Ваша личная цель: {goal}",
        "guest_brief": f"Ситуация: {problem}. Не раскрывайте личную цель сразу; проверяйте предложения фактами.",
    }
    prompt = (
        "Создай реалистичную учебную деловую ситуацию для двух людей. Верни только JSON: "
        "host_role, guest_role, host_goal, guest_goal, host_brief, guest_brief. "
        "Цели сторон должны быть разными, совместимыми хотя бы частично и не содержать готовых реплик. "
        f"Ситуация: {problem}. Цель инициатора: {goal}."
    )
    try:
        raw, _ = await call_with_fallback_detailed(prompt, None)
        data = extract_json(raw)
        if data and all(isinstance(data.get(key), str) and data[key].strip() for key in fallback):
            return {key: data[key][:700] for key in fallback}
    except LlmError:
        pass
    return fallback


async def generate_interview_questions(problem: str) -> list[str]:
    fallback = [
        "Кратко представьтесь и объясните, почему эта роль соответствует вашему опыту.",
        "Какой результат в похожей задаче вы считаете своим самым сильным и как его измеряли?",
        "Опишите сложную профессиональную задачу: как вы выбрали решение и проверили результат?",
        "Расскажите о рабочем разногласии и о том, как вы пришли к решению.",
        "Как вы действуете, когда требования неполные, а срок уже зафиксирован?",
        "Какую ошибку в работе вы совершили и что изменили после неё?",
        "Что вы сделаете в первые недели на этой позиции?",
        "Какой вопрос о роли или компании вы хотели бы задать работодателю?",
    ]
    prompt = (
        "Ты методист собеседований. Составь ровно 8 коротких, реалистичных вопросов для двух кандидатов "
        "на одну и ту же роль. Только по указанной профессии; без отвлечённых головоломок. Вопросы должны "
        "последовательно проверять мотивацию, подтверждённый опыт, профильный кейс, взаимодействие, ошибку, "
        "неопределённость, первые шаги и вопросы работодателю. Верни JSON {\"questions\":[...]}. "
        f"Роль и контекст: {problem}"
    )
    try:
        raw, _ = await call_with_fallback_detailed(prompt, None)
        data = extract_json(raw)
        questions = data.get("questions") if data else None
        if isinstance(questions, list) and len(questions) == 8 and all(isinstance(q, str) and q.strip() for q in questions):
            return [q.strip()[:350] for q in questions]
    except LlmError:
        pass
    return fallback


def duel_settings(room: ArenaRoom, state: dict[str, Any], user_id: int) -> dict[str, Any]:
    participant = state["participants"][str(user_id)]
    return {
        "mode": "online", "room_id": room.id, "display_name": participant["display_name"],
        "role": "Кандидат", "opponent_role": "Интервьюер", "problem": state["request_text"],
        "goal": participant["private_goal"], "interview_questions": state["interview_questions"],
        "tone": "деловой", "max_questions": len(state["interview_questions"]),
    }


async def ensure_duel_session(db: AsyncSession, room: ArenaRoom, state: dict[str, Any], user: User) -> None:
    if room.mode != "duel" or str(user.id) in state["sessions"]:
        return
    session = await create_session(db, user, duel_settings(room, state, user.id))
    state["sessions"][str(user.id)] = session.id


def human_metrics(rows: list[ArenaRoomMessage], user_id: int) -> dict[str, Any]:
    deltas, history = [], []
    last_other = None
    for message in rows:
        if message.user_id != user_id:
            last_other = message.text
            continue
        analysis = loads(message.analysis, {})
        delta = {key: float(analysis.get(f"{key}_delta") or 0) for key in START_METRICS}
        deltas.append(delta)
        history.append({"text": message.text, "context": last_other, "comment": analysis.get("comment"),
                        "tki": analysis.get("tki_style"), "techniques": analysis.get("techniques") or [],
                        "delta": delta, "metrics_after": apply_decay(deltas)})
    return {"metrics": apply_decay(deltas), "history": history, "delta_history": deltas, "ai_provider": "gigachat"}


async def serialize_room(db: AsyncSession, room: ArenaRoom, user: User, *, summary: bool = False) -> dict[str, Any]:
    state = state_for(room)
    peer_id = room.guest_id if user.id == room.host_id else room.host_id
    participants = {uid: public_participant(value) for uid, value in state["participants"].items()}
    mine = state["participants"].get(str(user.id), {})
    payload: dict[str, Any] = {
        "id": room.id, "code": room.code, "mode": room.mode, "status": room.status, "phase": state["phase"],
        "host_id": room.host_id, "guest_id": room.guest_id, "your_id": user.id, "peer_id": peer_id,
        "participants": participants, "your_name": mine.get("display_name"),
        "peer_name": participants.get(str(peer_id), {}).get("display_name") if peer_id else None,
        "your_role": mine.get("role"), "your_brief": mine.get("private_brief"), "your_goal": mine.get("private_goal"),
        "request_text": state["request_text"], "problem": state["request_text"], "goal": state["goal"],
        "role": state.get("role"), "specialization": state.get("specialization"), "level": state.get("level"),
        "scenario": {key: state["scenario"].get(key) for key in ("id", "version", "title", "public_context", "source")},
        "scenario_ready": state["scenario_ready"], "team_name": state.get("team_name"), "ranked": state.get("ranked", False),
        "timezone": state["timezone"], "scheduled_at": state["scheduled_at"], "duration_minutes": state["duration_minutes"],
        "deadline": state.get("deadline"), "created_at": room.created_at.isoformat() if room.created_at else None,
        "ready": mine.get("ready", False), "peer_ready": participants.get(str(peer_id), {}).get("ready", False) if peer_id else False,
        "transport_ready": mine.get("transport_ready", False), "done": mine.get("done", False),
        "peer_done": participants.get(str(peer_id), {}).get("done", False) if peer_id else False,
        "your_session_id": state.get("sessions", {}).get(str(user.id)), "processing_status": state.get("processing_status"),
        "end_reason": state.get("end_reason"), "from_chat": bool(state.get("from_chat")),
    }
    if summary:
        return payload
    if room.mode == "human":
        rows = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id).order_by(ArenaRoomMessage.id))).all()
        payload["messages"] = [{"id": item.id, "user_id": item.user_id,
                                "name": participants.get(str(item.user_id), {}).get("display_name"), "text": item.text}
                               for item in rows]
        payload["metrics"] = human_metrics(rows, user.id)["metrics"]
    own_report = state.get("reports", {}).get(str(user.id))
    if own_report:
        payload["your_report"] = own_report
    if state.get("team_result"):
        payload["team_result"] = state["team_result"]
    feedback = await db.scalar(select(ArenaRoomFeedback).where(ArenaRoomFeedback.room_id == room.id,
                                                                ArenaRoomFeedback.user_id == user.id))
    payload["feedback_status"] = feedback.status if feedback else "not_received"
    recording = await db.scalar(select(ArenaRecording).where(ArenaRecording.room_id == room.id,
                                                              ArenaRecording.user_id == user.id))
    payload["recording"] = ({"id": recording.id, "status": recording.status,
                             "total_bytes": recording.total_bytes, "mime_type": recording.mime_type}
                            if recording else None)
    return payload


async def mark_started(db: AsyncSession, room: ArenaRoom, state: dict[str, Any]) -> None:
    if not can_start(state, room.host_id, room.guest_id):
        return
    start_state(state)
    room.status = "active"
    room.started_at = utcnow()
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "room.started", "deadline": state["deadline"]})


async def queue_processing(db: AsyncSession, room: ArenaRoom, state: dict[str, Any]) -> None:
    existing = await db.scalar(select(ArenaRoomJob).where(ArenaRoomJob.room_id == room.id, ArenaRoomJob.kind == "finalize"))
    if not existing:
        db.add(ArenaRoomJob(room_id=room.id, kind="finalize", status="pending"))
    state["phase"] = "processing"
    state["processing_status"] = "queued"
    room.status = "processing"
    room.state = dumps(state)
    await db.commit()


async def enter_feedback(db: AsyncSession, room: ArenaRoom, state: dict[str, Any], reason: str) -> None:
    end_state(state, reason)
    room.status = "feedback"
    room.finished_at = utcnow()
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "room.ended", "reason": reason})


@router.get("/scenarios")
async def room_scenarios(user: User = Depends(get_current_user)):
    del user
    return [{"id": item["id"], "title": item["title"], "description": item.get("description") or item.get("context", "")[:240]}
            for item in SCENARIOS.values()]


@router.get("/availability")
async def room_availability(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    bookings = await participant_bookings(db, user.id)
    return {"timezone": "Europe/Moscow", "now": utcnow().isoformat(),
            "booked": [{"start": item["start"].isoformat(), "end": item["end"].isoformat()} for item in bookings],
            "step_minutes": 30, "day_start": "09:00", "day_end": "22:00"}


@router.post("/demo/speak")
async def demo_speak(body: DemoSpeech, user: User = Depends(get_current_user)):
    del user
    try:
        return Response(await local_tts.synthesize(body.text), media_type="audio/wav")
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/demo/transcribe")
async def demo_transcribe(request: Request, user: User = Depends(get_current_user)):
    del user
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/octet-stream":
        raise HTTPException(415, "Требуется бинарное аудио")
    if request.headers.get("x-audio-format") != "pcm_s16le" or request.headers.get("x-audio-rate") != "16000":
        raise HTTPException(400, "Поддерживается только mono PCM16, 16 кГц")
    data = await request.body()
    if len(data) < 3200 or len(data) > MAX_AUDIO_BYTES or len(data) % 2:
        raise HTTPException(400, "Аудиореплика слишком короткая или повреждена")
    try:
        transcript = await local_stt.transcribe(data)
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"transcript": transcript[:2000], "silence": not bool(transcript.strip())}


@router.post("/demo/turn")
async def demo_turn(body: DemoTurn, user: User = Depends(get_current_user)):
    del user
    recent = "\n".join(f"{item.get('from')}: {item.get('text', '')[:500]}" for item in body.history[-10:])
    prompt = (
        "Ты реалистичный деловой собеседник в учебной тренировке. Отвечай по-русски, кратко и строго по теме. "
        "Не льсти, не придумывай факты за участника, не повторяй заданные вопросы. Задай один следующий вопрос, "
        "который логично продолжает ответ и помогает проверить заявленную цель. "
        f"Формат: {body.mode}. Ситуация: {body.request_text}. Цель участника: {body.goal}. "
        f"Роль: {body.role or 'участник'}, специализация: {body.specialization or 'не указана'}, уровень: {body.level}.\n"
        f"История:\n{recent}\nНовый ответ участника: {body.text}\nОтвет собеседника:"
    )
    try:
        reply, provider = await call_with_fallback_detailed(prompt, None)
    except LlmError:
        reply, provider = "Приведите конкретный пример и объясните, какой результат вы получили.", "offline"
    return {"reply": reply.strip()[:1200], "provider": provider, "fallback": provider != "gigachat"}


@router.post("/demo/analyze")
async def demo_analyze(body: DemoAnalyze, user: User = Depends(get_current_user)):
    del user
    metrics = dict(START_METRICS)
    analyses = []
    settings_payload = {"role": body.role or "Участник", "opponent_role": "Собеседник",
                        "goal": body.goal, "problem": body.request_text}
    for answer in body.answers:
        analysis = await analyze_block(settings_payload, {"metrics": metrics}, answer, None)
        for key in START_METRICS:
            metrics[key] = max(0, min(100, int(metrics[key] + float(analysis.get(f"{key}_delta") or 0))))
        analyses.append(analysis)
    score = round(.5 * metrics["goal"] + .3 * metrics["trust"] + .2 * metrics["control"])
    comments = [item.get("comment") for item in analyses if item.get("comment") and item.get("comment") != "Анализ недоступен"]
    return {"score": score, "metrics": metrics, "verdict": "Пройдено" if score >= 65 else "Нужно доработать",
            "strengths": comments[-3:] or ["Цель тренировки была задана заранее."],
            "improvements": ["Добавляйте проверяемые факты, числа и конкретный следующий шаг."] if score < 75 else
                            ["Сохраняйте конкретику и заранее готовьте ответы на возражения."],
            "answers_analyzed": len(body.answers)}


@router.get("/leaderboard")
async def team_leaderboard(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    del user
    rows = (await db.scalars(select(ArenaTeamRecord).where(ArenaTeamRecord.eligible == 1, ArenaTeamRecord.public == 1)
                             .order_by(ArenaTeamRecord.score.desc(), ArenaTeamRecord.created_at.asc()).limit(50))).all()
    best: dict[tuple[str, str], ArenaTeamRecord] = {}
    for row in rows:
        best.setdefault((row.team_key, row.challenge_key), row)
    result = []
    for position, row in enumerate(best.values(), 1):
        first, second = await db.get(User, row.user_a_id), await db.get(User, row.user_b_id)
        details = loads(row.details, {})
        result.append({"position": position, "team_name": details.get("team_name") or " + ".join(
                           item.display_name or item.username for item in (first, second) if item), "score": row.score,
                       "members": [item.display_name or item.username for item in (first, second) if item],
                       "challenge_key": row.challenge_key, "created_at": row.created_at.isoformat()})
    return result


@router.get("/records/me")
async def my_team_records(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(ArenaTeamRecord).where((ArenaTeamRecord.user_a_id == user.id) |
                                                            (ArenaTeamRecord.user_b_id == user.id))
                             .order_by(ArenaTeamRecord.created_at.desc()).limit(20))).all()
    return [{"room_id": row.room_id, "team_name": loads(row.details, {}).get("team_name") or row.team_key, "score": row.score,
             "eligible": bool(row.eligible), "public": bool(row.public), "challenge_key": row.challenge_key,
             "created_at": row.created_at.isoformat()} for row in rows]


@router.get("/preview/{code}")
async def preview_room(code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    del user
    room = await db.scalar(select(ArenaRoom).where(ArenaRoom.code == code.strip()))
    if not room or room.status not in {"waiting", "lobby"}:
        raise HTTPException(404, "Приглашение недоступно")
    state = state_for(room)
    return {"id": room.id, "code": room.code, "mode": room.mode, "host_name": state["participants"][str(room.host_id)]["display_name"],
            "scenario": {key: state["scenario"].get(key) for key in ("title", "public_context")},
            "scheduled_at": state["scheduled_at"], "timezone": state["timezone"], "duration_minutes": state["duration_minutes"],
            "team_name": state.get("team_name"), "ranked": state.get("ranked", False)}


@router.post("")
async def create_room(body: RoomCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    request_text = (body.request_text or body.problem or "").strip()
    if len(request_text) < 3:
        raise HTTPException(422, "Опишите ситуацию")
    try:
        scheduled = parse_schedule(body.scheduled_at, body.timezone)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    profile_context = ". ".join(filter(None, [
        f"Роль участника: {body.role.strip()}" if body.role and body.role.strip() else None,
        f"Специализация: {body.specialization.strip()}" if body.specialization and body.specialization.strip() else None,
        f"Уровень: {body.level}",
    ]))
    generation_context = f"{request_text}. {profile_context}"
    roles = await generate_roles(generation_context, body.goal) if body.mode == "human" else None
    questions = (RANKED_INTERVIEW_QUESTIONS if body.ranked and body.scenario_id else
                 await generate_interview_questions(generation_context)) if body.mode == "duel" else None
    state = build_state(mode=body.mode, host_id=user.id, display_name=body.display_name.strip(), request_text=request_text,
                        goal=body.goal.strip(), duration_minutes=body.duration_minutes, scheduled_at=scheduled,
                        timezone_name=body.timezone, team_name=body.team_name, scenario_id=body.scenario_id,
                        ranked=body.ranked, roles=roles, questions=questions, role=body.role,
                        specialization=body.specialization, level=body.level)
    async with booking_lock:
        if body.scheduled_at and await has_participant_overlap(db, user.id, scheduled, body.duration_minutes):
            raise HTTPException(409, "У вас уже есть встреча, которая пересекается с этим временем")
        room = ArenaRoom(code=secrets.token_urlsafe(8), mode=body.mode, host_id=user.id, status="waiting", state=dumps(state))
        db.add(room)
        await db.flush()
        await ensure_duel_session(db, room, state, user)
        room.state = dumps(state)
        await db.commit()
    return await serialize_room(db, room, user)


@router.get("")
async def list_rooms(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(ArenaRoom).where((ArenaRoom.host_id == user.id) | (ArenaRoom.guest_id == user.id))
                             .order_by(ArenaRoom.created_at.desc()).limit(50))).all()
    return [await serialize_room(db, room, user, summary=True) for room in rows]


@router.post("/join")
async def join_room(body: RoomJoin, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await db.scalar(select(ArenaRoom).where(ArenaRoom.code == body.code.strip()))
    if not room or room.status not in {"waiting", "lobby"} or room.host_id == user.id:
        raise HTTPException(400, "Комната недоступна для входа")
    if room.guest_id and room.guest_id != user.id:
        raise HTTPException(409, "Комната уже занята")
    state = state_for(room)
    scheduled = datetime.fromisoformat(state["scheduled_at"])
    if not room.guest_id and await has_participant_overlap(db, user.id, scheduled, int(state.get("duration_minutes") or 15)):
        raise HTTPException(409, "Эта встреча пересекается с другой встречей в вашем расписании")
    if not room.guest_id:
        claim = await db.execute(update(ArenaRoom).where(ArenaRoom.id == room.id, ArenaRoom.guest_id.is_(None))
                                 .values(guest_id=user.id, status="lobby"))
        if claim.rowcount != 1:
            await db.rollback()
            raise HTTPException(409, "Комната уже занята")
        await db.refresh(room)
    state = state_for(room)
    side = "guest"
    roles = state.get("roles") or {}
    state["participants"][str(user.id)] = {
        "display_name": body.display_name.strip(), "role_id": body.role_id or side,
        "role": roles.get("guest_role") or ("Кандидат" if room.mode == "duel" else "Вторая сторона"),
        "public_role": roles.get("guest_role") or ("Кандидат" if room.mode == "duel" else "Вторая сторона"),
        "private_goal": roles.get("guest_goal") or state["goal"], "private_brief": roles.get("guest_brief") or state["request_text"],
        "ready": False, "transport_ready": False, "present": True, "done": False,
        "recording_consent": False, "joined_at": utcnow().isoformat(),
    }
    await ensure_duel_session(db, room, state, user)
    room.status = "lobby"
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "participant.joined", "user_id": user.id})
    return await serialize_room(db, room, user)


@router.post("/{room_id}/ready")
async def ready_room(room_id: int, body: RoomReady = RoomReady(), db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if state["phase"] != "lobby":
        return await serialize_room(db, room, user)
    participant = state["participants"][str(user.id)]
    participant.update(ready=body.ready, transport_ready=body.transport_ready,
                       recording_consent=body.recording_consent, present=True)
    room.status = "lobby"
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "participant.ready", "user_id": user.id,
                              "ready": body.ready, "transport_ready": body.transport_ready})
    await mark_started(db, room, state)
    return await serialize_room(db, room, user)


@router.get("/{room_id}")
async def get_room(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if state["phase"] == "active" and room_deadline_passed(room, state):
        await enter_feedback(db, room, state, "time_limit")
    return await serialize_room(db, room, user)


@router.post("/{room_id}/message")
async def send_message(room_id: int, body: RoomText, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    participant = state["participants"].get(str(user.id), {})
    if state["phase"] != "active" or participant.get("done") or room_deadline_passed(room, state):
        raise HTTPException(409, "Переговоры уже завершены")
    text = body.text.strip()
    if room.mode == "duel":
        session = await db.get(Session, state["sessions"][str(user.id)])
        result = await apply_free_text(db, session, user, text, False)
        if result.get("finished"):
            participant["done"] = True
            room.state = dumps(state)
            await db.commit()
        return result
    rows = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id)
                             .order_by(ArenaRoomMessage.id.desc()).limit(20))).all()
    own_rows = [row for row in reversed(rows) if row.user_id == user.id]
    participant_state = human_metrics(own_rows, user.id)
    recent_context = "\n".join(f"Участник {row.user_id}: {row.text}" for row in reversed(rows[-8:]))
    analysis = await analyze_block({"role": participant.get("role"), "opponent_role": "Вторая сторона",
                                    "goal": participant.get("private_goal"), "problem": state["request_text"],
                                    "recent_dialogue": recent_context}, participant_state, text, None)
    db.add(ArenaRoomMessage(room_id=room.id, user_id=user.id, text=text, analysis=dumps(analysis)))
    await db.commit()
    await broadcast(room.id, {"type": "message.created", "user_id": user.id, "text": text})
    return {"ok": True, "analysis": analysis}


@router.post("/{room_id}/voice")
async def send_voice(room_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if state["phase"] != "active":
        raise HTTPException(409, "Переговоры уже завершены")
    if request.headers.get("x-audio-format") != "pcm_s16le" or request.headers.get("x-audio-rate") != "16000":
        raise HTTPException(415, "Требуется mono PCM16, 16 кГц")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Аудиореплика слишком длинная")
        data.extend(chunk)
    if len(data) < 9600 or len(data) % 2:
        raise HTTPException(400, "Аудиореплика слишком короткая или повреждена")
    try:
        transcript = await local_stt.transcribe(bytes(data))
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    if not transcript:
        return {"silence": True, "transcript": ""}
    result = await send_message(room_id, RoomText(text=transcript[:2000]), db, user)
    return {"silence": False, "transcript": transcript[:2000], "result": result}


@router.post("/{room_id}/finish")
async def finish_room_side(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if state["phase"] == "active":
        state["participants"][str(user.id)]["done"] = True
        both_done = room.guest_id and all(state["participants"].get(str(uid), {}).get("done") for uid in (room.host_id, room.guest_id))
        if room.mode == "human" or both_done:
            await enter_feedback(db, room, state, "completed")
        else:
            room.state = dumps(state)
            await db.commit()
            await broadcast(room.id, {"type": "participant.finished", "user_id": user.id})
    return await serialize_room(db, room, user)


@router.post("/{room_id}/leave")
async def leave_room(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    state["participants"][str(user.id)]["present"] = False
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "participant.left", "user_id": user.id})
    return {"ok": True, "reconnect_grace_seconds": 90}


@router.post("/{room_id}/feedback")
async def save_feedback(room_id: int, body: FeedbackIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if state["phase"] not in {"feedback", "processing", "finished"}:
        raise HTTPException(409, "Обратная связь доступна после завершения")
    feedback = await db.scalar(select(ArenaRoomFeedback).where(ArenaRoomFeedback.room_id == room.id,
                                                               ArenaRoomFeedback.user_id == user.id))
    if not feedback:
        feedback = ArenaRoomFeedback(room_id=room.id, user_id=user.id)
        db.add(feedback)
    feedback.status = body.status
    feedback.answers = dumps(body.model_dump(exclude={"status", "share_with_peer", "publish_team_result"}))
    feedback.share_with_peer = int(body.share_with_peer)
    feedback.publish_team_result = int(body.publish_team_result)
    feedback.updated_at = utcnow()
    await db.flush()
    peer_feedback = await db.scalar(select(ArenaRoomFeedback).where(ArenaRoomFeedback.room_id == room.id,
                                                                    ArenaRoomFeedback.user_id != user.id))
    if state["phase"] == "feedback":
        await queue_processing(db, room, state)
    else:
        record = await db.scalar(select(ArenaTeamRecord).where(ArenaTeamRecord.room_id == room.id))
        if record and peer_feedback:
            record.public = int(bool(feedback.publish_team_result and peer_feedback.publish_team_result))
        await db.commit()
    return await serialize_room(db, room, user)


@router.post("/{room_id}/recordings")
async def start_recording(room_id: int, body: RecordingStart, db: AsyncSession = Depends(get_db),
                          user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if not body.consent or state["phase"] != "active":
        raise HTTPException(409, "Для записи нужно согласие и активная комната")
    recording = await db.scalar(select(ArenaRecording).where(ArenaRecording.room_id == room.id,
                                                              ArenaRecording.user_id == user.id))
    if not recording:
        recording = ArenaRecording(room_id=room.id, user_id=user.id, status="recording", consented=1,
                                   mime_type=body.mime_type,
                                   expires_at=utcnow() + timedelta(days=settings.room_recording_retention_days))
        db.add(recording)
        await db.flush()
    elif recording.status != "recording":
        recording.status = "recording"
        recording.finalized_at = None
        recording.expires_at = utcnow() + timedelta(days=settings.room_recording_retention_days)
    state["participants"][str(user.id)]["recording_consent"] = True
    room.state = dumps(state)
    await db.commit()
    return {"id": recording.id, "status": recording.status, "mime_type": recording.mime_type}


@router.put("/{room_id}/recordings/{recording_id}/chunks/{segment_id}/{index}")
async def upload_recording_chunk(room_id: int, recording_id: int, segment_id: str, index: int, request: Request,
                                 x_checksum_sha256: str = Header(), x_start_ms: int = Header(default=0),
                                 x_end_ms: int = Header(default=0), db: AsyncSession = Depends(get_db),
                                 user: User = Depends(get_current_user)):
    await require_room(db, room_id, user)
    recording = await db.get(ArenaRecording, recording_id)
    if not recording or recording.room_id != room_id or recording.user_id != user.id or recording.status != "recording":
        raise HTTPException(404, "Запись не найдена")
    existing = await db.scalar(select(ArenaRecordingChunk).where(ArenaRecordingChunk.recording_id == recording.id,
                                                                  ArenaRecordingChunk.segment_id == segment_id,
                                                                  ArenaRecordingChunk.chunk_index == index))
    data = await request.body()
    if not existing and recording.total_bytes + len(data) > settings.room_max_recording_bytes:
        raise HTTPException(413, "Превышен лимит записи")
    try:
        storage_key = recording_storage.save(room_id, recording.id, segment_id, index, data, x_checksum_sha256)
    except RecordingConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    if existing:
        if existing.checksum != x_checksum_sha256.lower():
            raise HTTPException(409, "Фрагмент с этим номером уже отличается")
        return {"ok": True, "duplicate": True, "index": index}
    db.add(ArenaRecordingChunk(recording_id=recording.id, segment_id=segment_id, chunk_index=index,
                               checksum=x_checksum_sha256.lower(), size=len(data), start_ms=x_start_ms,
                               end_ms=x_end_ms, storage_key=storage_key))
    recording.total_bytes += len(data)
    await db.commit()
    return {"ok": True, "duplicate": False, "index": index}


@router.get("/{room_id}/recordings/{recording_id}/status")
async def recording_status(room_id: int, recording_id: int, db: AsyncSession = Depends(get_db),
                           user: User = Depends(get_current_user)):
    await require_room(db, room_id, user)
    recording = await db.get(ArenaRecording, recording_id)
    if not recording or recording.user_id != user.id or recording.room_id != room_id:
        raise HTTPException(404, "Запись не найдена")
    rows = (await db.scalars(select(ArenaRecordingChunk).where(ArenaRecordingChunk.recording_id == recording.id)
                             .order_by(ArenaRecordingChunk.segment_id, ArenaRecordingChunk.chunk_index))).all()
    return {"status": recording.status, "total_bytes": recording.total_bytes,
            "chunks": [{"segment_id": row.segment_id, "index": row.chunk_index, "checksum": row.checksum} for row in rows]}


@router.post("/{room_id}/recordings/{recording_id}/finalize")
async def finalize_recording(room_id: int, recording_id: int, body: RecordingFinalize,
                             db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_room(db, room_id, user)
    recording = await db.get(ArenaRecording, recording_id)
    if not recording or recording.user_id != user.id or recording.room_id != room_id:
        raise HTTPException(404, "Запись не найдена")
    if recording.status == "ready":
        return {"ok": True, "status": "ready"}
    rows = (await db.scalars(select(ArenaRecordingChunk).where(ArenaRecordingChunk.recording_id == recording.id)
                             .order_by(ArenaRecordingChunk.created_at, ArenaRecordingChunk.chunk_index))).all()
    grouped: dict[str, list[int]] = {}
    for row in rows:
        grouped.setdefault(row.segment_id, []).append(row.chunk_index)
    manifest = {**body.manifest, "segments": [{"id": key, "chunks": sorted(indices)} for key, indices in grouped.items()]}
    try:
        output = recording_storage.assemble(room_id, recording.id, manifest)
    except (KeyError, OSError, RecordingConflict) as exc:
        raise HTTPException(409, "Не все фрагменты записи загружены") from exc
    manifest["output"] = str(output.relative_to(recording_storage.root))
    manifest["download_type"] = "application/zip" if output.suffix == ".zip" else (recording.mime_type or "application/octet-stream")
    recording.manifest = dumps(manifest)
    recording.status = "ready"
    recording.finalized_at = utcnow()
    await db.commit()
    return {"ok": True, "status": "ready"}


@router.get("/{room_id}/recordings/{recording_id}/download")
async def download_recording(room_id: int, recording_id: int, db: AsyncSession = Depends(get_db),
                             user: User = Depends(get_current_user)):
    await require_room(db, room_id, user)
    recording = await db.get(ArenaRecording, recording_id)
    if not recording or recording.user_id != user.id or recording.room_id != room_id or recording.status != "ready":
        raise HTTPException(404, "Запись не готова")
    manifest = loads(recording.manifest, {})
    path = recording_storage.resolve(manifest["output"])
    media_type = manifest.get("download_type") or recording.mime_type or "application/octet-stream"
    suffix = "zip" if media_type == "application/zip" else "webm"
    return FileResponse(path, media_type=media_type, filename=f"arena-room-{room_id}.{suffix}")


@router.get("/{room_id}/ice")
async def ice_configuration(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_room(db, room_id, user)
    try:
        servers = json.loads(settings.room_ice_servers_json)
    except json.JSONDecodeError:
        servers = []
    return {"iceServers": servers}


@router.post("/{room_id}/signal")
async def send_signal(room_id: int, body: RoomSignal, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    if room.mode != "human" or state_for(room)["phase"] not in {"lobby", "active"}:
        raise HTTPException(409, "Видеозвонок недоступен")
    if len(body.model_dump_json()) > 32_000:
        raise HTTPException(413, "Сигнал видеозвонка слишком длинный")
    duplicate = await db.scalar(select(ArenaRoomSignal).where(ArenaRoomSignal.room_id == room.id,
                                                               ArenaRoomSignal.user_id == user.id,
                                                               ArenaRoomSignal.payload.contains(body.event_id)))
    if not duplicate:
        db.add(ArenaRoomSignal(room_id=room.id, user_id=user.id, payload=body.model_dump_json()))
        await db.commit()
    await broadcast(room.id, {"type": "signal", "user_id": user.id, **body.model_dump()}, exclude_user=user.id)
    return {"ok": True, "duplicate": bool(duplicate)}


@router.get("/{room_id}/signals")
async def get_signals(room_id: int, after: int = 0, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    rows = (await db.scalars(select(ArenaRoomSignal).where(ArenaRoomSignal.room_id == room.id,
                    ArenaRoomSignal.id > after, ArenaRoomSignal.user_id != user.id).order_by(ArenaRoomSignal.id).limit(100))).all()
    return [{"id": row.id, **loads(row.payload, {})} for row in rows]


@router.websocket("/{room_id}/ws")
async def room_socket(websocket: WebSocket, room_id: int):
    authenticated = await authenticate_room_socket(websocket, room_id)
    if not authenticated:
        return
    user, room = authenticated
    await connect(room_id, user.id, websocket)
    await broadcast(room_id, {"type": "presence", "user_id": user.id, "present": True})
    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > 32_000:
                await websocket.close(code=4400, reason="message_too_large")
                break
            event = json.loads(raw)
            if event.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif event.get("type") == "signal" and room.mode == "human":
                signal = RoomSignal.model_validate(event.get("signal") or {})
                async with SessionLocal() as db:
                    db.add(ArenaRoomSignal(room_id=room_id, user_id=user.id, payload=signal.model_dump_json()))
                    await db.commit()
                await broadcast(room_id, {"type": "signal", "user_id": user.id, **signal.model_dump()}, exclude_user=user.id)
    except (WebSocketDisconnect, ValueError, json.JSONDecodeError):
        pass
    finally:
        disconnect(room_id, user.id, websocket)
        await broadcast(room_id, {"type": "presence", "user_id": user.id, "present": False})


async def process_room(db: AsyncSession, room: ArenaRoom) -> None:
    state = state_for(room)
    state["processing_status"] = "analyzing"
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "processing.stage", "stage": "analyzing"})
    reports: dict[str, Any] = {}
    participant_ids = [uid for uid in (room.host_id, room.guest_id) if uid]
    feedback_rows = (await db.scalars(select(ArenaRoomFeedback).where(ArenaRoomFeedback.room_id == room.id))).all()
    feedback_by_user = {item.user_id: item for item in feedback_rows}
    if room.mode == "duel":
        for uid in participant_ids:
            session = await db.get(Session, state["sessions"].get(str(uid)))
            person = await db.get(User, uid)
            if session and person:
                reports[str(uid)] = await finish_session(db, session, person) if session.status == "active" else loads(session.report, {})
    else:
        rows = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id)
                                 .order_by(ArenaRoomMessage.id))).all()
        scenario = match_scenario({"problem": state["request_text"]})
        for uid in participant_ids:
            participant = human_metrics(rows, uid)
            context = {"goal": state["participants"][str(uid)]["private_goal"], "problem": state["request_text"]}
            report = build_report(scenario, participant, context)
            reports[str(uid)] = await enrich_online_report(report, participant, {**context, "human_room": True})
    for uid in participant_ids:
        report = reports.get(str(uid))
        if not report:
            continue
        own = feedback_by_user.get(uid)
        if own:
            report["session_feedback"] = loads(own.answers, {})
        peer = next((item for item in feedback_rows if item.user_id != uid and item.share_with_peer), None)
        if peer:
            shared = loads(peer.answers, {})
            report["peer_feedback"] = shared.get("peer_feedback")
    state["processing_status"] = "building_report"
    room.state = dumps(state)
    await db.commit()
    await broadcast(room.id, {"type": "processing.stage", "stage": "building_report"})
    state["reports"] = reports
    state["team_result"] = team_result(reports, participant_ids)
    state.update(phase="finished", processing_status="ready")
    room.status = "finished"
    room.state = dumps(state)
    publish = len(feedback_rows) == 2 and all(bool(item.publish_team_result) for item in feedback_rows)
    result = state["team_result"]
    if room.mode == "duel" and result.get("complete") and len(participant_ids) == 2:
        record = await db.scalar(select(ArenaTeamRecord).where(ArenaTeamRecord.room_id == room.id))
        if not record:
            pair = sorted(participant_ids)
            record = ArenaTeamRecord(room_id=room.id, user_a_id=participant_ids[0], user_b_id=participant_ids[1],
                                     team_key=f"pair:{pair[0]}:{pair[1]}", challenge_key=challenge_key(state),
                                     score=result["score"], eligible=int(bool(state.get("ranked"))), public=int(publish),
                                     details=dumps({"scoring_version": state["scoring_version"], "scores": result["scores"],
                                                    "team_name": state.get("team_name")}))
            db.add(record)
    await db.commit()
    await broadcast(room.id, {"type": "report.ready"})


@router.post("/{room_id}/processing/retry")
async def retry_processing(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    state = state_for(room)
    if state.get("phase") != "processing" or state.get("processing_status") != "failed":
        raise HTTPException(409, "Повторный запуск сейчас недоступен")
    job = await db.scalar(select(ArenaRoomJob).where(ArenaRoomJob.room_id == room.id, ArenaRoomJob.kind == "finalize"))
    if not job:
        job = ArenaRoomJob(room_id=room.id, kind="finalize")
        db.add(job)
    job.status, job.attempts, job.error, job.available_at = "pending", 0, None, utcnow()
    state["processing_status"] = "queued"
    room.state = dumps(state)
    await db.commit()
    return await serialize_room(db, room, user)


async def room_worker_once() -> None:
    async with SessionLocal() as db:
        expired = (await db.scalars(select(ArenaRecording).where(ArenaRecording.status == "ready",
                                                                  ArenaRecording.expires_at <= utcnow()).limit(20))).all()
        for recording in expired:
            chunks = (await db.scalars(select(ArenaRecordingChunk).where(
                ArenaRecordingChunk.recording_id == recording.id))).all()
            for chunk in chunks:
                try:
                    recording_storage.resolve(chunk.storage_key).unlink(missing_ok=True)
                except OSError:
                    pass
            output = loads(recording.manifest, {}).get("output")
            if output:
                try:
                    recording_storage.resolve(output).unlink(missing_ok=True)
                except OSError:
                    pass
            recording.status = "expired"
        if expired:
            await db.commit()
        lobby_rooms = (await db.scalars(select(ArenaRoom).where(ArenaRoom.status == "lobby"))).all()
        for room in lobby_rooms:
            await mark_started(db, room, state_for(room))
        active = (await db.scalars(select(ArenaRoom).where(ArenaRoom.status == "active"))).all()
        for room in active:
            state = state_for(room)
            if room_deadline_passed(room, state):
                await enter_feedback(db, room, state, "time_limit")
        job = await db.scalar(select(ArenaRoomJob).where(ArenaRoomJob.status == "pending",
                                                         ArenaRoomJob.available_at <= utcnow()).order_by(ArenaRoomJob.id))
        if not job:
            return
        job.status = "running"
        job.attempts += 1
        await db.commit()
        try:
            room = await db.get(ArenaRoom, job.room_id)
            if room:
                await process_room(db, room)
            job.status = "done"
            job.finished_at = utcnow()
            await db.commit()
        except Exception as exc:
            await db.rollback()
            job = await db.get(ArenaRoomJob, job.id)
            job.error = f"{type(exc).__name__}: {exc}"[:1000]
            job.status = "pending" if job.attempts < 3 else "failed"
            job.available_at = utcnow() + timedelta(seconds=5 * job.attempts)
            if job.status == "failed":
                room = await db.get(ArenaRoom, job.room_id)
                if room:
                    state = state_for(room)
                    state["processing_status"] = "failed"
                    room.state = dumps(state)
            await db.commit()


async def room_worker_loop() -> None:
    while True:
        await room_worker_once()
        await asyncio.sleep(2)
