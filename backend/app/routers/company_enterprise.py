"""Enterprise access profiles and license accounting for a company tenant."""
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import CAPABILITY_KEYS, ROLE_LABELS, capabilities, validate_owner_change
from app.company_models import CompanyMembership, CompanySubscription
from app.db import get_db
from app.models import User
from app.routers.company import audit, require_membership, require_role

router = APIRouter(prefix="/company", tags=["company-enterprise"])

PLAN_CATALOG = {
    "TEAM": {"label": "Команда", "features": ["assignments", "programs", "analytics"], "default_seats": 25},
    "BUSINESS": {"label": "Бизнес", "features": ["assignments", "programs", "analytics", "integrations", "custom_roles", "leagues"], "default_seats": 100},
    "ENTERPRISE": {"label": "Enterprise", "features": ["assignments", "programs", "analytics", "integrations", "custom_roles", "leagues", "sso", "audit_export"], "default_seats": 500},
}


class AccessProfileIn(BaseModel):
    corporate_role: str | None = None
    capability_overrides: dict[str, bool] = Field(default_factory=dict)


class SubscriptionIn(BaseModel):
    plan_code: str = "TEAM"
    status: str = Field(default="ACTIVE", pattern="^(TRIAL|ACTIVE|PAST_DUE|SUSPENDED|CANCELLED)$")
    licensed_seats: int = Field(ge=1, le=100000)
    billing_provider: str = Field(default="MANUAL", pattern="^(MANUAL|EXTERNAL)$")
    external_customer_id: str | None = Field(default=None, max_length=180)
    external_subscription_id: str | None = Field(default=None, max_length=180)
    period_ends_at: datetime | None = None


def _overrides(member: CompanyMembership) -> dict[str, bool]:
    try:
        value = json.loads(member.capability_overrides or "{}")
    except (TypeError, ValueError):
        return {}
    return {key: flag for key, flag in value.items() if key in CAPABILITY_KEYS and isinstance(flag, bool)}


async def _seat_usage(db: AsyncSession, company_id: int) -> int:
    return int(await db.scalar(select(func.count()).select_from(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.status.in_(("ACTIVE", "INVITED")),
    )) or 0)


async def _subscription(db: AsyncSession, company_id: int) -> CompanySubscription:
    row = await db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    if row is None:
        row = CompanySubscription(company_id=company_id, plan_code="TEAM", status="TRIAL", licensed_seats=25)
        db.add(row)
        await db.flush()
    return row


async def subscription_payload(db: AsyncSession, row: CompanySubscription) -> dict:
    plan = PLAN_CATALOG.get(row.plan_code, PLAN_CATALOG["TEAM"])
    used = await _seat_usage(db, row.company_id)
    return {
        "plan_code": row.plan_code, "plan_label": plan["label"], "features": plan["features"],
        "status": row.status, "licensed_seats": row.licensed_seats, "used_seats": used,
        "available_seats": max(0, row.licensed_seats - used), "billing_provider": row.billing_provider,
        "provider_connected": bool(row.external_customer_id and row.external_subscription_id),
        "period_ends_at": row.period_ends_at.isoformat() if row.period_ends_at else None,
    }


@router.get("/{company_id}/access")
async def access_profiles(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    member_rows = (await db.execute(select(CompanyMembership, User).join(User, User.id == CompanyMembership.user_id).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.status != "LEFT",
    ).order_by(CompanyMembership.id))).all()
    subscription = await _subscription(db, company_id)
    await db.commit()
    return {
        "roles": [{"code": code, "label": label} for code, label in ROLE_LABELS.items()],
        "capabilities": sorted(CAPABILITY_KEYS),
        "members": [{"id": row.id, "user_id": row.user_id, "name": person.display_name or person.username,
                     "username": person.username, "role": row.corporate_role,
                     "role_label": ROLE_LABELS.get(row.corporate_role, row.corporate_role),
                     "overrides": _overrides(row), "effective": capabilities(row), "status": row.status}
                    for row, person in member_rows],
        "subscription": {**await subscription_payload(db, subscription), "catalog": PLAN_CATALOG},
    }


@router.put("/{company_id}/access/{membership_id}")
async def update_access_profile(company_id: int, membership_id: int, body: AccessProfileIn,
                                db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    target = await db.get(CompanyMembership, membership_id)
    if target is None or target.company_id != company_id:
        raise HTTPException(404, "Сотрудник не найден")
    role = body.corporate_role or target.corporate_role
    if role not in ROLE_LABELS:
        raise HTTPException(400, "Неизвестная корпоративная роль")
    if any(key not in CAPABILITY_KEYS for key in body.capability_overrides):
        raise HTTPException(400, "Неизвестное корпоративное право")
    await validate_owner_change(db, actor, target, role, target.status)
    before = {"role": target.corporate_role, "overrides": _overrides(target)}
    target.corporate_role = role
    target.capability_overrides = json.dumps(body.capability_overrides, ensure_ascii=False, sort_keys=True)
    await audit(db, actor, user.id, "ACCESS_PROFILE_UPDATED", "membership", target.id,
                {"before": before, "after": {"role": role, "overrides": body.capability_overrides}})
    await db.commit()
    return {"id": target.id, "role": role, "role_label": ROLE_LABELS[role],
            "overrides": body.capability_overrides, "effective": capabilities(target)}


@router.get("/{company_id}/subscription")
async def get_subscription(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await _subscription(db, company_id)
    await db.commit()
    return {**await subscription_payload(db, row), "catalog": PLAN_CATALOG}


@router.put("/{company_id}/subscription")
async def update_subscription(company_id: int, body: SubscriptionIn, db: AsyncSession = Depends(get_db),
                              user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER"})
    if body.plan_code not in PLAN_CATALOG:
        raise HTTPException(400, "Неизвестный тариф")
    used = await _seat_usage(db, company_id)
    if body.licensed_seats < used:
        raise HTTPException(409, f"Используется мест: {used}. Сначала освободите лицензии.")
    if body.billing_provider == "EXTERNAL" and not (body.external_customer_id and body.external_subscription_id):
        raise HTTPException(400, "Для внешнего биллинга нужны идентификаторы клиента и подписки")
    row = await _subscription(db, company_id)
    before = await subscription_payload(db, row)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await audit(db, actor, user.id, "SUBSCRIPTION_UPDATED", "subscription", row.id,
                {"before": before, "plan_code": row.plan_code, "status": row.status, "licensed_seats": row.licensed_seats})
    await db.commit()
    return await subscription_payload(db, row)
