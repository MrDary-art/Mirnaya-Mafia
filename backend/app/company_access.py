"""Corporate role and hierarchy checks shared by the existing company API."""
import json
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.company_models import CompanyDepartment, CompanyMembership, CompanyCohort, CompanyCohortMember

ROLE_LABELS = {
    "COMPANY_OWNER": "Владелец компании", "COMPANY_ADMIN": "Администратор компании",
    "LND_MANAGER": "Менеджер обучения", "DEPARTMENT_MANAGER": "Руководитель подразделения",
    "TEAM_LEAD": "Руководитель команды", "MENTOR": "Наставник",
    "AUDITOR": "Аудитор", "EMPLOYEE": "Сотрудник",
}
MANAGE_ALL = {"COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER"}
MANAGE_TEAM = MANAGE_ALL | {"DEPARTMENT_MANAGER", "TEAM_LEAD"}
COMPANY_ADMINS = {"COMPANY_OWNER", "COMPANY_ADMIN"}

CAPABILITY_KEYS = {
    "manage_company", "manage_learning", "manage_team", "view_analytics",
    "manage_structure", "invite_members", "manage_assignments", "view_audit",
    "review_results", "comment_results",
}

ROLE_CAPABILITIES = {
    "MENTOR": {"manage_team": True, "view_analytics": True, "review_results": True,
               "comment_results": True, "manage_assignments": False, "scope": "TEAM"},
    "AUDITOR": {"view_analytics": True, "view_audit": True, "review_results": True,
                "comment_results": False, "scope": "COMPANY"},
}


def role_capabilities(role: str) -> dict:
    company_admin = role in COMPANY_ADMINS
    manager = role in MANAGE_TEAM
    scope = "COMPANY" if role in MANAGE_ALL else ("DEPARTMENT_SUBTREE" if role == "DEPARTMENT_MANAGER" else ("TEAM" if manager else "SELF"))
    result = {"manage_company": company_admin, "manage_learning": role in MANAGE_ALL,
            "manage_team": manager, "view_analytics": manager, "manage_structure": company_admin,
            "invite_members": company_admin, "manage_assignments": manager, "view_audit": company_admin,
            "review_results": manager, "comment_results": manager, "scope": scope}
    result.update(ROLE_CAPABILITIES.get(role, {}))
    return result


def capabilities(member: CompanyMembership) -> dict:
    result = role_capabilities(member.corporate_role)
    try:
        overrides = json.loads(member.capability_overrides or "{}")
    except (TypeError, ValueError):
        overrides = {}
    # Membership overrides may only remove permissions; grants must come from
    # the role matrix and therefore cannot bypass tenant/scope checks.
    for key, value in overrides.items():
        if key in CAPABILITY_KEYS and value is False:
            result[key] = False
    return result


def require_capability(member: CompanyMembership, capability: str) -> None:
    if not capabilities(member).get(capability, False):
        raise HTTPException(403, "Недостаточно корпоративных прав")


async def ensure_license_capacity(db: AsyncSession, company_id: int, incoming: int = 1) -> None:
    """Protect paid seats without blocking legacy tenants that predate subscriptions."""
    from app.company_models import CompanySubscription
    subscription = await db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    if subscription is None:
        return
    used = int(await db.scalar(select(func.count()).select_from(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.status.in_(("ACTIVE", "INVITED")),
    )) or 0)
    if used + incoming > subscription.licensed_seats:
        raise HTTPException(409, f"Недостаточно лицензий: занято {used} из {subscription.licensed_seats}")


async def owned_department(db: AsyncSession, company_id: int, department_id: int | None):
    if department_id is None:
        return None
    row = await db.get(CompanyDepartment, department_id)
    if row is None or row.company_id != company_id:
        raise HTTPException(400, "Подразделение не найдено в этой компании")
    return row


async def active_company_member(db: AsyncSession, company_id: int, membership_id: int | None):
    if membership_id is None:
        return None
    row = await db.get(CompanyMembership, membership_id)
    if row is None or row.company_id != company_id or row.status != "ACTIVE":
        raise HTTPException(400, "Выберите активного сотрудника этой компании")
    return row


async def validate_department_parent(db: AsyncSession, company_id: int, department_id: int | None, parent_id: int | None):
    seen = {department_id} if department_id is not None else set()
    while parent_id is not None:
        if parent_id in seen:
            raise HTTPException(400, "Подразделения не могут образовывать цикл")
        seen.add(parent_id)
        parent = await owned_department(db, company_id, parent_id)
        parent_id = parent.parent_department_id


async def validate_manager(db: AsyncSession, company_id: int, manager_id: int | None, member_id: int | None = None):
    manager = await active_company_member(db, company_id, manager_id)
    if manager is None:
        return
    if not capabilities(manager).get("manage_team"):
        raise HTTPException(400, "Руководителю нужна корпоративная роль управления")
    seen = {member_id} if member_id is not None else set()
    current = manager
    while current is not None:
        if current.id in seen:
            raise HTTPException(400, "Связи руководителей не могут образовывать цикл")
        seen.add(current.id)
        current = await active_company_member(db, company_id, current.manager_membership_id)


async def visible_membership_ids(db: AsyncSession, member: CompanyMembership) -> list[int]:
    members = list((await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == member.company_id, CompanyMembership.status == "ACTIVE"))).all())
    member_capabilities = capabilities(member)
    if member_capabilities["scope"] == "COMPANY":
        return [row.id for row in members]
    if member_capabilities["scope"] == "SELF":
        return [member.id]
    departments = list((await db.scalars(select(CompanyDepartment).where(CompanyDepartment.company_id == member.company_id))).all())
    managed = {row.id for row in departments if row.manager_membership_id == member.id}
    subtree = set(managed)
    if member_capabilities["scope"] == "DEPARTMENT_SUBTREE" and member.department_id:
        subtree.add(member.department_id)
    while True:
        expanded = subtree | {row.id for row in departments if row.parent_department_id in subtree}
        if expanded == subtree:
            break
        subtree = expanded
    # Keep legacy team-lead departments, while explicitly managed departments include descendants.
    department_ids = subtree | ({member.department_id} if member.department_id else set())
    visible = {member.id} | {row.id for row in members if row.department_id in department_ids and row.corporate_role not in MANAGE_ALL}
    while True:
        expanded = visible | {row.id for row in members if row.manager_membership_id in visible and row.corporate_role not in MANAGE_ALL}
        if expanded == visible:
            break
        visible = expanded
    cohort_ids = list((await db.scalars(select(CompanyCohort.id).where(
        CompanyCohort.company_id == member.company_id, CompanyCohort.status == "ACTIVE", CompanyCohort.leader_membership_id == member.id))).all())
    if cohort_ids:
        group_ids = set((await db.scalars(select(CompanyCohortMember.membership_id).where(CompanyCohortMember.cohort_id.in_(cohort_ids)))).all())
        visible.update(row.id for row in members if row.id in group_ids and row.corporate_role not in MANAGE_ALL)
    return sorted(visible)


def validate_role_grant(actor: CompanyMembership, role: str):
    if role not in ROLE_LABELS:
        raise HTTPException(400, "Неизвестная корпоративная роль")
    if role == "COMPANY_OWNER" and actor.corporate_role != "COMPANY_OWNER":
        raise HTTPException(403, "Только владелец может назначить другого владельца")


async def validate_owner_change(db: AsyncSession, actor: CompanyMembership, target: CompanyMembership, role: str, status: str):
    validate_role_grant(actor, role)
    if target.corporate_role != "COMPANY_OWNER":
        return
    if actor.corporate_role != "COMPANY_OWNER":
        raise HTTPException(403, "Только владелец может изменять членство владельца")
    if target.status == "ACTIVE" and (role != "COMPANY_OWNER" or status != "ACTIVE"):
        count = await db.scalar(select(func.count()).select_from(CompanyMembership).where(
            CompanyMembership.company_id == target.company_id, CompanyMembership.status == "ACTIVE", CompanyMembership.corporate_role == "COMPANY_OWNER"))
        if count <= 1:
            raise HTTPException(409, "В компании должен оставаться хотя бы один активный владелец")


async def ensure_manager_can_deactivate(db: AsyncSession, member: CompanyMembership):
    report = await db.scalar(select(CompanyMembership.id).where(CompanyMembership.company_id == member.company_id,
        CompanyMembership.status == "ACTIVE", CompanyMembership.manager_membership_id == member.id))
    department = await db.scalar(select(CompanyDepartment.id).where(CompanyDepartment.company_id == member.company_id,
        CompanyDepartment.manager_membership_id == member.id))
    cohort = await db.scalar(select(CompanyCohort.id).where(CompanyCohort.company_id == member.company_id,
        CompanyCohort.status == "ACTIVE", CompanyCohort.leader_membership_id == member.id))
    if report or department or cohort:
        raise HTTPException(409, "Сначала переназначьте подчинённых и управляемые команды")
