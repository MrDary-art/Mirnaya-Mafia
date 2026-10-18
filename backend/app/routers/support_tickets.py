"""Ticket inbox, staff claims, developer escalation and participant-confirmed closure."""
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, update
from app.auth import get_current_user, get_admin
from app.db import get_db
from app.models import User, AppSetting, Notification
from app.support_models import SupportTicket, SupportTicketMessage
from app.support_service import (now, iso, loads, public_ticket, public_messages, lock_ticket, may_work,
    staff_reply, diagnostic_snapshot, record_action, audit, notify, send_public_message)
from app.routers.operations import staff, online_staff

router=APIRouter(tags=["support-tickets"])


class ClientContext(BaseModel):
    language: str = Field(default="",max_length=40)
    timezone: str = Field(default="",max_length=80)
    viewport: str = Field(default="",max_length=40)


class SendIn(BaseModel):
    text: str = Field(min_length=1,max_length=4000)
    path: str = Field(default="",max_length=300)
    client: ClientContext = Field(default_factory=ClientContext)
    ticket_id: str | None = Field(default=None,max_length=40)


class ActionIn(BaseModel):
    action: Literal["claim","release","escalate","reply","resolve"]
    text: str = Field(default="",max_length=4000)


class DecisionIn(BaseModel):
    resolved: bool


class NavigationIn(BaseModel):
    path: str = Field(max_length=200)


@router.post("/support/activity")
async def navigation(body:NavigationIn,user=Depends(get_current_user),db=Depends(get_db)):
    from app.deployment_security import rate_limit
    rate_limit("support-navigation",user.id,120,60)
    await record_action(db,user.id,"Переход на страницу",body.path)
    await db.commit()
    return {"ok":True}


@router.get("/support/tickets")
async def my_tickets(user=Depends(get_current_user),db=Depends(get_db)):
    rows=(await db.scalars(select(SupportTicket).where(SupportTicket.owner_id==user.id).order_by(SupportTicket.updated_at.desc()).limit(100))).all()
    return {"items":[public_ticket(t) for t in rows]}


@router.get("/support/tickets/{ticket_id}")
async def my_ticket(ticket_id:str,user=Depends(get_current_user),db=Depends(get_db)):
    ticket=await db.get(SupportTicket,ticket_id)
    if not ticket or ticket.owner_id!=user.id:
        raise HTTPException(404,"Обращение не найдено")
    return {**public_ticket(ticket),"messages":await public_messages(db,user.id,ticket_id)}


async def create_message(body,user,db,request):
    online=await online_staff(db)
    receipt="Спасибо! Специалист получил ваше сообщение и ответит здесь." if online else "Спасибо! Сейчас специалисты не в сети. Обращение сохранено, мы ответим здесь."
    context=await diagnostic_snapshot(db,user,request,body.path,body.client.model_dump())
    ticket,message=await send_public_message(db,user,body.text,context,body.ticket_id,receipt)
    await db.commit()
    return {"id":message.id,"ticket_id":ticket.id,"text":message.text,"staff":False,"at":iso(message.created_at),"receipt":receipt}


@router.post("/support/tickets/messages")
async def send(body:SendIn,request:Request,user=Depends(get_current_user),db=Depends(get_db)):
    return await create_message(body,user,db,request)


@router.post("/support/tickets/{ticket_id}/confirm")
async def confirm(ticket_id:str,body:DecisionIn,user=Depends(get_current_user),db=Depends(get_db)):
    ticket=await lock_ticket(db,ticket_id)
    if ticket.owner_id!=user.id:
        raise HTTPException(404,"Обращение не найдено")
    if ticket.status!="WAITING_USER":
        raise HTTPException(409,"Обращение не ожидает подтверждения")
    ticket.status="CLOSED" if body.resolved else "DEVELOPER" if ticket.developer_only else "IN_PROGRESS" if ticket.assigned_to else "OPEN"
    ticket.closed_at=now() if body.resolved else None
    ticket.updated_at=now()
    if ticket.source_report_id and body.resolved:
        from app.social_models import SocialReport
        report=await db.get(SocialReport,ticket.source_report_id)
        if report:
            report.status="RESOLVED"
            report.resolved_at=now()
            report.moderator_id=ticket.assigned_to
    await audit(db,user,ticket,"USER_CONFIRMED" if body.resolved else "USER_REOPENED")
    await db.execute(update(Notification).where(Notification.user_id==user.id,Notification.type=="SUPPORT_CONFIRMATION",
        Notification.payload.contains(ticket.id)).values(is_read=1))
    await db.commit()
    return public_ticket(ticket)


@router.get("/admin/operations/access")
async def access(user=Depends(staff),db=Depends(get_db)):
    marker=await db.get(AppSetting,f"support_presence:{user.id}")
    presence=loads(marker.value) if marker else {}
    from datetime import datetime,timezone
    active=bool(presence.get("available") and (datetime.now(timezone.utc)-datetime.fromisoformat(presence["at"])).total_seconds()<90)
    return {"id":user.id,"admin":bool(user.is_admin),"name":user.display_name or user.username,"available":active}


async def staff_summary(db,ticket):
    owner=await db.get(User,ticket.owner_id)
    assignee=await db.get(User,ticket.assigned_to) if ticket.assigned_to else None
    latest=await db.scalar(select(SupportTicketMessage.text).where(SupportTicketMessage.ticket_id==ticket.id).order_by(SupportTicketMessage.created_at.desc(),SupportTicketMessage.id.desc()).limit(1))
    return {**public_ticket(ticket),"name":(owner.display_name or owner.username) if owner and ticket.kind=="SUPPORT" else "Обращение сообщества",
            "username":owner.username if owner and ticket.kind=="SUPPORT" else None,
            "assigned_to":ticket.assigned_to,"assignee":(assignee.display_name or assignee.username) if assignee else None,
            "developer_only":bool(ticket.developer_only),"preview":(latest or "")[:140]}


@router.get("/admin/support/tickets")
async def queue(status:Literal["active","OPEN","IN_PROGRESS","DEVELOPER","WAITING_USER","CLOSED","all"]="active",
                source:Literal["all","SUPPORT","COMMUNITY"]="all",q:str="",page:int=Query(1,ge=1),user=Depends(staff),db=Depends(get_db)):
    statement=select(SupportTicket)
    if status=="active":statement=statement.where(SupportTicket.status!="CLOSED")
    elif status!="all":statement=statement.where(SupportTicket.status==status)
    if source!="all":statement=statement.where(SupportTicket.kind==source)
    if q.strip():
        term=f"%{q.strip()}%"
        users=select(User.id).where(or_(User.username.ilike(term),User.display_name.ilike(term)))
        messages=select(SupportTicketMessage.ticket_id).where(SupportTicketMessage.text.ilike(term))
        statement=statement.where(or_(SupportTicket.id.ilike(term),SupportTicket.id.in_(messages),
            (SupportTicket.kind=="SUPPORT") & SupportTicket.owner_id.in_(users)))
    total=await db.scalar(select(func.count()).select_from(statement.subquery()))
    rows=(await db.scalars(statement.order_by(SupportTicket.updated_at.desc(),SupportTicket.id).offset((page-1)*20).limit(20))).all()
    return {"items":[await staff_summary(db,t) for t in rows],"total":total,"page":page}


@router.get("/admin/support/developer-notifications")
async def developer_notifications(user=Depends(get_admin),db=Depends(get_db)):
    rows=(await db.scalars(select(Notification).where(Notification.user_id==user.id,Notification.type=="SUPPORT_DEVELOPER",Notification.is_read==0).order_by(Notification.id.desc()).limit(20))).all()
    waiting=await db.scalar(select(func.count()).select_from(SupportTicket).where(SupportTicket.developer_only==1,SupportTicket.status=="DEVELOPER"))
    return {"count":len(rows),"waiting":waiting,"items":[{"id":row.id,"ticket_id":loads(row.payload).get("ticket_id"),"created_at":iso(row.created_at)} for row in rows]}


@router.get("/admin/support/tickets/{ticket_id}")
async def detail(ticket_id:str,user=Depends(staff),db=Depends(get_db)):
    ticket=await db.get(SupportTicket,ticket_id)
    if not ticket:raise HTTPException(404,"Обращение не найдено")
    data={**await staff_summary(db,ticket),"messages":await public_messages(db,ticket.owner_id,ticket.id),
          "diagnostics":loads(ticket.private_context),"internal_note":ticket.internal_note}
    if ticket.source_report_id:
        from app.social_models import SocialReport,SocialPost,SocialComment,SocialStory
        report=await db.get(SocialReport,ticket.source_report_id)
        target=await db.get({"POST":SocialPost,"COMMENT":SocialComment,"STORY":SocialStory}[report.target_type],report.target_id) if report else None
        data["content"]={"report_id":report.id,"target_type":report.target_type,"target_id":report.target_id,"reason":report.reason,
                         "text":target.body if isinstance(target,SocialPost) else target.text if target else "Материал удалён",
                         "status":target.status if target else "DELETED"} if report else None
    if user.is_admin:
        await db.execute(update(Notification).where(Notification.user_id==user.id,Notification.type=="SUPPORT_DEVELOPER",Notification.payload.contains(ticket_id)).values(is_read=1))
        await db.commit()
    return data


@router.post("/admin/support/tickets/{ticket_id}/actions")
async def act(ticket_id:str,body:ActionIn,user=Depends(staff),db=Depends(get_db)):
    ticket=await lock_ticket(db,ticket_id)
    if body.action=="claim":
        if ticket.developer_only and not user.is_admin:raise HTTPException(403,"Это очередь разработчиков")
        if ticket.status in ("WAITING_USER","CLOSED"):raise HTTPException(409,"Обращение не ожидает сотрудника")
        if ticket.assigned_to not in (None,user.id):raise HTTPException(409,"Обращение уже взял другой сотрудник")
        ticket.assigned_to=user.id
        ticket.status="DEVELOPER" if ticket.developer_only else "IN_PROGRESS"
        await audit(db,user,ticket,"CLAIMED")
    elif body.action=="release":
        may_work(ticket,user)
        ticket.assigned_to=None
        ticket.status="DEVELOPER" if ticket.developer_only else "OPEN"
        await audit(db,user,ticket,"RELEASED")
    elif body.action=="escalate":
        may_work(ticket,user)
        if ticket.developer_only:raise HTTPException(409,"Обращение уже передано разработчику")
        if len(body.text.strip())<5:raise HTTPException(422,"Укажите причину передачи разработчику")
        ticket.developer_only=1
        ticket.status="DEVELOPER"
        ticket.assigned_to=None
        ticket.internal_note=body.text.strip()
        for admin_id in (await db.scalars(select(User.id).where(User.is_admin==1))).all():
            await notify(db,admin_id,"SUPPORT_DEVELOPER",ticket)
        await audit(db,user,ticket,"ESCALATED",{"reason":body.text.strip()})
    else:
        await staff_reply(db,ticket,user,body.text,resolve=body.action=="resolve")
    ticket.updated_at=now()
    await db.commit()
    return {"ok":True,"status":ticket.status}


class ContentIn(BaseModel):
    action: Literal["hide","restore","dismiss"]


@router.post("/admin/support/tickets/{ticket_id}/content")
async def moderate_content(ticket_id:str,body:ContentIn,user=Depends(staff),db=Depends(get_db)):
    ticket=await lock_ticket(db,ticket_id)
    may_work(ticket,user)
    if not ticket.source_report_id:raise HTTPException(409,"Это обращение не связано с материалом сообщества")
    from app.routers.social_feed import apply_report_moderation
    from app.social_models import SocialReport
    report=await db.get(SocialReport,ticket.source_report_id)
    if not report:raise HTTPException(404,"Жалоба не найдена")
    await apply_report_moderation(db,report,body.action,user.id)
    await audit(db,user,ticket,"CONTENT_"+body.action.upper())
    await db.commit()
    return {"ok":True}
