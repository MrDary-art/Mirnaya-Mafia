from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.engine.scenario import build_ideal_dialogue, list_scenarios
from app.models import Message, Session, User
from app.schemas import ChoiceIn, GuessIn, MessageIn, SessionSettings
from app.services import (
    apply_choice,
    apply_free_text,
    create_session,
    finish_session,
    loads,
    serialize_session,
    dumps,
)
from app.engine.metrics import clamp
from app.engine.scenario import get_scenario, step_by_id
from app.report_jobs import report_status, queue_report, session_locks

router = APIRouter(tags=["game"])


@router.get("/scenarios")
async def scenarios():
    return list_scenarios()


@router.post("/sessions")
async def start_session(body: SessionSettings, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        session = await create_session(db, user, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return serialize_session(session)


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        await db.scalars(
            select(Session).where(Session.user_id == user.id).order_by(Session.created_at.desc())
        )
    ).all()
    return [serialize_session(s, include_step=False) for s in rows]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    data = serialize_session(session)
    msgs = (await db.scalars(select(Message).where(Message.session_id == session.id).order_by(Message.id))).all()
    data["messages"] = [{"sender": m.sender, "text": m.text, "analysis": loads(m.analysis, {}) if m.sender == "player" else None, "created_at": m.created_at.isoformat() if m.created_at else None} for m in msgs]
    return data


@router.post("/sessions/{session_id}/choice")
async def choose(
    session_id: int,
    body: ChoiceIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    try:
        return await apply_choice(db, session, user, body.option_id, body.used_hint, body.timeout)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/sessions/{session_id}/chaos-response")
async def chaos_response_endpoint(
    session_id: int,
    body: dict,  # {"event_type": "...", "choice_index": 0}
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Обработка ответа на событие хаоса."""
    from app.engine.scenario import CHAOS_EVENTS
    
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    
    sess_settings = loads(session.settings, {})
    state = loads(session.state, {})
    
    event_type = body.get("event_type")
    choice_index = body.get("choice_index", 0)
    
    # Найти событие по типу
    event = next((e for e in CHAOS_EVENTS if e["id"] == event_type), None)
    if not event:
        raise HTTPException(400, "Событие не найдено")
    
    # Получить ответ
    if choice_index >= len(event["response_options"]):
        raise HTTPException(400, "Неверный индекс ответа")
    
    response = event["response_options"][choice_index]
    
    # Применить дельты
    metrics = dict(state["metrics"])
    for key, val in response["delta"].items():
        metrics[key] = clamp(metrics[key] + val)
    state["metrics"] = metrics
    
    # Обновить историю хаоса
    if "chaos_history" in state and state["chaos_history"]:
        # Найти последнее событие этого типа без ответа
        for chaos_event in reversed(state["chaos_history"]):
            if chaos_event.get("event_id") == event_type and chaos_event.get("response") is None:
                chaos_event["response"] = {
                    "text": response["text"],
                    "delta": response["delta"],
                }
                break
    
    state["turns"] += 1
    session.state = dumps(state)
    session.metrics = dumps(state["metrics"])
    
    # Перейти к следующему шагу сценария
    scenario = get_scenario(session.scenario_id)
    step = step_by_id(scenario, state["step_id"])
    db.add(Message(session_id=session.id, sender="player", text=response["text"], analysis=dumps({"chaos_event": event_type, "delta": response["delta"]})))
    
    nxt = step.get("next") or "end:eval"
    finished = nxt.startswith("end:")
    
    if finished:
        session.state = dumps(state)
        session.metrics = dumps(state["metrics"])
        report = await finish_session(db, session, user)
        return {"finished": True, "report": report, "metrics": state["metrics"]}
    
    state["step_id"] = nxt
    next_step = step_by_id(scenario, nxt)
    db.add(Message(session_id=session.id, sender="opponent", text=next_step["opponent_line"]))
    session.state = dumps(state)
    session.metrics = dumps(state["metrics"])
    await db.commit()
    await db.refresh(session)
    
    return {
        "finished": False,
        "session": serialize_session(session),
        "metrics": state["metrics"],
    }


@router.post("/sessions/{session_id}/message")
async def free_message(
    session_id: int,
    body: MessageIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    if session.mode != "online":
        raise HTTPException(400, "Свободный ввод доступен в онлайн-режиме")
    try:
        async with session_locks[session_id]:
            await db.refresh(session)
            return await apply_free_text(db, session, user, body.text, body.timeout)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    if session.status != "active":
        return serialize_session(session)
    session.status = "stopped"
    await db.commit()
    return serialize_session(session)


@router.post("/sessions/{session_id}/finish")
async def complete(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    async with session_locks[session_id]:
        session = await db.get(Session, session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(404, "Сессия не найдена")
        if session.report:
            return loads(session.report, {})
        return await finish_session(db, session, user)


@router.post("/sessions/{session_id}/guess")
async def guess_goal(
    session_id: int,
    body: GuessIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    state = loads(session.state, {})
    state["hidden_guess"] = body.index
    session.state = __import__("json").dumps(state, ensure_ascii=False)
    await db.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}/report")
async def report(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    if session.status == "processing":
        return report_status(session)
    if not session.report:
        if session.status == "processing":
            return report_status(session)
        raise HTTPException(400, "Отчёт ещё не готов")
    result = loads(session.report, {})
    state, settings = loads(session.state, {}), loads(session.settings, {})
    if not result.get("narrative"):
        from app.engine.narrative_report import online_narrative, scenario_narrative
        result["narrative"] = online_narrative(result, state, settings) if session.mode == "online" else scenario_narrative(result, state.get("history", []), get_scenario(session.scenario_id))
    result.setdefault("transcript", [{key: row.get(key) for key in ("text", "context", "reply")} for row in state.get("history", [])])
    if session.mode == "online":
        from app.engine.mentor import support_summary
        result.setdefault("learning_support", support_summary(state))
    return result


@router.post("/sessions/{session_id}/report/retry")
async def retry_session_report(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    async with session_locks[session_id]:
        session = await db.get(Session, session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(404, "Сессия не найдена")
        if session.report:
            return await queue_report(db, session, retry=True)
        if session.status != "processing":
            raise HTTPException(409, "Сначала завершите разговор")
        return await queue_report(db, session, retry=True)


@router.post("/sessions/{session_id}/coach")
async def session_coach(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility for older clients. The same exam restriction applies.
    return await session_mentor(session_id, MentorIn(), db, user)


class MentorIn(BaseModel):
    text: str = Field(default="", max_length=1500)
    request_id: str = Field(default="", max_length=64)


def require_mentor(session, user):
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    settings = loads(session.settings, {})
    if session.mode != "online" or settings.get("room_id"):
        raise HTTPException(403, "В соревновательном интервью ментор недоступен: оба участника отвечают самостоятельно")
    return settings


@router.get("/sessions/{session_id}/mentor")
async def get_mentor(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = await db.get(Session, session_id)
    require_mentor(session, user)
    return loads(session.state, {}).get("mentor") or {"messages": []}


@router.post("/sessions/{session_id}/mentor")
async def session_mentor(session_id: int, body: MentorIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.engine.mentor import mentor_reply
    from app.engine.llm import LlmError
    from app.engine.input_quality import validate_prompt
    if body.text.strip():
        try:
            validate_prompt(body.text, "Вопрос ментору", descriptive=False)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    async with session_locks[session_id]:
        session = await db.get(Session, session_id)
        settings = require_mentor(session, user)
        await db.refresh(session)
        if session.status != "active":
            raise HTTPException(409, "Разговор завершён. История ментора сохранена в этой попытке")
        state = loads(session.state, {})
        mentor = state.get("mentor") or {"messages": []}
        messages = mentor["messages"]
        if (not body.text.strip() and messages) or (body.request_id and any(m.get("request_id") == body.request_id for m in messages)):
            return mentor
        try:
            answer, provider = await mentor_reply(settings, state, messages, body.text.strip())
        except (LlmError, ValueError):
            raise HTTPException(503, "Ментор временно недоступен. Попробуйте ещё раз; обращение не засчитано")
        turn = len(state.get("history") or [])
        mentor.setdefault("first_turn", turn)
        messages.extend([
            {"role": "user", "text": body.text.strip() or "Помогите разобраться с этой тренировкой", "after_turn": turn, "request_id": body.request_id},
            {"role": "assistant", "text": answer, "after_turn": turn, "request_id": body.request_id},
        ])
        mentor["provider"] = provider
        state["mentor"] = mentor
        state["assistance_used"] = int(state.get("assistance_used") or 0) + 1
        session.state = dumps(state)
        await db.commit()
        return {**mentor, "advice": answer}


@router.get("/sessions/{session_id}/ideal-dialogue")
async def ideal_dialogue(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    if session.mode != "scenario" or session.status != "finished":
        raise HTTPException(400, "Идеальный диалог доступен после завершения сценария")
    try:
        payload = build_ideal_dialogue(get_scenario(session.scenario_id or ""))
    except KeyError as exc:
        raise HTTPException(404, "Сценарий не найден") from exc
    payload["scenario_id"] = session.scenario_id
    payload["roles"] = {"player": session.role, "opponent": session.opponent_role}
    return payload
