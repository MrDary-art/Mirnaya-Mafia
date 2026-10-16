"""Public business enquiries with explicit consent, durable storage and bounded spam protection."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_models import BusinessLead
from app.config import settings
from app.db import get_db
from app.auth import get_admin
from app.models import User

router = APIRouter(prefix="/business", tags=["business"])
admin_router = APIRouter(prefix="/admin/business", tags=["business-crm"])


class BusinessLeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    company: str = Field(min_length=2, max_length=180)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    message: str = Field(default="", max_length=6000)
    consent: Literal[True]
    website: str = Field(default="", max_length=300)
    interest: Literal["demo", "proposal", "contact", "integration"] = "demo"


def private_hash(value):
    return hmac.new(settings.secret_key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


@router.post("/leads", status_code=201)
async def create_business_lead(body: BusinessLeadIn, request: Request, db: AsyncSession = Depends(get_db)):
    if body.website.strip():
        return {"ok": True}
    name, company = body.name.strip(), body.company.strip()
    if len(name) < 2 or len(company) < 2:
        raise HTTPException(422, "Укажите имя и название компании")
    email = body.email.strip().lower()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Ignore client supplied forwarded headers; deployment proxy can set request.client securely.
    source_hash = private_hash(request.client.host if request.client else "unknown")
    email_hash = private_hash(email)
    ip_count = await db.scalar(select(func.count()).select_from(BusinessLead).where(
        BusinessLead.source_hash == source_hash, BusinessLead.created_at >= now - timedelta(hours=1)))
    email_count = await db.scalar(select(func.count()).select_from(BusinessLead).where(
        BusinessLead.email_hash == email_hash, BusinessLead.created_at >= now - timedelta(days=1)))
    if ip_count >= 10 or email_count >= 3:
        raise HTTPException(429, "Слишком много заявок. Попробуйте позже", headers={"Retry-After": "3600"})
    lead = BusinessLead(name=name, company=company, email=email, message=body.message.strip(),
        interest=body.interest, consent_version="business-lead-v1", consented_at=now,
        source_hash=source_hash, email_hash=email_hash)
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return {"ok": True, "id": lead.id}


@router.get("/leads")
async def business_leads_are_private():
    raise HTTPException(404, "Публичный список заявок недоступен")


class BusinessLeadUpdateIn(BaseModel):
    status: Literal["NEW", "QUALIFIED", "CONTACTED", "PROPOSAL", "WON", "LOST"]
    internal_note: str = Field(default="", max_length=6000)
    next_action_at: datetime | None = None
    assign_to_me: bool = True


def lead_payload(row: BusinessLead) -> dict:
    return {"id": row.id, "name": row.name, "company": row.company, "email": row.email,
            "message": row.message, "interest": row.interest, "status": row.status,
            "assignee_id": row.assignee_id, "internal_note": row.internal_note or "",
            "next_action_at": row.next_action_at.isoformat() if row.next_action_at else None,
            "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@admin_router.get("/leads")
async def admin_business_leads(status: str = "", q: str = "", offset: int = Query(0, ge=0),
                               limit: int = Query(50, ge=1, le=200), db: AsyncSession = Depends(get_db),
                               admin: User = Depends(get_admin)):
    query = select(BusinessLead)
    count_query = select(func.count()).select_from(BusinessLead)
    if status:
        query, count_query = query.where(BusinessLead.status == status.upper()), count_query.where(BusinessLead.status == status.upper())
    if q.strip():
        pattern = f"%{q.strip()}%"
        condition = BusinessLead.company.ilike(pattern) | BusinessLead.name.ilike(pattern) | BusinessLead.email.ilike(pattern)
        query, count_query = query.where(condition), count_query.where(condition)
    total = int(await db.scalar(count_query) or 0)
    rows = (await db.scalars(query.order_by(BusinessLead.created_at.desc()).offset(offset).limit(limit))).all()
    return {"items": [lead_payload(row) for row in rows], "total": total, "offset": offset, "limit": limit}


@admin_router.put("/leads/{lead_id}")
async def update_business_lead(lead_id: int, body: BusinessLeadUpdateIn, db: AsyncSession = Depends(get_db),
                               admin: User = Depends(get_admin)):
    row = await db.get(BusinessLead, lead_id)
    if row is None:
        raise HTTPException(404, "Заявка не найдена")
    row.status = body.status
    row.internal_note = body.internal_note.strip() or None
    row.next_action_at = body.next_action_at
    row.assignee_id = admin.id if body.assign_to_me else None
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return lead_payload(row)
