"""Organization, cohorts, calendar and member notification preferences."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import owned_department, validate_department_parent, validate_manager, active_company_member
from app.company_models import (
    CompanyCertificate, CompanyCohort, CompanyCohortMember, CompanyCompetition,
    CompanyDepartment, CompanyMembership, CompanyProgramEnrollment, CompanyRoomBooking,
    CompanyAssignment, CompanyAssignmentTarget,
)
from app.db import get_db
from app.models import User
from app.services import dumps
from app.routers.company import MANAGE_ALL, MANAGE_TEAM, as_json, audit, require_membership, require_role, visible_membership_ids

router = APIRouter(prefix="/company", tags=["company-organization"])


class DepartmentUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    parent_department_id: int | None = None
    manager_membership_id: int | None = None
    description: str | None = Field(default=None, max_length=1000)


class DepartmentRemoveIn(BaseModel):
    move_members_to_department_id: int | None = None


class CohortIn(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=2000)
    membership_ids: list[int] = Field(default_factory=list, max_length=1000)
    leader_membership_id: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    goal: str = Field(default="", max_length=2000)
    focus_skills: list[str] = Field(default_factory=list, max_length=30)


class CohortUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=2000)
    leader_membership_id: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    goal: str | None = Field(default=None, max_length=2000)
    focus_skills: list[str] | None = Field(default=None, max_length=30)
    status: str | None = Field(default=None, pattern="^(ACTIVE|ARCHIVED)$")


class CohortMembersIn(BaseModel):
    membership_ids: list[int] = Field(min_length=1, max_length=1000)


class NotificationSettingsIn(BaseModel):
    settings: dict[str, bool]


def department_payload(row: CompanyDepartment) -> dict:
    return {
        "id": row.id, "name": row.name, "description": row.description,
        "parent_department_id": row.parent_department_id,
        "manager_membership_id": row.manager_membership_id,
    }


@router.put("/{company_id}/departments/{department_id}")
async def update_department(company_id: int, department_id: int, body: DepartmentUpdateIn,
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await owned_department(db, company_id, department_id)
    changes = body.model_dump(exclude_unset=True)
    if "parent_department_id" in changes:
        await validate_department_parent(db, company_id, row.id, changes["parent_department_id"])
    if "manager_membership_id" in changes:
        await validate_manager(db, company_id, changes["manager_membership_id"])
    if "name" in changes:
        if not changes["name"] or not changes["name"].strip():
            raise HTTPException(400, "Укажите название подразделения")
        duplicate = await db.scalar(select(CompanyDepartment.id).where(CompanyDepartment.company_id == company_id,
            CompanyDepartment.name == changes["name"].strip(), CompanyDepartment.id != row.id))
        if duplicate:
            raise HTTPException(409, "Подразделение с таким названием уже существует")
    before = department_payload(row)
    for key, value in changes.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    await audit(db, actor, user.id, "DEPARTMENT_UPDATED", "department", row.id, {"before": before})
    await db.commit()
    return department_payload(row)


@router.delete("/{company_id}/departments/{department_id}")
async def delete_department(company_id: int, department_id: int, body: DepartmentRemoveIn,
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await owned_department(db, company_id, department_id)
    destination = await owned_department(db, company_id, body.move_members_to_department_id) if body.move_members_to_department_id else None
    if destination and destination.id == row.id:
        raise HTTPException(400, "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0435 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435")
    if destination:
        # A destination inside the removed subtree would make a child its own parent.
        await validate_department_parent(db, company_id, row.id, destination.id)
    members = (await db.scalars(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.department_id == row.id))).all()
    children = (await db.scalars(select(CompanyDepartment).where(CompanyDepartment.company_id == company_id, CompanyDepartment.parent_department_id == row.id))).all()
    for member in members:
        member.department_id = destination.id if destination else None
    for child in children:
        child.parent_department_id = destination.id if destination else None
    await audit(db, actor, user.id, "DEPARTMENT_DELETED", "department", row.id,
                {"members_moved": len(members), "destination": destination.id if destination else None})
    await db.delete(row)
    await db.commit()
    return {"ok": True, "members_moved": len(members)}


def cohort_payload(row: CompanyCohort, members: list[int]) -> dict:
    return {"id": row.id, "title": row.title, "description": row.description, "members": members, "size": len(members),
            "leader_membership_id": row.leader_membership_id, "goal": row.goal, "focus_skills": as_json(row.focus_skills, []),
            "starts_at": row.starts_at.isoformat() if row.starts_at else None,
            "ends_at": row.ends_at.isoformat() if row.ends_at else None, "status": row.status}


def cohort_date(value: datetime | None):
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value and value.tzinfo else value


async def cohort_changes(db: AsyncSession, actor: CompanyMembership, changes: dict, row: CompanyCohort | None = None):
    if "title" in changes:
        title = (changes["title"] or "").strip()
        if len(title) < 2:
            raise HTTPException(400, "Укажите название команды")
        query = select(CompanyCohort.id).where(CompanyCohort.company_id == actor.company_id, CompanyCohort.title == title)
        if row:
            query = query.where(CompanyCohort.id != row.id)
        if await db.scalar(query):
            raise HTTPException(409, "Команда с таким названием уже существует")
        changes["title"] = title
    allowed = set(await visible_membership_ids(db, actor))
    leader_id = changes.get("leader_membership_id")
    if leader_id is not None:
        await validate_manager(db, actor.company_id, leader_id)
        if leader_id not in allowed:
            raise HTTPException(403, "Нет доступа к выбранному руководителю")
    for key in ("starts_at", "ends_at"):
        if key in changes:
            changes[key] = cohort_date(changes[key])
    starts = changes.get("starts_at", row.starts_at if row else None)
    ends = changes.get("ends_at", row.ends_at if row else None)
    if starts and ends and ends < starts:
        raise HTTPException(400, "Завершение команды не может быть раньше начала")
    if "focus_skills" in changes:
        skills = changes["focus_skills"]
        if skills is None or any(not item.strip() or len(item.strip()) > 80 for item in skills):
            raise HTTPException(400, "Укажите навыки длиной от 1 до 80 символов")
        changes["focus_skills"] = dumps(list(dict.fromkeys(item.strip() for item in skills)))
    if changes.get("status", "ACTIVE") is None:
        raise HTTPException(400, "Укажите состояние команды")
    return changes


async def managed_cohort(db: AsyncSession, actor: CompanyMembership, cohort_id: int):
    require_role(actor, MANAGE_TEAM)
    row = await db.get(CompanyCohort, cohort_id)
    if row is None or row.company_id != actor.company_id:
        raise HTTPException(404, "Команда не найдена")
    members = list((await db.scalars(select(CompanyCohortMember.membership_id).where(CompanyCohortMember.cohort_id == row.id))).all())
    allowed = set(await visible_membership_ids(db, actor))
    if actor.corporate_role not in MANAGE_ALL and (set(members) - allowed or (not members and row.created_by != actor.user_id and row.leader_membership_id != actor.id)):
        raise HTTPException(403, "Нет прав управлять этой командой")
    return row, members


@router.get("/{company_id}/cohorts")
async def cohorts(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyCohort).where(CompanyCohort.company_id == company_id, CompanyCohort.status == "ACTIVE").order_by(CompanyCohort.title))).all()
    allowed = set(await visible_membership_ids(db, member))
    result = []
    for row in rows:
        members = list((await db.scalars(select(CompanyCohortMember.membership_id).where(CompanyCohortMember.cohort_id == row.id))).all())
        if member.corporate_role not in MANAGE_TEAM:
            if member.id not in members:
                continue
        elif member.corporate_role not in MANAGE_ALL and (set(members) - allowed or (not members and row.created_by != user.id and row.leader_membership_id != member.id)):
            continue
        result.append(cohort_payload(row, members))
    return result


@router.post("/{company_id}/cohorts")
async def create_cohort(company_id: int, body: CohortIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, MANAGE_TEAM)
    allowed = set(await visible_membership_ids(db, actor))
    recipients = set(body.membership_ids)
    if recipients - allowed:
        raise HTTPException(403, "Выберите участников из доступной команды")
    values = body.model_dump(exclude={"membership_ids"})
    values = await cohort_changes(db, actor, values)
    row = CompanyCohort(company_id=company_id, created_by=user.id, **values)
    db.add(row)
    await db.flush()
    for membership_id in recipients:
        db.add(CompanyCohortMember(cohort_id=row.id, membership_id=membership_id))
    await audit(db, actor, user.id, "COHORT_CREATED", "cohort", row.id, {"members": len(recipients)})
    await db.commit()
    return cohort_payload(row, sorted(recipients))


@router.put("/{company_id}/cohorts/{cohort_id}")
async def update_cohort(company_id: int, cohort_id: int, body: CohortUpdateIn,
                        db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    row, members = await managed_cohort(db, actor, cohort_id)
    changes = await cohort_changes(db, actor, body.model_dump(exclude_unset=True), row)
    for key, value in changes.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    await audit(db, actor, user.id, "COHORT_UPDATED", "cohort", row.id, {"fields": list(changes)})
    await db.commit()
    return cohort_payload(row, members)


@router.put("/{company_id}/cohorts/{cohort_id}/members")
async def replace_cohort_members(company_id: int, cohort_id: int, body: CohortMembersIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    cohort, members = await managed_cohort(db, actor, cohort_id)
    allowed = set(await visible_membership_ids(db, actor))
    recipients = set(body.membership_ids)
    if recipients - allowed:
        raise HTTPException(403, "Выберите участников из доступной команды")
    existing = (await db.scalars(select(CompanyCohortMember).where(CompanyCohortMember.cohort_id == cohort_id))).all()
    for row in existing:
        await db.delete(row)
    await db.flush()
    for membership_id in recipients:
        db.add(CompanyCohortMember(cohort_id=cohort_id, membership_id=membership_id))
    await audit(db, actor, user.id, "COHORT_MEMBERS_UPDATED", "cohort", cohort_id, {"members": len(recipients)})
    await db.commit()
    return {"id": cohort_id, "members": sorted(recipients)}


@router.delete("/{company_id}/cohorts/{cohort_id}")
async def archive_cohort(company_id: int, cohort_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    row, members = await managed_cohort(db, actor, cohort_id)
    row.status = "ARCHIVED"
    await audit(db, actor, user.id, "COHORT_ARCHIVED", "cohort", cohort_id)
    await db.commit()
    return {"ok": True}


@router.get("/{company_id}/calendar")
async def company_calendar(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    allowed = set(await visible_membership_ids(db, member)) if member.corporate_role in MANAGE_TEAM else {member.id}
    events: list[dict] = []
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(CompanyAssignmentTarget.company_id == company_id, CompanyAssignmentTarget.membership_id.in_(allowed)))).all()
    for target in targets:
        assignment = await db.get(CompanyAssignment, target.assignment_id)
        if assignment and assignment.deadline:
            events.append({"id": f"assignment-{target.id}", "type": "ASSIGNMENT", "title": assignment.title, "date": assignment.deadline.isoformat(), "status": target.status, "target_id": target.id})
    bookings = (await db.scalars(select(CompanyRoomBooking).where(CompanyRoomBooking.company_id == company_id))).all()
    for booking in bookings:
        if {booking.host_membership_id, booking.guest_membership_id} & allowed:
            events.append({"id": f"room-{booking.id}", "type": "ONLINE_1X1", "title": booking.title, "date": booking.scheduled_at.isoformat(), "status": booking.status, "room_id": booking.room_id})
    certificates = (await db.scalars(select(CompanyCertificate).where(CompanyCertificate.company_id == company_id, CompanyCertificate.membership_id.in_(allowed), CompanyCertificate.expires_at.is_not(None)))).all()
    for certificate in certificates:
        events.append({"id": f"certificate-{certificate.id}", "type": "CERTIFICATE_EXPIRY", "title": certificate.title, "date": certificate.expires_at.isoformat(), "status": certificate.status})
    enrolments = (await db.scalars(select(CompanyProgramEnrollment).where(CompanyProgramEnrollment.company_id == company_id, CompanyProgramEnrollment.membership_id.in_(allowed)))).all()
    for enrolment in enrolments:
        events.append({"id": f"program-{enrolment.id}", "type": "PROGRAM", "title": "\u041d\u0430\u0447\u0430\u043b\u043e \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u044b", "date": enrolment.enrolled_at.isoformat(), "status": enrolment.status, "program_id": enrolment.program_id})
    return sorted(events, key=lambda event: event["date"])


@router.get("/{company_id}/notification-settings")
async def notification_settings(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    return {"settings": as_json(member.notification_settings, {})}


@router.put("/{company_id}/notification-settings")
async def update_notification_settings(company_id: int, body: NotificationSettingsIn,
                                       db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    allowed = {"assignment", "deadline", "result", "program", "room", "certificate", "email"}
    settings = {key: bool(value) for key, value in body.settings.items() if key in allowed}
    member.notification_settings = __import__("json").dumps(settings, ensure_ascii=False)
    await db.commit()
    return {"settings": settings}


class PersonalizationIn(BaseModel):
    enabled: bool


@router.put("/{company_id}/personalization")
async def update_personalization(company_id: int, body: PersonalizationIn,
                                  db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    member.personalization_enabled = int(body.enabled)
    await audit(db, member, user.id, "PERSONALIZATION_UPDATED", "membership", member.id, {"enabled": body.enabled})
    await db.commit()
    return {"enabled": bool(member.personalization_enabled)}
