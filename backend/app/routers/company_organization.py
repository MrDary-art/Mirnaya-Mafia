"""Organization, cohorts, calendar and member notification preferences."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import (
    CompanyCertificate, CompanyCohort, CompanyCohortMember, CompanyCompetition,
    CompanyDepartment, CompanyMembership, CompanyProgramEnrollment, CompanyRoomBooking,
    CompanyAssignment, CompanyAssignmentTarget,
)
from app.db import get_db
from app.models import User
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


async def owned_department(db: AsyncSession, company_id: int, department_id: int | None, message: str = "\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e") -> CompanyDepartment | None:
    if department_id is None:
        return None
    row = await db.get(CompanyDepartment, department_id)
    if not row or row.company_id != company_id:
        raise HTTPException(400, message)
    return row


@router.put("/{company_id}/departments/{department_id}")
async def update_department(company_id: int, department_id: int, body: DepartmentUpdateIn,
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await owned_department(db, company_id, department_id)
    if body.parent_department_id == department_id:
        raise HTTPException(400, "\u041e\u0442\u0434\u0435\u043b \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u0441\u0432\u043e\u0438\u043c \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u043c")
    if body.parent_department_id is not None:
        await owned_department(db, company_id, body.parent_department_id)
    if body.manager_membership_id is not None:
        manager = await db.get(CompanyMembership, body.manager_membership_id)
        if not manager or manager.company_id != company_id or manager.status != "ACTIVE":
            raise HTTPException(400, "\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u043c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u043c")
    before = department_payload(row)
    for key, value in body.model_dump(exclude_none=True).items():
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
    members = (await db.scalars(select(CompanyMembership).where(CompanyMembership.department_id == row.id))).all()
    children = (await db.scalars(select(CompanyDepartment).where(CompanyDepartment.parent_department_id == row.id))).all()
    for member in members:
        member.department_id = destination.id if destination else None
    for child in children:
        child.parent_department_id = destination.id if destination else None
    await audit(db, actor, user.id, "DEPARTMENT_DELETED", "department", row.id,
                {"members_moved": len(members), "destination": destination.id if destination else None})
    await db.delete(row)
    await db.commit()
    return {"ok": True, "members_moved": len(members)}


@router.get("/{company_id}/cohorts")
async def cohorts(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyCohort).where(CompanyCohort.company_id == company_id, CompanyCohort.status == "ACTIVE").order_by(CompanyCohort.title))).all()
    result = []
    for row in rows:
        members = (await db.scalars(select(CompanyCohortMember.membership_id).where(CompanyCohortMember.cohort_id == row.id))).all()
        if member.corporate_role not in MANAGE_TEAM and member.id not in members:
            continue
        result.append({"id": row.id, "title": row.title, "description": row.description, "members": members, "size": len(members)})
    return result


@router.post("/{company_id}/cohorts")
async def create_cohort(company_id: int, body: CohortIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, MANAGE_ALL)
    allowed = set(await visible_membership_ids(db, actor))
    recipients = allowed & set(body.membership_ids)
    row = CompanyCohort(company_id=company_id, title=body.title.strip(), description=body.description.strip() or None, created_by=user.id)
    db.add(row)
    await db.flush()
    for membership_id in recipients:
        db.add(CompanyCohortMember(cohort_id=row.id, membership_id=membership_id))
    await audit(db, actor, user.id, "COHORT_CREATED", "cohort", row.id, {"members": len(recipients)})
    await db.commit()
    return {"id": row.id, "title": row.title, "members": sorted(recipients)}


@router.put("/{company_id}/cohorts/{cohort_id}/members")
async def replace_cohort_members(company_id: int, cohort_id: int, body: CohortMembersIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, MANAGE_ALL)
    cohort = await db.get(CompanyCohort, cohort_id)
    if not cohort or cohort.company_id != company_id:
        raise HTTPException(404, "\u0413\u0440\u0443\u043f\u043f\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430")
    allowed = set(await visible_membership_ids(db, actor))
    recipients = allowed & set(body.membership_ids)
    if not recipients:
        raise HTTPException(400, "\u0412 \u0433\u0440\u0443\u043f\u043f\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u0438\u043d \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a")
    existing = (await db.scalars(select(CompanyCohortMember).where(CompanyCohortMember.cohort_id == cohort_id))).all()
    for row in existing:
        await db.delete(row)
    for membership_id in recipients:
        db.add(CompanyCohortMember(cohort_id=cohort_id, membership_id=membership_id))
    await audit(db, actor, user.id, "COHORT_MEMBERS_UPDATED", "cohort", cohort_id, {"members": len(recipients)})
    await db.commit()
    return {"id": cohort_id, "members": sorted(recipients)}


@router.delete("/{company_id}/cohorts/{cohort_id}")
async def archive_cohort(company_id: int, cohort_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    require_role(actor, MANAGE_ALL)
    row = await db.get(CompanyCohort, cohort_id)
    if not row or row.company_id != company_id:
        raise HTTPException(404, "\u0413\u0440\u0443\u043f\u043f\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430")
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
