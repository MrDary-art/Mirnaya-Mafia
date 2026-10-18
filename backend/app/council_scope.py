"""Corporate audience and deliberately limited director controls."""
import json
from fastapi import HTTPException
from sqlalchemy import select
from app.company_models import Company, CompanyMembership
from app.council_models import CouncilCompany


async def allocations(db, meeting):
    rows = list((await db.scalars(select(CouncilCompany).where(CouncilCompany.meeting_id == meeting.id))).all())
    return {r.company_id: r.seats for r in rows} or ({meeting.company_id: json.loads(meeting.configuration or "{}").get("capacity", 4)} if meeting.company_id else {})


async def memberships(db, user_id, company_ids, *, directors=False):
    query = select(CompanyMembership.company_id).join(Company, Company.id == CompanyMembership.company_id).where(
        CompanyMembership.user_id == user_id, CompanyMembership.status == "ACTIVE",
        CompanyMembership.company_id.in_(company_ids), Company.status.in_(["ACTIVE", "DEMO"]))
    if directors:
        query = query.where(CompanyMembership.corporate_role == "COMPANY_OWNER")
    return set((await db.scalars(query)).all())


async def represented_company(db, meeting, user_id, requested=None):
    limits = await allocations(db, meeting)
    if not limits:
        return None
    eligible = await memberships(db, user_id, limits)
    if requested is not None:
        eligible &= {requested}
    if len(eligible) != 1:
        raise HTTPException(422, "Выберите одну из компаний встречи, в которой состоит участник")
    return next(iter(eligible))


async def director_permissions(db, meeting, user):
    policy = json.loads(meeting.configuration or "{}").get("director_permissions", {})
    owned = await memberships(db, user.id, await allocations(db, meeting), directors=True)
    if not owned or policy.get("scope") not in {"own", "all"}:
        return {}
    return {"scope": policy["scope"], "company_ids": sorted(owned), **{key: bool(policy.get(key)) for key in ("muted", "camera_blocked", "kick")}}


def director_target_allowed(permissions, member, capability):
    return bool(permissions.get(capability) and (permissions.get("scope") == "all" or member.company_id in permissions.get("company_ids", [])))
