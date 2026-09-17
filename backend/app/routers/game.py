from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.engine.scenario import list_scenarios
from app.models import Message, Session, User
from app.schemas import ChoiceIn, GuessIn, MessageIn, SessionSettings
from app.services import (
    apply_choice,
    apply_free_text,
    create_session,
    finish_session,
    loads,
    serialize_session,
)

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
            select(Session).where(Session.user_id == user.id).order_by(Session.created_at.desc()).limit(50)
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
    data["messages"] = [{"sender": m.sender, "text": m.text, "created_at": m.created_at.isoformat() if m.created_at else None} for m in msgs]
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
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    if session.status != "active":
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
    if not session.report:
        raise HTTPException(400, "Отчёт ещё не готов")
    return loads(session.report, {})
