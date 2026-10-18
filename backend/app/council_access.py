"""Council is a corporate feature; historical invitations do not grant access."""
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import Company, CompanyMembership
from app.db import get_db
from app.models import User


async def get_council_user(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.is_admin:
        return user
    member = await db.scalar(select(CompanyMembership.id).join(Company, Company.id == CompanyMembership.company_id).where(
        CompanyMembership.user_id == user.id, CompanyMembership.status == "ACTIVE", Company.status.in_(["ACTIVE", "DEMO"])).limit(1))
    if not member:
        raise HTTPException(403, "Совет решений доступен только действующим сотрудникам и владельцам компаний")
    return user
