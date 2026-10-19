"""Single-use corporate invitations; accounts and authentication remain shared."""
from datetime import datetime, timedelta
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import (ROLE_LABELS, COMPANY_ADMINS, ensure_license_capacity,
                                owned_department, validate_role_grant, validate_owner_change)
from app.company_models import Company, CompanyInboxMessage, CompanyInvitation, CompanyMembership
from app.company_advanced_models import CompanyOnboarding
from app.db import get_db
from app.models import Notification, User
from app.routers.company import require_membership, require_role, audit
from app.services import dumps

router = APIRouter(prefix="/company", tags=["company-invitations"])


class InvitationLinkIn(BaseModel):
    corporate_role: str = "EMPLOYEE"
    department_id: int | None = None
    job_title: str = Field(default="Сотрудник", min_length=1, max_length=160)
    expires_in_days: int = Field(default=7, ge=1, le=30)
    username: str | None = Field(default=None, min_length=2, max_length=80)


class MemberInvitationIn(BaseModel):
    """An in-product invitation for an existing Arena account.

    Unlike a reusable link, this creates one pending company membership.  The
    recipient can accept or decline it from the workspace chooser.
    """
    identity: str = Field(min_length=2, max_length=80)
    corporate_role: str = "EMPLOYEE"
    department_id: int | None = None
    job_title: str = Field(default="Сотрудник", min_length=1, max_length=160)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def invitation_status(row: CompanyInvitation) -> str:
    if row.accepted_at:
        return "ACCEPTED"
    if row.revoked_at:
        return "REVOKED"
    if row.expires_at <= datetime.now():
        return "EXPIRED"
    return "PENDING"


@router.post("/{company_id}/member-invitations", status_code=201)
async def invite_existing_member(company_id: int, body: MemberInvitationIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Invite a registered person by their exact login or nickname."""
    actor = await require_membership(db, user, company_id)
    require_role(actor, COMPANY_ADMINS)
    validate_role_grant(actor, body.corporate_role)
    await owned_department(db, company_id, body.department_id)
    identity = body.identity.strip()
    if not identity or not body.job_title.strip():
        raise HTTPException(400, "Укажите логин или никнейм и должность")
    person = await db.scalar(select(User).where(or_(User.username == identity, User.login == identity)))
    if person is None:
        raise HTTPException(404, "Пользователь Arena с таким логином или никнеймом не найден")
    membership = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.user_id == person.id,
    ))
    if membership and membership.status == "ACTIVE":
        raise HTTPException(409, "Пользователь уже состоит в компании")
    if membership and membership.status == "INVITED":
        raise HTTPException(409, "Приглашение этому пользователю уже отправлено")
    if membership:
        await validate_owner_change(db, actor, membership, body.corporate_role, "INVITED")
    else:
        await ensure_license_capacity(db, company_id)
        membership = CompanyMembership(company_id=company_id, user_id=person.id)
    membership.department_id = body.department_id
    membership.corporate_role = body.corporate_role
    membership.job_title = body.job_title.strip()
    membership.status = "INVITED"
    membership.invited_by = user.id
    membership.joined_at = None
    membership.verified_at = None
    db.add(membership)
    await db.flush()
    company = await db.get(Company, company_id)
    payload = dumps({"company_id": company_id, "membership_id": membership.id, "company": company.name})
    db.add(Notification(user_id=person.id, type="COMPANY_INVITATION", payload=payload))
    db.add(CompanyInboxMessage(company_id=company_id, membership_id=membership.id,
        type="COMPANY_INVITATION", title=f"Приглашение в «{company.name}»",
        text=f"Вас приглашают на должность «{membership.job_title}». Примите или отклоните приглашение.",
        payload=payload))
    await audit(db, actor, user.id, "MEMBER_INVITED", "membership", membership.id,
                {"target_user_id": person.id, "role": membership.corporate_role})
    await db.commit()
    return {"membership_id": membership.id, "status": "INVITED", "name": person.display_name or person.username,
            "username": person.username}


async def available_invitation(db: AsyncSession, token: str) -> CompanyInvitation:
    if len(token) < 32 or len(token) > 128:
        raise HTTPException(404, "Приглашение не найдено")
    row = await db.scalar(select(CompanyInvitation).where(CompanyInvitation.token_hash == token_hash(token)))
    if row is None:
        raise HTTPException(404, "Приглашение не найдено")
    if invitation_status(row) != "PENDING":
        raise HTTPException(410, "Приглашение уже использовано, отозвано или срок его действия истёк")
    company = await db.get(Company, row.company_id)
    inviter = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == row.company_id,
        CompanyMembership.user_id == row.created_by, CompanyMembership.status == "ACTIVE"))
    if company is None or company.status != "ACTIVE" or inviter is None or inviter.corporate_role not in COMPANY_ADMINS:
        raise HTTPException(410, "Приглашение больше не действует")
    validate_role_grant(inviter, row.corporate_role)
    return row


@router.post("/{company_id}/invitation-links")
async def create_invitation_link(company_id: int, body: InvitationLinkIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, COMPANY_ADMINS)
    validate_role_grant(actor, body.corporate_role)
    await owned_department(db, company_id, body.department_id)
    if not body.job_title.strip():
        raise HTTPException(400, "Укажите должность")
    target = None
    if body.username:
        target = await db.scalar(select(User).where(User.username == body.username.strip()))
        if target is None:
            raise HTTPException(404, "Пользователь Arena не найден")
        existing = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.user_id == target.id))
        if existing and existing.status == "ACTIVE":
            raise HTTPException(409, "Пользователь уже состоит в компании")
        if existing:
            await validate_owner_change(db, actor, existing, body.corporate_role, "INVITED")
    count = await db.scalar(select(func.count()).select_from(CompanyInvitation).where(
        CompanyInvitation.company_id == company_id, CompanyInvitation.accepted_at.is_(None),
        CompanyInvitation.revoked_at.is_(None), CompanyInvitation.expires_at > datetime.now()))
    if count >= 100:
        raise HTTPException(429, "В компании уже есть 100 действующих ссылок приглашения")
    token = secrets.token_urlsafe(32)
    row = CompanyInvitation(company_id=company_id, token_hash=token_hash(token), corporate_role=body.corporate_role,
        department_id=body.department_id, job_title=body.job_title.strip(), target_user_id=target.id if target else None,
        created_by=user.id, expires_at=datetime.now() + timedelta(days=body.expires_in_days))
    db.add(row)
    await db.flush()
    await audit(db, actor, user.id, "INVITATION_LINK_CREATED", "invitation", row.id, {"role": row.corporate_role, "targeted": target is not None})
    await db.commit()
    return {"id": row.id, "token": token, "url": f"/business/login?invitation={token}",
            "expires_at": row.expires_at.isoformat(), "status": "PENDING"}


@router.get("/{company_id}/invitation-links")
async def invitation_links(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, COMPANY_ADMINS)
    rows = (await db.scalars(select(CompanyInvitation).where(CompanyInvitation.company_id == company_id)
        .order_by(CompanyInvitation.created_at.desc()).limit(200))).all()
    return [{"id": row.id, "corporate_role": row.corporate_role, "role_label": ROLE_LABELS.get(row.corporate_role),
             "department_id": row.department_id, "job_title": row.job_title, "status": invitation_status(row),
             "expires_at": row.expires_at.isoformat(), "created_at": row.created_at.isoformat(),
             "targeted": row.target_user_id is not None} for row in rows]


@router.post("/{company_id}/invitation-links/{invitation_id}/revoke")
async def revoke_invitation_link(company_id: int, invitation_id: int,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, COMPANY_ADMINS)
    row = await db.get(CompanyInvitation, invitation_id)
    if row is None or row.company_id != company_id:
        raise HTTPException(404, "Приглашение не найдено")
    validate_role_grant(actor, row.corporate_role)
    if row.accepted_at:
        raise HTTPException(409, "Приглашение уже принято; управление участником доступно в сотрудниках")
    row.revoked_at = row.revoked_at or datetime.now()
    await audit(db, actor, user.id, "INVITATION_LINK_REVOKED", "invitation", row.id)
    await db.commit()
    return {"ok": True, "status": "REVOKED"}


@router.get("/invitations/{token}")
async def preview_invitation(token: str, db: AsyncSession = Depends(get_db)):
    row = await available_invitation(db, token)
    company = await db.get(Company, row.company_id)
    department = await owned_department(db, row.company_id, row.department_id)
    return {"company": {"id": company.id, "name": company.name}, "corporate_role": row.corporate_role,
            "role_label": ROLE_LABELS.get(row.corporate_role), "job_title": row.job_title,
            "department": department.name if department else None, "expires_at": row.expires_at.isoformat(),
            "requires_account": True, "targeted": row.target_user_id is not None}


@router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await available_invitation(db, token)
    if row.target_user_id is not None and row.target_user_id != user.id:
        raise HTTPException(403, "Это приглашение предназначено другому пользователю")
    await owned_department(db, row.company_id, row.department_id)
    membership = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == row.company_id, CompanyMembership.user_id == user.id))
    if membership and membership.status == "ACTIVE":
        raise HTTPException(409, "Вы уже состоите в этой компании")
    if membership and membership.corporate_role == "COMPANY_OWNER" and row.corporate_role != "COMPANY_OWNER":
        raise HTTPException(409, "Восстановление членства владельца требует приглашения владельца")
    now = datetime.now()
    # Conditional consumption prevents a second account from accepting the same link.
    consumed = await db.execute(update(CompanyInvitation).where(CompanyInvitation.id == row.id,
        CompanyInvitation.accepted_at.is_(None), CompanyInvitation.revoked_at.is_(None), CompanyInvitation.expires_at > now)
        .values(accepted_at=now, accepted_by=user.id).execution_options(synchronize_session=False))
    if consumed.rowcount != 1:
        raise HTTPException(410, "Приглашение уже недоступно")
    membership = membership or CompanyMembership(company_id=row.company_id, user_id=user.id)
    membership.department_id = row.department_id
    membership.corporate_role = row.corporate_role
    membership.job_title = row.job_title
    membership.status = "ACTIVE"
    membership.joined_at = now
    membership.verified_at = now
    membership.invited_by = row.created_by
    db.add(membership)
    await db.flush()
    onboarding = await db.scalar(select(CompanyOnboarding).where(CompanyOnboarding.membership_id == membership.id))
    if onboarding is None:
        db.add(CompanyOnboarding(company_id=row.company_id, membership_id=membership.id))
    await audit(db, membership, user.id, "INVITATION_LINK_ACCEPTED", "invitation", row.id)
    await db.commit()
    return {"ok": True, "company_id": row.company_id, "membership_id": membership.id, "onboarding_required": True,
            "onboarding_url": f"/business/{row.company_id}/onboarding"}
