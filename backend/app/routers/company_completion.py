"""Missing enterprise lifecycle workflows built on the current company APIs."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_admin, get_current_user, verify_password
from app.company_access import capabilities, require_capability, visible_membership_ids
from app.company_advanced_models import (
    CompanyActiveSession,
    CompanyLearningRecommendation,
    CompanyMembershipProfession,
    CompanyProfession,
    CompanyProgramProfession,
)
from app.company_completion_models import (
    CompanyCorporateIdentity,
    CompanyOwnershipTransfer,
    CompanyProductRequest,
    CompanyProfessionScenario,
    CompanyProfessionalProfile,
    CompanyScenarioSnapshot,
    CompanySpecialty,
)
from app.company_models import CompanyMembership, CompanyProgram, CompanyScenario
from app.company_scenario_engine import snapshot_from_company_scenario
from app.db import get_db
from app.deployment_security import rate_limit
from app.models import User
from app.services import dumps, loads

router = APIRouter(prefix="/company", tags=["company-enterprise-completion"])
admin_router = APIRouter(prefix="/admin/company", tags=["company-enterprise-completion-admin"])


def now() -> datetime:
    return datetime.now()


async def member_for(db: AsyncSession, user: User, company_id: int) -> CompanyMembership:
    from app.company_models import Company
    company = await db.get(Company, company_id)
    if company is None or company.status not in {"ACTIVE", "DEMO"}:
        raise HTTPException(404, "Компания недоступна")
    member = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.user_id == user.id,
        CompanyMembership.status == "ACTIVE",
    ))
    if member is None:
        raise HTTPException(403, "Нет активного доступа к компании")
    return member


class CorporateIdentityIn(BaseModel):
    organization_code: str = Field(min_length=4, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    email_domain: str | None = Field(default=None, max_length=190)
    require_verified_email: bool = True

    @field_validator("organization_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().casefold()

    @field_validator("email_domain")
    @classmethod
    def normalize_domain(cls, value: str | None) -> str | None:
        if not value:
            return None
        return value.strip().casefold().lstrip("@")


class CorporateLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=512)
    organization_code: str = Field(min_length=4, max_length=40)


@router.put("/{company_id}/corporate-identity")
async def configure_corporate_identity(company_id: int, body: CorporateIdentityIn,
                                       db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    require_capability(member, "manage_company")
    conflict = await db.scalar(select(CompanyCorporateIdentity).where(
        CompanyCorporateIdentity.organization_code == body.organization_code,
        CompanyCorporateIdentity.company_id != company_id,
    ))
    if conflict:
        raise HTTPException(409, "Код организации уже используется")
    row = await db.scalar(select(CompanyCorporateIdentity).where(CompanyCorporateIdentity.company_id == company_id))
    row = row or CompanyCorporateIdentity(company_id=company_id, organization_code=body.organization_code, updated_by=user.id)
    row.organization_code = body.organization_code
    row.email_domain = body.email_domain
    row.require_verified_email = int(body.require_verified_email)
    row.updated_by = user.id
    db.add(row)
    await db.commit()
    return {"company_id": company_id, "organization_code": row.organization_code,
            "email_domain": row.email_domain, "require_verified_email": bool(row.require_verified_email)}


@router.get("/{company_id}/corporate-identity")
async def corporate_identity(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    require_capability(member, "manage_company")
    row = await db.scalar(select(CompanyCorporateIdentity).where(CompanyCorporateIdentity.company_id == company_id))
    return {"configured": row is not None, "organization_code": row.organization_code if row else None,
            "email_domain": row.email_domain if row else None,
            "require_verified_email": bool(row.require_verified_email) if row else True}


@router.post("/auth/login")
async def corporate_login(body: CorporateLoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("company-login", request.client.host if request.client else "unknown", 15, 60)
    identity = await db.scalar(select(CompanyCorporateIdentity).where(
        CompanyCorporateIdentity.organization_code == body.organization_code.strip().casefold()))
    if identity is None:
        raise HTTPException(401, "Неверный код организации, логин или пароль")
    user = await db.scalar(select(User).where(
        (User.username == body.username.strip()) | (User.email == body.username.strip().casefold())))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный код организации, логин или пароль")
    member = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == identity.company_id,
        CompanyMembership.user_id == user.id,
        CompanyMembership.status == "ACTIVE",
    ))
    if member is None:
        raise HTTPException(403, "Корпоративный доступ не активирован")
    if identity.email_domain:
        email = (user.email or "").casefold()
        if not email.endswith(f"@{identity.email_domain}"):
            raise HTTPException(403, "Используйте рабочую почту организации")
        if identity.require_verified_email and not user.email_verified_at:
            raise HTTPException(403, "Сначала подтвердите рабочую почту")
    placeholder = secrets.token_urlsafe(32)
    session = CompanyActiveSession(
        company_id=identity.company_id,
        membership_id=member.id,
        token_hash=hashlib.sha256(placeholder.encode()).hexdigest(),
        user_agent=request.headers.get("user-agent", "")[:500],
        ip_hash=hashlib.sha256((request.client.host if request.client else "unknown").encode()).hexdigest(),
    )
    db.add(session)
    await db.flush()
    token = create_token(user.id, user.username, user.password_hash,
                         corporate_session_id=session.id, corporate_company_id=identity.company_id)
    session.token_hash = hashlib.sha256(token.encode()).hexdigest()
    await db.commit()
    return {"access_token": token, "token_type": "bearer", "username": user.username,
            "is_admin": bool(user.is_admin), "level": user.level, "stars": user.stars, "xp": user.xp,
            "company_id": identity.company_id, "corporate_session_id": session.id}


class OwnershipTransferIn(BaseModel):
    to_membership_id: int


class OwnershipConfirmIn(BaseModel):
    confirmation_code: str = Field(min_length=8, max_length=32)


@router.post("/{company_id}/ownership-transfers", status_code=201)
async def create_ownership_transfer(company_id: int, body: OwnershipTransferIn,
                                    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    if actor.corporate_role != "COMPANY_OWNER":
        raise HTTPException(403, "Передать компанию может только владелец")
    target = await db.get(CompanyMembership, body.to_membership_id)
    if target is None or target.company_id != company_id or target.status != "ACTIVE" or target.id == actor.id:
        raise HTTPException(404, "Получатель передачи не найден")
    pending = await db.scalars(select(CompanyOwnershipTransfer).where(
        CompanyOwnershipTransfer.company_id == company_id,
        CompanyOwnershipTransfer.confirmed_at.is_(None),
        CompanyOwnershipTransfer.cancelled_at.is_(None),
    ))
    for row in pending:
        row.cancelled_at = now()
    code = f"{secrets.randbelow(100_000_000):08d}"
    row = CompanyOwnershipTransfer(
        company_id=company_id, from_membership_id=actor.id, to_membership_id=target.id,
        confirmation_hash=hashlib.sha256(code.encode()).hexdigest(), expires_at=now() + timedelta(minutes=30),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "to_membership_id": target.id, "confirmation_code": code,
            "expires_at": row.expires_at.isoformat(), "requires_recipient_confirmation": True}


@router.post("/{company_id}/ownership-transfers/confirm")
async def confirm_ownership_transfer(company_id: int, body: OwnershipConfirmIn,
                                     db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    recipient = await member_for(db, user, company_id)
    digest = hashlib.sha256(body.confirmation_code.strip().encode()).hexdigest()
    row = await db.scalar(select(CompanyOwnershipTransfer).where(
        CompanyOwnershipTransfer.company_id == company_id,
        CompanyOwnershipTransfer.to_membership_id == recipient.id,
        CompanyOwnershipTransfer.confirmation_hash == digest,
        CompanyOwnershipTransfer.confirmed_at.is_(None),
        CompanyOwnershipTransfer.cancelled_at.is_(None),
        CompanyOwnershipTransfer.expires_at > now(),
    ))
    if row is None:
        raise HTTPException(404, "Запрос передачи не найден или срок кода истёк")
    previous = await db.get(CompanyMembership, row.from_membership_id)
    if previous is None or previous.status != "ACTIVE" or previous.corporate_role != "COMPANY_OWNER":
        raise HTTPException(409, "Владелец компании изменился; создайте новый запрос")
    previous.corporate_role = "COMPANY_ADMIN"
    recipient.corporate_role = "COMPANY_OWNER"
    row.confirmed_at = now()
    await db.commit()
    return {"ok": True, "company_id": company_id, "owner_membership_id": recipient.id}


class SpecialtyIn(BaseModel):
    profession_id: int
    code: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    catalog_version: str = Field(default="v1", max_length=40)


@router.get("/{company_id}/catalog/specialties")
async def list_specialties(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await member_for(db, user, company_id)
    rows = list((await db.scalars(select(CompanySpecialty).where(
        CompanySpecialty.company_id == company_id, CompanySpecialty.status == "ACTIVE").order_by(CompanySpecialty.title))).all())
    return [{"id": row.id, "profession_id": row.profession_id, "code": row.code, "title": row.title,
             "description": row.description, "catalog_version": row.catalog_version} for row in rows]


@router.post("/{company_id}/catalog/specialties", status_code=201)
async def create_specialty(company_id: int, body: SpecialtyIn,
                           db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    profession = await db.get(CompanyProfession, body.profession_id)
    if profession is None or profession.company_id != company_id:
        raise HTTPException(404, "Профессия не найдена")
    row = CompanySpecialty(company_id=company_id, profession_id=profession.id, code=body.code.strip().casefold(),
                           title=body.title.strip(), description=body.description, catalog_version=body.catalog_version,
                           created_by=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "profession_id": row.profession_id, "code": row.code, "title": row.title}


class ProfessionScenariosIn(BaseModel):
    scenario_ids: list[int] = Field(default_factory=list, max_length=200)


@router.put("/{company_id}/catalog/professions/{profession_id}/scenarios")
async def bind_profession_scenarios(company_id: int, profession_id: int, body: ProfessionScenariosIn,
                                    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    profession = await db.get(CompanyProfession, profession_id)
    if profession is None or profession.company_id != company_id:
        raise HTTPException(404, "Профессия не найдена")
    scenarios = list((await db.scalars(select(CompanyScenario).where(
        CompanyScenario.company_id == company_id, CompanyScenario.id.in_(set(body.scenario_ids))))).all()) if body.scenario_ids else []
    if len(scenarios) != len(set(body.scenario_ids)):
        raise HTTPException(422, "Один из сценариев не принадлежит компании")
    await db.execute(delete(CompanyProfessionScenario).where(CompanyProfessionScenario.profession_id == profession_id))
    db.add_all([CompanyProfessionScenario(company_id=company_id, profession_id=profession_id, scenario_id=row.id) for row in scenarios])
    await db.commit()
    return {"profession_id": profession_id, "scenario_ids": sorted(row.id for row in scenarios)}


class ProfessionalProfileIn(BaseModel):
    profession_id: int | None = None
    specialty_id: int | None = None
    professional_level: int = Field(default=1, ge=1, le=10)
    share_results: bool = False
    policy_version: str = Field(default="company-data-v1", max_length=40)


async def profile_payload(db: AsyncSession, member: CompanyMembership) -> dict:
    profile = await db.scalar(select(CompanyProfessionalProfile).where(CompanyProfessionalProfile.membership_id == member.id))
    profession = await db.get(CompanyProfession, member.profession_id) if member.profession_id else None
    specialty = await db.get(CompanySpecialty, profile.specialty_id) if profile and profile.specialty_id else None
    programs = []
    scenarios = []
    if profession:
        program_links = list((await db.scalars(select(CompanyProgramProfession).where(CompanyProgramProfession.profession_id == profession.id))).all())
        scenario_links = list((await db.scalars(select(CompanyProfessionScenario).where(CompanyProfessionScenario.profession_id == profession.id))).all())
        if program_links:
            programs = list((await db.scalars(select(CompanyProgram).where(CompanyProgram.id.in_([row.program_id for row in program_links])))).all())
        if scenario_links:
            scenarios = list((await db.scalars(select(CompanyScenario).where(CompanyScenario.id.in_([row.scenario_id for row in scenario_links])))).all())
    return {
        "membership_id": member.id, "job_title": member.job_title,
        "profession": {"id": profession.id, "title": profession.title, "catalog_version": profession.catalog_version} if profession else None,
        "specialty": {"id": specialty.id, "title": specialty.title, "code": specialty.code} if specialty else None,
        "professional_level": profile.professional_level if profile else 1,
        "level_verified": bool(profile and profile.level_verified_at),
        "level_verified_at": profile.level_verified_at.isoformat() if profile and profile.level_verified_at else None,
        "share_results": bool(profile and profile.share_results),
        "history_restored": bool(profile and profile.rehire_count),
        "recommendations": {
            "programs": [{"id": row.id, "title": row.title} for row in programs],
            "scenarios": [{"id": row.id, "title": row.title} for row in scenarios],
        },
    }


@router.get("/{company_id}/me/professional-profile")
async def my_professional_profile(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await profile_payload(db, await member_for(db, user, company_id))


@router.put("/{company_id}/me/professional-profile")
async def update_professional_profile(company_id: int, body: ProfessionalProfileIn,
                                      db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    profession = await db.get(CompanyProfession, body.profession_id) if body.profession_id else None
    if profession and profession.company_id != company_id:
        raise HTTPException(404, "Профессия не найдена")
    specialty = await db.get(CompanySpecialty, body.specialty_id) if body.specialty_id else None
    if specialty and (specialty.company_id != company_id or specialty.profession_id != body.profession_id):
        raise HTTPException(422, "Специальность не относится к выбранной профессии")
    profile = await db.scalar(select(CompanyProfessionalProfile).where(CompanyProfessionalProfile.membership_id == member.id))
    profile = profile or CompanyProfessionalProfile(company_id=company_id, membership_id=member.id)
    if profile.professional_level != body.professional_level or member.profession_id != body.profession_id:
        profile.level_verified_at = None
        profile.level_verified_by = None
    member.profession_id = body.profession_id
    profile.specialty_id = body.specialty_id
    profile.professional_level = body.professional_level
    profile.share_results = int(body.share_results)
    profile.policy_version = body.policy_version
    db.add(profile)
    if profession:
        link = await db.scalar(select(CompanyMembershipProfession).where(
            CompanyMembershipProfession.membership_id == member.id,
            CompanyMembershipProfession.profession_id == profession.id,
        ))
        link = link or CompanyMembershipProfession(company_id=company_id, membership_id=member.id, profession_id=profession.id)
        link.level = body.professional_level
        link.verified_at = None
        db.add(link)
    await db.commit()
    return await profile_payload(db, member)


class VerifyLevelIn(BaseModel):
    professional_level: int = Field(ge=1, le=10)


@router.post("/{company_id}/employees/{membership_id}/verify-professional-level")
async def verify_professional_level(company_id: int, membership_id: int, body: VerifyLevelIn,
                                    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_team")
    if membership_id not in await visible_membership_ids(db, actor):
        raise HTTPException(403, "Сотрудник вне области управления")
    target = await db.get(CompanyMembership, membership_id)
    if target is None or target.company_id != company_id:
        raise HTTPException(404, "Сотрудник не найден")
    profile = await db.scalar(select(CompanyProfessionalProfile).where(CompanyProfessionalProfile.membership_id == target.id))
    profile = profile or CompanyProfessionalProfile(company_id=company_id, membership_id=target.id)
    profile.professional_level = body.professional_level
    profile.level_verified_at = now()
    profile.level_verified_by = actor.id
    db.add(profile)
    if target.profession_id:
        link = await db.scalar(select(CompanyMembershipProfession).where(
            CompanyMembershipProfession.membership_id == target.id,
            CompanyMembershipProfession.profession_id == target.profession_id))
        if link:
            link.level = body.professional_level
            link.verified_at = profile.level_verified_at
    await db.commit()
    return {"membership_id": target.id, "professional_level": profile.professional_level,
            "verified_at": profile.level_verified_at.isoformat(), "verified_by": actor.id}


def scenario_snapshot(row: CompanyScenario) -> dict:
    return snapshot_from_company_scenario(row)


async def ensure_scenario_snapshot(db: AsyncSession, scenario: CompanyScenario, actor: CompanyMembership) -> CompanyScenarioSnapshot:
    row = await db.scalar(select(CompanyScenarioSnapshot).where(
        CompanyScenarioSnapshot.scenario_id == scenario.id,
        CompanyScenarioSnapshot.revision == scenario.revision,
    ))
    if row is None:
        row = CompanyScenarioSnapshot(company_id=scenario.company_id, scenario_id=scenario.id,
            revision=scenario.revision, snapshot=dumps(scenario_snapshot(scenario)), created_by_membership_id=actor.id)
        db.add(row)
        await db.flush()
    return row


@router.get("/{company_id}/scenario-reviews")
async def scenario_review_queue(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    from app.company_advanced_models import CompanyScenarioApproval
    rows = list((await db.scalars(select(CompanyScenarioApproval).where(
        CompanyScenarioApproval.company_id == company_id).order_by(CompanyScenarioApproval.created_at.desc()))).all())
    scenarios = {row.id: row for row in (await db.scalars(select(CompanyScenario).where(CompanyScenario.company_id == company_id))).all()}
    return [{"id": row.id, "scenario_id": row.scenario_id, "scenario_title": scenarios.get(row.scenario_id).title if scenarios.get(row.scenario_id) else "Удалённый сценарий",
             "version": row.version, "status": row.status, "reviewer_membership_id": row.reviewer_membership_id,
             "expert_membership_id": row.expert_membership_id, "comment": row.comment,
             "created_at": row.created_at.isoformat()} for row in rows]


@router.post("/{company_id}/scenarios/{scenario_id}/snapshot")
async def save_scenario_snapshot(company_id: int, scenario_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    scenario = await db.get(CompanyScenario, scenario_id)
    if scenario is None or scenario.company_id != company_id:
        raise HTTPException(404, "Сценарий не найден")
    row = await ensure_scenario_snapshot(db, scenario, actor)
    await db.commit()
    return {"id": row.id, "scenario_id": row.scenario_id, "revision": row.revision}


@router.get("/{company_id}/scenarios/{scenario_id}/snapshots")
async def scenario_snapshots(company_id: int, scenario_id: int,
                             db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    rows = list((await db.scalars(select(CompanyScenarioSnapshot).where(
        CompanyScenarioSnapshot.company_id == company_id,
        CompanyScenarioSnapshot.scenario_id == scenario_id,
    ).order_by(CompanyScenarioSnapshot.revision.desc()))).all())
    return [{"id": row.id, "scenario_id": row.scenario_id, "revision": row.revision,
             "created_at": row.created_at.isoformat()} for row in rows]


@router.get("/{company_id}/scenario-versions/compare")
async def compare_scenario_versions(company_id: int, left_id: int, right_id: int,
                                    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    left = await db.get(CompanyScenarioSnapshot, left_id)
    right = await db.get(CompanyScenarioSnapshot, right_id)
    if left is None or right is None or left.company_id != company_id or right.company_id != company_id:
        raise HTTPException(404, "Версия сценария не найдена")
    before, after = loads(left.snapshot, {}), loads(right.snapshot, {})
    keys = sorted(set(before) | set(after))
    return {"left": {"id": left.id, "scenario_id": left.scenario_id, "revision": left.revision, "snapshot": before},
            "right": {"id": right.id, "scenario_id": right.scenario_id, "revision": right.revision, "snapshot": after},
            "changed_fields": [key for key in keys if before.get(key) != after.get(key)]}


class ProductRequestIn(BaseModel):
    request_type: Literal["SCENARIO", "MODE", "INTEGRATION", "OTHER"]
    title: str = Field(min_length=2, max_length=220)
    description: str = Field(min_length=10, max_length=10000)
    materials: list[str] = Field(default_factory=list, max_length=20)


class ProductRequestStatusIn(BaseModel):
    status: Literal["SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "DONE", "DECLINED"]
    admin_note: str | None = Field(default=None, max_length=4000)


def product_request_payload(row: CompanyProductRequest) -> dict:
    return {"id": row.id, "company_id": row.company_id, "request_type": row.request_type,
            "title": row.title, "description": row.description, "materials": loads(row.materials, []),
            "status": row.status, "admin_note": row.admin_note, "created_at": row.created_at.isoformat()}


@router.get("/{company_id}/product-requests")
async def product_requests(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    query = select(CompanyProductRequest).where(CompanyProductRequest.company_id == company_id)
    if not capabilities(member).get("manage_learning") and not capabilities(member).get("manage_company"):
        query = query.where(CompanyProductRequest.requested_by_membership_id == member.id)
    rows = list((await db.scalars(query.order_by(CompanyProductRequest.created_at.desc()))).all())
    return [product_request_payload(row) for row in rows]


@router.post("/{company_id}/product-requests", status_code=201)
async def create_product_request(company_id: int, body: ProductRequestIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row = CompanyProductRequest(company_id=company_id, requested_by_membership_id=member.id,
        request_type=body.request_type, title=body.title.strip(), description=body.description.strip(), materials=dumps(body.materials))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return product_request_payload(row)


@router.patch("/{company_id}/product-requests/{request_id}")
async def update_product_request(company_id: int, request_id: int, body: ProductRequestStatusIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_capability(actor, "manage_learning")
    row = await db.get(CompanyProductRequest, request_id)
    if row is None or row.company_id != company_id:
        raise HTTPException(404, "Заявка не найдена")
    row.status = body.status
    row.admin_note = body.admin_note
    await db.commit()
    return product_request_payload(row)


@admin_router.get("/product-requests")
async def admin_product_requests(db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)):
    rows = list((await db.scalars(select(CompanyProductRequest).order_by(CompanyProductRequest.created_at.desc()).limit(500))).all())
    return [product_request_payload(row) for row in rows]


@admin_router.patch("/product-requests/{request_id}")
async def admin_update_product_request(request_id: int, body: ProductRequestStatusIn,
                                       db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)):
    row = await db.get(CompanyProductRequest, request_id)
    if row is None:
        raise HTTPException(404, "Заявка не найдена")
    row.status = body.status
    row.admin_note = body.admin_note
    await db.commit()
    return product_request_payload(row)
