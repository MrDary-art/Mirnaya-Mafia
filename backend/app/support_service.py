"""Support state transitions, ownership and explicit public/private serializers."""
import json
import re
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select, update, delete
from app.models import User, Notification
from app.support_models import SupportTicket, SupportTicketMessage, SupportActionLog
from app.deployment_models import AdminAudit


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def loads(value):
    try:
        return json.loads(value or "{}")
    except (TypeError, ValueError):
        return {}


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def clean_path(path):
    path = (path or "").split("?")[0].split("#")[0]
    if not re.fullmatch(r"/[a-zA-Z0-9_/{}/-]{0,190}", path):
        return ""
    if any(part in path.lower() for part in ("password", "token", "verify", "invitation", "callback", "auth", "mail/")):
        return ""
    return path


async def record_action(db, user_id, action, route, method="GET", status_code=200):
    route = clean_path(route)
    if not route:
        return
    db.add(SupportActionLog(user_id=user_id, action=action[:80], route=route, method=method[:8], status_code=status_code))
    await db.flush()
    keep = select(SupportActionLog.id).where(SupportActionLog.user_id == user_id).order_by(SupportActionLog.id.desc()).limit(100)
    await db.execute(delete(SupportActionLog).where(SupportActionLog.user_id == user_id, SupportActionLog.id.not_in(keep)))


async def diagnostic_snapshot(db, user, request, path="", client=None):
    events = (await db.scalars(select(SupportActionLog).where(SupportActionLog.user_id == user.id)
                              .order_by(SupportActionLog.id.desc()).limit(10))).all()
    return {"captured_at": iso(now()), "page": clean_path(path), "api_version": request.app.version,
            "browser": request.headers.get("user-agent", "")[:300],
            "client": client or {}, "actions": [{"at": iso(e.created_at), "action": e.action, "route": e.route,
                "method": e.method, "status": e.status_code} for e in reversed(events)]}


async def lock_ticket(db, ticket_id):
    # SQLite write lock precedes the read, making claims/changes atomic across workers.
    result = await db.execute(update(SupportTicket).where(SupportTicket.id == ticket_id).values(version=SupportTicket.version+1))
    if not result.rowcount:
        raise HTTPException(404, "Обращение не найдено")
    ticket = await db.get(SupportTicket, ticket_id, populate_existing=True)
    return ticket


def may_work(ticket, user):
    if ticket.developer_only and not user.is_admin:
        raise HTTPException(403, "Обращение передано разработчику. Ответ ожидается от администратора.")
    if ticket.status in ("CLOSED", "WAITING_USER"):
        raise HTTPException(409, "Обращение закрыто или ожидает подтверждения участника")
    if ticket.assigned_to != user.id:
        raise HTTPException(409, "Сначала возьмите обращение в работу. Другой сотрудник мог уже заняться им.")


async def audit(db, actor, ticket, action, detail=None):
    db.add(AdminAudit(actor_id=actor.id, action="SUPPORT_"+action, detail=json.dumps({"ticket_id": ticket.id, **(detail or {})}, ensure_ascii=False), created=datetime.now(timezone.utc).timestamp()))


async def notify(db, user_id, kind, ticket):
    db.add(Notification(user_id=user_id, type=kind, payload=json.dumps({"ticket_id":ticket.id,"path":"/admin/operations?queue=developer" if kind=="SUPPORT_DEVELOPER" else f"/support?ticket={ticket.id}", "message":"Обращение передано разработчику" if kind=="SUPPORT_DEVELOPER" else "Поддержка ожидает подтверждения решения"}, ensure_ascii=False)))


async def public_messages(db, owner_id, ticket_id=None):
    query = select(SupportTicketMessage, SupportTicket).join(SupportTicket, SupportTicket.id==SupportTicketMessage.ticket_id).where(SupportTicket.owner_id==owner_id)
    if ticket_id:
        query=query.where(SupportTicket.id==ticket_id)
    rows=(await db.execute(query.order_by(SupportTicketMessage.created_at,SupportTicketMessage.id))).all()
    return [{"id": m.id,"ticket_id": t.id,"staff":bool(m.staff),"text":m.text,"at":iso(m.created_at),
             "receipt":m.receipt} for m,t in rows]


def public_ticket(ticket):
    # Deliberate allowlist. Private context, assignment notes and logs never enter this response.
    return {"id":ticket.id,"kind":ticket.kind,"status":ticket.status,"created_at":iso(ticket.created_at),
            "updated_at":iso(ticket.updated_at),"closed_at":iso(ticket.closed_at)}


async def send_public_message(db, user, text, context, ticket_id=None, receipt=None):
    text=text.strip()
    if not text:
        raise HTTPException(422,"Напишите сообщение")
    if ticket_id:
        ticket=await lock_ticket(db,ticket_id)
        if ticket.owner_id!=user.id:
            raise HTTPException(404,"Обращение не найдено")
        if ticket.status=="CLOSED":
            raise HTTPException(409,"Обращение уже закрыто. Создайте новое.")
    else:
        # Serialize new requests per owner; a simultaneous send joins the same active support ticket.
        await db.execute(update(User).where(User.id==user.id).values(stars=User.stars))
        ticket=await db.scalar(select(SupportTicket).where(SupportTicket.owner_id==user.id,SupportTicket.kind=="SUPPORT",SupportTicket.status!="CLOSED").order_by(SupportTicket.created_at.desc()))
        if not ticket:
            ticket=SupportTicket(id=uuid4().hex,owner_id=user.id,kind="SUPPORT",status="OPEN",created_at=now(),updated_at=now())
            db.add(ticket)
            await db.flush()
        else:
            ticket=await lock_ticket(db,ticket.id)
    latest=await db.scalar(select(SupportTicketMessage.created_at).where(SupportTicketMessage.ticket_id==ticket.id,SupportTicketMessage.staff==0).order_by(SupportTicketMessage.created_at.desc()).limit(1))
    if latest and (now()-latest).total_seconds()<2:
        raise HTTPException(429,"Подождите пару секунд перед следующим сообщением")
    ticket.private_context=json.dumps(context,ensure_ascii=False)
    ticket.updated_at=now()
    if ticket.status=="WAITING_USER":
        ticket.status="DEVELOPER" if ticket.developer_only else "IN_PROGRESS" if ticket.assigned_to else "OPEN"
    message=SupportTicketMessage(id=uuid4().hex,ticket_id=ticket.id,author_id=user.id,staff=0,text=text,receipt=receipt,created_at=now())
    db.add(message)
    await db.flush()
    return ticket,message


async def staff_reply(db,ticket,user,text,resolve=False):
    may_work(ticket,user)
    text=text.strip()
    if not text:
        raise HTTPException(422,"Напишите ответ участнику")
    db.add(SupportTicketMessage(id=uuid4().hex,ticket_id=ticket.id,author_id=user.id,staff=1,text=text,created_at=now()))
    ticket.updated_at=now()
    if resolve:
        ticket.status="WAITING_USER"
        await notify(db,ticket.owner_id,"SUPPORT_CONFIRMATION",ticket)
    await audit(db,user,ticket,"RESOLUTION_PROPOSED" if resolve else "REPLY")


async def ensure_community_ticket(db, report, context=None):
    ticket=await db.scalar(select(SupportTicket).where(SupportTicket.source_report_id==report.id))
    if ticket:
        return ticket
    ticket=SupportTicket(id=f"community-{report.id}",owner_id=report.reporter_user_id,kind="COMMUNITY",source_report_id=report.id,
                         status="OPEN" if report.status=="PENDING" else "CLOSED",private_context=json.dumps(context or {"legacy":True}),
                         created_at=report.created_at or now(),updated_at=report.created_at or now(),closed_at=report.resolved_at)
    db.add(ticket)
    await db.flush()
    db.add(SupportTicketMessage(id=f"community-message-{report.id}",ticket_id=ticket.id,author_id=report.reporter_user_id,
        staff=0,text=f"Обращение о материале №{report.target_id}: {report.reason}",created_at=report.created_at or now()))
    return ticket
