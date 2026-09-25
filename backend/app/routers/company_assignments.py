from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import Company, CompanyAssignment, CompanyAssignmentAttempt, CompanyAssignmentTarget, CompanyCohort, CompanyCohortMember, CompanyInboxMessage, CompanyKPI, CompanyMembership, CompanyScenario
from app.db import get_db
from app.engine.scenario import SCENARIOS
from app.models import DirectMessage, Notification, User
from app.services import create_session, dumps
from app.routers.company import AssignmentIn, MANAGE_ALL, MANAGE_TEAM, allows_member_notification, assignment_payload, audit, require_membership, require_role, visible_membership_ids

router = APIRouter(prefix="/company", tags=["company-assignments"])


class AssignmentUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=220)
    description: str | None = Field(default=None, max_length=3000)
    goal: str | None = Field(default=None, max_length=2000)
    deadline: datetime | None = None

@router.get("/{company_id}/assignments")
async def assignments(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    allowed_ids = await visible_membership_ids(db, membership)
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(
        CompanyAssignmentTarget.company_id == company_id, CompanyAssignmentTarget.membership_id.in_(allowed_ids))
        .order_by(CompanyAssignmentTarget.updated_at.desc()))).all()
    return [await assignment_payload(db, row) | {"membership_id": row.membership_id} for row in targets]


@router.get("/{company_id}/assignments/catalog")
async def assignment_catalog(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Активные задания, которые можно подключить к этапу программы."""
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_TEAM)
    statement = select(CompanyAssignment).where(
        CompanyAssignment.company_id == company_id,
        CompanyAssignment.status == "ACTIVE",
    )
    if membership.corporate_role not in MANAGE_ALL:
        allowed = set(await visible_membership_ids(db, membership))
        target_ids = (await db.scalars(select(CompanyAssignmentTarget.assignment_id).where(
            CompanyAssignmentTarget.company_id == company_id,
            CompanyAssignmentTarget.membership_id.in_(allowed),
        ))).all()
        statement = statement.where(CompanyAssignment.id.in_(set(target_ids))) if target_ids else statement.where(False)
    rows = (await db.scalars(statement.order_by(CompanyAssignment.title))).all()
    return [{"id": row.id, "title": row.title, "difficulty": row.difficulty,
             "passing_score": row.passing_score, "program_id": row.program_id} for row in rows]


@router.get("/{company_id}/assignments/{assignment_id}")
async def assignment_detail(company_id: int, assignment_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    assignment = await db.get(CompanyAssignment, assignment_id)
    if not assignment or assignment.company_id != company_id:
        raise HTTPException(404, "\u0417\u0430\u0434\u0430\u043d\u0438\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e")
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(CompanyAssignmentTarget.assignment_id == assignment_id))).all()
    allowed = set(await visible_membership_ids(db, membership))
    visible_targets = [target for target in targets if target.membership_id in allowed]
    if not visible_targets:
        raise HTTPException(403, "\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u043a \u044d\u0442\u043e\u043c\u0443 \u0437\u0430\u0434\u0430\u043d\u0438\u044e")
    result = {
        "id": assignment.id, "title": assignment.title, "description": assignment.description, "goal": assignment.goal,
        "deadline": assignment.deadline.isoformat() if assignment.deadline else None,
        "difficulty": assignment.difficulty, "attempts_allowed": assignment.attempts_allowed,
        "passing_score": assignment.passing_score, "snapshot": __import__("json").loads(assignment.assignment_snapshot or "{}"),
    }
    if membership.corporate_role in MANAGE_TEAM:
        result["targets"] = [{"membership_id": target.membership_id, "status": target.status, "best_score": target.best_score,
                              "attempts_used": target.attempts_used} for target in visible_targets]
        result["summary"] = {"assigned": len(visible_targets), "completed": sum(target.status in {"PASSED", "FAILED", "COMPLETED"} for target in visible_targets),
                             "in_progress": sum(target.status == "IN_PROGRESS" for target in visible_targets)}
    else:
        result["target"] = await assignment_payload(db, visible_targets[0])
    return result


@router.put("/{company_id}/assignments/{assignment_id}")
async def update_assignment(company_id: int, assignment_id: int, body: AssignmentUpdateIn,
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_TEAM)
    assignment = await db.get(CompanyAssignment, assignment_id)
    if not assignment or assignment.company_id != company_id:
        raise HTTPException(404, "\u0417\u0430\u0434\u0430\u043d\u0438\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e")
    allowed = set(await visible_membership_ids(db, membership))
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(CompanyAssignmentTarget.assignment_id == assignment_id))).all()
    if any(target.membership_id not in allowed for target in targets):
        raise HTTPException(403, "\u041d\u0435\u0442 \u043f\u0440\u0430\u0432 \u043c\u0435\u043d\u044f\u0442\u044c \u0437\u0430\u0434\u0430\u043d\u0438\u0435 \u0432\u043d\u0435 \u0441\u0432\u043e\u0435\u0439 \u043a\u043e\u043c\u0430\u043d\u0434\u044b")
    before = {"title": assignment.title, "deadline": assignment.deadline.isoformat() if assignment.deadline else None}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(assignment, field, value.strip() if isinstance(value, str) else value)
    await audit(db, membership, user.id, "ASSIGNMENT_UPDATED", "assignment", assignment.id, {"before": before})
    await db.commit()
    return {"id": assignment.id, "title": assignment.title, "deadline": assignment.deadline.isoformat() if assignment.deadline else None}


@router.post("/{company_id}/assignments")
async def create_assignment(company_id: int, body: AssignmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    if body.arena_weight + body.company_weight != 100: raise HTTPException(400, "Сумма весов Arena и KPI компании должна быть 100")
    corporate_scenario = None
    if body.company_scenario_id:
        corporate_scenario = await db.get(CompanyScenario, body.company_scenario_id)
        if not corporate_scenario or corporate_scenario.company_id != company_id:
            raise HTTPException(400, "Корпоративный сценарий не найден")
        if corporate_scenario.status != "PUBLISHED":
            raise HTTPException(409, "Назначать можно только опубликованный корпоративный сценарий")
    kpis = (await db.scalars(select(CompanyKPI).where(CompanyKPI.company_id == company_id, CompanyKPI.id.in_(body.kpi_ids)))).all() if body.kpi_ids else []
    row = CompanyAssignment(company_id=company_id, title=body.title.strip(), description=body.description.strip(), goal=body.goal.strip(),
        content_type=body.content_type, scenario_id=body.scenario_id, company_scenario_id=body.company_scenario_id,
        program_id=body.program_id, difficulty=body.difficulty, employee_role=body.employee_role, opponent=body.opponent,
        deadline=body.deadline, attempts_allowed=body.attempts_allowed, attempt_policy=body.attempt_policy,
        passing_score=body.passing_score, hints_allowed=int(body.hints_allowed), ghost_allowed=int(body.ghost_allowed),
        show_result_immediately=int(body.show_result_immediately), show_team_comparison=int(body.show_team_comparison),
        issue_certificate=int(body.issue_certificate), arena_weight=body.arena_weight, company_weight=body.company_weight,
        kpi_snapshot=dumps([{"id": k.id, "name": k.name, "rule": k.rule, "threshold": k.threshold,
                            "weight": k.weight, "required": bool(k.required), "max_score": k.max_score} for k in kpis]),
        assignment_snapshot=dumps({"version": 1, "scenario_id": body.scenario_id, "company_scenario_id": body.company_scenario_id,
            "difficulty": body.difficulty, "employee_role": body.employee_role, "opponent": body.opponent,
            "passing_score": body.passing_score, "attempts_allowed": body.attempts_allowed,
            "attempt_policy": body.attempt_policy, "arena_weight": body.arena_weight, "company_weight": body.company_weight,
            "corporate_scenario_revision": corporate_scenario.revision if corporate_scenario else None,
            "kpis": [{"id": k.id, "rule": k.rule, "threshold": k.threshold, "weight": k.weight} for k in kpis],
            "template_only": body.template_only}), created_by=user.id)
    db.add(row); await db.flush()
    scope_ids = set(await visible_membership_ids(db, membership))
    recipients = set(body.membership_ids) & scope_ids
    if body.department_ids:
        department_members = (await db.scalars(select(CompanyMembership.id).where(
            CompanyMembership.company_id == company_id, CompanyMembership.department_id.in_(body.department_ids),
            CompanyMembership.status == "ACTIVE"))).all()
        recipients.update(set(department_members) & scope_ids)
    if body.cohort_ids:
        cohort_ids = (await db.scalars(select(CompanyCohort.id).where(
            CompanyCohort.company_id == company_id, CompanyCohort.id.in_(body.cohort_ids), CompanyCohort.status == "ACTIVE"))).all()
        cohort_members = (await db.scalars(select(CompanyCohortMember.membership_id).where(
            CompanyCohortMember.cohort_id.in_(cohort_ids)))).all() if cohort_ids else []
        recipients.update(set(cohort_members) & scope_ids)
    if body.all_company and membership.corporate_role in MANAGE_ALL: recipients = scope_ids
    if body.template_only and membership.corporate_role not in MANAGE_ALL:
        raise HTTPException(403, "Конструктор программ доступен только ролям с полным управлением")
    if not recipients and not body.template_only:
        raise HTTPException(400, "Выберите хотя бы одного получателя или отметьте шаблон для программы")
    company = await db.get(Company, company_id)
    for member_id in recipients:
        target = CompanyAssignmentTarget(company_id=company_id, assignment_id=row.id, membership_id=member_id)
        db.add(target)
        recipient = await db.get(CompanyMembership, member_id)
        if allows_member_notification(recipient, "assignment"):
            db.add(Notification(user_id=recipient.user_id, type="COMPANY_ASSIGNMENT", payload=dumps({"company": company.name, "assignment_id": row.id, "title": row.title})))
            db.add(CompanyInboxMessage(company_id=company_id, membership_id=member_id, type="COMPANY_ASSIGNMENT",
                title="Новое корпоративное задание", text=f"{user.display_name or user.username} назначил вам «{row.title}».",
                payload=dumps({"assignment_id": row.id, "deadline": row.deadline.isoformat() if row.deadline else None})))
            has_chat = await db.scalar(select(DirectMessage.id).where(or_(
                and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == recipient.user_id),
                and_(DirectMessage.sender_id == recipient.user_id, DirectMessage.receiver_id == user.id),
            )).limit(1))
            if has_chat:
                db.add(DirectMessage(sender_id=user.id, receiver_id=recipient.user_id, type="COMPANY_ASSIGNMENT",
                    text="Корпоративное задание", payload=dumps({"company": company.name, "assignment_id": row.id,
                    "title": row.title, "difficulty": row.difficulty, "deadline": row.deadline.isoformat() if row.deadline else None})))
    await audit(db, membership, user.id, "ASSIGNMENT_CREATED", "assignment", row.id,
                {"recipients": len(recipients), "template_only": body.template_only})
    await db.commit(); return {"id": row.id, "recipients": len(recipients), "template_only": body.template_only}


@router.post("/{company_id}/assignments/{assignment_id}/start")
async def start_assignment(company_id: int, assignment_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    assignment = await db.get(CompanyAssignment, assignment_id)
    target = await db.scalar(select(CompanyAssignmentTarget).where(CompanyAssignmentTarget.assignment_id == assignment_id,
                                                                    CompanyAssignmentTarget.membership_id == membership.id))
    if not assignment or assignment.company_id != company_id or not target: raise HTTPException(404, "Задание не найдено")
    if target.attempts_used >= assignment.attempts_allowed: raise HTTPException(409, "Доступные попытки закончились")
    if assignment.deadline and assignment.deadline < datetime.now(): target.status = "OVERDUE"; await db.commit(); raise HTTPException(409, "Срок задания истёк")
    scenario_id = assignment.scenario_id if assignment.scenario_id in SCENARIOS else next(iter(SCENARIOS))
    session = await create_session(db, user, {"mode": "scenario", "scenario_id": scenario_id, "preset": scenario_id,
        "role": assignment.employee_role or "Сотрудник", "opponent_role": assignment.opponent or "Оппонент",
        "difficulty": assignment.difficulty, "goal": assignment.goal or "Выполнить корпоративное задание",
        "ghost": bool(assignment.ghost_allowed), "corporate": {"company_id": company_id, "assignment_id": assignment_id}})
    target.attempts_used += 1; target.status = "IN_PROGRESS"; target.opened_at = target.opened_at or datetime.now()
    attempt = CompanyAssignmentAttempt(company_id=company_id, assignment_id=assignment_id, target_id=target.id,
                                       membership_id=membership.id, session_id=session.id)
    db.add(attempt); await db.commit(); await db.refresh(attempt)
    return {"session_id": session.id, "attempt_id": attempt.id}

