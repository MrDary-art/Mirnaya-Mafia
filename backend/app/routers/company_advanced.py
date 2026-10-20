"""Advanced, privacy-sensitive company workflows.

This router is deliberately separate from the legacy company router.  It gives
the new workflows one policy boundary and keeps employee-owned data private by
default.  All reads start with an active membership in the requested tenant.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, get_current_user, hash_password
from app.company_access import ROLE_LABELS, capabilities
from app.company_models import (
    Company, CompanyAssignmentAttempt, CompanyDepartment, CompanyIntegration, CompanyLeague,
    CompanyLeagueEntry, CompanyMembership, CompanyProgram, CompanyScenario, CompanySubscription,
)
from app.company_advanced_models import (
    CompanyActiveSession, CompanyAnalyticsMethod, CompanyArchiveConsent,
    CompanyArchiveGrant, CompanyArchiveRecord, CompanyCareerStep, CompanyCareerTrack,
    CompanyCompetency, CompanyCustomRole, CompanyIntegrationJob, CompanyIntegrationRequest,
    CompanyBillingEvent, CompanyBillingInvoice, CompanyLeagueConsent,
    CompanyLearningRecommendation, CompanyMembershipProfession, CompanyModePolicy, CompanyModeUsage,
    CompanyMultiPartyParticipant, CompanyMultiPartyReport, CompanyMultiPartySession,
    CompanyMultiPartyTurn, CompanyOnboarding, CompanyProfession, CompanyProfessionCompetency,
    CompanyProgramProfession, CompanyScenarioApproval, CompanyScenarioRequest,
    CompanySkillGap, CompanyTwinProfile, CompanyTwinSource, CompanyTwinTrainingUse,
    CompanyChat, CompanyChatMember, CompanyChatMessage, CompanyChatReaction, CompanyChatTask,
    CompanySsoIdentity,
)
from app.db import get_db
from app.config import settings
from app.models import User
from app.services import dumps, loads

router = APIRouter(prefix="/company", tags=["company-advanced"])
admin_router = APIRouter(prefix="/admin/company", tags=["company-admin-advanced"])

POLICY_VERSION = "company-privacy-v1"
ARCHIVE_SCOPES = {"METRICS_ONLY", "METRICS_AND_REPORT", "FULL_TRANSCRIPT"}
TWIN_SOURCES = {"TRAINING_RESULTS", "CORPORATE_ARCHIVE", "CORPORATE_FEEDBACK"}
MODES = {"SCENARIOS", "AI", "VOICE", "VIDEO", "SERIALS", "MULTIPARTY"}
MODE_FEATURES = {"AI": "ai", "VOICE": "voice", "VIDEO": "video", "MULTIPARTY": "multipart", "SERIALS": "programs", "SCENARIOS": "assignments"}


def _json(value, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def _now() -> datetime:
    return datetime.now()


async def member_for(db: AsyncSession, user: User, company_id: int, *, active: bool = True) -> CompanyMembership:
    query = select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.user_id == user.id)
    if active:
        query = query.where(CompanyMembership.status == "ACTIVE")
    member = await db.scalar(query.order_by(CompanyMembership.id.desc()))
    company = await db.get(Company, company_id)
    if member is None or company is None or company.status not in {"ACTIVE", "DEMO"}:
        raise HTTPException(403, "Нет подтверждённого доступа к компании")
    return member


def require_action(member: CompanyMembership, action: str, *, manager: bool = False) -> None:
    perms = capabilities(member)
    if manager and not (perms.get("manage_company") or perms.get("manage_learning") or perms.get("manage_team")):
        raise HTTPException(403, "Недостаточно корпоративных прав")
    if action and not perms.get(action, False) and not perms.get("manage_company", False):
        raise HTTPException(403, "Недостаточно корпоративных прав")


def record_payload(row: CompanyArchiveRecord, *, include_data: bool = False) -> dict:
    result = {
        "id": row.id, "company_id": row.company_id, "owner_membership_id": row.owner_membership_id,
        "session_id": row.session_id, "title": row.title, "record_type": row.record_type,
        "data_scope": row.data_scope, "methodology_version": row.methodology_version,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
    if include_data:
        result["data"] = _json(row.payload, {})
    return result


async def archive_access(db: AsyncSession, member: CompanyMembership, archive_id: int, *, write: bool = False):
    row = await db.get(CompanyArchiveRecord, archive_id)
    if row is None or row.company_id != member.company_id or row.deleted_at:
        raise HTTPException(404, "Запись архива не найдена")
    if row.owner_membership_id == member.id:
        return row, None
    grant = await db.scalar(select(CompanyArchiveGrant).where(
        CompanyArchiveGrant.archive_id == row.id,
        CompanyArchiveGrant.grantee_membership_id == member.id,
        CompanyArchiveGrant.revoked_at.is_(None),
    ).order_by(CompanyArchiveGrant.granted_at.desc()))
    if grant is None or (grant.expires_at and grant.expires_at <= _now()):
        raise HTTPException(403, "Сотрудник не выдал доступ к этой записи")
    if write:
        grant.last_viewed_at = _now()
    return row, grant


class ArchiveCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    record_type: str = Field(default="NEGOTIATION", max_length=40)
    data_scope: str = Field(default="METRICS_AND_REPORT", max_length=80)
    payload: dict = Field(default_factory=dict)
    session_id: int | None = None
    methodology_version: str = Field(default="arena-v1", max_length=40)


class ArchiveGrantIn(BaseModel):
    grantee_membership_id: int
    data_scope: Literal["METRICS_ONLY", "METRICS_AND_REPORT", "FULL_TRANSCRIPT"]
    purpose: str = Field(min_length=4, max_length=500)
    duration_days: int | None = Field(default=30, ge=1, le=3650)
    confirm_preview: bool


class ArchiveTransferIn(BaseModel):
    target_membership_id: int
    confirm: bool
    reason: str = Field(min_length=4, max_length=500)


@router.get("/{company_id}/archive")
async def list_archive(company_id: int, include_shared: bool = True, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    own = (await db.scalars(select(CompanyArchiveRecord).where(
        CompanyArchiveRecord.company_id == company_id, CompanyArchiveRecord.owner_membership_id == member.id,
        CompanyArchiveRecord.deleted_at.is_(None)).order_by(CompanyArchiveRecord.created_at.desc()))).all()
    result = [record_payload(row) | {"access": "owner"} for row in own]
    if include_shared:
        shared = (await db.scalars(select(CompanyArchiveRecord).join(CompanyArchiveGrant, CompanyArchiveGrant.archive_id == CompanyArchiveRecord.id).where(
            CompanyArchiveRecord.company_id == company_id, CompanyArchiveGrant.grantee_membership_id == member.id,
            CompanyArchiveGrant.revoked_at.is_(None), CompanyArchiveRecord.deleted_at.is_(None),
            (CompanyArchiveGrant.expires_at.is_(None) | (CompanyArchiveGrant.expires_at > _now()))))).all()
        result.extend(record_payload(row) | {"access": "granted"} for row in shared if row.owner_membership_id != member.id)
    return {"policy_version": POLICY_VERSION, "items": result, "manager_access_requires_consent": True}


@router.post("/{company_id}/archive", status_code=201)
async def create_archive(company_id: int, body: ArchiveCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    if body.data_scope not in ARCHIVE_SCOPES:
        raise HTTPException(422, "Неизвестный объём архивной записи")
    row = CompanyArchiveRecord(company_id=company_id, owner_membership_id=member.id, session_id=body.session_id,
        title=body.title.strip(), record_type=body.record_type.strip().upper(), data_scope=body.data_scope,
        payload=dumps(body.payload), methodology_version=body.methodology_version)
    db.add(row); await db.commit(); await db.refresh(row)
    return record_payload(row, include_data=True)


@router.get("/{company_id}/archive/{archive_id}")
async def get_archive(company_id: int, archive_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row, grant = await archive_access(db, member, archive_id, write=True)
    if grant:
        db.add(CompanyArchiveConsent(company_id=company_id, archive_id=row.id, grant_id=grant.id,
            actor_membership_id=member.id, action="VIEW", data_scope=grant.data_scope,
            policy_version=grant.policy_version, details=dumps({"purpose": grant.purpose})))
        await db.commit()
    data = _json(row.payload, {})
    if grant and grant.data_scope == "METRICS_ONLY":
        data = {key: value for key, value in data.items() if key in {"metrics", "score", "methodology_version"}}
    elif grant and grant.data_scope == "METRICS_AND_REPORT":
        data = {key: value for key, value in data.items() if key not in {"transcript", "messages", "raw_text"}}
    return record_payload(row) | {"data": data, "access": "owner" if grant is None else "granted", "grant_id": grant.id if grant else None}


@router.post("/{company_id}/archive/{archive_id}/grants", status_code=201)
async def grant_archive(company_id: int, archive_id: int, body: ArchiveGrantIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    owner = await member_for(db, user, company_id)
    row, grant = await archive_access(db, owner, archive_id)
    if grant is not None or row.owner_membership_id != owner.id:
        raise HTTPException(403, "Только владелец записи может выдать доступ")
    if not body.confirm_preview:
        raise HTTPException(422, "Сначала подтвердите список данных, которые увидит компания")
    target = await db.get(CompanyMembership, body.grantee_membership_id)
    if target is None or target.company_id != company_id or target.status != "ACTIVE":
        raise HTTPException(404, "Получатель доступа не найден")
    previous = await db.scalar(select(CompanyArchiveGrant).where(
        CompanyArchiveGrant.archive_id == archive_id, CompanyArchiveGrant.grantee_membership_id == target.id,
        CompanyArchiveGrant.revoked_at.is_(None)))
    if previous:
        raise HTTPException(409, "Доступ уже выдан; сначала отзовите прежнее согласие")
    expires = _now() + timedelta(days=body.duration_days) if body.duration_days else None
    created = CompanyArchiveGrant(company_id=company_id, archive_id=archive_id, owner_membership_id=owner.id,
        grantee_membership_id=target.id, data_scope=body.data_scope, purpose=body.purpose.strip(),
        policy_version=POLICY_VERSION, expires_at=expires)
    db.add(created); await db.flush()
    db.add(CompanyArchiveConsent(company_id=company_id, archive_id=archive_id, grant_id=created.id,
        actor_membership_id=owner.id, action="GRANT", data_scope=body.data_scope,
        policy_version=POLICY_VERSION, details=dumps({"purpose": body.purpose, "expires_at": expires.isoformat() if expires else None})))
    await db.commit(); await db.refresh(created)
    return {"id": created.id, "archive_id": archive_id, "data_scope": created.data_scope, "purpose": created.purpose,
            "expires_at": created.expires_at.isoformat() if created.expires_at else None, "policy_version": POLICY_VERSION}


@router.get("/{company_id}/archive/{archive_id}/preview")
async def archive_preview(company_id: int, archive_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row, grant = await archive_access(db, member, archive_id)
    return {"archive_id": row.id, "title": row.title, "policy_version": POLICY_VERSION,
            "available_scopes": sorted(ARCHIVE_SCOPES), "owner": row.owner_membership_id == member.id,
            "visible_fields": {"METRICS_ONLY": ["metrics", "score", "methodology_version"],
                               "METRICS_AND_REPORT": ["metrics", "score", "report", "methodology_version"],
                               "FULL_TRANSCRIPT": ["metrics", "score", "report", "transcript", "messages", "methodology_version"]},
            "active_grant": {"id": grant.id, "scope": grant.data_scope, "expires_at": grant.expires_at.isoformat() if grant and grant.expires_at else None} if grant else None}


@router.post("/{company_id}/archive/{archive_id}/grants/{grant_id}/revoke")
async def revoke_archive(company_id: int, archive_id: int, grant_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    owner = await member_for(db, user, company_id)
    row, _ = await archive_access(db, owner, archive_id)
    grant = await db.get(CompanyArchiveGrant, grant_id)
    if row.owner_membership_id != owner.id or grant is None or grant.archive_id != row.id or grant.revoked_at:
        raise HTTPException(404, "Активное согласие не найдено")
    grant.revoked_at = _now()
    db.add(CompanyArchiveConsent(company_id=company_id, archive_id=row.id, grant_id=grant.id,
        actor_membership_id=owner.id, action="REVOKE", data_scope=grant.data_scope,
        policy_version=grant.policy_version, details=dumps({})))
    await db.commit()
    return {"ok": True, "revoked_at": grant.revoked_at.isoformat()}


@router.delete("/{company_id}/archive/{archive_id}")
async def delete_archive(company_id: int, archive_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    owner = await member_for(db, user, company_id)
    row, _ = await archive_access(db, owner, archive_id)
    if row.owner_membership_id != owner.id:
        raise HTTPException(403, "Только владелец записи может удалить её")
    row.deleted_at = _now()
    db.add(CompanyArchiveConsent(company_id=company_id, archive_id=row.id, actor_membership_id=owner.id, action="DELETE", data_scope=row.data_scope, policy_version=POLICY_VERSION, details=dumps({"reason": "owner_request"})))
    await db.commit()
    return {"ok": True, "deleted_at": row.deleted_at.isoformat(), "retention": "soft_deleted"}


@router.post("/{company_id}/archive/{archive_id}/transfer")
async def transfer_archive(company_id: int, archive_id: int, body: ArchiveTransferIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    owner = await member_for(db, user, company_id); row, _ = await archive_access(db, owner, archive_id)
    if row.owner_membership_id != owner.id: raise HTTPException(403, "Передать запись может только её владелец")
    if not body.confirm: raise HTTPException(422, "Подтвердите передачу права владения отдельным действием")
    target = await db.get(CompanyMembership, body.target_membership_id)
    if target is None or target.company_id != company_id or target.status != "ACTIVE": raise HTTPException(404, "Получатель не найден")
    previous = row.owner_membership_id; row.owner_membership_id = target.id
    db.add(CompanyArchiveConsent(company_id=company_id, archive_id=row.id, actor_membership_id=owner.id, action="TRANSFER", data_scope=row.data_scope, policy_version=POLICY_VERSION, details=dumps({"from_membership_id": previous, "to_membership_id": target.id, "reason": body.reason.strip()})))
    await db.commit(); return {"ok": True, "archive_id": row.id, "owner_membership_id": row.owner_membership_id, "policy_version": POLICY_VERSION}


class ChatCreateIn(BaseModel):
    kind: Literal["DIRECT", "GROUP", "TEAM"] = "GROUP"
    title: str = Field(default="", max_length=220)
    membership_ids: list[int] = Field(default_factory=list, max_length=100)


class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    attachments: list[dict] = Field(default_factory=list, max_length=10)


class ChatMembersIn(BaseModel):
    membership_ids: list[int] = Field(min_length=1, max_length=100)


class ChatReactionIn(BaseModel):
    reaction: str = Field(min_length=1, max_length=32)
    active: bool = True


class ChatTaskIn(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    assignee_membership_id: int | None = None
    due_at: datetime | None = None


async def chat_access(db: AsyncSession, member: CompanyMembership, chat_id: int):
    chat = await db.get(CompanyChat, chat_id)
    if chat is None or chat.company_id != member.company_id or chat.archived_at:
        raise HTTPException(404, "Корпоративный чат не найден")
    chat_member = await db.scalar(select(CompanyChatMember).where(CompanyChatMember.chat_id == chat.id, CompanyChatMember.membership_id == member.id, CompanyChatMember.left_at.is_(None)))
    if chat_member is None:
        raise HTTPException(403, "У вас нет доступа к этому чату")
    return chat, chat_member


@router.get("/{company_id}/messenger/directory")
async def messenger_directory(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Company-only contact directory available to every active member."""
    actor = await member_for(db, user, company_id)
    rows = (await db.execute(select(CompanyMembership, User, CompanyDepartment, CompanyProfession).join(
        User, User.id == CompanyMembership.user_id
    ).outerjoin(
        CompanyDepartment, CompanyDepartment.id == CompanyMembership.department_id
    ).outerjoin(
        CompanyProfession, CompanyProfession.id == CompanyMembership.profession_id
    ).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.status == "ACTIVE",
    ).order_by(User.display_name, User.username))).all()
    return [{
        "membership_id": member.id,
        "name": person.display_name or person.username,
        "username": person.username,
        "job_title": member.job_title,
        "department": department.name if department else None,
        "role": member.corporate_role,
        "role_label": ROLE_LABELS.get(member.corporate_role, member.corporate_role),
        "profession": profession.title if profession else None,
        "specialization": person.specialization,
        "manager_membership_id": member.manager_membership_id,
        "is_direct_report": member.manager_membership_id == actor.id,
    } for member, person, department, profession in rows if member.id != actor.id]


@router.post("/{company_id}/messenger/chats", status_code=201)
async def create_chat(company_id: int, body: ChatCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    ids = list(dict.fromkeys([actor.id, *body.membership_ids]))
    if body.kind == "DIRECT" and len(ids) != 2:
        raise HTTPException(422, "Личный корпоративный чат должен содержать ровно двух участников")
    if body.kind != "DIRECT" and len(ids) < 2:
        raise HTTPException(422, "В групповой чат нужно добавить минимум двух участников")
    members = list((await db.scalars(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.id.in_(ids), CompanyMembership.status == "ACTIVE"))).all())
    if len(members) != len(ids): raise HTTPException(404, "Один из участников недоступен")
    if body.kind == "DIRECT":
        existing = await db.scalar(select(CompanyChat).join(CompanyChatMember, CompanyChatMember.chat_id == CompanyChat.id).where(CompanyChat.company_id == company_id, CompanyChat.kind == "DIRECT", CompanyChatMember.membership_id == ids[0]))
        if existing:
            second = await db.scalar(select(CompanyChatMember).where(CompanyChatMember.chat_id == existing.id, CompanyChatMember.membership_id == ids[1], CompanyChatMember.left_at.is_(None)))
            if second: return {"id": existing.id, "kind": existing.kind, "title": existing.title, "reused": True}
    chat = CompanyChat(company_id=company_id, kind=body.kind, title=body.title.strip() or None, created_by_membership_id=actor.id)
    db.add(chat); await db.flush()
    for membership_id in ids:
        db.add(CompanyChatMember(company_id=company_id, chat_id=chat.id, membership_id=membership_id, role="OWNER" if membership_id == actor.id else "MEMBER"))
    await db.commit(); await db.refresh(chat)
    return {"id": chat.id, "kind": chat.kind, "title": chat.title, "member_count": len(ids), "reused": False}


@router.get("/{company_id}/messenger/chats")
async def list_chats(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    memberships = list((await db.scalars(select(CompanyChatMember).where(CompanyChatMember.company_id == company_id, CompanyChatMember.membership_id == member.id, CompanyChatMember.left_at.is_(None)))).all())
    result = []
    for chat_member in memberships:
        chat = await db.get(CompanyChat, chat_member.chat_id)
        if not chat or chat.archived_at: continue
        unread_query = select(func.count(CompanyChatMessage.id)).where(CompanyChatMessage.chat_id == chat.id, CompanyChatMessage.deleted_at.is_(None), CompanyChatMessage.author_membership_id != member.id)
        if chat_member.last_read_at: unread_query = unread_query.where(CompanyChatMessage.created_at > chat_member.last_read_at)
        unread = int(await db.scalar(unread_query) or 0)
        last = await db.scalar(select(CompanyChatMessage).where(CompanyChatMessage.chat_id == chat.id, CompanyChatMessage.deleted_at.is_(None)).order_by(CompanyChatMessage.created_at.desc()).limit(1))
        participant_rows = list((await db.scalars(select(CompanyChatMember).where(
            CompanyChatMember.chat_id == chat.id, CompanyChatMember.left_at.is_(None)
        ))).all())
        participants = []
        for participant_row in participant_rows:
            participant = await db.get(CompanyMembership, participant_row.membership_id)
            person = await db.get(User, participant.user_id) if participant else None
            if participant and person:
                participants.append({"membership_id": participant.id, "name": person.display_name or person.username,
                                     "username": person.username, "role": participant_row.role})
        peer = next((item for item in participants if item["membership_id"] != member.id), None)
        title = chat.title or (peer["name"] if chat.kind == "DIRECT" and peer else "Командный чат")
        result.append({"id": chat.id, "kind": chat.kind, "title": title, "unread": unread,
                       "member_count": len(participants), "participants": participants,
                       "last_message": {"text": last.text, "created_at": last.created_at.isoformat()} if last else None})
    return result


@router.get("/{company_id}/messenger/chats/{chat_id}/messages")
async def chat_messages(company_id: int, chat_id: int, limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); chat, chat_member = await chat_access(db, member, chat_id)
    rows = list((await db.scalars(select(CompanyChatMessage).where(CompanyChatMessage.chat_id == chat.id, CompanyChatMessage.deleted_at.is_(None)).order_by(CompanyChatMessage.created_at.desc()).limit(limit))).all())
    rows.reverse()
    return {"chat": {"id": chat.id, "kind": chat.kind, "title": chat.title}, "messages": [{"id": row.id, "author_membership_id": row.author_membership_id, "text": row.text, "attachments": _json(row.attachments, []), "created_at": row.created_at.isoformat()} for row in rows]}


@router.post("/{company_id}/messenger/chats/{chat_id}/messages", status_code=201)
async def send_chat_message(company_id: int, chat_id: int, body: ChatMessageIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); chat, _ = await chat_access(db, member, chat_id)
    row = CompanyChatMessage(company_id=company_id, chat_id=chat.id, author_membership_id=member.id, text=body.text.strip(), attachments=dumps(body.attachments))
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "chat_id": chat.id, "author_membership_id": member.id, "text": row.text, "attachments": body.attachments, "created_at": row.created_at.isoformat()}


@router.post("/{company_id}/messenger/chats/{chat_id}/read")
async def mark_chat_read(company_id: int, chat_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); _, chat_member = await chat_access(db, member, chat_id); chat_member.last_read_at = _now(); await db.commit()
    return {"ok": True, "read_at": chat_member.last_read_at.isoformat()}


@router.post("/{company_id}/messenger/chats/{chat_id}/members")
async def add_chat_members(company_id: int, chat_id: int, body: ChatMembersIn,
                           db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    chat, actor_row = await chat_access(db, actor, chat_id)
    if chat.kind == "DIRECT":
        raise HTTPException(409, "В личный чат нельзя добавлять участников")
    if actor_row.role != "OWNER" and not capabilities(actor).get("manage_team") and not capabilities(actor).get("manage_company"):
        raise HTTPException(403, "Добавлять участников может создатель чата или руководитель")
    ids = list(dict.fromkeys(body.membership_ids))
    members = list((await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.id.in_(ids),
        CompanyMembership.status == "ACTIVE",
    ))).all())
    if len(members) != len(ids):
        raise HTTPException(404, "Один из участников недоступен")
    added = []
    for membership_id in ids:
        row = await db.scalar(select(CompanyChatMember).where(
            CompanyChatMember.chat_id == chat.id,
            CompanyChatMember.membership_id == membership_id,
        ))
        if row and row.left_at is None:
            continue
        if row:
            row.left_at = None
            row.joined_at = _now()
        else:
            db.add(CompanyChatMember(company_id=company_id, chat_id=chat.id,
                                     membership_id=membership_id, role="MEMBER"))
        added.append(membership_id)
    await db.commit()
    return {"ok": True, "added_membership_ids": added}


@router.post("/{company_id}/messenger/messages/{message_id}/reaction")
async def react_chat_message(company_id: int, message_id: int, body: ChatReactionIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); message = await db.get(CompanyChatMessage, message_id)
    if message is None or message.company_id != company_id: raise HTTPException(404, "Сообщение не найдено")
    await chat_access(db, member, message.chat_id)
    row = await db.scalar(select(CompanyChatReaction).where(CompanyChatReaction.message_id == message_id, CompanyChatReaction.membership_id == member.id, CompanyChatReaction.reaction == body.reaction))
    if body.active and row is None: db.add(CompanyChatReaction(company_id=company_id, message_id=message_id, membership_id=member.id, reaction=body.reaction))
    elif not body.active and row is not None: await db.delete(row)
    await db.commit(); return {"message_id": message_id, "reaction": body.reaction, "active": body.active}


@router.post("/{company_id}/messenger/messages/{message_id}/task", status_code=201)
async def task_from_message(company_id: int, message_id: int, body: ChatTaskIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); message = await db.get(CompanyChatMessage, message_id)
    if message is None or message.company_id != company_id: raise HTTPException(404, "Сообщение не найдено")
    await chat_access(db, member, message.chat_id)
    if body.assignee_membership_id is not None:
        assignee = await db.get(CompanyMembership, body.assignee_membership_id)
        if assignee is None or assignee.company_id != company_id or assignee.status != "ACTIVE": raise HTTPException(404, "Исполнитель не найден")
    row = CompanyChatTask(company_id=company_id, message_id=message_id, assignee_membership_id=body.assignee_membership_id, title=body.title.strip(), due_at=body.due_at, created_by_membership_id=member.id)
    db.add(row); await db.commit(); await db.refresh(row); return {"id": row.id, "message_id": row.message_id, "title": row.title, "status": row.status, "assignee_membership_id": row.assignee_membership_id}


@router.delete("/{company_id}/messenger/chats/{chat_id}/members/{membership_id}")
async def leave_chat(company_id: int, chat_id: int, membership_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); chat, _ = await chat_access(db, actor, chat_id)
    if membership_id != actor.id and not capabilities(actor).get("manage_team") and not capabilities(actor).get("manage_company"):
        raise HTTPException(403, "Удалять участников может только руководитель команды")
    target = await db.scalar(select(CompanyChatMember).where(CompanyChatMember.chat_id == chat.id, CompanyChatMember.membership_id == membership_id, CompanyChatMember.left_at.is_(None)))
    if target is None: raise HTTPException(404, "Участник чата не найден")
    target.left_at = _now(); await db.commit(); return {"ok": True, "membership_id": membership_id, "left_at": target.left_at.isoformat()}


@router.get("/{company_id}/archive/{archive_id}/consents")
async def archive_consents(company_id: int, archive_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row, _ = await archive_access(db, member, archive_id)
    if row.owner_membership_id != member.id:
        raise HTTPException(403, "Журнал согласий доступен владельцу записи")
    rows = (await db.scalars(select(CompanyArchiveConsent).where(CompanyArchiveConsent.archive_id == archive_id).order_by(CompanyArchiveConsent.created_at.desc()))).all()
    return [{"id": item.id, "action": item.action, "data_scope": item.data_scope, "policy_version": item.policy_version,
             "actor_membership_id": item.actor_membership_id, "created_at": item.created_at.isoformat(), "details": _json(item.details, {})} for item in rows]


class OnboardingIn(BaseModel):
    policy_version: str = POLICY_VERSION
    accept_data_policy: bool
    manager_membership_id: int | None = None
    job_title: str | None = Field(default=None, max_length=160)
    profession_id: int | None = None
    first_tasks: list[str] = Field(default_factory=list, max_length=20)


@router.get("/{company_id}/onboarding/me")
async def onboarding_me(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row = await db.scalar(select(CompanyOnboarding).where(CompanyOnboarding.membership_id == member.id))
    return {"membership_id": member.id, "policy_version": POLICY_VERSION, "completed": bool(row and row.completed_at),
            "policy_accepted_at": row.policy_accepted_at.isoformat() if row and row.policy_accepted_at else None,
            "manager_confirmed_at": row.manager_confirmed_at.isoformat() if row and row.manager_confirmed_at else None,
            "first_tasks": _json(row.first_tasks, []) if row else [], "job_title": member.job_title, "profession_id": member.profession_id}


@router.post("/{company_id}/onboarding/me")
async def complete_onboarding(company_id: int, body: OnboardingIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    if not body.accept_data_policy or body.policy_version != POLICY_VERSION:
        raise HTTPException(422, "Нужно принять актуальную политику корпоративных данных")
    row = await db.scalar(select(CompanyOnboarding).where(CompanyOnboarding.membership_id == member.id))
    row = row or CompanyOnboarding(company_id=company_id, membership_id=member.id)
    row.policy_accepted_at = _now(); row.first_tasks = dumps(body.first_tasks)
    if body.manager_membership_id:
        manager = await db.get(CompanyMembership, body.manager_membership_id)
        if manager is None or manager.company_id != company_id or manager.status != "ACTIVE":
            raise HTTPException(404, "Руководитель не найден")
        row.manager_confirmed_at = _now()
    if body.job_title is not None:
        member.job_title = body.job_title.strip() or None
    if body.profession_id is not None:
        profession = await db.get(CompanyProfession, body.profession_id)
        if profession is None or profession.company_id != company_id: raise HTTPException(404, "Профессия не найдена")
        member.profession_id = profession.id
        assigned = await db.scalar(select(CompanyMembershipProfession).where(CompanyMembershipProfession.membership_id == member.id, CompanyMembershipProfession.profession_id == profession.id))
        if assigned is None: db.add(CompanyMembershipProfession(company_id=company_id, membership_id=member.id, profession_id=profession.id, level=1))
    row.completed_at = _now(); db.add(row); await db.commit()
    return {"ok": True, "completed": True, "policy_version": POLICY_VERSION}


@router.get("/{company_id}/me")
async def employee_workspace(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """The employee's privacy-aware corporate home, separate from the public Arena profile."""
    member = await member_for(db, user, company_id)
    onboarding = await db.scalar(select(CompanyOnboarding).where(CompanyOnboarding.membership_id == member.id))
    profession = await db.get(CompanyProfession, member.profession_id) if member.profession_id else None
    custom_role = await db.get(CompanyCustomRole, member.custom_role_id) if member.custom_role_id else None
    chain = []
    seen = set()
    manager_id = member.manager_membership_id
    while manager_id and manager_id not in seen and len(chain) < 12:
        seen.add(manager_id)
        manager = await db.get(CompanyMembership, manager_id)
        if not manager or manager.company_id != company_id or manager.status != "ACTIVE":
            break
        manager_user = await db.get(User, manager.user_id)
        chain.append({"membership_id": manager.id, "user_id": manager.user_id,
                      "name": (manager_user.display_name or manager_user.username) if manager_user else None,
                      "job_title": manager.job_title, "role": manager.corporate_role})
        manager_id = manager.manager_membership_id
    own_records = await db.scalar(select(func.count()).select_from(CompanyArchiveRecord).where(
        CompanyArchiveRecord.company_id == company_id, CompanyArchiveRecord.owner_membership_id == member.id,
        CompanyArchiveRecord.deleted_at.is_(None)))
    return {
        "company_id": company_id,
        "user": {"id": user.id, "username": user.username, "display_name": user.display_name},
        "membership": {"id": member.id, "job_title": member.job_title, "employee_number": member.employee_number,
                       "role": member.corporate_role, "custom_role": {"id": custom_role.id, "code": custom_role.code, "title": custom_role.title} if custom_role else None,
                       "status": member.status, "company_visibility": member.company_visibility},
        "profession": {"id": profession.id, "code": profession.code, "title": profession.title, "catalog_version": profession.catalog_version} if profession else None,
        "manager_chain": chain,
        "onboarding": {"completed": bool(onboarding and onboarding.completed_at), "policy_version": POLICY_VERSION,
                       "policy_accepted_at": onboarding.policy_accepted_at.isoformat() if onboarding and onboarding.policy_accepted_at else None,
                       "manager_confirmed_at": onboarding.manager_confirmed_at.isoformat() if onboarding and onboarding.manager_confirmed_at else None,
                       "first_tasks": _json(onboarding.first_tasks, []) if onboarding else []},
        "archive": {"owned_records": int(own_records or 0), "manager_access_requires_grant": True},
        "privacy": {"personal_arena_data_shared": False, "corporate_results_shared_by_explicit_grant": True},
    }


class CustomRoleIn(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=3000)
    capabilities: list[str] = Field(default_factory=list, max_length=30)
    scope: Literal["SELF", "TEAM", "DEPARTMENT_SUBTREE", "COMPANY"] = "SELF"


def _custom_role_capabilities(values: list[str]) -> dict[str, bool]:
    from app.company_access import CAPABILITY_KEYS
    allowed = set(values)
    unknown = allowed - CAPABILITY_KEYS
    forbidden = allowed & {"manage_company", "manage_structure", "invite_members", "view_audit"}
    if unknown:
        raise HTTPException(422, f"Неизвестные корпоративные права: {', '.join(sorted(unknown))}")
    if forbidden:
        raise HTTPException(403, "Критические права доступны только фиксированным ролям владельца и администратора")
    return {key: key in allowed for key in sorted(CAPABILITY_KEYS)}


@router.get("/{company_id}/roles")
async def list_custom_roles(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await member_for(db, user, company_id)
    rows = list((await db.scalars(select(CompanyCustomRole).where(CompanyCustomRole.company_id == company_id, CompanyCustomRole.status == "ACTIVE").order_by(CompanyCustomRole.title))).all())
    return [{"id": row.id, "code": row.code, "title": row.title, "description": row.description, "scope": row.scope,
             "capabilities": _json(row.capabilities, []), "assigned_members": int(await db.scalar(select(func.count()).select_from(CompanyMembership).where(CompanyMembership.custom_role_id == row.id, CompanyMembership.status == "ACTIVE")) or 0)} for row in rows]


@router.post("/{company_id}/roles", status_code=201)
async def create_custom_role(company_id: int, body: CustomRoleIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); require_action(actor, "manage_company", manager=True)
    permissions = _custom_role_capabilities(body.capabilities)
    code = body.code.strip().lower().replace(" ", "_")
    if await db.scalar(select(CompanyCustomRole.id).where(CompanyCustomRole.company_id == company_id, CompanyCustomRole.code == code)):
        raise HTTPException(409, "Роль с таким кодом уже существует")
    row = CompanyCustomRole(company_id=company_id, code=code, title=body.title.strip(), description=body.description.strip() or None,
                            capabilities=dumps([key for key, enabled in permissions.items() if enabled]), scope=body.scope, created_by=user.id)
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "code": row.code, "title": row.title, "scope": row.scope, "capabilities": _json(row.capabilities, [])}


@router.post("/{company_id}/roles/{role_id}/assign")
async def assign_custom_role(company_id: int, role_id: int, membership_id: int = Query(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); require_action(actor, "manage_company", manager=True)
    role = await db.get(CompanyCustomRole, role_id); target = await db.get(CompanyMembership, membership_id)
    if not role or role.company_id != company_id or role.status != "ACTIVE" or not target or target.company_id != company_id or target.status != "ACTIVE":
        raise HTTPException(404, "Роль или сотрудник не найдены")
    target.custom_role_id = role.id
    target.capability_overrides = dumps({key: True for key in _json(role.capabilities, [])})
    db.add(target); await db.commit()
    return {"ok": True, "membership_id": target.id, "custom_role_id": role.id, "capabilities": _json(role.capabilities, [])}


class ProfessionIn(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=3000)
    catalog_version: str = Field(default="v1", max_length=40)


class CompetencyIn(ProfessionIn):
    pass


class LinkCompetencyIn(BaseModel):
    competency_id: int
    target_level: int = Field(default=3, ge=1, le=5)


class AssignProfessionIn(BaseModel):
    membership_id: int
    profession_id: int
    level: int = Field(default=1, ge=1, le=5)
    verified: bool = False


async def ensure_admin_member(db: AsyncSession, user: User, company_id: int):
    member = await member_for(db, user, company_id)
    require_action(member, "manage_learning", manager=True)
    return member


async def ensure_company_admin(db: AsyncSession, user: User, company_id: int):
    member = await member_for(db, user, company_id)
    require_action(member, "manage_company", manager=True)
    return member


@router.get("/{company_id}/catalog")
async def catalog(company_id: int, version: str | None = None, q: str | None = Query(default=None, max_length=120), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await member_for(db, user, company_id)
    search = f"%{q.strip()}%" if q and q.strip() else None
    profession_filters = [CompanyProfession.company_id == company_id]
    competency_filters = [CompanyCompetency.company_id == company_id]
    if version: profession_filters.append(CompanyProfession.catalog_version == version); competency_filters.append(CompanyCompetency.catalog_version == version)
    if search: profession_filters.append(CompanyProfession.title.ilike(search) | CompanyProfession.code.ilike(search)); competency_filters.append(CompanyCompetency.title.ilike(search) | CompanyCompetency.code.ilike(search))
    professions = (await db.scalars(select(CompanyProfession).where(*profession_filters).order_by(CompanyProfession.title))).all()
    competencies = (await db.scalars(select(CompanyCompetency).where(*competency_filters).order_by(CompanyCompetency.title))).all()
    links = (await db.scalars(select(CompanyProfessionCompetency).where(CompanyProfessionCompetency.profession_id.in_([p.id for p in professions])))).all() if professions else []
    return {"versions": sorted({p.catalog_version for p in professions} | {c.catalog_version for c in competencies}),
            "professions": [{"id": p.id, "code": p.code, "title": p.title, "description": p.description, "catalog_version": p.catalog_version, "status": p.status,
                             "competencies": [{"competency_id": l.competency_id, "target_level": l.target_level} for l in links if l.profession_id == p.id]} for p in professions],
            "competencies": [{"id": c.id, "code": c.code, "title": c.title, "description": c.description, "catalog_version": c.catalog_version, "status": c.status} for c in competencies]}


@router.post("/{company_id}/catalog/professions", status_code=201)
async def create_profession(company_id: int, body: ProfessionIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    row = CompanyProfession(company_id=company_id, code=body.code.strip().lower(), title=body.title.strip(), description=body.description.strip() or None,
        catalog_version=body.catalog_version, status="ACTIVE", created_by=user.id)
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "code": row.code, "title": row.title, "catalog_version": row.catalog_version}


@router.post("/{company_id}/catalog/competencies", status_code=201)
async def create_competency(company_id: int, body: CompetencyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    row = CompanyCompetency(company_id=company_id, code=body.code.strip().lower(), title=body.title.strip(), description=body.description.strip() or None,
        catalog_version=body.catalog_version, created_by=user.id)
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "code": row.code, "title": row.title, "catalog_version": row.catalog_version}


@router.post("/{company_id}/catalog/professions/{profession_id}/competencies")
async def link_competency(company_id: int, profession_id: int, body: LinkCompetencyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    profession = await db.get(CompanyProfession, profession_id); competency = await db.get(CompanyCompetency, body.competency_id)
    if not profession or profession.company_id != company_id or not competency or competency.company_id != company_id:
        raise HTTPException(404, "Профессия или компетенция не найдена")
    row = await db.scalar(select(CompanyProfessionCompetency).where(CompanyProfessionCompetency.profession_id == profession_id, CompanyProfessionCompetency.competency_id == body.competency_id))
    row = row or CompanyProfessionCompetency(profession_id=profession_id, competency_id=body.competency_id)
    row.target_level = body.target_level; db.add(row); await db.commit()
    return {"profession_id": profession_id, "competency_id": body.competency_id, "target_level": body.target_level}


@router.post("/{company_id}/catalog/assign")
async def assign_profession(company_id: int, body: AssignProfessionIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    member = await db.get(CompanyMembership, body.membership_id); profession = await db.get(CompanyProfession, body.profession_id)
    if not member or member.company_id != company_id or member.status != "ACTIVE" or not profession or profession.company_id != company_id:
        raise HTTPException(404, "Сотрудник или специальность не найдены")
    row = await db.scalar(select(CompanyMembershipProfession).where(CompanyMembershipProfession.membership_id == member.id, CompanyMembershipProfession.profession_id == profession.id))
    row = row or CompanyMembershipProfession(company_id=company_id, membership_id=member.id, profession_id=profession.id)
    member.profession_id = profession.id
    row.level = body.level; row.verified_at = _now() if body.verified else None; db.add(row); await db.commit()
    return {"membership_id": member.id, "profession_id": profession.id, "level": row.level, "verified": bool(row.verified_at)}


@router.post("/{company_id}/programs/{program_id}/professions")
async def link_program_profession(company_id: int, program_id: int, profession_id: int = Query(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    program = await db.get(CompanyProgram, program_id); profession = await db.get(CompanyProfession, profession_id)
    if not program or program.company_id != company_id or not profession or profession.company_id != company_id:
        raise HTTPException(404, "Программа или профессия не найдены")
    row = CompanyProgramProfession(company_id=company_id, program_id=program_id, profession_id=profession_id)
    db.add(row); await db.commit(); return {"program_id": program_id, "profession_id": profession_id}


@router.get("/{company_id}/hr/report")
async def hr_report(company_id: int, profession_id: int | None = None, min_group_size: int = Query(5, ge=3), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); require_action(member, "view_analytics", manager=True)
    prof_query = select(CompanyMembershipProfession).where(CompanyMembershipProfession.company_id == company_id)
    if profession_id: prof_query = prof_query.where(CompanyMembershipProfession.profession_id == profession_id)
    assignments = list((await db.scalars(prof_query)).all())
    grouped = {}
    for link in assignments:
        attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.membership_id == link.membership_id, CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.final_score.is_not(None)))).all()
        values = [int(a.final_score) for a in attempts]
        bucket = grouped.setdefault(link.profession_id, {"profession_id": link.profession_id, "sample_size": 0, "score_sum": 0, "members": set()})
        bucket["sample_size"] += len(values); bucket["score_sum"] += sum(values); bucket["members"].add(link.membership_id)
    rows = []
    for bucket in grouped.values():
        sample = bucket["sample_size"]
        rows.append({"profession_id": bucket["profession_id"], "sample_size": sample, "status": "READY" if sample >= min_group_size else "SUPPRESSED",
                     "average_score": round(bucket["score_sum"] / sample) if sample >= min_group_size else None,
                     "member_count": len(bucket["members"]) if sample >= min_group_size else None})
    return {"methodology_version": "hr-v1", "population": "TRAINING_RESULTS_ONLY", "minimum_group_size": min_group_size,
            "real_world_performance_included": False, "rows": rows, "privacy": "small groups are suppressed and individual identities are never exported"}


class AnalyticsMethodIn(BaseModel):
    version: str = Field(min_length=2, max_length=40)
    definition: dict = Field(default_factory=dict)
    active: bool = True


@router.get("/{company_id}/analytics/methodology")
async def analytics_methodology(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    require_action(member, "view_analytics", manager=True)
    rows = list((await db.scalars(select(CompanyAnalyticsMethod).where(CompanyAnalyticsMethod.company_id == company_id).order_by(CompanyAnalyticsMethod.created_at.desc()))).all())
    return {"active_version": next((row.version for row in rows if row.active), "hr-v1"), "methods": [{
        "id": row.id, "version": row.version, "definition": _json(row.definition, {}), "active": bool(row.active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in rows]}


@router.post("/{company_id}/analytics/methodology", status_code=201)
async def create_analytics_method(company_id: int, body: AnalyticsMethodIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    if body.active:
        await db.execute(update(CompanyAnalyticsMethod).where(CompanyAnalyticsMethod.company_id == company_id).values(active=0))
    row = CompanyAnalyticsMethod(company_id=company_id, version=body.version.strip(), definition=dumps(body.definition), active=int(body.active), created_by=user.id)
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "version": row.version, "active": bool(row.active), "definition": body.definition}


class CareerTrackIn(BaseModel):
    profession_id: int
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=3000)


class CareerStepIn(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    level: int = Field(default=1, ge=1, le=10)
    required_competencies: list[int] = Field(default_factory=list, max_length=50)
    recommended_program_ids: list[int] = Field(default_factory=list, max_length=50)


@router.get("/{company_id}/career-tracks")
async def career_tracks(company_id: int, profession_id: int | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await member_for(db, user, company_id)
    query = select(CompanyCareerTrack).where(CompanyCareerTrack.company_id == company_id)
    if profession_id is not None: query = query.where(CompanyCareerTrack.profession_id == profession_id)
    tracks = list((await db.scalars(query.order_by(CompanyCareerTrack.created_at))).all())
    result = []
    for track in tracks:
        steps = list((await db.scalars(select(CompanyCareerStep).where(CompanyCareerStep.track_id == track.id).order_by(CompanyCareerStep.level, CompanyCareerStep.id))).all())
        result.append({"id": track.id, "profession_id": track.profession_id, "title": track.title, "description": track.description, "status": track.status,
                       "steps": [{"id": step.id, "title": step.title, "level": step.level, "required_competencies": _json(step.required_competencies, []), "recommended_program_ids": _json(step.recommended_program_ids, [])} for step in steps]})
    return result


@router.post("/{company_id}/career-tracks", status_code=201)
async def create_career_track(company_id: int, body: CareerTrackIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    profession = await db.get(CompanyProfession, body.profession_id)
    if not profession or profession.company_id != company_id: raise HTTPException(404, "Профессия не найдена")
    row = CompanyCareerTrack(company_id=company_id, profession_id=body.profession_id, title=body.title.strip(), description=body.description.strip() or None, created_by=user.id)
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "profession_id": row.profession_id, "title": row.title, "status": row.status}


@router.post("/{company_id}/career-tracks/{track_id}/steps", status_code=201)
async def create_career_step(company_id: int, track_id: int, body: CareerStepIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id)
    track = await db.get(CompanyCareerTrack, track_id)
    if not track or track.company_id != company_id: raise HTTPException(404, "Карьерный трек не найден")
    row = CompanyCareerStep(track_id=track_id, title=body.title.strip(), level=body.level, required_competencies=dumps(body.required_competencies), recommended_program_ids=dumps(body.recommended_program_ids))
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "track_id": row.track_id, "title": row.title, "level": row.level}


@router.get("/{company_id}/skill-gaps/{membership_id}")
async def skill_gaps(company_id: int, membership_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    if actor.id != membership_id: require_action(actor, "view_analytics", manager=True)
    links = (await db.scalars(select(CompanyMembershipProfession).where(CompanyMembershipProfession.company_id == company_id, CompanyMembershipProfession.membership_id == membership_id))).all()
    result = []
    for link in links:
        mapping = (await db.scalars(select(CompanyProfessionCompetency).where(CompanyProfessionCompetency.profession_id == link.profession_id))).all()
        for item in mapping:
            competency = await db.get(CompanyCompetency, item.competency_id)
            if not competency: continue
            gap = max(0, item.target_level - link.level)
            result.append({"competency_id": competency.id, "code": competency.code, "title": competency.title,
                           "current_level": link.level, "target_level": item.target_level, "gap": gap})
    return {"methodology_version": "hr-v1", "membership_id": membership_id, "gaps": result}


@router.get("/{company_id}/recommendations/{membership_id}")
async def recommendations(company_id: int, membership_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    if actor.id != membership_id: require_action(actor, "view_analytics", manager=True)
    rows = (await db.scalars(select(CompanyLearningRecommendation).where(CompanyLearningRecommendation.company_id == company_id, CompanyLearningRecommendation.membership_id == membership_id, CompanyLearningRecommendation.status == "OPEN").order_by(CompanyLearningRecommendation.priority.desc()))).all()
    return [{"id": r.id, "program_id": r.program_id, "competency_id": r.competency_id, "reason": r.reason, "priority": r.priority, "methodology_version": r.methodology_version} for r in rows]


@router.post("/{company_id}/skill-gaps/{membership_id}/recompute")
async def recompute_skill_gaps(company_id: int, membership_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    if actor.id != membership_id: require_action(actor, "view_analytics", manager=True)
    links = list((await db.scalars(select(CompanyMembershipProfession).where(CompanyMembershipProfession.company_id == company_id, CompanyMembershipProfession.membership_id == membership_id))).all())
    created = 0
    gaps = []
    for link in links:
        mappings = list((await db.scalars(select(CompanyProfessionCompetency).where(CompanyProfessionCompetency.profession_id == link.profession_id))).all())
        for mapping in mappings:
            gap = max(0, mapping.target_level - link.level)
            current = await db.scalar(select(CompanySkillGap).where(CompanySkillGap.company_id == company_id, CompanySkillGap.membership_id == membership_id, CompanySkillGap.competency_id == mapping.competency_id))
            if current is None:
                current = CompanySkillGap(company_id=company_id, membership_id=membership_id, competency_id=mapping.competency_id)
                created += 1
            current.current_level = link.level; current.target_level = mapping.target_level; current.evidence = dumps({"source": "profession_target", "profession_id": link.profession_id, "gap": gap}); current.calculated_with = "hr-v1"; db.add(current)
            gaps.append((mapping.competency_id, gap, mapping.target_level))
    for competency_id, gap, target in gaps:
        if gap <= 0: continue
        existing = await db.scalar(select(CompanyLearningRecommendation).where(CompanyLearningRecommendation.company_id == company_id, CompanyLearningRecommendation.membership_id == membership_id, CompanyLearningRecommendation.competency_id == competency_id, CompanyLearningRecommendation.status == "OPEN"))
        if existing is None:
            db.add(CompanyLearningRecommendation(company_id=company_id, membership_id=membership_id, competency_id=competency_id, reason=f"Разрыв до уровня {target} по каталогу профессии", priority=min(100, 50 + gap * 10), methodology_version="hr-v1"))
    await db.commit()
    return {"membership_id": membership_id, "methodology_version": "hr-v1", "gaps": len(gaps), "created": created}


class TwinOptInIn(BaseModel):
    opt_in: bool
    source_types: list[str] = Field(default_factory=lambda: ["TRAINING_RESULTS"])


class TwinSourceIn(BaseModel):
    enabled: bool


def twin_payload(row: CompanyTwinProfile | None, sources: list[CompanyTwinSource]) -> dict:
    if row is None: return {"exists": False, "opt_in": False, "rule_version": "twin-rules-v1", "sources": []}
    return {"exists": not bool(row.deleted_at), "opt_in": bool(row.opt_in), "rule_version": row.rule_version,
            "profile": _json(row.profile, {}) if row.opt_in and not row.deleted_at else {},
            "sources": [{"type": source.source_type, "enabled": bool(source.enabled), "consented_at": source.consented_at.isoformat() if source.consented_at else None, "revoked_at": source.revoked_at.isoformat() if source.revoked_at else None} for source in sources]}


@router.get("/{company_id}/twin/me")
async def twin_me(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row = await db.scalar(select(CompanyTwinProfile).where(CompanyTwinProfile.membership_id == member.id, CompanyTwinProfile.deleted_at.is_(None)))
    sources = list((await db.scalars(select(CompanyTwinSource).where(CompanyTwinSource.twin_id == row.id))).all()) if row else []
    return twin_payload(row, sources)


@router.put("/{company_id}/twin/me")
async def twin_opt_in(company_id: int, body: TwinOptInIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    invalid = set(body.source_types) - TWIN_SOURCES
    if invalid: raise HTTPException(422, "Неизвестный источник переговорного двойника")
    row = await db.scalar(select(CompanyTwinProfile).where(CompanyTwinProfile.membership_id == member.id))
    row = row or CompanyTwinProfile(company_id=company_id, membership_id=member.id)
    row.deleted_at = None; row.opt_in = int(body.opt_in)
    db.add(row); await db.flush()
    existing = {s.source_type: s for s in (await db.scalars(select(CompanyTwinSource).where(CompanyTwinSource.twin_id == row.id))).all()}
    for source_type in TWIN_SOURCES:
        source = existing.get(source_type) or CompanyTwinSource(company_id=company_id, twin_id=row.id, source_type=source_type)
        source.enabled = int(body.opt_in and source_type in body.source_types); source.consented_at = _now() if source.enabled else source.consented_at
        source.revoked_at = None if source.enabled else _now(); db.add(source)
    await db.commit(); await db.refresh(row)
    sources = list((await db.scalars(select(CompanyTwinSource).where(CompanyTwinSource.twin_id == row.id))).all())
    return twin_payload(row, sources)


@router.patch("/{company_id}/twin/me/sources/{source_type}")
async def twin_source(company_id: int, source_type: str, body: TwinSourceIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    if source_type not in TWIN_SOURCES: raise HTTPException(404, "Источник не найден")
    row = await db.scalar(select(CompanyTwinProfile).where(CompanyTwinProfile.membership_id == member.id, CompanyTwinProfile.deleted_at.is_(None)))
    if not row or not row.opt_in: raise HTTPException(409, "Сначала включите переговорный двойник")
    source = await db.scalar(select(CompanyTwinSource).where(CompanyTwinSource.twin_id == row.id, CompanyTwinSource.source_type == source_type))
    source = source or CompanyTwinSource(company_id=company_id, twin_id=row.id, source_type=source_type)
    source.enabled = int(body.enabled); source.consented_at = _now() if body.enabled else source.consented_at; source.revoked_at = None if body.enabled else _now()
    db.add(source); await db.commit(); return {"source_type": source_type, "enabled": bool(source.enabled)}


@router.post("/{company_id}/twin/me/generate")
async def generate_twin(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row = await db.scalar(select(CompanyTwinProfile).where(CompanyTwinProfile.membership_id == member.id, CompanyTwinProfile.deleted_at.is_(None)))
    if not row or not row.opt_in: raise HTTPException(409, "Переговорный двойник доступен только после opt-in")
    sources = list((await db.scalars(select(CompanyTwinSource).where(CompanyTwinSource.twin_id == row.id, CompanyTwinSource.enabled == 1))).all())
    enabled = {s.source_type for s in sources}; profile = {"rule_version": "twin-rules-v1", "signals": [], "dimensions": {"trust": 50, "goal": 50, "control": 50, "eq": 50}}
    if "TRAINING_RESULTS" in enabled:
        attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.membership_id == member.id, CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.final_score.is_not(None)))).all()
        scores = [int(a.final_score) for a in attempts]
        if scores: profile["dimensions"]["goal"] = round(sum(scores) / len(scores)); profile["signals"].append({"source": "TRAINING_RESULTS", "rule": "mean(final_score)", "sample_size": len(scores)})
    if "CORPORATE_ARCHIVE" in enabled:
        records = (await db.scalars(select(CompanyArchiveRecord).where(CompanyArchiveRecord.company_id == company_id, CompanyArchiveRecord.owner_membership_id == member.id, CompanyArchiveRecord.deleted_at.is_(None)))).all()
        metrics = [_json(r.payload, {}).get("metrics", {}) for r in records]
        for key in ("trust", "goal", "control", "eq"):
            values = [int(item[key]) for item in metrics if isinstance(item, dict) and isinstance(item.get(key), (int, float))]
            if values: profile["dimensions"][key] = round(sum(values) / len(values));
        profile["signals"].append({"source": "CORPORATE_ARCHIVE", "rule": "mean(metrics)", "sample_size": len(records)})
    row.profile = dumps(profile); row.sources_snapshot = dumps(sorted(enabled)); row.generated_at = _now(); row.updated_at = _now(); db.add(row); await db.commit()
    return {"ok": True, "profile": profile, "explanation": "Профиль построен детерминированными правилами из разрешённых корпоративных источников; личные данные и внешний архив не использовались."}


@router.delete("/{company_id}/twin/me")
async def delete_twin(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); row = await db.scalar(select(CompanyTwinProfile).where(CompanyTwinProfile.membership_id == member.id))
    if not row: return {"ok": True}
    row.opt_in = 0; row.deleted_at = _now(); row.profile = "{}"; row.sources_snapshot = "[]"; db.add(row); await db.commit(); return {"ok": True, "deleted_at": row.deleted_at.isoformat()}


class TwinUseIn(BaseModel):
    scenario_id: str | None = None


@router.post("/{company_id}/twin/me/training-use")
async def use_twin(company_id: int, body: TwinUseIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); row = await db.scalar(select(CompanyTwinProfile).where(CompanyTwinProfile.membership_id == member.id, CompanyTwinProfile.deleted_at.is_(None)))
    if not row or not row.opt_in: raise HTTPException(403, "Двойник отключён сотрудником")
    profile = _json(row.profile, {}); explanation = "Тренировка использует только агрегированный профиль и показывает, какие правила сработали: " + ", ".join(signal.get("rule", "") for signal in profile.get("signals", []))
    db.add(CompanyTwinTrainingUse(company_id=company_id, twin_id=row.id, actor_membership_id=member.id, scenario_id=body.scenario_id, explanation=explanation)); await db.commit()
    return {"scenario_id": body.scenario_id, "profile": profile, "explanation": explanation, "personal_data_shared": False}


class MultiPartyCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    context: str = Field(min_length=10, max_length=10000)
    mode: Literal["HUMAN_MEDIATOR", "AI_MEDIATOR"] = "HUMAN_MEDIATOR"
    participant_membership_ids: list[int] = Field(min_length=2, max_length=20)


class ParticipantIn(BaseModel):
    membership_id: int
    role: str = Field(default="PARTICIPANT", max_length=40)


class TurnIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    kind: Literal["MESSAGE", "PROPOSAL", "QUESTION", "SUMMARY", "AGREEMENT"] = "MESSAGE"


async def multipart_access(db: AsyncSession, member: CompanyMembership, session_id: int):
    session = await db.get(CompanyMultiPartySession, session_id)
    if not session or session.company_id != member.company_id: raise HTTPException(404, "Многосторонняя сессия не найдена")
    participant = await db.scalar(select(CompanyMultiPartyParticipant).where(CompanyMultiPartyParticipant.session_id == session.id, CompanyMultiPartyParticipant.membership_id == member.id))
    if participant is None and session.created_by_membership_id != member.id: raise HTTPException(403, "Вы не участвуете в этой сессии")
    return session, participant


@router.post("/{company_id}/multipart/sessions", status_code=201)
async def create_multipart(company_id: int, body: MultiPartyCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); require_action(actor, "manage_team", manager=True)
    ids = list(dict.fromkeys(body.participant_membership_ids + [actor.id]))
    if len(ids) < 3:
        raise HTTPException(422, "Для многосторонней сессии нужны минимум три участника")
    members = list((await db.scalars(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.id.in_(ids), CompanyMembership.status == "ACTIVE"))).all())
    if len(members) != len(ids): raise HTTPException(404, "Один из участников не найден")
    row = CompanyMultiPartySession(company_id=company_id, title=body.title.strip(), context=body.context.strip(), mode=body.mode, status="OPEN", created_by_membership_id=actor.id)
    db.add(row); await db.flush()
    for item in members: db.add(CompanyMultiPartyParticipant(company_id=company_id, session_id=row.id, membership_id=item.id, role="MEDIATOR" if item.id == actor.id else "PARTICIPANT", status="JOINED" if item.id == actor.id else "INVITED", joined_at=_now() if item.id == actor.id else None))
    await db.commit(); await db.refresh(row)
    return {"id": row.id, "title": row.title, "mode": row.mode, "status": row.status, "participant_count": len(ids), "participant_roles": "separate_participant_model"}


@router.get("/{company_id}/multipart/sessions")
async def list_multipart(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    rows = (await db.scalars(select(CompanyMultiPartySession).join(CompanyMultiPartyParticipant, CompanyMultiPartyParticipant.session_id == CompanyMultiPartySession.id).where(CompanyMultiPartySession.company_id == company_id, CompanyMultiPartyParticipant.membership_id == member.id).order_by(CompanyMultiPartySession.created_at.desc()))).all()
    return [{"id": r.id, "title": r.title, "mode": r.mode, "status": r.status, "current_turn": r.current_turn, "created_at": r.created_at.isoformat()} for r in rows]


@router.post("/{company_id}/multipart/sessions/{session_id}/join")
async def join_multipart(company_id: int, session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); session, participant = await multipart_access(db, member, session_id)
    if participant is None: raise HTTPException(403, "Участник не приглашён")
    participant.status = "JOINED"; participant.joined_at = participant.joined_at or _now(); session.status = "ACTIVE"; await db.commit()
    return {"ok": True, "status": participant.status, "session_status": session.status}


@router.post("/{company_id}/multipart/sessions/{session_id}/turns")
async def add_turn(company_id: int, session_id: int, body: TurnIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); session, participant = await multipart_access(db, member, session_id)
    if session.status not in {"OPEN", "ACTIVE"}: raise HTTPException(409, "Сессия уже завершена")
    if not participant or participant.status != "JOINED": raise HTTPException(403, "Сначала присоединитесь к сессии")
    session.current_turn += 1; tags = []
    lowered = body.text.casefold()
    if "почему" in lowered or "уточн" in lowered: tags.append("clarifying_question")
    if "договор" in lowered or "следующ" in lowered: tags.append("next_step")
    if "нет" in lowered or "невозможно" in lowered: tags.append("boundary")
    turn = CompanyMultiPartyTurn(company_id=company_id, session_id=session.id, participant_id=participant.id, author_membership_id=member.id, turn_number=session.current_turn, kind=body.kind, text=body.text.strip(), tags=dumps(tags)); db.add(turn)
    mediator = None
    if session.mode == "AI_MEDIATOR":
        mediator_text = "Медиатор: зафиксируйте интересы каждой стороны и предложите проверяемый следующий шаг."
        session.current_turn += 1; mediator = CompanyMultiPartyTurn(company_id=company_id, session_id=session.id, participant_id=None, author_membership_id=None, turn_number=session.current_turn, kind="MEDIATOR", text=mediator_text, tags=dumps(["ai_mediator_rule_v1"])); db.add(mediator)
    await db.commit()
    return {"turn": {"number": turn.turn_number, "kind": turn.kind, "text": turn.text, "tags": tags}, "mediator": {"number": mediator.turn_number, "text": mediator.text} if mediator else None, "current_turn": session.current_turn}


@router.post("/{company_id}/multipart/sessions/{session_id}/close")
async def close_multipart(company_id: int, session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); session, participant = await multipart_access(db, member, session_id)
    if session.created_by_membership_id != member.id and not capabilities(member).get("manage_team"): raise HTTPException(403, "Закрыть сессию может медиатор или руководитель")
    turns = list((await db.scalars(select(CompanyMultiPartyTurn).where(CompanyMultiPartyTurn.session_id == session.id))).all()); scores = {}
    for turn in turns:
        if not turn.author_membership_id: continue
        bucket = scores.setdefault(str(turn.author_membership_id), {"turns": 0, "questions": 0, "next_steps": 0, "boundaries": 0})
        tags = _json(turn.tags, []); bucket["turns"] += 1; bucket["questions"] += int("clarifying_question" in tags); bucket["next_steps"] += int("next_step" in tags); bucket["boundaries"] += int("boundary" in tags)
    session.status = "COMPLETED"; session.closed_at = _now(); db.add(CompanyMultiPartyReport(company_id=company_id, session_id=session.id, outcome="COMPLETED", participant_scores=dumps(scores))); await db.commit()
    return {"session_id": session.id, "status": session.status, "methodology_version": "multipart-v1", "participant_scores": scores, "privacy": "each participant sees their contribution; managers see aggregate contribution"}


@router.get("/{company_id}/multipart/sessions/{session_id}")
async def multipart_detail(company_id: int, session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); session, participant = await multipart_access(db, member, session_id)
    participants = list((await db.scalars(select(CompanyMultiPartyParticipant).where(CompanyMultiPartyParticipant.session_id == session.id))).all()); turns = list((await db.scalars(select(CompanyMultiPartyTurn).where(CompanyMultiPartyTurn.session_id == session.id).order_by(CompanyMultiPartyTurn.turn_number))).all())
    return {"id": session.id, "title": session.title, "context": session.context, "mode": session.mode, "status": session.status, "current_turn": session.current_turn,
            "participants": [{"id": p.id, "membership_id": p.membership_id, "role": p.role, "status": p.status} for p in participants],
            "turns": [{"id": t.id, "number": t.turn_number, "author_membership_id": t.author_membership_id, "kind": t.kind, "text": t.text, "tags": _json(t.tags, [])} for t in turns]}


class ModePolicyIn(BaseModel):
    enabled: bool = True
    allowed_roles: list[str] = Field(default_factory=list)
    allowed_departments: list[int] = Field(default_factory=list)
    limit_per_member: int | None = Field(default=None, ge=1, le=1000)
    voice_video_allowed: bool = True


@router.get("/{company_id}/mode-policies")
async def list_mode_policies(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); rows = list((await db.scalars(select(CompanyModePolicy).where(CompanyModePolicy.company_id == company_id))).all())
    visible = []
    for row in rows:
        allowed = (not row.allowed_roles or member.corporate_role in _json(row.allowed_roles, [])) and (not row.allowed_departments or member.department_id in _json(row.allowed_departments, []))
        if allowed or capabilities(member).get("manage_company"): visible.append({"mode": row.mode, "enabled": bool(row.enabled), "allowed_roles": _json(row.allowed_roles, []), "allowed_departments": _json(row.allowed_departments, []), "limit_per_member": row.limit_per_member, "voice_video_allowed": bool(row.voice_video_allowed)})
    return {"modes": sorted(MODES), "policies": visible}


@router.put("/{company_id}/mode-policies/{mode}")
async def save_mode_policy(company_id: int, mode: str, body: ModePolicyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await ensure_company_admin(db, user, company_id)
    if mode not in MODES: raise HTTPException(404, "Режим не найден")
    row = await db.scalar(select(CompanyModePolicy).where(CompanyModePolicy.company_id == company_id, CompanyModePolicy.mode == mode))
    row = row or CompanyModePolicy(company_id=company_id, mode=mode, updated_by=user.id)
    row.enabled = int(body.enabled); row.allowed_roles = dumps(body.allowed_roles); row.allowed_departments = dumps(body.allowed_departments); row.limit_per_member = body.limit_per_member; row.voice_video_allowed = int(body.voice_video_allowed); row.updated_by = user.id; db.add(row); await db.commit()
    return {"mode": mode, "enabled": bool(row.enabled), "allowed_roles": body.allowed_roles, "allowed_departments": body.allowed_departments, "limit_per_member": row.limit_per_member, "voice_video_allowed": bool(row.voice_video_allowed)}


@router.get("/{company_id}/mode-access/{mode}")
async def mode_access(company_id: int, mode: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if mode not in MODES: raise HTTPException(404, "Режим не найден")
    member = await member_for(db, user, company_id); row = await db.scalar(select(CompanyModePolicy).where(CompanyModePolicy.company_id == company_id, CompanyModePolicy.mode == mode))
    subscription = await db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    if subscription and subscription.status not in {"TRIAL", "ACTIVE"}:
        return {"mode": mode, "allowed": False, "reason": "SUBSCRIPTION_INACTIVE", "plan_code": subscription.plan_code}
    if subscription:
        plan_features = {"assignments", "programs", "analytics"} if subscription.plan_code == "TEAM" else {"assignments", "programs", "analytics", "integrations", "custom_roles", "leagues", "sso", "audit_export", "ai", "voice", "video", "multipart"}
        feature = MODE_FEATURES.get(mode)
        if feature and feature not in plan_features:
            return {"mode": mode, "allowed": False, "reason": "PLAN_LIMIT", "plan_code": subscription.plan_code, "required_feature": feature}
    if not row: return {"mode": mode, "allowed": True, "reason": "NO_POLICY", "plan_code": subscription.plan_code if subscription else None}
    roles, departments = _json(row.allowed_roles, []), _json(row.allowed_departments, []); allowed = bool(row.enabled) and (not roles or member.corporate_role in roles) and (not departments or member.department_id in departments)
    period = _now().strftime("%Y-%m")
    usage = await db.scalar(select(CompanyModeUsage).where(CompanyModeUsage.company_id == company_id, CompanyModeUsage.membership_id == member.id, CompanyModeUsage.mode == mode, CompanyModeUsage.period == period))
    used = usage.used if usage else 0
    remaining = max(0, row.limit_per_member - used) if row.limit_per_member is not None else None
    if allowed and remaining is not None and remaining <= 0:
        allowed = False
    return {"mode": mode, "allowed": allowed, "reason": "LIMIT_REACHED" if not allowed and remaining == 0 else ("ALLOWED" if allowed else "COMPANY_POLICY"), "voice_video_allowed": bool(row.voice_video_allowed), "limit_per_member": row.limit_per_member, "used": used, "remaining": remaining, "period": period}


@router.post("/{company_id}/mode-usage/{mode}", status_code=201)
async def consume_mode_use(company_id: int, mode: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Reserve one company-scoped mode use after policy and subscription checks."""
    member = await member_for(db, user, company_id)
    access = await mode_access(company_id, mode, db, user)
    if not access.get("allowed"):
        raise HTTPException(403, f"Режим недоступен: {access.get('reason')}")
    period = _now().strftime("%Y-%m")
    usage = await db.scalar(select(CompanyModeUsage).where(CompanyModeUsage.company_id == company_id, CompanyModeUsage.membership_id == member.id, CompanyModeUsage.mode == mode, CompanyModeUsage.period == period))
    if usage is None:
        usage = CompanyModeUsage(company_id=company_id, membership_id=member.id, mode=mode, period=period, used=0)
    usage.used += 1; db.add(usage); await db.commit()
    limit = access.get("limit_per_member")
    return {"mode": mode, "period": period, "used": usage.used, "remaining": max(0, limit - usage.used) if limit is not None else None}


class ScenarioRequestIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    brief: str = Field(min_length=10, max_length=10000)
    mode: str = Field(default="SCENARIO", max_length=40)
    secure_material: dict = Field(default_factory=dict)


@router.post("/{company_id}/scenario-requests", status_code=201)
async def scenario_request(company_id: int, body: ScenarioRequestIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id)
    row = CompanyScenarioRequest(company_id=company_id, requested_by_membership_id=member.id, title=body.title.strip(), brief=body.brief.strip(), mode=body.mode, secure_material=dumps(body.secure_material)); db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "status": row.status, "title": row.title, "secure_material_received": bool(body.secure_material)}


@router.get("/{company_id}/scenario-requests")
async def scenario_requests(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); require_action(member, "manage_learning", manager=True)
    rows = list((await db.scalars(select(CompanyScenarioRequest).where(CompanyScenarioRequest.company_id == company_id).order_by(CompanyScenarioRequest.created_at.desc()))).all())
    return [{"id": r.id, "title": r.title, "brief": r.brief, "mode": r.mode, "status": r.status, "created_at": r.created_at.isoformat(), "secure_material": _json(r.secure_material, {})} for r in rows]


class ApprovalIn(BaseModel):
    action: Literal["REQUEST", "APPROVE", "RETURN"]
    comment: str = Field(default="", max_length=3000)
    expert_membership_id: int | None = None


@router.post("/{company_id}/scenarios/{scenario_id}/approval")
async def scenario_approval(company_id: int, scenario_id: int, body: ApprovalIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await ensure_admin_member(db, user, company_id); scenario = await db.get(CompanyScenario, scenario_id)
    if not scenario or scenario.company_id != company_id: raise HTTPException(404, "Сценарий не найден")
    if body.action == "APPROVE" and actor.user_id in {scenario.author_id, scenario.owner_id}:
        raise HTTPException(409, "Публикацию должен подтвердить другой участник компании")
    if body.action == "APPROVE" and body.expert_membership_id:
        expert = await db.get(CompanyMembership, body.expert_membership_id)
        if not expert or expert.company_id != company_id: raise HTTPException(404, "Эксперт не найден")
    status = {"REQUEST": "REQUESTED", "APPROVE": "APPROVED", "RETURN": "RETURNED"}[body.action]
    row = CompanyScenarioApproval(company_id=company_id, scenario_id=scenario_id, reviewer_membership_id=actor.id, expert_membership_id=body.expert_membership_id, version=scenario.revision, status=status, comment=body.comment.strip() or None, reviewed_at=_now() if body.action != "REQUEST" else None); db.add(row)
    if body.action == "APPROVE": scenario.status = "PUBLISHED"
    elif body.action == "RETURN": scenario.status = "DRAFT"
    await db.commit(); return {"id": row.id, "scenario_id": scenario_id, "version": row.version, "status": status, "comment": row.comment}


@router.get("/{company_id}/scenarios/{scenario_id}/approvals")
async def scenario_approvals(company_id: int, scenario_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await ensure_admin_member(db, user, company_id); rows = list((await db.scalars(select(CompanyScenarioApproval).where(CompanyScenarioApproval.company_id == company_id, CompanyScenarioApproval.scenario_id == scenario_id).order_by(CompanyScenarioApproval.created_at.desc()))).all())
    return [{"id": r.id, "version": r.version, "status": r.status, "reviewer_membership_id": r.reviewer_membership_id, "expert_membership_id": r.expert_membership_id, "comment": r.comment, "created_at": r.created_at.isoformat()} for r in rows]


class IntegrationRequestIn(BaseModel):
    provider: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=10, max_length=4000)


@router.post("/{company_id}/integration-requests", status_code=201)
async def integration_request(company_id: int, body: IntegrationRequestIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); row = CompanyIntegrationRequest(company_id=company_id, requested_by=user.id, provider=body.provider.strip().lower(), description=body.description.strip()); db.add(row); await db.commit(); await db.refresh(row); return {"id": row.id, "provider": row.provider, "status": row.status}


@router.get("/{company_id}/integration-jobs")
async def integration_jobs(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await ensure_company_admin(db, user, company_id); rows = list((await db.scalars(select(CompanyIntegrationJob).where(CompanyIntegrationJob.company_id == company_id).order_by(CompanyIntegrationJob.created_at.desc()).limit(100))).all()); return [{"id": r.id, "operation": r.operation, "status": r.status, "attempts": r.attempts, "max_attempts": r.max_attempts, "next_attempt_at": r.next_attempt_at.isoformat() if r.next_attempt_at else None, "last_error": r.last_error} for r in rows]


class IntegrationJobIn(BaseModel):
    provider: str
    operation: Literal["IMPORT_MEMBERS", "EXPORT_COMPLETIONS", "SYNC_STRUCTURE", "PUSH_WEBHOOK"]
    payload: dict = Field(default_factory=dict)


class IntegrationWebhookIn(BaseModel):
    event_id: str = Field(min_length=2, max_length=180)
    event_type: str = Field(min_length=2, max_length=80)
    payload: dict = Field(default_factory=dict)


async def dispatch_due_advanced_integration_jobs(db: AsyncSession) -> int:
    """Run the durable integration queue with bounded, observable retries.

    Provider adapters remain intentionally deterministic until a tenant stores a
    real connector configuration.  The job lifecycle is still production-safe:
    every attempt is counted, failures back off, and exhausted work is visible.
    """
    rows = list((await db.scalars(select(CompanyIntegrationJob).where(CompanyIntegrationJob.status.in_(("QUEUED", "RETRY")), CompanyIntegrationJob.next_attempt_at <= _now()).order_by(CompanyIntegrationJob.created_at).limit(20))).all())
    processed = 0
    for row in rows:
        integration = await db.get(CompanyIntegration, row.integration_id)
        row.attempts += 1
        if integration is None or not integration.enabled:
            row.status = "FAILED" if row.attempts >= row.max_attempts else "RETRY"
            row.last_error = "Интеграция отключена или удалена"
        else:
            capabilities_list = _json(integration.capabilities, [])
            if row.operation not in capabilities_list and capabilities_list:
                row.status = "FAILED" if row.attempts >= row.max_attempts else "RETRY"
                row.last_error = f"Операция {row.operation} не разрешена конфигурацией провайдера"
            else:
                row.status = "COMPLETED"
                row.last_error = None
        if row.status == "RETRY": row.next_attempt_at = _now() + timedelta(seconds=min(3600, 30 * (2 ** max(0, row.attempts - 1))))
        processed += 1
    if rows: await db.commit()
    return processed


@router.post("/{company_id}/integration-jobs", status_code=202)
async def queue_integration_job(company_id: int, body: IntegrationJobIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await ensure_company_admin(db, user, company_id); integration = await db.scalar(select(CompanyIntegration).where(CompanyIntegration.company_id == company_id, CompanyIntegration.provider == body.provider, CompanyIntegration.enabled == 1))
    if not integration: raise HTTPException(409, "Сначала включите интеграцию провайдера")
    row = CompanyIntegrationJob(company_id=company_id, integration_id=integration.id, operation=body.operation, payload=dumps(body.payload), created_by=user.id, next_attempt_at=_now()); db.add(row); await db.commit(); await db.refresh(row); return {"id": row.id, "status": row.status, "retry_policy": {"max_attempts": row.max_attempts, "backoff_seconds": [30, 120, 600, 3600]}}


@router.post("/{company_id}/integrations/{integration_id}/webhook", status_code=202)
async def integration_webhook(company_id: int, integration_id: int, body: IntegrationWebhookIn, x_arena_signature: str | None = Header(default=None), db: AsyncSession = Depends(get_db)):
    integration = await db.get(CompanyIntegration, integration_id)
    if integration is None or integration.company_id != company_id or not integration.enabled: raise HTTPException(404, "Интеграция не найдена или отключена")
    canonical = dumps({"event_id": body.event_id, "event_type": body.event_type, "payload": body.payload})
    expected = hmac.new(settings.secret_key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    if not x_arena_signature or not hmac.compare_digest(x_arena_signature, expected): raise HTTPException(401, "Подпись webhook не прошла проверку")
    operation = "IMPORT_MEMBERS" if body.event_type.upper() in {"EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_DELETED"} else "SYNC_STRUCTURE"
    row = CompanyIntegrationJob(company_id=company_id, integration_id=integration_id, operation=operation, payload=dumps({"event_id": body.event_id, "event_type": body.event_type, "payload": body.payload}), created_by=integration.updated_by, next_attempt_at=_now())
    db.add(row); await db.commit(); await db.refresh(row)
    return {"accepted": True, "job_id": row.id, "status": row.status, "operation": row.operation}


@router.post("/{company_id}/integration-jobs/{job_id}/retry")
async def retry_integration_job(company_id: int, job_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_company_admin(db, user, company_id)
    row = await db.get(CompanyIntegrationJob, job_id)
    if row is None or row.company_id != company_id: raise HTTPException(404, "Задание синхронизации не найдено")
    if row.status not in {"FAILED", "RETRY"}: raise HTTPException(409, "Повтор доступен только для завершившегося с ошибкой задания")
    row.status = "QUEUED"; row.next_attempt_at = _now(); row.last_error = None; db.add(row); await db.commit()
    return {"id": row.id, "status": row.status, "attempts": row.attempts}


@router.post("/{company_id}/billing/invoices", status_code=201)
async def create_invoice(company_id: int, plan_code: str = Query("TEAM"), amount_minor: int = Query(0, ge=0), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_company_admin(db, user, company_id); row = CompanyBillingInvoice(company_id=company_id, plan_code=plan_code, amount_minor=amount_minor); db.add(row); await db.commit(); await db.refresh(row); return {"id": row.id, "status": row.status, "plan_code": row.plan_code, "amount_minor": row.amount_minor, "currency": row.currency}


@router.get("/{company_id}/billing/invoices")
async def invoices(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_company_admin(db, user, company_id); rows = list((await db.scalars(select(CompanyBillingInvoice).where(CompanyBillingInvoice.company_id == company_id).order_by(CompanyBillingInvoice.issued_at.desc()))).all()); return [{"id": r.id, "plan_code": r.plan_code, "amount_minor": r.amount_minor, "currency": r.currency, "status": r.status, "issued_at": r.issued_at.isoformat()} for r in rows]


class BillingEventIn(BaseModel):
    provider: str
    event_id: str
    event_type: str
    company_id: int | None = None
    payload: dict = Field(default_factory=dict)


@router.post("/billing/webhooks", status_code=202)
async def billing_webhook(body: BillingEventIn, x_arena_signature: str | None = Header(default=None), db: AsyncSession = Depends(get_db)):
    payload_hash = hashlib.sha256(dumps(body.payload).encode()).hexdigest(); existing = await db.scalar(select(CompanyBillingEvent).where(CompanyBillingEvent.event_id == body.event_id))
    if existing: return {"accepted": True, "duplicate": True, "event_id": body.event_id}
    expected = hmac.new(settings.secret_key.encode("utf-8"), f"{body.event_id}:{payload_hash}".encode("utf-8"), hashlib.sha256).hexdigest()
    if not x_arena_signature or not hmac.compare_digest(x_arena_signature, expected):
        raise HTTPException(401, "Подпись webhook не прошла проверку")
    row = CompanyBillingEvent(company_id=body.company_id, provider=body.provider, event_id=body.event_id, event_type=body.event_type, payload_hash=payload_hash, processed_at=_now()); db.add(row); await db.commit(); return {"accepted": True, "duplicate": False, "event_id": body.event_id}


@router.post("/{company_id}/sso/{provider}/assert")
async def sso_assert(company_id: int, provider: Literal["oidc", "saml"], subject: str = Query(...), email: str | None = Query(None), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id)
    require_action(actor, "manage_company", manager=True)
    if not subject.strip(): raise HTTPException(422, "SSO subject обязателен")
    identity = await db.scalar(select(CompanySsoIdentity).where(CompanySsoIdentity.company_id == company_id, CompanySsoIdentity.provider == provider, CompanySsoIdentity.subject == subject))
    user = await db.scalar(select(User).where(User.username == email)) if email else None
    created = False
    if identity is None:
        identity = CompanySsoIdentity(company_id=company_id, provider=provider, subject=subject, user_id=user.id if user else None, email=email); db.add(identity); created = True
    identity.last_login_at = _now(); await db.commit(); return {"accepted": True, "identity_id": identity.id, "mapped_user_id": identity.user_id, "provisioning_required": identity.user_id is None, "created": created}


class SsoProvisionIn(BaseModel):
    provider: Literal["oidc", "saml"]
    subject: str = Field(min_length=2, max_length=240)
    email: str = Field(min_length=5, max_length=254)
    display_name: str = Field(min_length=2, max_length=180)
    job_title: str = Field(default="Сотрудник", max_length=160)
    corporate_role: str = Field(default="EMPLOYEE", max_length=40)
    department_id: int | None = None


@router.post("/{company_id}/sso/provision", status_code=201)
async def sso_provision(company_id: int, body: SsoProvisionIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); require_action(actor, "manage_company", manager=True)
    if body.corporate_role not in ROLE_LABELS: raise HTTPException(422, "Неизвестная корпоративная роль")
    identity = await db.scalar(select(CompanySsoIdentity).where(CompanySsoIdentity.company_id == company_id, CompanySsoIdentity.provider == body.provider, CompanySsoIdentity.subject == body.subject))
    existing_user = await db.scalar(select(User).where(User.username == body.email.strip().lower()))
    created_user = False
    if existing_user is None:
        from app.registration_policy import require_registration_open
        await require_registration_open(db)
        existing_user = User(username=body.email.strip().lower(), password_hash=hash_password(secrets.token_urlsafe(32)), display_name=body.display_name.strip())
        db.add(existing_user); await db.flush(); created_user = True
    member = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.user_id == existing_user.id))
    if member is None:
        member = CompanyMembership(company_id=company_id, user_id=existing_user.id, corporate_role=body.corporate_role, status="ACTIVE", is_primary=1, joined_at=_now(), verified_at=_now(), job_title=body.job_title.strip(), department_id=body.department_id)
        db.add(member)
    else:
        member.status = "ACTIVE"; member.verified_at = _now(); member.job_title = body.job_title.strip(); member.corporate_role = body.corporate_role; member.department_id = body.department_id
    identity = identity or CompanySsoIdentity(company_id=company_id, provider=body.provider, subject=body.subject)
    identity.user_id = existing_user.id; identity.email = body.email.strip().lower(); identity.last_login_at = _now(); db.add(identity)
    await db.commit(); await db.refresh(member)
    return {"user_id": existing_user.id, "membership_id": member.id, "identity_id": identity.id, "created_user": created_user, "status": member.status}


@router.delete("/{company_id}/sso/{provider}/provision/{subject}")
async def sso_deprovision(company_id: int, provider: Literal["oidc", "saml"], subject: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); require_action(actor, "manage_company", manager=True)
    identity = await db.scalar(select(CompanySsoIdentity).where(CompanySsoIdentity.company_id == company_id, CompanySsoIdentity.provider == provider, CompanySsoIdentity.subject == subject))
    if identity is None or identity.user_id is None: raise HTTPException(404, "SSO-пользователь не найден")
    member = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.user_id == identity.user_id, CompanyMembership.status != "LEFT"))
    if member is None: raise HTTPException(404, "Membership не найден")
    member.status = "LEFT"
    await db.commit(); return {"ok": True, "membership_id": member.id, "status": member.status}


@router.post("/{company_id}/active-sessions")
async def register_active_session(company_id: int, user_agent: str = Query(""), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    member = await member_for(db, user, company_id); raw = secrets.token_urlsafe(32); row = CompanyActiveSession(company_id=company_id, membership_id=member.id, token_hash=hashlib.sha256(raw.encode()).hexdigest(), user_agent=user_agent[:500]); db.add(row); await db.commit(); await db.refresh(row); return {"id": row.id, "session_token": raw, "created_at": row.created_at.isoformat()}


@router.get("/{company_id}/active-sessions")
async def active_sessions(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await ensure_company_admin(db, user, company_id); rows = list((await db.scalars(select(CompanyActiveSession).where(CompanyActiveSession.company_id == company_id, CompanyActiveSession.revoked_at.is_(None)).order_by(CompanyActiveSession.last_seen_at.desc()))).all()); return [{"id": r.id, "membership_id": r.membership_id, "user_agent": r.user_agent, "created_at": r.created_at.isoformat(), "last_seen_at": r.last_seen_at.isoformat()} for r in rows]


@router.delete("/{company_id}/active-sessions/{session_id}")
async def revoke_active_session(company_id: int, session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await member_for(db, user, company_id); row = await db.get(CompanyActiveSession, session_id)
    if not row or row.company_id != company_id or (row.membership_id != actor.id and not capabilities(actor).get("manage_company")): raise HTTPException(404, "Сессия не найдена")
    row.revoked_at = _now(); await db.commit(); return {"ok": True}


class LeagueConsentIn(BaseModel):
    aggregate_scope: Literal["COMPANY_AVERAGE", "COMPANY_PERCENTILE"] = "COMPANY_AVERAGE"
    confirm: bool


@router.post("/{company_id}/leagues/{league_id}/consent")
async def league_consent(company_id: int, league_id: int, body: LeagueConsentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await ensure_admin_member(db, user, company_id)
    if not body.confirm: raise HTTPException(422, "Нужно подтвердить публикацию только агрегированных данных")
    league = await db.get(CompanyLeague, league_id)
    if not league: raise HTTPException(404, "Лига не найдена")
    row = await db.scalar(select(CompanyLeagueConsent).where(CompanyLeagueConsent.league_id == league_id, CompanyLeagueConsent.company_id == company_id)); row = row or CompanyLeagueConsent(league_id=league_id, company_id=company_id, accepted_by=user.id)
    row.aggregate_scope = body.aggregate_scope; row.revoked_at = None; db.add(row); await db.commit(); return {"league_id": league_id, "company_id": company_id, "consented": True, "aggregate_scope": row.aggregate_scope, "policy_version": row.policy_version}


@router.post("/{company_id}/leagues/{league_id}/consent/revoke")
async def revoke_league_consent(company_id: int, league_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_admin_member(db, user, company_id); row = await db.scalar(select(CompanyLeagueConsent).where(CompanyLeagueConsent.league_id == league_id, CompanyLeagueConsent.company_id == company_id));
    if not row: raise HTTPException(404, "Согласие не найдено")
    row.revoked_at = _now(); await db.commit(); return {"consented": False, "revoked_at": row.revoked_at.isoformat()}


@admin_router.get("/scenario-requests")
async def admin_scenario_requests(db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)):
    rows = list((await db.scalars(select(CompanyScenarioRequest).order_by(CompanyScenarioRequest.created_at.desc()).limit(200))).all()); return [{"id": r.id, "company_id": r.company_id, "title": r.title, "brief": r.brief, "mode": r.mode, "status": r.status, "secure_material": _json(r.secure_material, {}), "created_at": r.created_at.isoformat()} for r in rows]


@admin_router.patch("/scenario-requests/{request_id}")
async def admin_update_scenario_request(request_id: int, status: Literal["SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "DONE", "DECLINED"], note: str = Query(""), db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)):
    row = await db.get(CompanyScenarioRequest, request_id)
    if not row: raise HTTPException(404, "Заявка не найдена")
    row.status = status; row.admin_note = note.strip() or None; await db.commit(); return {"id": row.id, "status": row.status, "admin_note": row.admin_note}


@admin_router.get("/integration-requests")
async def admin_integration_requests(db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)):
    rows = list((await db.scalars(select(CompanyIntegrationRequest).order_by(CompanyIntegrationRequest.created_at.desc()).limit(200))).all()); return [{"id": r.id, "company_id": r.company_id, "provider": r.provider, "description": r.description, "status": r.status, "created_at": r.created_at.isoformat()} for r in rows]


@admin_router.patch("/integration-requests/{request_id}")
async def admin_update_integration_request(request_id: int, status: Literal["SUBMITTED", "IN_REVIEW", "SCHEDULED", "DONE", "DECLINED"], note: str = Query(""), db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)):
    row = await db.get(CompanyIntegrationRequest, request_id)
    if not row: raise HTTPException(404, "Заявка не найдена")
    row.status = status; row.admin_note = note.strip() or None; await db.commit(); return {"id": row.id, "status": row.status, "admin_note": row.admin_note}
