from __future__ import annotations

import json
import re
import secrets
import csv
from io import StringIO
from io import BytesIO
from datetime import datetime, timedelta
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_notifications import deliver_company_event
from app.company_models import (
    Company, CompanyAssignment, CompanyAssignmentAttempt, CompanyAssignmentTarget,
    CompanyAuditLog, CompanyCertificate, CompanyDepartment, CompanyInboxMessage,
    CompanyKPI, CompanyMembership, CompanyProgram, CompanyProgramEnrollment, CompanyProgramStep, CompanyScenario,
    CompanyApplication, CompanyResultComment, CompanyAchievement, CompanyAchievementGrant,
)
from app.db import get_db
from app.engine.scenario import SCENARIOS
from app.models import DirectMessage, Notification, Session, User
from app.services import create_session, dumps, loads

router = APIRouter(prefix="/company", tags=["company"])

ROLE_LABELS = {
    "COMPANY_OWNER": "Владелец компании", "COMPANY_ADMIN": "Администратор компании",
    "LND_MANAGER": "Менеджер обучения", "DEPARTMENT_MANAGER": "Руководитель подразделения",
    "TEAM_LEAD": "Руководитель команды", "EMPLOYEE": "Сотрудник",
}
MANAGE_ALL = {"COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER"}
MANAGE_TEAM = MANAGE_ALL | {"DEPARTMENT_MANAGER", "TEAM_LEAD"}


class CompanyCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    industry: str = Field(default="", max_length=120)
    company_size: str = Field(default="", max_length=60)
    city: str = Field(default="", max_length=100)
    logo: str | None = Field(default=None, max_length=500000)


class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    parent_department_id: int | None = None
    description: str = Field(default="", max_length=1000)


class InviteIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    department_id: int | None = None
    job_title: str = Field(default="Сотрудник", max_length=160)
    corporate_role: str = "EMPLOYEE"


class ApplicationIn(BaseModel):
    desired_job_title: str = Field(min_length=2, max_length=160)
    specialization: str | None = Field(default=None, max_length=120)
    message: str | None = Field(default=None, max_length=1000)


class ApplicationReviewIn(BaseModel):
    action: str = Field(pattern="^(accept|decline)$")
    job_title: str | None = Field(default=None, max_length=160)
    corporate_role: str = "EMPLOYEE"
    department_id: int | None = None
    note: str | None = Field(default=None, max_length=1000)


class MemberUpdateIn(BaseModel):
    department_id: int | None = None
    job_title: str | None = Field(default=None, max_length=160)
    corporate_role: str | None = None
    status: str | None = None
    mentor_membership_id: int | None = None


class AssignmentIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    description: str = Field(default="", max_length=3000)
    goal: str = Field(default="", max_length=2000)
    content_type: str = "ARENA_SCENARIO"
    scenario_id: str | None = None
    company_scenario_id: int | None = None
    program_id: int | None = None
    difficulty: str = "средняя"
    employee_role: str = "Сотрудник"
    opponent: str = "Оппонент"
    deadline: datetime | None = None
    attempts_allowed: int = Field(default=3, ge=1, le=20)
    attempt_policy: str = "BEST"
    passing_score: int = Field(default=70, ge=0, le=100)
    hints_allowed: bool = True
    ghost_allowed: bool = True
    show_result_immediately: bool = True
    show_team_comparison: bool = False
    issue_certificate: bool = False
    arena_weight: int = Field(default=50, ge=0, le=100)
    company_weight: int = Field(default=50, ge=0, le=100)
    membership_ids: list[int] = []
    department_ids: list[int] = []
    all_company: bool = False
    kpi_ids: list[int] = []
    cohort_ids: list[int] = []
    # Шаблон не создаёт получателей до зачисления в программу.
    template_only: bool = False


class ScenarioIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    description: str = ""
    industry: str = ""
    employee_role: str = Field(min_length=2, max_length=160)
    opponent_role: str = Field(min_length=2, max_length=160)
    context: str = Field(min_length=10, max_length=10000)
    employee_goal: str = Field(min_length=3, max_length=3000)
    opponent_goal: str = ""
    difficulty: str = "средняя"
    tone: str = "нейтральный"
    batna: str = ""
    zopa: str = ""
    restrictions: str = ""
    success_criteria: list[str] = []
    source_materials: list[str] = []
    # Each step has an opponent line and 2-5 deterministic options. The server
    # validates all transitions and metric deltas before publication.
    steps: list[dict] = Field(default_factory=list, max_length=6)


class KPIIn(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    description: str = ""
    unit: str = "баллы"
    rule: str = "MIN"
    threshold: int | None = None
    weight: int = Field(default=10, ge=0, le=100)
    required: bool = False
    max_score: int = Field(default=100, ge=1, le=1000)


class ProgramIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    description: str = ""
    audience: str = ""
    steps: list[dict] = []


class CertificateRevokeIn(BaseModel):
    reason: str = Field(min_length=2, max_length=1000)


class SettingsIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    short_name: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=3000)
    industry: str | None = Field(default=None, max_length=120)
    company_size: str | None = Field(default=None, max_length=60)
    country: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    website: str | None = Field(default=None, max_length=300)
    academy_name: str | None = Field(default=None, max_length=160)
    logo: str | None = Field(default=None, max_length=500000)
    corporate_color: str | None = None
    secondary_color: str | None = None
    timezone: str | None = None
    settings: dict | None = None


def slugify(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower().replace("ё", "е")).strip("-")
    return base or f"company-{secrets.token_hex(3)}"


def as_json(value: str | None, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def allows_member_notification(member: CompanyMembership, category: str) -> bool:
    """Personal opt-out applies to delivery, never to access to the underlying assignment."""
    return bool(as_json(member.notification_settings, {}).get(category, True))


def default_company_settings() -> dict:
    return {
        "learning": {"default_attempts": 3, "attempt_policy": "BEST", "show_result_immediately": True, "ghost_coach": True},
        "kpi": {"arena_weight": 50, "company_weight": 50},
        "ratings": {"enabled": False, "visibility": "MANAGERS_ONLY", "show_percentile": False},
        "notifications": {"reminders_3d": True, "reminders_24h": True, "reminders_3h": True, "certificate_30d": True, "certificate_7d": True},
        "privacy": {"records": "company_only", "leaderboard": "managers", "retention_days": 365},
    }


async def active_membership(db: AsyncSession, user_id: int, company_id: int | None = None) -> CompanyMembership | None:
    query = select(CompanyMembership).where(CompanyMembership.user_id == user_id, CompanyMembership.status == "ACTIVE")
    if company_id:
        query = query.where(CompanyMembership.company_id == company_id)
    else:
        query = query.order_by(CompanyMembership.is_primary.desc(), CompanyMembership.id)
    return await db.scalar(query)


async def require_membership(db: AsyncSession, user: User, company_id: int | None = None) -> CompanyMembership:
    membership = await active_membership(db, user.id, company_id)
    if not membership:
        raise HTTPException(403, "Нет подтверждённого членства в компании")
    return membership


def require_role(membership: CompanyMembership, roles: set[str]) -> None:
    if membership.corporate_role not in roles:
        raise HTTPException(403, "Недостаточно корпоративных прав")


async def audit(db: AsyncSession, membership: CompanyMembership, user_id: int, action: str, entity: str, entity_id=None, details=None):
    db.add(CompanyAuditLog(company_id=membership.company_id, actor_user_id=user_id, action=action,
                           entity_type=entity, entity_id=str(entity_id) if entity_id is not None else None,
                           details=dumps(details or {})))


async def visible_membership_ids(db: AsyncSession, membership: CompanyMembership) -> list[int]:
    query = select(CompanyMembership.id).where(CompanyMembership.company_id == membership.company_id,
                                                CompanyMembership.status == "ACTIVE")
    if membership.corporate_role not in MANAGE_ALL:
        if membership.corporate_role in {"DEPARTMENT_MANAGER", "TEAM_LEAD"} and membership.department_id:
            query = query.where(CompanyMembership.department_id == membership.department_id)
        else:
            query = query.where(CompanyMembership.id == membership.id)
    return list((await db.scalars(query)).all())


def company_payload(row: Company) -> dict:
    return {"id": row.id, "name": row.name, "short_name": row.short_name, "slug": row.slug,
            "logo": row.logo, "description": row.description, "industry": row.industry,
            "company_size": row.company_size, "country": row.country, "city": row.city,
            "website": row.website, "corporate_color": row.corporate_color,
            "secondary_color": row.secondary_color, "academy_name": row.academy_name or f"{row.name} · Академия",
            "timezone": row.timezone, "language": row.language, "status": row.status,
            "settings": as_json(row.settings, {})}


async def assignment_payload(db: AsyncSession, target: CompanyAssignmentTarget) -> dict:
    assignment = await db.get(CompanyAssignment, target.assignment_id)
    creator = await db.get(User, assignment.created_by)
    status = target.status
    now = datetime.now()
    if assignment.deadline and assignment.deadline < now and status not in {"COMPLETED", "PASSED", "FAILED", "CANCELLED"}:
        status = "OVERDUE"
        target.status = status
    return {"id": assignment.id, "target_id": target.id, "title": assignment.title,
            "description": assignment.description, "goal": assignment.goal, "content_type": assignment.content_type,
            "scenario_id": assignment.scenario_id, "company_scenario_id": assignment.company_scenario_id,
            "program_id": assignment.program_id, "difficulty": assignment.difficulty,
            "employee_role": assignment.employee_role, "opponent": assignment.opponent,
            "deadline": assignment.deadline.isoformat() if assignment.deadline else None,
            "attempts_allowed": assignment.attempts_allowed, "attempts_used": target.attempts_used,
            "attempt_policy": assignment.attempt_policy, "passing_score": assignment.passing_score,
            "status": status, "best_score": target.best_score, "required": bool(assignment.required),
            "hints_allowed": bool(assignment.hints_allowed), "ghost_allowed": bool(assignment.ghost_allowed),
            "show_result_immediately": bool(assignment.show_result_immediately),
            "show_team_comparison": bool(assignment.show_team_comparison),
            "issue_certificate": bool(assignment.issue_certificate),
            "assigned_by": creator.display_name or creator.username if creator else "Компания",
            "created_at": assignment.created_at.isoformat() if assignment.created_at else None}


async def grant_completed_achievements(db: AsyncSession, membership: CompanyMembership, attempt: CompanyAssignmentAttempt,
                                       assignment: CompanyAssignment, metrics: dict) -> None:
    """Awards only declarative, verifiable conditions; never subjective traits."""
    achievements = (await db.scalars(select(CompanyAchievement).where(
        CompanyAchievement.company_id == membership.company_id, CompanyAchievement.status == "ACTIVE"))).all()
    for achievement in achievements:
        conditions = as_json(achievement.conditions, {})
        assignment_id = conditions.get("assignment_id")
        if assignment_id and int(assignment_id) != assignment.id:
            continue
        if (attempt.final_score or 0) < int(conditions.get("min_score") or 0):
            continue
        if any(int(metrics.get(key, 0)) < int(conditions.get(f"min_{key}") or 0) for key in ("trust", "goal", "control", "eq")):
            continue
        exists = await db.scalar(select(CompanyAchievementGrant.id).where(
            CompanyAchievementGrant.achievement_id == achievement.id,
            CompanyAchievementGrant.membership_id == membership.id,
        ))
        if exists:
            continue
        grant = CompanyAchievementGrant(company_id=membership.company_id, achievement_id=achievement.id,
                                        membership_id=membership.id, assignment_attempt_id=attempt.id)
        db.add(grant)
        if allows_member_notification(membership, "result"):
            db.add(CompanyInboxMessage(company_id=membership.company_id, membership_id=membership.id,
                type="COMPANY_ACHIEVEMENT", title=achievement.title,
                text="\u0412\u044b \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 \u043a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u043e\u0435 \u0434\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435 \u0437\u0430 \u0438\u0437\u043c\u0435\u0440\u0438\u043c\u044b\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442.",
                payload=dumps({"achievement_id": achievement.id, "attempt_id": attempt.id})))


async def refresh_program_enrollment(db: AsyncSession, membership: CompanyMembership,
                                     enrollment: CompanyProgramEnrollment) -> bool:
    """Calculate the only server-side program state and issue the next stage target."""
    program = await db.get(CompanyProgram, enrollment.program_id)
    if not program:
        return False
    persisted = (await db.scalars(select(CompanyProgramStep).where(
        CompanyProgramStep.program_id == program.id).order_by(CompanyProgramStep.position))).all()
    steps = [{
        "position": item.position, "title": item.title, "assignment_id": item.assignment_id,
        "unlock_rule": item.unlock_rule, "min_score": item.min_score, "required": bool(item.required),
    } for item in persisted] or as_json(program.steps, [])
    if not steps:
        enrollment.unlocked_step = 0
        enrollment.completed_steps = dumps([])
        return False

    assignment_ids = [item.get("assignment_id") for item in steps if item.get("assignment_id")]
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(
        CompanyAssignmentTarget.membership_id == membership.id,
        CompanyAssignmentTarget.assignment_id.in_(assignment_ids),
    ))).all() if assignment_ids else []
    by_assignment = {item.assignment_id: item for item in targets}
    completed_positions = [
        position for position, step in enumerate(steps, 1)
        if step.get("assignment_id") and by_assignment.get(step["assignment_id"])
        and by_assignment[step["assignment_id"]].status == "PASSED"
    ]
    completed = set(completed_positions)
    unlocked = 0
    created_target = False
    for position, step in enumerate(steps, 1):
        assignment_id = step.get("assignment_id")
        current_target = by_assignment.get(assignment_id) if assignment_id else None
        if position == 1:
            allowed = True
        else:
            previous = steps[position - 2]
            previous_target = by_assignment.get(previous.get("assignment_id"))
            previous_passed = bool(previous_target and previous_target.status == "PASSED")
            rule = (step.get("unlock_rule") or "PREVIOUS").upper()
            allowed = previous_passed
            if rule == "MIN_SCORE":
                allowed = previous_passed and (previous_target.best_score or 0) >= int(step.get("min_score") or 0)
            elif rule == "MANUAL":
                # A manager can make a manual stage available; it never opens itself.
                allowed = current_target is not None
        if not allowed:
            break
        unlocked = position
        if assignment_id and current_target is None:
            assignment = await db.get(CompanyAssignment, assignment_id)
            if not assignment or assignment.company_id != membership.company_id or assignment.status != "ACTIVE":
                break
            target = CompanyAssignmentTarget(
                company_id=membership.company_id, assignment_id=assignment.id,
                membership_id=membership.id, status="ASSIGNED",
            )
            db.add(target)
            by_assignment[assignment.id] = target
            created_target = True
            # This stage has just been opened. The next stage must wait for its result.
            break

    enrollment.unlocked_step = unlocked
    enrollment.completed_steps = dumps(completed_positions)
    required_positions = [position for position, step in enumerate(steps, 1) if step.get("required", True)]
    if required_positions and set(required_positions).issubset(completed):
        enrollment.status = "COMPLETED"
        enrollment.completed_at = enrollment.completed_at or datetime.now()
    return created_target


async def sync_attempts(db: AsyncSession, membership: CompanyMembership) -> None:
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == membership.company_id,
        CompanyAssignmentAttempt.membership_id == membership.id,
        CompanyAssignmentAttempt.status == "IN_PROGRESS",
    ))).all()
    changed = False
    for attempt in attempts:
        session = await db.get(Session, attempt.session_id) if attempt.session_id else None
        if not session or session.status != "finished":
            continue
        metrics = loads(session.metrics, {})
        values = [int(metrics.get(key, 0)) for key in ("trust", "goal", "control", "eq")]
        arena_score = round(sum(values) / 4)
        assignment = await db.get(CompanyAssignment, attempt.assignment_id)
        company_score = arena_score
        total_weight = max(1, assignment.arena_weight + assignment.company_weight)
        final_score = round((arena_score * assignment.arena_weight + company_score * assignment.company_weight) / total_weight)
        attempt.arena_score = arena_score
        attempt.company_score = company_score
        attempt.final_score = final_score
        attempt.metrics_snapshot = dumps(metrics)
        attempt.status = "COMPLETED"
        attempt.completed_at = session.finished_at or datetime.now()
        target = await db.get(CompanyAssignmentTarget, attempt.target_id)
        target.best_score = max(target.best_score or 0, final_score)
        target.status = "PASSED" if target.best_score >= assignment.passing_score else "FAILED"
        target.completed_at = attempt.completed_at
        if target.status == "PASSED" and assignment.issue_certificate:
            exists = await db.scalar(select(CompanyCertificate.id).where(
                CompanyCertificate.membership_id == membership.id,
                CompanyCertificate.program_id == assignment.program_id,
                CompanyCertificate.title == assignment.title,
            ))
            if not exists:
                db.add(CompanyCertificate(company_id=membership.company_id, membership_id=membership.id,
                    program_id=assignment.program_id, title=assignment.title,
                    certificate_id=f"ARENA-{secrets.token_hex(6).upper()}", verification_code=secrets.token_urlsafe(18)))
        await grant_completed_achievements(db, membership, attempt, assignment, metrics)
        changed = True
    if changed:
        enrollments = (await db.scalars(select(CompanyProgramEnrollment).where(
            CompanyProgramEnrollment.membership_id == membership.id, CompanyProgramEnrollment.status == "ACTIVE"))).all()
        for enrollment in enrollments:
            await refresh_program_enrollment(db, membership, enrollment)
        await db.commit()


async def purge_company_retention(db: AsyncSession) -> int:
    """Applies the configured retention window to notification content, never to audit evidence."""
    companies = (await db.scalars(select(Company))).all()
    removed = 0
    now = datetime.now()
    for company in companies:
        settings = as_json(company.settings, default_company_settings())
        days = int(settings.get("privacy", {}).get("retention_days", 365) or 365)
        days = min(max(days, 1), 3650)
        cutoff = now - timedelta(days=days)
        messages = (await db.scalars(select(CompanyInboxMessage).where(
            CompanyInboxMessage.company_id == company.id, CompanyInboxMessage.created_at < cutoff))).all()
        for message in messages:
            await db.delete(message)
            removed += 1
    if removed:
        await db.commit()
    return removed


async def dispatch_company_reminders(db: AsyncSession) -> int:
    """Создаёт каждое напоминание один раз; состояние хранится в корпоративном inbox."""
    now = datetime.now()
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(
        CompanyAssignmentTarget.status.notin_(["PASSED", "FAILED", "COMPLETED", "CANCELLED"])
    ))).all()
    sent = 0
    outbound_events: list[dict] = []
    rules = [(timedelta(days=3), "REMINDER_3D", "До задания осталось 3 дня."),
             (timedelta(hours=24), "REMINDER_24H", "Завтра дедлайн задания."),
             (timedelta(hours=3), "REMINDER_3H", "До дедлайна осталось меньше 3 часов.")]
    for target in targets:
        assignment = await db.get(CompanyAssignment, target.assignment_id)
        if not assignment or not assignment.deadline:
            continue
        remaining = assignment.deadline - now
        kind, text = ("OVERDUE", "Срок корпоративного задания истёк.") if remaining <= timedelta() else next(
            ((rule_kind, rule_text) for threshold, rule_kind, rule_text in rules if remaining <= threshold), (None, None)
        )
        if not kind:
            continue
        settings = as_json((await db.get(Company, assignment.company_id)).settings, default_company_settings())
        notifications = settings.get("notifications", {})
        if kind in {"REMINDER_3D", "REMINDER_24H", "REMINDER_3H"} and not notifications.get({"REMINDER_3D": "reminders_3d", "REMINDER_24H": "reminders_24h", "REMINDER_3H": "reminders_3h"}[kind], True):
            continue
        existing = (await db.scalars(select(CompanyInboxMessage).where(
            CompanyInboxMessage.membership_id == target.membership_id, CompanyInboxMessage.type == kind
        ))).all()
        if any(as_json(row.payload, {}).get("assignment_id") == assignment.id for row in existing):
            continue
        membership = await db.get(CompanyMembership, target.membership_id)
        if not membership or membership.status != "ACTIVE":
            continue
        if not allows_member_notification(membership, "deadline"):
            continue
        db.add(CompanyInboxMessage(company_id=assignment.company_id, membership_id=membership.id, type=kind,
            title=assignment.title, text=text, payload=dumps({"assignment_id": assignment.id, "deadline": assignment.deadline.isoformat()})))
        db.add(Notification(user_id=membership.user_id, type=kind,
            payload=dumps({"company_id": assignment.company_id, "assignment_id": assignment.id, "title": assignment.title})))
        outbound_events.append({"company_id": assignment.company_id, "type": kind, "title": assignment.title,
                                "assignment_id": assignment.id, "deadline": assignment.deadline.isoformat()})
        if kind == "OVERDUE":
            target.status = "OVERDUE"
        sent += 1
    if sent:
        await db.commit()
        for event in outbound_events:
            await deliver_company_event(db, event.pop("company_id"), event)
    return sent


async def dispatch_certificate_reminders(db: AsyncSession) -> int:
    """Notify certificate holders and responsible managers once per deadline window."""
    now = datetime.now()
    rows = (await db.scalars(select(CompanyCertificate).where(
        CompanyCertificate.expires_at.is_not(None), CompanyCertificate.status.in_(["ACTIVE", "EXPIRED"])
    ))).all()
    created = 0
    for certificate in rows:
        expires_at = certificate.expires_at
        if not expires_at:
            continue
        remaining = expires_at - now
        if remaining <= timedelta():
            kind, text = "CERTIFICATE_EXPIRED", "\u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u0430 \u0438\u0441\u0442\u0451\u043a."
            certificate.status = "EXPIRED"
        elif remaining <= timedelta(days=7):
            kind, text = "CERTIFICATE_EXPIRING_7D", "\u0414\u043e \u043e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u044f \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u0430 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c 7 \u0434\u043d\u0435\u0439."
        elif remaining <= timedelta(days=30):
            kind, text = "CERTIFICATE_EXPIRING_30D", "\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442 \u0438\u0441\u0442\u0435\u043a\u0430\u0435\u0442 \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0435 30 \u0434\u043d\u0435\u0439."
        else:
            continue
        existing = (await db.scalars(select(CompanyInboxMessage).where(
            CompanyInboxMessage.membership_id == certificate.membership_id,
            CompanyInboxMessage.type == kind,
        ))).all()
        if any(as_json(item.payload, {}).get("certificate_id") == certificate.id for item in existing):
            continue
        holder = await db.get(CompanyMembership, certificate.membership_id)
        if not holder:
            continue
        if not allows_member_notification(holder, "certificate"):
            continue
        db.add(CompanyInboxMessage(
            company_id=certificate.company_id, membership_id=holder.id, type=kind,
            title=certificate.title, text=text, payload=dumps({"certificate_id": certificate.id, "expires_at": expires_at.isoformat()}),
        ))
        db.add(Notification(user_id=holder.user_id, type=kind, payload=dumps({
            "company_id": certificate.company_id, "certificate_id": certificate.id, "title": certificate.title,
        })))
        managers = (await db.scalars(select(CompanyMembership).where(
            CompanyMembership.company_id == certificate.company_id,
            CompanyMembership.status == "ACTIVE",
            CompanyMembership.corporate_role.in_(MANAGE_TEAM),
        ))).all()
        for manager in managers:
            if manager.id != holder.id:
                db.add(Notification(user_id=manager.user_id, type=kind, payload=dumps({
                    "company_id": certificate.company_id, "certificate_id": certificate.id, "membership_id": holder.id,
                    "title": certificate.title,
                })))
        created += 1
    if created:
        await db.commit()
    return created


@router.get("/context")
async def context(company_id: int | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    memberships = (await db.scalars(select(CompanyMembership).where(CompanyMembership.user_id == user.id).order_by(CompanyMembership.is_primary.desc()))).all()
    active = next((item for item in memberships if item.status == "ACTIVE" and (not company_id or item.company_id == company_id)), None)
    if company_id and not active:
        active = next((item for item in memberships if item.status == "ACTIVE"), None)
    pending = []
    for item in memberships:
        if item.status == "INVITED":
            company = await db.get(Company, item.company_id)
            pending.append({"membership_id": item.id, "company": company_payload(company), "job_title": item.job_title,
                            "role": ROLE_LABELS.get(item.corporate_role, item.corporate_role)})
    if not active:
        return {"has_company": False, "pending_invitations": pending}
    await sync_attempts(db, active)
    company = await db.get(Company, active.company_id)
    department = await db.get(CompanyDepartment, active.department_id) if active.department_id else None
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(CompanyAssignmentTarget.membership_id == active.id))).all()
    assignments = [await assignment_payload(db, target) for target in targets]
    order = {"OVERDUE": 0, "IN_PROGRESS": 1, "OPENED": 2, "ASSIGNED": 3, "PASSED": 4, "COMPLETED": 5, "FAILED": 6}
    assignments.sort(key=lambda item: (order.get(item["status"], 9), item["deadline"] or "9999"))
    inbox = (await db.scalars(select(CompanyInboxMessage).where(CompanyInboxMessage.membership_id == active.id)
                              .order_by(CompanyInboxMessage.created_at.desc()).limit(30))).all()
    programs = (await db.scalars(select(CompanyProgram).where(CompanyProgram.company_id == company.id,
                                                              CompanyProgram.status != "ARCHIVED"))).all()
    enrollments = {row.program_id: row for row in (await db.scalars(select(CompanyProgramEnrollment).where(
        CompanyProgramEnrollment.membership_id == active.id))).all()}
    certificates = (await db.scalars(select(CompanyCertificate).where(CompanyCertificate.membership_id == active.id)
                                     .order_by(CompanyCertificate.issued_at.desc()))).all()
    all_active_count = await db.scalar(select(func.count()).select_from(CompanyMembership).where(
        CompanyMembership.company_id == company.id, CompanyMembership.status == "ACTIVE"))
    completed = sum(1 for item in assignments if item["status"] in {"COMPLETED", "PASSED", "FAILED"})
    program_payloads = []
    for row in programs:
        enrollment = enrollments.get(row.id)
        completed_steps = set(as_json(enrollment.completed_steps, [])) if enrollment else set()
        steps = []
        for index, step in enumerate(as_json(row.steps, []), 1):
            state = "completed" if index in completed_steps else ("current" if enrollment and index == enrollment.unlocked_step else "locked")
            steps.append({**step, "status": state})
        program_payloads.append({"id": row.id, "title": row.title, "description": row.description,
                                 "steps": steps, "status": enrollment.status if enrollment else row.status,
                                 "enrolled": bool(enrollment)})
    company_options = []
    for item in memberships:
        option_company = await db.get(Company, item.company_id)
        option_department = await db.get(CompanyDepartment, item.department_id) if item.department_id else None
        company_options.append({"membership_id": item.id, "company_id": item.company_id, "name": option_company.name,
                                "department": option_department.name if option_department else None,
                                "status": item.status, "primary": bool(item.is_primary)})
    return {
        "has_company": True, "company": company_payload(company),
        "membership": {"id": active.id, "role": active.corporate_role, "role_label": ROLE_LABELS.get(active.corporate_role),
                       "job_title": active.job_title, "department": department.name if department else None,
                       "department_id": active.department_id},
        "companies": company_options,
        "permissions": {"manage_company": active.corporate_role in {"COMPANY_OWNER", "COMPANY_ADMIN"},
                        "manage_learning": active.corporate_role in MANAGE_ALL,
                        "manage_team": active.corporate_role in MANAGE_TEAM,
                        "view_analytics": active.corporate_role in MANAGE_TEAM},
        "summary": {"employees": all_active_count or 0, "assignments": len(assignments), "completed": completed,
                    "progress": round(completed * 100 / len(assignments)) if assignments else 100,
                    "overdue": sum(1 for item in assignments if item["status"] == "OVERDUE")},
        "assignments": assignments,
        "programs": program_payloads,
        "inbox": [{"id": row.id, "type": row.type, "title": row.title, "text": row.text,
                   "payload": as_json(row.payload, {}), "read": bool(row.is_read),
                   "created_at": row.created_at.isoformat()} for row in inbox],
        "certificates": [{"id": row.id, "title": row.title, "certificate_id": row.certificate_id,
                          "status": row.status, "issued_at": row.issued_at.isoformat(),
                          "expires_at": row.expires_at.isoformat() if row.expires_at else None} for row in certificates],
        "pending_invitations": pending,
    }


@router.get("/search")
async def search_companies(q: str = "", db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Company).where(Company.status == "ACTIVE")
    if q.strip():
        query = query.where(Company.name.ilike(f"%{q.strip()}%"))
    rows = (await db.scalars(query.order_by(Company.name).limit(30))).all()
    result = []
    for row in rows:
        count = await db.scalar(select(func.count()).select_from(CompanyMembership).where(
            CompanyMembership.company_id == row.id, CompanyMembership.status == "ACTIVE"))
        application_status = await db.scalar(select(CompanyApplication.status).where(
            CompanyApplication.company_id == row.id, CompanyApplication.user_id == user.id))
        result.append({**company_payload(row), "members": count or 0, "application_status": application_status})
    return result


@router.get("/verify/{verification_code}")
async def verify_certificate(verification_code: str, db: AsyncSession = Depends(get_db)):
    certificate = await db.scalar(select(CompanyCertificate).where(CompanyCertificate.verification_code == verification_code))
    if not certificate:
        raise HTTPException(404, "Сертификат не найден")
    company = await db.get(Company, certificate.company_id)
    return {"valid": certificate.status == "ACTIVE", "certificate_id": certificate.certificate_id,
            "title": certificate.title, "company": company.name if company else "", "issued_at": certificate.issued_at.isoformat(),
            "expires_at": certificate.expires_at.isoformat() if certificate.expires_at else None}


@router.get("/{company_id}/directory")
async def employee_directory(company_id: int, q: str = "", db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Safe directory for all active employees of their own company."""
    await require_membership(db, user, company_id)
    query = select(CompanyMembership, User, CompanyDepartment).join(User, User.id == CompanyMembership.user_id).outerjoin(
        CompanyDepartment, CompanyDepartment.id == CompanyMembership.department_id).where(
        CompanyMembership.company_id == company_id, CompanyMembership.status == "ACTIVE")
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(User.username.ilike(like), User.display_name.ilike(like), CompanyMembership.job_title.ilike(like)))
    rows = (await db.execute(query.order_by(User.display_name, User.username).limit(100))).all()
    return [{"membership_id": member.id, "name": person.display_name or person.username, "username": person.username,
             "job_title": member.job_title, "department": department.name if department else None,
             "role_label": ROLE_LABELS.get(member.corporate_role)} for member, person, department in rows]


@router.get("/{company_id}/certificates")
async def company_certificates(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    allowed = set(await visible_membership_ids(db, member)) if member.corporate_role in MANAGE_TEAM else {member.id}
    rows = (await db.scalars(select(CompanyCertificate).where(
        CompanyCertificate.company_id == company_id, CompanyCertificate.membership_id.in_(allowed)).order_by(CompanyCertificate.issued_at.desc()))).all()
    result = []
    for row in rows:
        holder = await db.get(CompanyMembership, row.membership_id)
        person = await db.get(User, holder.user_id) if holder else None
        target_row = (await db.execute(select(CompanyAssignmentTarget, CompanyAssignment).join(
            CompanyAssignment, CompanyAssignment.id == CompanyAssignmentTarget.assignment_id).where(
            CompanyAssignmentTarget.company_id == company_id,
            CompanyAssignmentTarget.membership_id == row.membership_id,
            CompanyAssignment.title == row.title,
        ).order_by(CompanyAssignmentTarget.completed_at.desc()))).first()
        target, assignment = target_row if target_row else (None, None)
        result.append({"id": row.id, "title": row.title, "certificate_id": row.certificate_id,
                       "verification_code": row.verification_code if row.membership_id == member.id else None,
                       "holder": person.display_name or person.username if person else "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a",
                       "membership_id": row.membership_id, "status": row.status,
                       "final_score": target.best_score if target else None,
                       "passing_score": assignment.passing_score if assignment else None,
                       "completed_at": target.completed_at.isoformat() if target and target.completed_at else None,
                       "issued_at": row.issued_at.isoformat(), "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                       "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None, "revoke_reason": row.revoke_reason})
    return result


@router.post("/{company_id}/certificates/{certificate_id}/revoke")
async def revoke_certificate(company_id: int, certificate_id: int, body: CertificateRevokeIn,
                             db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    require_role(member, MANAGE_ALL)
    certificate = await db.get(CompanyCertificate, certificate_id)
    if not certificate or certificate.company_id != company_id:
        raise HTTPException(404, "\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d")
    if certificate.status == "REVOKED":
        raise HTTPException(409, "\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442 \u0443\u0436\u0435 \u043e\u0442\u043e\u0437\u0432\u0430\u043d")
    certificate.status = "REVOKED"
    certificate.revoked_at = datetime.now()
    certificate.revoke_reason = body.reason.strip()
    await audit(db, member, user.id, "CERTIFICATE_REVOKED", "certificate", certificate.id)
    await db.commit()
    return {"id": certificate.id, "status": certificate.status, "revoked_at": certificate.revoked_at.isoformat()}


@router.get("/{company_id}/certificates/{certificate_id}/pdf")
async def certificate_pdf(company_id: int, certificate_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    certificate = await db.get(CompanyCertificate, certificate_id)
    if not certificate or certificate.company_id != company_id or certificate.membership_id != membership.id:
        raise HTTPException(404, "Сертификат не найден")
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas
    person = await db.get(User, user.id); company = await db.get(Company, company_id)
    pdfmetrics.registerFont(TTFont("ArenaDejaVu", "C:/Windows/Fonts/DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("ArenaDejaVuBold", "C:/Windows/Fonts/DejaVuSans-Bold.ttf"))
    output = BytesIO(); page = canvas.Canvas(output, pagesize=A4); width, height = A4
    page.setFillColor(HexColor(company.corporate_color)); page.rect(0, height - 28, width, 28, fill=1, stroke=0)
    page.setFont("ArenaDejaVuBold", 25); page.setFillColor(HexColor("#15233A")); page.drawCentredString(width / 2, height - 150, "СЕРТИФИКАТ")
    page.setFont("ArenaDejaVu", 13); page.drawCentredString(width / 2, height - 195, "подтверждает успешное прохождение корпоративной программы")
    page.setFont("ArenaDejaVuBold", 21); page.drawCentredString(width / 2, height - 255, person.display_name or person.username)
    page.setFont("ArenaDejaVu", 15); page.drawCentredString(width / 2, height - 305, certificate.title)
    page.setFont("ArenaDejaVu", 11); page.drawCentredString(width / 2, height - 360, company.name)
    page.drawCentredString(width / 2, height - 385, f"Выдан: {certificate.issued_at.strftime('%d.%m.%Y')}")
    page.setFont("ArenaDejaVu", 9); page.drawString(48, 58, f"ID: {certificate.certificate_id}")
    page.drawRightString(width - 48, 58, f"Проверка: /api/company/verify/{certificate.verification_code}")
    page.showPage(); page.save()
    return Response(output.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{certificate.certificate_id}.pdf"'})


@router.post("")
async def create_company(body: CompanyCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    base = slugify(body.name)
    slug = base
    suffix = 1
    while await db.scalar(select(Company.id).where(Company.slug == slug)):
        suffix += 1
        slug = f"{base}-{suffix}"
    row = Company(name=body.name.strip(), slug=slug, industry=body.industry.strip(), company_size=body.company_size.strip(), logo=body.logo,
                  city=body.city.strip(), academy_name=f"{body.name.strip()} · Академия", created_by=user.id)
    db.add(row); await db.flush()
    membership = CompanyMembership(company_id=row.id, user_id=user.id, corporate_role="COMPANY_OWNER", status="ACTIVE",
                                   job_title="Владелец пространства", is_primary=1, joined_at=datetime.now(), verified_at=datetime.now())
    db.add(membership); await db.flush()
    await audit(db, membership, user.id, "COMPANY_CREATED", "company", row.id, {"name": row.name})
    await db.commit()
    return company_payload(row)


@router.post("/memberships/{membership_id}/{action}")
async def membership_action(membership_id: int, action: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(CompanyMembership, membership_id)
    if not row or row.user_id != user.id or row.status != "INVITED":
        raise HTTPException(404, "Приглашение не найдено")
    if action == "accept":
        row.status = "ACTIVE"; row.joined_at = datetime.now(); row.verified_at = datetime.now()
    elif action == "decline":
        row.status = "DECLINED"
    else:
        raise HTTPException(400, "Неизвестное действие")
    await db.commit()
    return {"ok": True, "status": row.status}


@router.post("/{company_id}/applications")
async def apply_to_company(company_id: int, body: ApplicationIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company or company.status != "ACTIVE": raise HTTPException(404, "Компания не найдена")
    if await active_membership(db, user.id, company_id): raise HTTPException(409, "Вы уже состоите в этой компании")
    row = await db.scalar(select(CompanyApplication).where(CompanyApplication.company_id == company_id, CompanyApplication.user_id == user.id))
    if row and row.status == "PENDING": raise HTTPException(409, "Заявка уже отправлена")
    if row:
        row.desired_job_title=body.desired_job_title.strip(); row.specialization=(body.specialization or "").strip() or None; row.message=(body.message or "").strip() or None; row.status="PENDING"; row.reviewed_by=None; row.review_note=None; row.reviewed_at=None
    else:
        row=CompanyApplication(company_id=company_id,user_id=user.id,desired_job_title=body.desired_job_title.strip(),specialization=(body.specialization or "").strip() or None,message=(body.message or "").strip() or None); db.add(row)
    owners = (await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.status == "ACTIVE",
        CompanyMembership.corporate_role.in_(["COMPANY_OWNER", "COMPANY_ADMIN"]),
    ))).all()
    for owner in owners:
        db.add(Notification(user_id=owner.user_id,type="COMPANY_APPLICATION",payload=dumps({"company_id":company_id,"applicant":user.username})))
        db.add(DirectMessage(sender_id=user.id,receiver_id=owner.user_id,type="COMPANY_APPLICATION",text=f"Заявка в компанию «{company.name}»",payload=dumps({"company_id":company_id,"applicant":user.username,"job_title":body.desired_job_title})))
    await db.commit(); return {"ok":True,"status":"PENDING"}


@router.get("/{company_id}/applications")
async def applications(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member=await require_membership(db,user,company_id); require_role(member,{"COMPANY_OWNER","COMPANY_ADMIN"})
    rows=(await db.execute(select(CompanyApplication,User).join(User,User.id==CompanyApplication.user_id).where(CompanyApplication.company_id==company_id).order_by(CompanyApplication.created_at.desc()))).all()
    return [{"id":row.id,"username":person.username,"name":person.display_name or person.username,"job_title":row.desired_job_title,"specialization":row.specialization,"message":row.message,"status":row.status,"created_at":row.created_at.isoformat()} for row,person in rows]


@router.post("/{company_id}/applications/{application_id}/review")
async def review_application(company_id:int,application_id:int,body:ApplicationReviewIn,db:AsyncSession=Depends(get_db),user:User=Depends(get_current_user)):
    actor=await require_membership(db,user,company_id); require_role(actor,{"COMPANY_OWNER","COMPANY_ADMIN"})
    row=await db.get(CompanyApplication,application_id)
    if not row or row.company_id!=company_id or row.status!="PENDING": raise HTTPException(404,"Заявка не найдена")
    if body.corporate_role not in ROLE_LABELS: raise HTTPException(400,"Неизвестная корпоративная роль")
    if body.department_id:
        department = await db.get(CompanyDepartment, body.department_id)
        if not department or department.company_id != company_id:
            raise HTTPException(400, "Подразделение не найдено")
    company=await db.get(Company,company_id); applicant=await db.get(User,row.user_id); row.reviewed_by=user.id;row.review_note=(body.note or "").strip() or None;row.reviewed_at=datetime.now()
    if body.action=="accept":
        membership=await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id==company_id,CompanyMembership.user_id==applicant.id))
        membership=membership or CompanyMembership(company_id=company_id,user_id=applicant.id)
        membership.status="ACTIVE";membership.department_id=body.department_id;membership.job_title=(body.job_title or row.desired_job_title).strip();membership.corporate_role=body.corporate_role;membership.is_primary=1;membership.joined_at=datetime.now();membership.verified_at=datetime.now();membership.invited_by=user.id; db.add(membership);row.status="ACCEPTED"
        text=f"Ваша заявка в «{company.name}» одобрена. Должность: {membership.job_title}."
    else: row.status="DECLINED"; text=f"Заявка в «{company.name}» отклонена."
    db.add(Notification(user_id=applicant.id,type="COMPANY_APPLICATION_"+row.status,payload=dumps({"company_id":company_id,"application_id":row.id})))
    db.add(DirectMessage(sender_id=user.id,receiver_id=applicant.id,type="COMPANY_APPLICATION",text=text,payload=dumps({"company_id":company_id,"status":row.status})))
    await audit(db,actor,user.id,"APPLICATION_"+row.status,"application",row.id);await db.commit();return {"ok":True,"status":row.status}


@router.get("/{company_id}/departments")
async def departments(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyDepartment).where(CompanyDepartment.company_id == company_id).order_by(CompanyDepartment.name))).all()
    return [{"id": row.id, "name": row.name, "parent_department_id": row.parent_department_id,
             "manager_membership_id": row.manager_membership_id, "description": row.description} for row in rows]


@router.post("/{company_id}/departments")
async def create_department(company_id: int, body: DepartmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    if body.parent_department_id:
        parent = await db.get(CompanyDepartment, body.parent_department_id)
        if not parent or parent.company_id != company_id: raise HTTPException(400, "Родительский отдел не найден")
    row = CompanyDepartment(company_id=company_id, name=body.name.strip(), parent_department_id=body.parent_department_id,
                            description=body.description.strip())
    db.add(row); await db.flush(); await audit(db, membership, user.id, "DEPARTMENT_CREATED", "department", row.id)
    await db.commit(); return {"id": row.id, "name": row.name}


@router.get("/{company_id}/employees")
async def employees(company_id: int, q: str = "", department_id: int | None = None, role: str | None = None,
                    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    allowed_ids = await visible_membership_ids(db, membership)
    query = select(CompanyMembership, User, CompanyDepartment).join(User, User.id == CompanyMembership.user_id).outerjoin(
        CompanyDepartment, CompanyDepartment.id == CompanyMembership.department_id).where(CompanyMembership.id.in_(allowed_ids))
    if q.strip():
        like = f"%{q.strip()}%"; query = query.where(or_(User.username.ilike(like), User.display_name.ilike(like),
                                                         CompanyMembership.job_title.ilike(like), CompanyMembership.employee_number.ilike(like)))
    if department_id: query = query.where(CompanyMembership.department_id == department_id)
    if role: query = query.where(CompanyMembership.corporate_role == role)
    rows = (await db.execute(query.order_by(User.display_name))).all()
    return [{"membership_id": member.id, "user_id": person.id, "name": person.display_name or person.username,
             "username": person.username, "job_title": member.job_title, "department": department.name if department else None,
             "department_id": member.department_id, "role": member.corporate_role,
             "role_label": ROLE_LABELS.get(member.corporate_role), "status": member.status,
             "joined_at": member.joined_at.isoformat() if member.joined_at else None} for member, person, department in rows]


@router.get("/{company_id}/employees/{membership_id}/overview")
async def employee_overview(company_id: int, membership_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, MANAGE_TEAM)
    allowed = set(await visible_membership_ids(db, actor))
    if membership_id not in allowed: raise HTTPException(403, "Нет доступа к сотруднику")
    member = await db.get(CompanyMembership, membership_id)
    if not member or member.company_id != company_id: raise HTTPException(404, "Сотрудник не найден")
    company = await db.get(Company, company_id)
    privacy = as_json(company.settings, default_company_settings()).get("privacy", {}) if company else {}
    if privacy.get("records") == "employee_only":
        raise HTTPException(status_code=403)
    person = await db.get(User, member.user_id)
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(CompanyAssignmentTarget.membership_id == membership_id))).all()
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.membership_id == membership_id,
        CompanyAssignmentAttempt.status == "COMPLETED").order_by(CompanyAssignmentAttempt.completed_at.desc()))).all()
    scores = [row.final_score for row in attempts if row.final_score is not None]
    return {"employee": {"membership_id": member.id, "name": person.display_name or person.username, "username": person.username,
             "job_title": member.job_title, "role": ROLE_LABELS.get(member.corporate_role), "specialization": person.specialization},
            "summary": {"assigned": len(targets), "completed": sum(row.status in {"PASSED", "FAILED", "COMPLETED"} for row in targets),
                        "average_score": round(sum(scores) / len(scores)) if scores else None, "best_score": max(scores) if scores else None},
            "attempts": [{"id": row.id, "assignment_id": row.assignment_id,
                          "assignment_title": (await db.get(CompanyAssignment, row.assignment_id)).title if await db.get(CompanyAssignment, row.assignment_id) else "\u0417\u0430\u0434\u0430\u043d\u0438\u0435",
                          "score": row.final_score, "metrics": as_json(row.metrics_snapshot, {}),
                          "comments": [{"id": comment.id, "text": comment.text, "created_at": comment.created_at.isoformat()} for comment in (await db.scalars(select(CompanyResultComment).where(CompanyResultComment.attempt_id == row.id).order_by(CompanyResultComment.created_at))).all()],
                          "completed_at": row.completed_at.isoformat() if row.completed_at else None} for row in attempts]}


@router.post("/{company_id}/employees/invite")
async def invite_employee(company_id: int, body: InviteIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    if body.corporate_role not in ROLE_LABELS: raise HTTPException(400, "Неизвестная корпоративная роль")
    person = await db.scalar(select(User).where(User.username == body.username.strip()))
    if not person: raise HTTPException(404, "Пользователь Arena не найден")
    existing = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id,
                                                                CompanyMembership.user_id == person.id))
    if existing and existing.status in {"ACTIVE", "INVITED"}: raise HTTPException(409, "Пользователь уже состоит в компании или приглашён")
    row = existing or CompanyMembership(company_id=company_id, user_id=person.id)
    row.department_id = body.department_id; row.job_title = body.job_title.strip(); row.corporate_role = body.corporate_role
    row.status = "INVITED"; row.invited_by = user.id
    db.add(row); await db.flush()
    company = await db.get(Company, company_id)
    db.add(Notification(user_id=person.id, type="COMPANY_INVITATION", payload=dumps({"membership_id": row.id, "company": company.name})))
    db.add(DirectMessage(sender_id=user.id, receiver_id=person.id, type="COMPANY_INVITATION",
        text=f"Приглашаю вас в компанию «{company.name}» на должность «{row.job_title}».",
        payload=dumps({"membership_id": row.id, "company_id": company_id, "job_title": row.job_title, "role": row.corporate_role})))
    await audit(db, membership, user.id, "MEMBER_INVITED", "membership", row.id, {"username": person.username})
    await db.commit(); return {"ok": True, "membership_id": row.id}


@router.post("/{company_id}/employees/import-csv/preview")
async def preview_employees_csv(company_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Validate an import without mutating memberships or departments."""
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 CSV-\u0444\u0430\u0439\u043b")
    raw = await file.read()
    if len(raw) > 1_000_000:
        raise HTTPException(413, "CSV-\u0444\u0430\u0439\u043b \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u043f\u0440\u0435\u0432\u044b\u0448\u0430\u0442\u044c 1 \u041c\u0411")
    try:
        rows = list(csv.DictReader(StringIO(raw.decode("utf-8-sig"))))
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "CSV \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0432 \u043a\u043e\u0434\u0438\u0440\u043e\u0432\u043a\u0435 UTF-8") from exc
    if not rows or "username" not in (rows[0] or {}):
        raise HTTPException(400, "\u041d\u0443\u0436\u043d\u0430 \u043a\u043e\u043b\u043e\u043d\u043a\u0430 username")
    if len(rows) > 500:
        raise HTTPException(400, "\u0417\u0430 \u043e\u0434\u0438\u043d \u0440\u0430\u0437 \u043c\u043e\u0436\u043d\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0434\u043e 500 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432")
    departments = {item.name.strip().lower() for item in (await db.scalars(select(CompanyDepartment).where(CompanyDepartment.company_id == company_id))).all()}
    seen: set[str] = set()
    result = []
    for line, source in enumerate(rows, 2):
        username = (source.get("username") or "").strip()
        department = (source.get("department") or "").strip().lower()
        role = (source.get("corporate_role") or "EMPLOYEE").strip().upper()
        status, reason = "READY", None
        if not username:
            status, reason = "ERROR", "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d username"
        elif username.lower() in seen:
            status, reason = "ERROR", "\u0414\u0443\u0431\u043b\u0438\u043a\u0430\u0442 username \u0432 \u0444\u0430\u0439\u043b\u0435"
        elif role not in ROLE_LABELS:
            status, reason = "ERROR", "\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u0430\u044f \u043a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u0430\u044f \u0440\u043e\u043b\u044c"
        elif department and department not in departments:
            status, reason = "ERROR", "\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e\u0435 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435"
        else:
            person = await db.scalar(select(User).where(User.username == username))
            existing = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.user_id == person.id)) if person else None
            if not person:
                status, reason = "ERROR", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c Arena \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"
            elif existing and existing.status in {"ACTIVE", "INVITED"}:
                status, reason = "SKIPPED", "\u0423\u0436\u0435 \u0441\u043e\u0441\u0442\u043e\u0438\u0442 \u0432 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 \u0438\u043b\u0438 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0451\u043d"
        seen.add(username.lower())
        result.append({"line": line, "username": username, "status": status, "reason": reason})
    return {"processed": len(rows), "ready": sum(row["status"] == "READY" for row in result),
            "errors": sum(row["status"] == "ERROR" for row in result), "rows": result}


@router.post("/{company_id}/employees/import-csv")
async def import_employees_csv(company_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Import existing Arena users. Required CSV column: username; optional: department, job_title, corporate_role."""
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Загрузите CSV-файл")
    raw = await file.read()
    if len(raw) > 1_000_000: raise HTTPException(413, "CSV-файл не должен превышать 1 МБ")
    try:
        rows = list(csv.DictReader(StringIO(raw.decode("utf-8-sig"))))
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "CSV должен быть в кодировке UTF-8") from exc
    if not rows or "username" not in (rows[0] or {}): raise HTTPException(400, "Нужна колонка username")
    if len(rows) > 500: raise HTTPException(400, "За один раз можно импортировать до 500 сотрудников")
    company = await db.get(Company, company_id); result=[]
    departments={item.name.strip().lower():item for item in (await db.scalars(select(CompanyDepartment).where(CompanyDepartment.company_id==company_id))).all()}
    for number, source in enumerate(rows, 2):
        username=(source.get("username") or "").strip(); title=(source.get("job_title") or "Сотрудник").strip()[:160]
        role=(source.get("corporate_role") or "EMPLOYEE").strip().upper(); department_name=(source.get("department") or "").strip()[:160]
        if not username or role not in ROLE_LABELS: result.append({"line":number,"username":username,"status":"ERROR","reason":"Некорректные username или роль"}); continue
        person=await db.scalar(select(User).where(User.username==username))
        if not person: result.append({"line":number,"username":username,"status":"ERROR","reason":"Пользователь Arena не найден"}); continue
        existing=await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id==company_id,CompanyMembership.user_id==person.id))
        if existing and existing.status in {"ACTIVE","INVITED"}: result.append({"line":number,"username":username,"status":"SKIPPED","reason":"Уже состоит или приглашён"}); continue
        department=None
        if department_name:
            department=departments.get(department_name.lower())
            if not department:
                result.append({"line":number,"username":username,"status":"ERROR","reason":"\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e\u0435 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435"}); continue
        membership=existing or CompanyMembership(company_id=company_id,user_id=person.id)
        membership.department_id=department.id if department else None;membership.job_title=title;membership.corporate_role=role;membership.status="INVITED";membership.invited_by=user.id
        db.add(membership); await db.flush()
        db.add(Notification(user_id=person.id,type="COMPANY_INVITATION",payload=dumps({"membership_id":membership.id,"company":company.name})))
        db.add(DirectMessage(sender_id=user.id,receiver_id=person.id,type="COMPANY_INVITATION",text=f"Приглашаю вас в компанию «{company.name}» на должность «{title}».",payload=dumps({"membership_id":membership.id,"company_id":company_id})))
        result.append({"line":number,"username":username,"status":"INVITED"})
    await audit(db,actor,user.id,"EMPLOYEES_IMPORTED","company",company_id,{"rows":len(rows)})
    await db.commit(); return {"processed":len(rows),"invited":sum(item["status"]=="INVITED" for item in result),"rows":result}


@router.put("/{company_id}/employees/{membership_id}")
async def update_employee(company_id: int, membership_id: int, body: MemberUpdateIn,
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await db.get(CompanyMembership, membership_id)
    if not row or row.company_id != company_id: raise HTTPException(404, "Сотрудник не найден")
    if body.corporate_role and body.corporate_role not in ROLE_LABELS: raise HTTPException(400, "Неизвестная корпоративная роль")
    if body.status and body.status not in {"ACTIVE", "SUSPENDED", "LEFT"}: raise HTTPException(400, "Недопустимый статус")
    if body.department_id:
        department = await db.get(CompanyDepartment, body.department_id)
        if not department or department.company_id != company_id: raise HTTPException(400, "Подразделение не найдено")
    before = {"department_id": row.department_id, "job_title": row.job_title, "role": row.corporate_role, "status": row.status}
    for field, value in body.model_dump(exclude_none=True).items(): setattr(row, field, value.strip() if isinstance(value, str) else value)
    await audit(db, actor, user.id, "MEMBER_UPDATED", "membership", row.id, {"before": before})
    await db.commit(); return {"ok": True}


@router.delete("/{company_id}/employees/{membership_id}")
async def remove_employee(company_id: int, membership_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await db.get(CompanyMembership, membership_id)
    if not row or row.company_id != company_id: raise HTTPException(404, "Сотрудник не найден")
    if row.id == actor.id: raise HTTPException(409, "Нельзя удалить собственное членство этим действием")
    row.status = "LEFT"
    await audit(db, actor, user.id, "MEMBER_LEFT", "membership", row.id)
    await db.commit(); return {"ok": True}


@router.put("/{company_id}/settings")
async def update_settings(company_id: int, body: SettingsIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    company = await db.get(Company, company_id)
    for key, value in body.model_dump(exclude_none=True).items():
        if key == "settings": company.settings = dumps(value)
        elif key in {"corporate_color", "secondary_color"} and not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise HTTPException(400, "Цвет должен быть в формате #RRGGBB")
        else: setattr(company, key, value.strip() if isinstance(value, str) else value)
    await audit(db, membership, user.id, "COMPANY_SETTINGS_UPDATED", "company", company_id)
    await db.commit(); return company_payload(company)


@router.post("/{company_id}/inbox/{message_id}/read")
async def read_inbox(company_id: int, message_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    row = await db.get(CompanyInboxMessage, message_id)
    if not row or row.membership_id != membership.id: raise HTTPException(404, "Сообщение не найдено")
    row.is_read = 1; await db.commit(); return {"ok": True}


async def seed_company_demo(db: AsyncSession) -> None:
    """Идемпотентные данные для локального просмотра корпоративного кабинета."""
    if await db.scalar(select(Company.id).limit(1)):
        return
    demo = await db.scalar(select(User).where(User.username == "demo"))
    if not demo:
        return
    company = Company(name="Альфа Технологии", short_name="Альфа", slug="alpha-demo", description="Демонстрационное корпоративное пространство Arena.",
                      industry="Информационные технологии", company_size="51–200", country="Россия", city="Москва",
                      academy_name="Альфа · Академия переговоров", created_by=demo.id,
                      settings=dumps(default_company_settings()))
    db.add(company); await db.flush()
    sales = CompanyDepartment(company_id=company.id, name="B2B-продажи", description="Работа с корпоративными клиентами")
    hr = CompanyDepartment(company_id=company.id, name="HR", description="Команда по работе с людьми")
    db.add_all([sales, hr]); await db.flush()
    users = (await db.scalars(select(User).order_by(User.id).limit(8))).all()
    memberships = []
    for index, person in enumerate(users):
        role = "COMPANY_OWNER" if person.id == demo.id else ("TEAM_LEAD" if person.username == "alex_hr" else "EMPLOYEE")
        department = hr if person.username in {"demo", "alex_hr", "elena_pm"} else sales
        member = CompanyMembership(company_id=company.id, user_id=person.id, department_id=department.id,
            job_title="Руководитель обучения" if person.id == demo.id else (person.specialization or "Сотрудник"),
            employee_number=f"A-{1000 + index}", corporate_role=role, status="ACTIVE", is_primary=1,
            joined_at=datetime.now(), verified_at=datetime.now(), invited_by=demo.id)
        db.add(member); memberships.append(member)
    await db.flush()
    kpis = [
        CompanyKPI(company_id=company.id, name="Сохранение маржи", description="Не дать скидку выше допустимого уровня", unit="%", rule="MIN", threshold=10, weight=30, required=1),
        CompanyKPI(company_id=company.id, name="Выявление потребности", description="Получить минимум три факта о потребности клиента", unit="факты", rule="MIN", threshold=3, weight=35),
        CompanyKPI(company_id=company.id, name="Следующий шаг", description="Закрепить конкретное продолжение переговоров", unit="да/нет", rule="BOOL", threshold=1, weight=35),
    ]
    db.add_all(kpis)
    program = CompanyProgram(company_id=company.id, title="Переговоры с корпоративным клиентом", description="Путь от подготовки до итоговой аттестации.",
        audience="Отдел B2B-продаж", owner_id=demo.id, status="PUBLISHED", steps=dumps([
            {"title": "Основы переговоров", "status": "completed"}, {"title": "Работа с интересами", "status": "completed"},
            {"title": "Возражения", "status": "current"}, {"title": "Торг", "status": "locked"},
            {"title": "Итоговая аттестация", "status": "locked"}]))
    db.add(program); await db.flush()
    assignment = CompanyAssignment(company_id=company.id, title="Работа с требованием скидки", description="Сохраните клиента и защитите маржу.",
        goal="Выяснить причину требования скидки и предложить альтернативу", scenario_id="sales_discount", difficulty="высокая",
        employee_role="Менеджер по продажам", opponent="Корпоративный клиент", deadline=datetime.now() + timedelta(days=4), attempts_allowed=3,
        passing_score=70, issue_certificate=1, kpi_snapshot=dumps([{"name": k.name, "weight": k.weight, "required": bool(k.required)} for k in kpis]), created_by=demo.id)
    db.add(assignment); await db.flush()
    for member in memberships:
        if member.corporate_role == "EMPLOYEE":
            db.add(CompanyAssignmentTarget(company_id=company.id, assignment_id=assignment.id, membership_id=member.id))
            db.add(CompanyInboxMessage(company_id=company.id, membership_id=member.id, type="COMPANY_ASSIGNMENT",
                title="Новое корпоративное задание", text="Пройдите тренировку по работе с требованием скидки.", payload=dumps({"assignment_id": assignment.id})))
    db.add(CompanyAuditLog(company_id=company.id, actor_user_id=demo.id, action="COMPANY_CREATED", entity_type="company",
                           entity_id=str(company.id), details=dumps({"source": "demo"})))
    await db.commit()
