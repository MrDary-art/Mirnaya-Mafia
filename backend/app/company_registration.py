"""Company applications shared by registration and the existing company flow."""
import json
import re
import secrets
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.company_models import Company, CompanyApplication, CompanyMembership, CompanySubscription, CompanyAuditLog
from app.models import DirectMessage, Notification


async def create_company_workspace(db, user, *, name, industry="", city="", logo=None):
    """Create the workspace inside the caller's account/creation transaction."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower().replace("ё", "е")).strip("-") or f"company-{secrets.token_hex(3)}"
    slug, suffix = base, 1
    while await db.scalar(select(Company.id).where(Company.slug == slug)):
        suffix += 1
        slug = f"{base}-{suffix}"
    company = Company(name=name.strip(), slug=slug, industry=industry.strip(), company_size="25",
        logo=logo, city=city.strip(), academy_name=f"{name.strip()} · Академия", created_by=user.id)
    db.add(company)
    await db.flush()
    db.add(CompanyMembership(company_id=company.id, user_id=user.id, corporate_role="COMPANY_OWNER", status="ACTIVE",
        job_title="Генеральный директор", is_primary=1, joined_at=datetime.now(), verified_at=datetime.now()))
    db.add(CompanySubscription(company_id=company.id, plan_code="TEAM", status="TRIAL", licensed_seats=25))
    db.add(CompanyAuditLog(company_id=company.id, actor_user_id=user.id, action="COMPANY_CREATED",
        entity_type="company", entity_id=str(company.id), details=json.dumps({"name": company.name}, ensure_ascii=False)))
    await db.flush()
    return company


async def submit_application(db, company, user, *, desired_job_title="Сотрудник", specialization=None, message=None):
    membership = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id, CompanyMembership.user_id == user.id,
        CompanyMembership.status == "ACTIVE"))
    if membership:
        raise HTTPException(409, "Вы уже состоите в этой компании")
    row = await db.scalar(select(CompanyApplication).where(
        CompanyApplication.company_id == company.id, CompanyApplication.user_id == user.id))
    if row and row.status == "PENDING":
        raise HTTPException(409, "Заявка уже отправлена")
    if row is None:
        row = CompanyApplication(company_id=company.id, user_id=user.id)
        db.add(row)
    row.desired_job_title = desired_job_title.strip()
    row.specialization = (specialization or "").strip() or None
    row.message = (message or "").strip() or None
    row.status = "PENDING"
    row.reviewed_by = row.review_note = row.reviewed_at = None
    owners = (await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id, CompanyMembership.status == "ACTIVE",
        CompanyMembership.corporate_role.in_(["COMPANY_OWNER", "COMPANY_ADMIN"])))).all()
    for owner in owners:
        payload = {"company_id": company.id, "applicant": user.username}
        db.add(Notification(user_id=owner.user_id, type="COMPANY_APPLICATION", payload=json.dumps(payload)))
        db.add(DirectMessage(sender_id=user.id, receiver_id=owner.user_id, type="COMPANY_APPLICATION",
            text=f"Заявка в компанию «{company.name}»",
            payload=json.dumps({**payload, "job_title": row.desired_job_title})))
    return row
