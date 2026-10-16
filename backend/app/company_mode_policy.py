"""Resolve and enforce persisted company mode policies at execution time."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select

from app.company_advanced_models import CompanyModePolicy, CompanyModeUsage
from app.company_models import CompanyAssignment, CompanyAssignmentAttempt, CompanyMembership


async def enforce_mode_policy(db, member: CompanyMembership, mode: str) -> CompanyModePolicy | None:
    row = await db.scalar(select(CompanyModePolicy).where(
        CompanyModePolicy.company_id == member.company_id,
        CompanyModePolicy.mode == mode,
    ))
    if row is None:
        return None
    import json
    roles = json.loads(row.allowed_roles or "[]")
    departments = json.loads(row.allowed_departments or "[]")
    if not row.enabled or (roles and member.corporate_role not in roles) or (departments and member.department_id not in departments):
        raise HTTPException(403, "Этот режим отключён политикой компании")
    if mode == "AI" and row.ai_daily_limit is not None:
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        used_today = int(await db.scalar(select(func.count()).select_from(CompanyAssignmentAttempt).join(
            CompanyAssignment, CompanyAssignment.id == CompanyAssignmentAttempt.assignment_id).where(
            CompanyAssignmentAttempt.company_id == member.company_id,
            CompanyAssignmentAttempt.membership_id == member.id,
            CompanyAssignmentAttempt.started_at >= today,
            CompanyAssignment.content_type == "AI_PRACTICE",
        )) or 0)
        if used_today >= row.ai_daily_limit:
            raise HTTPException(429, "Дневной лимит практики с ИИ исчерпан")
    period = datetime.now().strftime("%Y-%m")
    usage = await db.scalar(select(CompanyModeUsage).where(
        CompanyModeUsage.company_id == member.company_id,
        CompanyModeUsage.membership_id == member.id,
        CompanyModeUsage.mode == mode,
        CompanyModeUsage.period == period,
    ))
    if row.limit_per_member is not None and usage and usage.used >= row.limit_per_member:
        raise HTTPException(429, "Лимит запусков режима исчерпан")
    return row


async def consume_mode_policy(db, member: CompanyMembership, mode: str) -> None:
    period = datetime.now().strftime("%Y-%m")
    usage = await db.scalar(select(CompanyModeUsage).where(
        CompanyModeUsage.company_id == member.company_id,
        CompanyModeUsage.membership_id == member.id,
        CompanyModeUsage.mode == mode,
        CompanyModeUsage.period == period,
    ))
    if usage is None:
        usage = CompanyModeUsage(company_id=member.company_id, membership_id=member.id, mode=mode, period=period, used=0)
    usage.used += 1
    db.add(usage)
