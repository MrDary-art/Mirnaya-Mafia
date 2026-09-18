"""Local paired negotiation rooms: human call or parallel AI interviews."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.engine.llm import LlmError, analyze_block, call_with_fallback_detailed
from app.engine.metrics import START_METRICS, apply_decay
from app.engine.online_report import enrich_online_report
from app.engine.parser import extract_json
from app.engine.scenario import build_report, match_scenario
from app.models import ArenaRoom, ArenaRoomMessage, ArenaRoomSignal, Session, User
from app.services import apply_free_text, create_session, dumps, finish_session, loads
from app.voice import SpeechUnavailable, local_stt

router = APIRouter(prefix="/rooms", tags=["rooms"])
MAX_AUDIO_BYTES = 1_280_000


class RoomCreate(BaseModel):
    mode: str = Field(pattern="^(human|duel)$")
    display_name: str = Field(min_length=1, max_length=60)
    problem: str = Field(min_length=3, max_length=1000)
    goal: str = Field(min_length=3, max_length=500)


class RoomJoin(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    display_name: str = Field(min_length=1, max_length=60)


class RoomText(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class RoomSignal(BaseModel):
    kind: str = Field(pattern="^(offer|answer|candidate)$")
    data: dict[str, Any]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def deadline_passed(room: ArenaRoom) -> bool:
    return bool(room.started_at and utcnow() >= room.started_at.replace(tzinfo=timezone.utc) + timedelta(minutes=15))


async def require_room(db: AsyncSession, room_id: int, user: User) -> ArenaRoom:
    room = await db.get(ArenaRoom, room_id)
    if not room or user.id not in {room.host_id, room.guest_id}:
        raise HTTPException(404, "Комната не найдена")
    return room


async def generate_roles(problem: str, goal: str) -> dict[str, str]:
    fallback = {
        "host_role": "Инициатор переговоров",
        "guest_role": "Другая сторона переговоров",
        "host_brief": f"Ваша цель: {goal}",
        "guest_brief": f"Обсудите ситуацию «{problem}» и отстаивайте интересы своей стороны.",
    }
    prompt = (
        "Для учебных деловых переговоров выдай две конкретные роли и отдельные краткие инструкции участникам. "
        "Верни только JSON с полями host_role, guest_role, host_brief, guest_brief. "
        "Каждому участнику дай интерес и позицию; не пиши готовые реплики. "
        f"Ситуация: {problem}. Цель инициатора: {goal}."
    )
    try:
        raw, _ = await call_with_fallback_detailed(prompt, None)
        data = extract_json(raw)
        if data and all(isinstance(data.get(k), str) and data[k].strip() for k in fallback):
            return {k: data[k][:600] for k in fallback}
    except LlmError:
        pass
    return fallback


async def generate_interview_questions(problem: str) -> list[str]:
    fallback = [
        "Расскажите о релевантном опыте и вашей роли в последнем проекте.",
        "Как вы разбираете сложную задачу, когда требований пока недостаточно?",
        "Опишите случай, когда вы не согласились с коллегой. Как нашли решение?",
        "Что вы сделаете в первые недели на этой позиции?",
    ]
    prompt = (
        "Составь ровно четыре одинаковых для обоих кандидатов вопроса учебного собеседования. "
        "Вопросы должны проверять опыт, решение задач, взаимодействие и первые шаги. "
        f"Вакансия/ситуация: {problem}. Верни только JSON: {{\"questions\":[\"...\",\"...\",\"...\",\"...\"]}}"
    )
    try:
        raw, _ = await call_with_fallback_detailed(prompt, None)
        data = extract_json(raw)
        questions = data.get("questions") if data else None
        if isinstance(questions, list) and len(questions) == 4 and all(isinstance(q, str) and q.strip() for q in questions):
            return [q[:300] for q in questions]
    except LlmError:
        pass
    return fallback


def duel_settings(room: ArenaRoom, state: dict[str, Any], user_id: int) -> dict[str, Any]:
    return {
        "mode": "online",
        "room_id": room.id,
        "display_name": state["names"][str(user_id)],
        "role": "Кандидат",
        "opponent_role": "Интервьюер",
        "problem": state["problem"],
        "goal": state["goal"],
        "interview_questions": state["interview_questions"],
        "tone": "нейтральный",
    }


async def serialize_room(db: AsyncSession, room: ArenaRoom, user: User) -> dict[str, Any]:
    state = loads(room.state, {})
    peer_id = room.guest_id if user.id == room.host_id else room.host_id
    payload = {
        "id": room.id, "code": room.code, "mode": room.mode, "status": room.status,
        "host_id": room.host_id, "guest_id": room.guest_id,
        "your_id": user.id, "peer_id": peer_id,
        "your_name": state["names"].get(str(user.id)),
        "peer_name": state["names"].get(str(peer_id)) if peer_id else None,
        "problem": state["problem"], "goal": state["goal"],
        "deadline": (room.started_at.replace(tzinfo=timezone.utc) + timedelta(minutes=15)).isoformat() if room.started_at else None,
        "your_session_id": state.get("sessions", {}).get(str(user.id)),
        "your_role": state.get("roles", {}).get("host_role" if user.id == room.host_id else "guest_role"),
        "your_brief": state.get("roles", {}).get("host_brief" if user.id == room.host_id else "guest_brief"),
        "done": user.id in state.get("done", []),
        "peer_done": peer_id in state.get("done", []),
    }
    if room.mode == "human":
        rows = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id).order_by(ArenaRoomMessage.id))).all()
        payload["messages"] = [{"id": m.id, "user_id": m.user_id, "name": state["names"].get(str(m.user_id)), "text": m.text} for m in rows]
        payload["metrics"] = human_metrics(rows, user.id)["metrics"]
    if room.status == "finished":
        payload["reports"] = state.get("reports", {})
        payload["comparison"] = state.get("comparison")
    return payload


def human_metrics(rows: list[ArenaRoomMessage], user_id: int) -> dict[str, Any]:
    deltas = []
    history = []
    last_other = None
    for message in rows:
        if message.user_id != user_id:
            last_other = message.text
            continue
        analysis = loads(message.analysis, {})
        delta = {key: float(analysis.get(key + "_delta") or 0) for key in START_METRICS}
        deltas.append(delta)
        history.append({
            "text": message.text, "comment": analysis.get("comment"),
            "context": last_other,
            "tki": analysis.get("tki_style"), "techniques": analysis.get("techniques") or [],
            "delta": delta, "metrics_after": apply_decay(deltas),
        })
    return {"metrics": apply_decay(deltas), "history": history, "delta_history": deltas, "ai_provider": "gigachat"}


async def finalize_room(db: AsyncSession, room: ArenaRoom) -> None:
    if room.status == "finished" or not room.guest_id:
        return
    state = loads(room.state, {})
    reports = {}
    if room.mode == "duel":
        for uid in (room.host_id, room.guest_id):
            session = await db.get(Session, state["sessions"][str(uid)])
            person = await db.get(User, uid)
            reports[str(uid)] = await finish_session(db, session, person) if session.status == "active" else loads(session.report, {})
    else:
        rows = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id).order_by(ArenaRoomMessage.id))).all()
        scenario = match_scenario({"problem": state["problem"]})
        for uid in (room.host_id, room.guest_id):
            participant = human_metrics(rows, uid)
            report = build_report(scenario, participant, {"goal": state["goal"], "problem": state["problem"]})
            reports[str(uid)] = await enrich_online_report(report, participant, {"goal": state["goal"], "problem": state["problem"], "human_room": True})
    state["reports"] = reports
    a = reports[str(room.host_id)]
    b = reports[str(room.guest_id)]
    score_a = a["metrics"]["confidence"]
    score_b = b["metrics"]["confidence"]
    if room.mode == "duel":
        accepted = room.host_id if score_a >= max(50, score_b + 1) else room.guest_id if score_b >= max(50, score_a + 1) else None
        comparison = {
            "accepted_user_id": accepted,
            "verdicts": {str(uid): "ПРИНЯТ" if uid == accepted else "НЕ ПРИНЯТ" for uid in (room.host_id, room.guest_id)},
            "reason": "Учебное решение по качеству ответов, достигнутой цели и доверию. Подробный разбор каждого участника — ниже.",
        }
    else:
        winner = room.host_id if score_a > score_b else room.guest_id if score_b > score_a else None
        comparison = {"winner_user_id": winner, "reason": "Сравнение по итоговому качеству переговоров. Подробный разбор каждого участника — ниже."}
    try:
        prompt = (
            "Кратко сравни две учебные попытки. Решение уже принято по серверным метрикам; не меняй его. "
            "Назови сильную сторону каждого, ключевую ошибку и объясни итог одним абзацем. "
            "Верни только JSON: {\"reason\":\"...\"}. "
            f"Формат: {room.mode}; задача: {state['problem']}; решение: {comparison}; "
            f"первый участник: {a.get('summary')}, метрики {a['metrics']['values']}; "
            f"второй участник: {b.get('summary')}, метрики {b['metrics']['values']}"
        )
        raw, _ = await call_with_fallback_detailed(prompt, None)
        ai = extract_json(raw)
        if ai and isinstance(ai.get("reason"), str) and ai["reason"].strip():
            comparison["reason"] = ai["reason"][:1200]
    except LlmError:
        pass
    state["comparison"] = comparison
    room.state = dumps(state)
    room.status = "finished"
    room.finished_at = utcnow()
    await db.commit()


async def settle_if_ready(db: AsyncSession, room: ArenaRoom) -> None:
    if room.status != "active":
        return
    state = loads(room.state, {})
    if room.mode == "duel":
        for uid, sid in state.get("sessions", {}).items():
            session = await db.get(Session, sid)
            if session.status != "active" and int(uid) not in state["done"]:
                state["done"].append(int(uid))
                room.state = dumps(state)
    if deadline_passed(room) or {room.host_id, room.guest_id}.issubset(state["done"]):
        await finalize_room(db, room)


@router.post("")
async def create_room(body: RoomCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    state = {"problem": body.problem.strip(), "goal": body.goal.strip(), "names": {str(user.id): body.display_name.strip()}, "sessions": {}, "done": []}
    if body.mode == "human":
        state["roles"] = await generate_roles(body.problem, body.goal)
    else:
        state["interview_questions"] = await generate_interview_questions(body.problem)
    room = ArenaRoom(code=secrets.token_urlsafe(8), mode=body.mode, host_id=user.id, state=dumps(state))
    db.add(room)
    await db.flush()
    if body.mode == "duel":
        try:
            session = await create_session(db, user, duel_settings(room, state, user.id))
        except ValueError as exc:
            await db.rollback()
            raise HTTPException(400, str(exc)) from exc
        state["sessions"][str(user.id)] = session.id
        room.state = dumps(state)
    await db.commit()
    return await serialize_room(db, room, user)


@router.post("/join")
async def join_room(body: RoomJoin, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await db.scalar(select(ArenaRoom).where(ArenaRoom.code == body.code.strip()))
    if not room or room.status != "waiting" or room.host_id == user.id or room.guest_id:
        raise HTTPException(400, "Комната недоступна для входа")
    claim = await db.execute(
        update(ArenaRoom)
        .where(ArenaRoom.id == room.id, ArenaRoom.guest_id.is_(None), ArenaRoom.status == "waiting")
        .values(guest_id=user.id)
    )
    if claim.rowcount != 1:
        await db.rollback()
        raise HTTPException(400, "Комната уже занята")
    await db.refresh(room)
    state = loads(room.state, {})
    state["names"][str(user.id)] = body.display_name.strip()
    if room.mode == "duel":
        try:
            session = await create_session(db, user, duel_settings(room, state, user.id))
        except ValueError as exc:
            await db.rollback()
            raise HTTPException(400, str(exc)) from exc
        state["sessions"][str(user.id)] = session.id
    room.state = dumps(state)
    room.status = "active"
    room.started_at = utcnow()
    await db.commit()
    return await serialize_room(db, room, user)


@router.get("/{room_id}")
async def get_room(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    await settle_if_ready(db, room)
    return await serialize_room(db, room, user)


@router.post("/{room_id}/message")
async def send_message(room_id: int, body: RoomText, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    await settle_if_ready(db, room)
    state = loads(room.state, {})
    if room.status != "active" or user.id in state["done"]:
        raise HTTPException(400, "Переговоры уже завершены")
    if room.mode == "duel":
        session = await db.get(Session, state["sessions"][str(user.id)])
        result = await apply_free_text(db, session, user, body.text.strip(), False)
        await settle_if_ready(db, room)
        return result
    rows = (await db.scalars(select(ArenaRoomMessage).where(ArenaRoomMessage.room_id == room.id, ArenaRoomMessage.user_id == user.id))).all()
    participant = human_metrics(rows, user.id)
    analysis = await analyze_block({"role": "Участник", "opponent_role": "Оппонент", "goal": state["goal"]}, participant, body.text, None)
    db.add(ArenaRoomMessage(room_id=room.id, user_id=user.id, text=body.text.strip(), analysis=dumps(analysis)))
    await db.commit()
    return {"ok": True}


@router.post("/{room_id}/voice")
async def send_voice(room_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    await settle_if_ready(db, room)
    if room.status != "active" or user.id in loads(room.state, {}).get("done", []):
        raise HTTPException(400, "Переговоры уже завершены")
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/octet-stream" or request.headers.get("x-audio-format") != "pcm_s16le" or request.headers.get("x-audio-rate") != "16000":
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
    state = loads(room.state, {})
    if room.status == "active" and user.id not in state["done"]:
        state["done"].append(user.id)
        room.state = dumps(state)
        await db.commit()
        await settle_if_ready(db, room)
    return await serialize_room(db, room, user)


@router.post("/{room_id}/signal")
async def send_signal(room_id: int, body: RoomSignal, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    if room.mode != "human" or room.status != "active":
        raise HTTPException(400, "Видеозвонок недоступен")
    if len(body.model_dump_json()) > 16384:
        raise HTTPException(413, "Сигнал видеозвонка слишком длинный")
    db.add(ArenaRoomSignal(room_id=room.id, user_id=user.id, payload=body.model_dump_json()))
    await db.commit()
    return {"ok": True}


@router.get("/{room_id}/signals")
async def get_signals(room_id: int, after: int = 0, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await require_room(db, room_id, user)
    if room.mode != "human":
        raise HTTPException(400, "Видеозвонок недоступен")
    rows = (await db.scalars(select(ArenaRoomSignal).where(ArenaRoomSignal.room_id == room.id, ArenaRoomSignal.id > after, ArenaRoomSignal.user_id != user.id).order_by(ArenaRoomSignal.id).limit(100))).all()
    return [{"id": row.id, **loads(row.payload, {})} for row in rows]
