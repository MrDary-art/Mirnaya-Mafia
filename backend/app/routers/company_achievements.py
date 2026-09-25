"""Corporate achievements separate from personal Arena economy."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import CompanyAchievement, CompanyAchievementGrant, CompanyMembership
from app.db import get_db
from app.models import User
from app.routers.company import MANAGE_ALL, as_json, audit, require_membership, require_role

router = APIRouter(prefix="/company", tags=["company-achievements"])


class AchievementIn(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=2000)
    icon: str = Field(default="??", max_length=16)
    assignment_id: int | None = None
    min_score: int = Field(default=0, ge=0, le=100)
    min_trust: int = Field(default=0, ge=0, le=100)
    min_goal: int = Field(default=0, ge=0, le=100)
    min_control: int = Field(default=0, ge=0, le=100)
    min_eq: int = Field(default=0, ge=0, le=100)


@router.get("/{company_id}/achievements")
async def achievements(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    rows = (await db.scalars(select(CompanyAchievement).where(
        CompanyAchievement.company_id == company_id, CompanyAchievement.status == "ACTIVE").order_by(CompanyAchievement.created_at.desc()))).all()
    granted = set((await db.scalars(select(CompanyAchievementGrant.achievement_id).where(
        CompanyAchievementGrant.membership_id == member.id))).all())
    return [{"id": row.id, "title": row.title, "description": row.description, "icon": row.icon,
             "conditions": as_json(row.conditions, {}), "earned": row.id in granted} for row in rows]


@router.post("/{company_id}/achievements")
async def create_achievement(company_id: int, body: AchievementIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await require_membership(db, user, company_id)
    require_role(member, MANAGE_ALL)
    conditions = {key: value for key, value in body.model_dump().items() if key.startswith("min_") or key == "assignment_id"}
    row = CompanyAchievement(company_id=company_id, title=body.title.strip(), description=body.description.strip() or None,
                             icon=body.icon, conditions=__import__("json").dumps(conditions), created_by=user.id)
    db.add(row)
    await db.flush()
    await audit(db, member, user.id, "ACHIEVEMENT_CREATED", "achievement", row.id, {"conditions": conditions})
    await db.commit()
    return {"id": row.id, "title": row.title}
