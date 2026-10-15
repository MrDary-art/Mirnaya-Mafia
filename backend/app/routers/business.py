"""Public business enquiries with explicit consent, durable storage and bounded spam protection."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_models import BusinessLead
from app.config import settings
from app.db import get_db

router = APIRouter(prefix="/business", tags=["business"])


class BusinessLeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    company: str = Field(min_length=2, max_length=180)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    message: str = Field(default="", max_length=6000)
    consent: Literal[True]
    website: str = Field(default="", max_length=300)
    interest: Literal["demo", "proposal", "contact"] = "demo"


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
