"""Support inbox and staff operations, with explicit public/private boundaries."""
import json
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user, get_admin, verify_password
from app.db import get_db
from app.models import AppSetting, User, Session
from app.company_models import Company
from app.council_models import CouncilModerator, CouncilMeeting

router = APIRouter(tags=["support"])

def stamp():
    return datetime.now(timezone.utc).isoformat()

async def staff(user=Depends(get_current_user), db=Depends(get_db)):
    if user.is_admin and verify_password("admin",user.password_hash):
        raise HTTPException(403,"Сначала смените стандартный пароль администратора")
    if not user.is_admin and not await db.get(CouncilModerator, user.id):
        raise HTTPException(403, "Нужны права модератора")
    return user

async def audit(db, user, action, target, reason):
    db.add(AppSetting(key=f"staff_audit:{uuid4().hex}", value=json.dumps({"actor": user.id, "action": action, "target": target, "reason": reason, "at": stamp()}, ensure_ascii=False)))

class SupportMessage(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    path: str = Field(default="", max_length=300)

class Reason(BaseModel):
    reason: str = Field(min_length=5, max_length=1500)

class Ban(Reason):
    hours: int = Field(ge=1, le=720)


class Availability(BaseModel):
    available: bool


async def online_staff(db):
    rows = (await db.scalars(select(AppSetting).where(AppSetting.key.like("support_presence:%")))).all()
    for row in rows:
        value = json.loads(row.value)
        if not value.get("available") or (datetime.now(timezone.utc) - datetime.fromisoformat(value["at"])).total_seconds() >= 90:
            continue
        person = await db.get(User, int(row.key.split(":")[-1]))
        if person and (person.is_admin or await db.get(CouncilModerator, person.id)):
            return True
    return False


@router.get("/support/status")
async def support_status(db=Depends(get_db)):
    online = await online_staff(db)
    return {"online": online, "label": "Специалист на связи" if online else "Сейчас не в сети", "message": "Напишите нам — специалист увидит ваше обращение." if online else "Оставьте сообщение. Мы сохраним его и ответим здесь, когда специалисты вернутся."}


@router.put("/admin/operations/availability")
async def availability(body: Availability, user=Depends(staff), db=Depends(get_db)):
    row = await db.get(AppSetting, f"support_presence:{user.id}")
    if row is None:
        row = AppSetting(key=f"support_presence:{user.id}")
        db.add(row)
    row.value = json.dumps({"available": body.available, "at": stamp()})
    await db.commit()
    return {"available": body.available}

async def support_rows(db, owner=None):
    from app.support_models import SupportTicket, SupportTicketMessage
    from app.support_service import iso
    query=select(SupportTicketMessage,SupportTicket,User).join(SupportTicket,SupportTicket.id==SupportTicketMessage.ticket_id).join(User,User.id==SupportTicket.owner_id).where(SupportTicket.kind=="SUPPORT")
    if owner is not None:query=query.where(SupportTicket.owner_id==owner)
    rows=(await db.execute(query.order_by(SupportTicketMessage.created_at,SupportTicketMessage.id))).all()
    return [{"id":m.id,"ticket_id":t.id,"owner_id":t.owner_id,"author":"Поддержка" if m.staff else u.display_name or u.username,
             "staff":bool(m.staff),"text":m.text,"at":iso(m.created_at),"receipt":m.receipt} for m,t,u in rows]

@router.get("/support/messages")
async def my_messages(user=Depends(get_current_user), db=Depends(get_db)):
    from app.support_service import public_messages
    return await public_messages(db, user.id)

@router.post("/support/messages")
async def send_message(body: SupportMessage, request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    from app.routers.support_tickets import create_message,SendIn
    return await create_message(SendIn(text=body.text,path=body.path),user,db,request)

@router.get("/admin/operations")
async def overview(user=Depends(staff), db=Depends(get_db)):
    from app.routers.council import summary, members_for
    meetings = (await db.scalars(select(CouncilMeeting).where(CouncilMeeting.company_id.is_(None), CouncilMeeting.visibility == "public", CouncilMeeting.status.not_in(["finished","cancelled"])).order_by(CouncilMeeting.scheduled_at.desc()).limit(100))).all()
    companies = (await db.scalars(select(Company).where(Company.status != "ARCHIVED").order_by(Company.name))).all()
    sessions = (await db.scalars(select(Session).where(Session.status == "active").order_by(Session.id.desc()).limit(100))).all()
    # Corporate sessions never enter the general support console.
    visible_sessions = []
    for s in sessions:
        settings = json.loads(s.settings or "{}")
        if any(settings.get(k) for k in ("corporate", "corporate_scenario_snapshot", "company_id", "company_assignment_id", "company_attempt_id", "corporate_company_id")):
            continue
        state = json.loads(s.state or "{}")
        visible_sessions.append({"id": s.id, "user_id": s.user_id, "status": s.status, "scenario_id": s.scenario_id, "step": state.get("step_id") or state.get("current_node") or state.get("step"), "turns": len(state.get("history") or [])})
    return {"admin": bool(user.is_admin), "meetings": [summary(m, await members_for(db, m.id), user.id) for m in meetings], "companies": [{"id": c.id, "name": c.name} for c in companies], "sessions": visible_sessions, "messages": await support_rows(db)}

@router.post("/admin/operations/support/{owner_id}")
async def reply(owner_id: int, body: SupportMessage, user=Depends(staff), db=Depends(get_db)):
    from app.support_models import SupportTicket
    from app.support_service import lock_ticket,staff_reply
    ticket_id=await db.scalar(select(SupportTicket.id).where(SupportTicket.owner_id==owner_id,SupportTicket.kind=="SUPPORT",SupportTicket.status!="CLOSED").order_by(SupportTicket.updated_at.desc()).limit(1))
    if not ticket_id:
        raise HTTPException(404, "Обращение не найдено")
    ticket=await lock_ticket(db,ticket_id)
    if ticket.status=="OPEN" and not ticket.assigned_to:
        ticket.assigned_to=user.id
        ticket.status="IN_PROGRESS"
    await staff_reply(db,ticket,user,body.text)
    await db.commit()
    return {"ok":True,"ticket_id":ticket_id}

@router.post("/admin/operations/companies/{company_id}/archive")
async def archive(company_id: int, body: Reason, user=Depends(staff), db=Depends(get_db)):
    company = await db.get(Company, company_id)
    if not company or company.status == "ARCHIVED":
        raise HTTPException(404, "Компания не найдена")
    data = json.loads(company.settings or "{}")
    data["moderation_archive"] = {"previous_status": company.status, "reason": body.reason, "actor": user.id, "at": stamp()}
    company.settings, company.status = json.dumps(data, ensure_ascii=False), "ARCHIVED"
    await audit(db, user, "company_archive", company_id, body.reason)
    await db.commit()
    return {"ok": True}


async def personal_session(db, session_id):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Сессия не найдена")
    settings = json.loads(session.settings or "{}")
    if any(settings.get(k) for k in ("corporate", "corporate_scenario_snapshot", "company_id", "company_assignment_id", "company_attempt_id", "corporate_company_id")):
        raise HTTPException(404, "Сессия не найдена")
    return session


@router.get("/admin/operations/sessions/{session_id}")
async def inspect_session(session_id: int, user=Depends(staff), db=Depends(get_db)):
    from app.models import Message
    session = await personal_session(db, session_id)
    messages = (await db.scalars(select(Message).where(Message.session_id == session_id).order_by(Message.id))).all()
    state = json.loads(session.state or "{}")
    await audit(db, user, "session_inspected", session_id, "Диагностика игровой сессии")
    await db.commit()
    return {"id": session.id, "status": session.status, "mode": session.mode, "role": session.role, "scenario": session.scenario_id, "history": state.get("history", []), "messages": [{"id":m.id,"sender":m.sender,"text":m.text} for m in messages], "report": json.loads(session.report) if session.report else None}


@router.post("/admin/operations/sessions/{session_id}/finish")
async def finish_session_support(session_id: int, body: Reason, user=Depends(staff), db=Depends(get_db)):
    from app.services import finish_session
    from app.routers.game import session_locks
    async with session_locks[session_id]:
        session = await personal_session(db, session_id)
        owner = await db.get(User, session.user_id)
        result = await finish_session(db, session, owner)
        await audit(db, user, "session_finished", session_id, body.reason)
        await db.commit()
        return result

@router.get("/admin/operations/archive")
async def archived(user=Depends(get_admin), db=Depends(get_db)):
    rows = (await db.scalars(select(Company).where(Company.status == "ARCHIVED"))).all()
    return [{"id": c.id, "name": c.name, **json.loads(c.settings or "{}").get("moderation_archive", {})} for c in rows]

@router.post("/admin/operations/companies/{company_id}/restore")
async def restore(company_id: int, body: Reason, user=Depends(get_admin), db=Depends(get_db)):
    company = await db.get(Company, company_id)
    if not company or company.status != "ARCHIVED":
        raise HTTPException(404, "Архивная компания не найдена")
    data = json.loads(company.settings or "{}")
    company.status = data.get("moderation_archive", {}).get("previous_status", "ACTIVE")
    await audit(db, user, "company_restore", company_id, body.reason)
    await db.commit()
    return {"ok": True}

@router.post("/admin/operations/users/{user_id}/ban")
async def ban(user_id: int, body: Ban, user=Depends(staff), db=Depends(get_db)):
    target = await db.get(User, user_id)
    if not target or target.is_admin or user_id == user.id or await db.get(CouncilModerator, user_id):
        raise HTTPException(422, "Нельзя ограничить этот аккаунт")
    key = f"moderation_ban:{user_id}"
    row = await db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key)
        db.add(row)
    row.value = json.dumps({"until": (datetime.now(timezone.utc) + timedelta(hours=body.hours)).isoformat(), "reason": body.reason})
    await audit(db, user, "temporary_ban", user_id, body.reason)
    await db.commit()
    return {"ok": True}
