"""Corporate automation, starter packs and privacy-safe intercompany leagues."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import require_capability, visible_membership_ids
from app.company_models import (Company, CompanyAssignment, CompanyAssignmentAttempt, CompanyAssignmentSchedule,
    CompanyAssignmentTarget, CompanyInboxMessage, CompanyLeague, CompanyLeagueEntry, CompanyMembership,
    CompanyScenario, CompanySubscription)
from app.company_advanced_models import CompanyLeagueConsent
from app.db import get_db
from app.models import Notification, User
from app.routers.company import as_json, audit, require_membership, require_role
from app.services import dumps

router = APIRouter(prefix="/company", tags=["company-growth"])

INDUSTRY_PACKS = {
    "sales": {"label": "B2B продажи", "situations": ["Защита цены", "Возврат сложного клиента", "Согласование условий"]},
    "management": {"label": "Управление", "situations": ["Обратная связь сотруднику", "Срыв срока", "Переговоры о приоритетах"]},
    "hr": {"label": "HR", "situations": ["Предложение кандидату", "Разговор об изменении роли", "Удержание специалиста"]},
    "procurement": {"label": "Закупки", "situations": ["Пересмотр цены поставщика", "Срок поставки", "Условия рамочного договора"]},
}


class ScheduleIn(BaseModel):
    template_assignment_id: int
    cadence: str = Field(pattern="^(DAILY|WEEKLY|MONTHLY)$")
    interval_count: int = Field(default=1, ge=1, le=24)
    next_run_at: datetime
    ends_at: datetime | None = None
    deadline_offset_days: int = Field(default=7, ge=1, le=365)
    membership_ids: list[int] = Field(min_length=1, max_length=5000)


class LeagueIn(BaseModel):
    title: str = Field(min_length=3, max_length=220)
    season: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=2000)
    min_sample_size: int = Field(default=5, ge=5, le=1000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class LeagueJoinIn(BaseModel):
    public_name: str = Field(min_length=2, max_length=120)
    publish_logo: bool = False


class StatusIn(BaseModel):
    status: str


def schedule_payload(row: CompanyAssignmentSchedule) -> dict:
    return {"id": row.id, "template_assignment_id": row.template_assignment_id, "cadence": row.cadence,
        "interval_count": row.interval_count, "next_run_at": row.next_run_at.isoformat(),
        "ends_at": row.ends_at.isoformat() if row.ends_at else None, "deadline_offset_days": row.deadline_offset_days,
        "membership_ids": as_json(row.recipient_membership_ids, []), "status": row.status, "run_count": row.run_count,
        "last_run_at": row.last_run_at.isoformat() if row.last_run_at else None}


def _advance(row: CompanyAssignmentSchedule) -> None:
    days = {"DAILY": 1, "WEEKLY": 7, "MONTHLY": 30}[row.cadence] * row.interval_count
    row.next_run_at += timedelta(days=days)
    if row.ends_at and row.next_run_at > row.ends_at:
        row.status = "COMPLETED"


async def _run_schedule(db: AsyncSession, row: CompanyAssignmentSchedule) -> int:
    template = await db.get(CompanyAssignment, row.template_assignment_id)
    if not template or template.company_id != row.company_id or template.status != "ACTIVE":
        row.status = "PAUSED"
        return 0
    recipient_ids = set(as_json(row.recipient_membership_ids, []))
    recipients = (await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == row.company_id, CompanyMembership.id.in_(recipient_ids),
        CompanyMembership.status == "ACTIVE"))).all()
    now = datetime.now()
    instance = CompanyAssignment(company_id=row.company_id, title=f"{template.title} · {now:%d.%m.%Y}",
        description=template.description, goal=template.goal, content_type=template.content_type,
        scenario_id=template.scenario_id, company_scenario_id=template.company_scenario_id,
        program_id=template.program_id, difficulty=template.difficulty, employee_role=template.employee_role,
        opponent=template.opponent, deadline=now + timedelta(days=row.deadline_offset_days),
        attempts_allowed=template.attempts_allowed, attempt_policy=template.attempt_policy,
        required=template.required, passing_score=template.passing_score, hints_allowed=template.hints_allowed,
        ghost_allowed=template.ghost_allowed, repeat_allowed=template.repeat_allowed,
        show_result_immediately=template.show_result_immediately, show_team_comparison=template.show_team_comparison,
        issue_certificate=template.issue_certificate, arena_weight=template.arena_weight,
        company_weight=template.company_weight, kpi_snapshot=template.kpi_snapshot,
        assignment_snapshot=template.assignment_snapshot, status="ACTIVE", created_by=row.created_by)
    db.add(instance); await db.flush()
    for member in recipients:
        db.add(CompanyAssignmentTarget(company_id=row.company_id, assignment_id=instance.id, membership_id=member.id))
        db.add(CompanyInboxMessage(company_id=row.company_id, membership_id=member.id, type="SCHEDULED_ASSIGNMENT",
            title=instance.title, text="Новое задание по расписанию.", payload=dumps({"assignment_id": instance.id})))
        db.add(Notification(user_id=member.user_id, type="COMPANY_ASSIGNMENT",
            payload=dumps({"company_id": row.company_id, "assignment_id": instance.id, "title": instance.title})))
    row.run_count += 1; row.last_run_at = now; _advance(row)
    return len(recipients)


async def dispatch_due_company_schedules(db: AsyncSession) -> int:
    rows = (await db.scalars(select(CompanyAssignmentSchedule).where(
        CompanyAssignmentSchedule.status == "ACTIVE", CompanyAssignmentSchedule.next_run_at <= datetime.now()))).all()
    created = 0
    for row in rows:
        created += await _run_schedule(db, row)
    if rows:
        await db.commit()
    return created


@router.get("/{company_id}/assignment-schedules")
async def list_schedules(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_capability(actor, "manage_assignments")
    rows = (await db.scalars(select(CompanyAssignmentSchedule).where(
        CompanyAssignmentSchedule.company_id == company_id).order_by(CompanyAssignmentSchedule.created_at.desc()))).all()
    return [schedule_payload(row) for row in rows]


@router.post("/{company_id}/assignment-schedules")
async def create_schedule(company_id: int, body: ScheduleIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_capability(actor, "manage_assignments")
    template = await db.get(CompanyAssignment, body.template_assignment_id)
    if not template or template.company_id != company_id:
        raise HTTPException(404, "Шаблон задания не найден")
    allowed = set(await visible_membership_ids(db, actor))
    if set(body.membership_ids) - allowed:
        raise HTTPException(403, "Получатель находится вне вашей области доступа")
    if body.ends_at and body.ends_at < body.next_run_at:
        raise HTTPException(400, "Окончание расписания должно быть позже первого запуска")
    row = CompanyAssignmentSchedule(company_id=company_id, template_assignment_id=template.id,
        cadence=body.cadence, interval_count=body.interval_count, next_run_at=body.next_run_at,
        ends_at=body.ends_at, deadline_offset_days=body.deadline_offset_days,
        recipient_membership_ids=dumps(sorted(set(body.membership_ids))), created_by=user.id)
    db.add(row); await db.flush(); await audit(db, actor, user.id, "ASSIGNMENT_SCHEDULE_CREATED", "schedule", row.id)
    await db.commit(); return schedule_payload(row)


@router.post("/{company_id}/assignment-schedules/{schedule_id}/run")
async def run_schedule(company_id: int, schedule_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_capability(actor, "manage_assignments")
    row = await db.get(CompanyAssignmentSchedule, schedule_id)
    if not row or row.company_id != company_id: raise HTTPException(404, "Расписание не найдено")
    recipients = await _run_schedule(db, row)
    await audit(db, actor, user.id, "ASSIGNMENT_SCHEDULE_RUN", "schedule", row.id, {"recipients": recipients})
    await db.commit(); return {"recipients": recipients, "schedule": schedule_payload(row)}


@router.patch("/{company_id}/assignment-schedules/{schedule_id}")
async def update_schedule(company_id: int, schedule_id: int, body: StatusIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_capability(actor, "manage_assignments")
    row = await db.get(CompanyAssignmentSchedule, schedule_id)
    if not row or row.company_id != company_id: raise HTTPException(404, "Расписание не найдено")
    if body.status not in {"ACTIVE", "PAUSED"}: raise HTTPException(400, "Допустимы статусы ACTIVE и PAUSED")
    row.status = body.status
    await audit(db, actor, user.id, "ASSIGNMENT_SCHEDULE_STATUS_CHANGED", "schedule", row.id, {"status": body.status})
    await db.commit(); return schedule_payload(row)


@router.get("/{company_id}/industry-packs")
async def industry_packs(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_capability(actor, "manage_learning")
    return [{"code": code, **pack} for code, pack in INDUSTRY_PACKS.items()]


@router.post("/{company_id}/industry-packs/{pack_code}/install")
async def install_industry_pack(company_id: int, pack_code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_capability(actor, "manage_learning")
    pack = INDUSTRY_PACKS.get(pack_code)
    if not pack: raise HTTPException(404, "Отраслевой пакет не найден")
    created = []
    for situation in pack["situations"]:
        title = f"{pack['label']} · {situation}"
        exists = await db.scalar(select(CompanyScenario.id).where(CompanyScenario.company_id == company_id, CompanyScenario.title == title))
        if exists: continue
        steps = [{"id":"start","opponent_text":f"Собеседник начинает разговор: {situation}.","options":[
            {"id":"clarify","text":"Уточнить интересы и критерии решения","effects":{"trust":6,"goal":3,"control":4,"eq":3},"next":"finish"},
            {"id":"offer","text":"Сразу предложить свои условия","effects":{"trust":-2,"goal":5,"control":2,"eq":0},"next":"finish"}]},
            {"id":"finish","opponent_text":"Стороны фиксируют следующий шаг.","options":[{"id":"commit","text":"Подтвердить договорённость","effects":{"trust":3,"goal":5,"control":4,"eq":2},"ending":"agreement"}]}]
        row = CompanyScenario(company_id=company_id, title=title, description="Стартовый отраслевой шаблон",
            industry=pack["label"], employee_role="Сотрудник", opponent_role="Собеседник",
            context=f"Рабочая ситуация: {situation}.", employee_goal="Согласовать измеримый следующий шаг.",
            success_criteria=dumps(["Уточнены интересы", "Зафиксирован следующий шаг"]), scenario_steps=dumps(steps),
            status="PUBLISHED", author_id=user.id, owner_id=user.id, last_editor_id=user.id)
        db.add(row); await db.flush(); created.append(row.id)
    await audit(db, actor, user.id, "INDUSTRY_PACK_INSTALLED", "industry_pack", pack_code, {"created": len(created)})
    await db.commit(); return {"pack": pack_code, "created": len(created), "scenario_ids": created}


async def _league_score(db: AsyncSession, company_id: int) -> tuple[int | None, int]:
    rows = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.status == "COMPLETED",
        CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    latest = {}
    for row in rows:
        if row.membership_id not in latest or (row.completed_at or datetime.min) > (latest[row.membership_id].completed_at or datetime.min):
            latest[row.membership_id] = row
    scores = [row.final_score for row in latest.values()]
    return (round(sum(scores) / len(scores)) if scores else None, len(scores))


@router.get("/{company_id}/leagues")
async def leagues(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyLeague).where(CompanyLeague.status.in_(("OPEN", "ACTIVE"))).order_by(CompanyLeague.created_at.desc()))).all()
    entries = (await db.scalars(select(CompanyLeagueEntry).where(CompanyLeagueEntry.company_id == company_id))).all()
    own = {entry.league_id: entry for entry in entries}
    return [{"id": row.id, "title": row.title, "season": row.season, "description": row.description,
             "min_sample_size": row.min_sample_size,
             "joined": row.id in own and own[row.id].status != "WITHDRAWN",
             "own_status": own[row.id].status if row.id in own else None,
             "can_moderate": row.created_by == user.id} for row in rows]


@router.post("/{company_id}/leagues")
async def create_league(company_id: int, body: LeagueIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER"})
    subscription = await db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    if subscription and subscription.plan_code == "TEAM": raise HTTPException(403, "Лиги доступны на тарифе Бизнес или Enterprise")
    row = CompanyLeague(title=body.title.strip(), season=body.season.strip(), description=body.description.strip() or None,
        min_sample_size=body.min_sample_size, starts_at=body.starts_at, ends_at=body.ends_at, created_by=user.id)
    db.add(row); await db.flush()
    # Creating a league is an explicit opt-in for the creator's own company.
    db.add(CompanyLeagueConsent(league_id=row.id, company_id=company_id, accepted_by=user.id, aggregate_scope="COMPANY_AVERAGE"))
    await db.commit(); await db.refresh(row); return {"id": row.id, "title": row.title, "season": row.season}


@router.post("/{company_id}/leagues/{league_id}/join")
async def join_league(company_id: int, league_id: int, body: LeagueJoinIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER"})
    league = await db.get(CompanyLeague, league_id); company = await db.get(Company, company_id)
    if not league or league.status not in {"OPEN", "ACTIVE"}: raise HTTPException(404, "Открытая лига не найдена")
    consent = await db.scalar(select(CompanyLeagueConsent).where(CompanyLeagueConsent.league_id == league_id, CompanyLeagueConsent.company_id == company_id, CompanyLeagueConsent.revoked_at.is_(None)))
    if consent is None:
        raise HTTPException(409, "Сначала подтвердите взаимный opt-in компании и публикацию агрегированных данных")
    score, sample = await _league_score(db, company_id)
    existing = await db.scalar(select(CompanyLeagueEntry).where(CompanyLeagueEntry.league_id == league_id, CompanyLeagueEntry.company_id == company_id))
    row = existing or CompanyLeagueEntry(league_id=league_id, company_id=company_id, public_name=body.public_name.strip(), joined_by=user.id)
    row.public_name = body.public_name.strip(); row.public_logo = company.logo if body.publish_logo else None
    row.score = score if sample >= league.min_sample_size else None; row.sample_size = sample
    row.status = "PUBLISHED" if row.score is not None else "WAITING_FOR_SAMPLE"
    db.add(row); await audit(db, actor, user.id, "LEAGUE_JOINED", "league", league_id, {"public_name": row.public_name})
    await db.commit(); return {"status": row.status, "sample_size": sample, "required": league.min_sample_size}


@router.delete("/{company_id}/leagues/{league_id}/membership")
async def leave_league(company_id: int, league_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER"})
    row = await db.scalar(select(CompanyLeagueEntry).where(
        CompanyLeagueEntry.league_id == league_id, CompanyLeagueEntry.company_id == company_id))
    if not row: raise HTTPException(404, "Участие в лиге не найдено")
    row.status = "WITHDRAWN"; row.score = None; row.public_logo = None
    await audit(db, actor, user.id, "LEAGUE_WITHDRAWN", "league", league_id)
    await db.commit(); return {"status": row.status}


@router.patch("/{company_id}/leagues/{league_id}/entries/{entry_id}")
async def moderate_league_entry(company_id: int, league_id: int, entry_id: int, body: StatusIn,
                                db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id); require_role(actor, {"COMPANY_OWNER"})
    league = await db.get(CompanyLeague, league_id)
    if not league or league.created_by != user.id: raise HTTPException(403, "Модерировать лигу может только её автор")
    if body.status not in {"PUBLISHED", "SUSPENDED"}: raise HTTPException(400, "Допустимы статусы PUBLISHED и SUSPENDED")
    row = await db.get(CompanyLeagueEntry, entry_id)
    if not row or row.league_id != league_id: raise HTTPException(404, "Участник лиги не найден")
    if body.status == "PUBLISHED" and (row.score is None or row.sample_size < league.min_sample_size):
        raise HTTPException(409, "Недостаточно агрегированных результатов для публикации")
    row.status = body.status
    await audit(db, actor, user.id, "LEAGUE_ENTRY_MODERATED", "league_entry", row.id, {"status": body.status})
    await db.commit(); return {"id": row.id, "status": row.status}


@router.get("/{company_id}/leagues/{league_id}/standings")
async def league_standings(company_id: int, league_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_membership(db, user, company_id)
    league = await db.get(CompanyLeague, league_id)
    if not league: raise HTTPException(404, "Лига не найдена")
    rows = (await db.scalars(select(CompanyLeagueEntry).where(
        CompanyLeagueEntry.league_id == league_id, CompanyLeagueEntry.status == "PUBLISHED",
        CompanyLeagueEntry.score.is_not(None),
        select(CompanyLeagueConsent.id).where(CompanyLeagueConsent.league_id == CompanyLeagueEntry.league_id, CompanyLeagueConsent.company_id == CompanyLeagueEntry.company_id, CompanyLeagueConsent.revoked_at.is_(None)).exists()).order_by(CompanyLeagueEntry.score.desc()))).all()
    return {"league": {"id": league.id, "title": league.title, "season": league.season},
        "can_moderate": league.created_by == user.id,
        "standings": [{"id": row.id, "place": index, "name": row.public_name, "logo": row.public_logo,
                       "score": row.score, "sample_size": row.sample_size} for index, row in enumerate(rows, 1)],
        "privacy": "Публикуются только добровольное название компании и агрегированный результат минимум по заданной выборке."}
