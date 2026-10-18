"""Corporate meeting protocols: consent, review, checks and publication."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import active_company_member, visible_membership_ids
from app.company_meeting_models import (
    CompanyMeeting, CompanyMeetingApproval, CompanyMeetingParticipant,
    CompanyMeetingProtocol, CompanyMeetingProtocolItem, CompanyMeetingTranscriptSegment,
    CompanyMeetingValidationIssue,
)
from app.routers.company_episodes import ensure_episode_participants, linked_episode_or_403, materialize_protocol_commitments
from app.company_models import CompanyInboxMessage, CompanyMembership
from app.company_notifications import deliver_company_event
from app.db import get_db
from app.engine.meeting_protocol import draft_from_segments, validate_items
from app.models import Notification, User
from app.routers.company import allows_member_notification, audit, require_membership

router = APIRouter(prefix="/company", tags=["company-meetings"])


class MeetingCreateIn(BaseModel):
    kind: Literal["MEETING", "NEGOTIATION", "ONE_TO_ONE", "COUNCIL"] = "MEETING"
    title: str = Field(min_length=3, max_length=220)
    description: str = Field(default="", max_length=3000)
    agenda: list[str] = Field(default_factory=list, max_length=20)
    membership_ids: list[int] = Field(default_factory=list, max_length=80)
    scheduled_at: datetime | None = None
    duration_minutes: int = Field(default=30, ge=5, le=480)
    consent_required: bool = True
    episode_id: int | None = None


class ConsentIn(BaseModel):
    accepted: bool


class TranscriptIn(BaseModel):
    speaker_membership_id: int | None = None
    start_ms: int = Field(default=0, ge=0)
    end_ms: int = Field(default=0, ge=0)
    text: str = Field(min_length=1, max_length=10000)


class ProtocolItemIn(BaseModel):
    kind: Literal["DECISION", "ACTION", "QUESTION", "RISK"] = "ACTION"
    title: str = Field(min_length=2, max_length=240)
    detail: str = Field(default="", max_length=5000)
    assignee_membership_id: int | None = None
    due_at: datetime | None = None
    acceptance_criteria: str = Field(default="", max_length=2000)
    source_segment_ids: list[int] = Field(default_factory=list, max_length=50)


class ProtocolUpdateIn(BaseModel):
    version: int = Field(ge=1)
    summary: str = Field(default="", max_length=3000)


class ApprovalIn(BaseModel):
    version: int = Field(ge=1)
    status: Literal["APPROVED", "CHANGES_REQUESTED"]
    comment: str = Field(default="", max_length=2000)


def _json(value, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


async def _meeting_or_404(db: AsyncSession, company_id: int, meeting_id: int) -> CompanyMeeting:
    row = await db.get(CompanyMeeting, meeting_id)
    if row is None or row.company_id != company_id:
        raise HTTPException(404, "Встреча не найдена")
    return row


async def _participants(db: AsyncSession, meeting_id: int):
    return list((await db.scalars(select(CompanyMeetingParticipant).where(
        CompanyMeetingParticipant.meeting_id == meeting_id
    ))).all())


async def _require_meeting_access(db: AsyncSession, company_id: int, meeting_id: int, user: User):
    actor = await require_membership(db, user, company_id)
    meeting = await _meeting_or_404(db, company_id, meeting_id)
    participants = await _participants(db, meeting_id)
    if actor.id not in {row.membership_id for row in participants}:
        raise HTTPException(403, "Эта встреча доступна только её участникам")
    return actor, meeting, participants


async def _member_name(db: AsyncSession, membership_id: int) -> str:
    member = await db.get(CompanyMembership, membership_id)
    person = await db.get(User, member.user_id) if member else None
    return (person.display_name or person.username) if person else "Сотрудник"


async def _serialize_meeting(db: AsyncSession, meeting: CompanyMeeting, actor: CompanyMembership) -> dict:
    participants = await _participants(db, meeting.id)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting.id))
    people = []
    for row in participants:
        people.append({"membership_id": row.membership_id, "name": await _member_name(db, row.membership_id),
                       "role": row.role, "invite_status": row.invite_status, "consent_status": row.consent_status})
    return {"id": meeting.id, "episode_id": meeting.episode_id, "kind": meeting.kind, "title": meeting.title, "description": meeting.description,
            "agenda": _json(meeting.agenda, []), "status": meeting.status,
            "scheduled_at": meeting.scheduled_at.isoformat() if meeting.scheduled_at else None,
            "duration_minutes": meeting.duration_minutes, "consent_required": bool(meeting.consent_required),
            "participants": people, "is_organizer": actor.id == meeting.organizer_membership_id,
            "my_consent": next((row.consent_status for row in participants if row.membership_id == actor.id), "PENDING"),
            "protocol_status": protocol.status if protocol else None, "protocol_id": protocol.id if protocol else None}


async def _protocol_payload(db: AsyncSession, protocol: CompanyMeetingProtocol) -> dict:
    items = list((await db.scalars(select(CompanyMeetingProtocolItem).where(
        CompanyMeetingProtocolItem.protocol_id == protocol.id).order_by(CompanyMeetingProtocolItem.id)
    )).all())
    approvals = list((await db.scalars(select(CompanyMeetingApproval).where(
        CompanyMeetingApproval.protocol_id == protocol.id, CompanyMeetingApproval.version == protocol.version
    ))).all())
    issues = list((await db.scalars(select(CompanyMeetingValidationIssue).where(
        CompanyMeetingValidationIssue.protocol_id == protocol.id, CompanyMeetingValidationIssue.resolved_at.is_(None)
    ))).all())
    return {"id": protocol.id, "status": protocol.status, "version": protocol.version, "summary": protocol.summary,
            "published_at": protocol.published_at.isoformat() if protocol.published_at else None,
            "items": [{"id": row.id, "kind": row.kind, "status": row.status, "title": row.title, "detail": row.detail,
                       "assignee_membership_id": row.assignee_membership_id, "due_at": row.due_at.isoformat() if row.due_at else None,
                       "acceptance_criteria": row.acceptance_criteria, "source_segment_ids": _json(row.source_segment_ids, []),
                       "confidence": row.confidence} for row in items],
            "approvals": [{"membership_id": row.membership_id, "name": await _member_name(db, row.membership_id),
                           "status": row.status, "comment": row.comment} for row in approvals],
            "issues": [{"id": row.id, "item_id": row.item_id, "severity": row.severity, "code": row.code, "message": row.message} for row in issues]}


async def _refresh_validation(db: AsyncSession, protocol: CompanyMeetingProtocol) -> list[dict]:
    items = list((await db.scalars(select(CompanyMeetingProtocolItem).where(
        CompanyMeetingProtocolItem.protocol_id == protocol.id
    ))).all())
    await db.execute(delete(CompanyMeetingValidationIssue).where(CompanyMeetingValidationIssue.protocol_id == protocol.id))
    raw = validate_items([{"id": row.id, "kind": row.kind, "assignee_membership_id": row.assignee_membership_id,
                           "due_at": row.due_at, "acceptance_criteria": row.acceptance_criteria,
                           "source_segment_ids": _json(row.source_segment_ids, [])} for row in items])
    for issue in raw:
        db.add(CompanyMeetingValidationIssue(protocol_id=protocol.id, **issue))
    return raw


@router.post("/{company_id}/meetings", status_code=201)
async def create_meeting(company_id: int, body: MeetingCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episode = await linked_episode_or_403(db, company_id, body.episode_id, actor)
    visible = set(await visible_membership_ids(db, actor))
    ids = list(dict.fromkeys([actor.id, *body.membership_ids]))
    if set(ids) - visible:
        raise HTTPException(403, "Можно приглашать только сотрудников из доступной вам области")
    for membership_id in ids:
        await active_company_member(db, company_id, membership_id)
    if episode:
        await ensure_episode_participants(db, episode, ids)
    meeting = CompanyMeeting(company_id=company_id, episode_id=episode.id if episode else None, organizer_membership_id=actor.id, kind=body.kind,
                             title=body.title.strip(), description=body.description.strip(), agenda=json.dumps(body.agenda, ensure_ascii=False),
                             scheduled_at=body.scheduled_at, duration_minutes=body.duration_minutes,
                             consent_required=int(body.consent_required))
    db.add(meeting); await db.flush()
    if episode and episode.status in {"PREPARING", "READY"}:
        episode.status = "IN_MEETING"
    for membership_id in ids:
        db.add(CompanyMeetingParticipant(meeting_id=meeting.id, membership_id=membership_id,
               role="ORGANIZER" if membership_id == actor.id else "PARTICIPANT",
               invite_status="ACCEPTED" if membership_id == actor.id else "INVITED",
               consent_status="ACCEPTED" if membership_id == actor.id and body.consent_required else "PENDING"))
        if membership_id != actor.id:
            recipient = await db.get(CompanyMembership, membership_id)
            if recipient and allows_member_notification(recipient, "room"):
                payload = json.dumps({"company_id": company_id, "meeting_id": meeting.id, "title": meeting.title}, ensure_ascii=False)
                db.add(Notification(user_id=recipient.user_id, type="COMPANY_MEETING", payload=payload))
                db.add(CompanyInboxMessage(company_id=company_id, membership_id=recipient.id, type="COMPANY_MEETING",
                    title="Приглашение на встречу", text=meeting.title, payload=payload))
    await audit(db, actor, user.id, "MEETING_CREATED", "company_meeting", meeting.id, {"kind": body.kind, "participants": ids})
    await db.commit()
    await deliver_company_event(db, company_id, {"type": "MEETING_CREATED", "meeting_id": meeting.id, "title": meeting.title})
    return await _serialize_meeting(db, meeting, actor)


@router.get("/{company_id}/meetings")
async def list_meetings(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    rows = list((await db.scalars(select(CompanyMeeting).where(CompanyMeeting.company_id == company_id).order_by(
        CompanyMeeting.scheduled_at.desc(), CompanyMeeting.created_at.desc()
    ))).all())
    result = []
    for meeting in rows:
        participants = await _participants(db, meeting.id)
        if actor.id in {row.membership_id for row in participants}:
            result.append(await _serialize_meeting(db, meeting, actor))
    return result


@router.get("/{company_id}/meetings/{meeting_id}")
async def meeting_detail(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    result = await _serialize_meeting(db, meeting, actor)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol:
        result["protocol"] = await _protocol_payload(db, protocol)
    return result


@router.post("/{company_id}/meetings/{meeting_id}/consent")
async def set_consent(company_id: int, meeting_id: int, body: ConsentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    row = next(row for row in participants if row.membership_id == actor.id)
    row.consent_status = "ACCEPTED" if body.accepted else "DECLINED"
    row.invite_status = "ACCEPTED" if body.accepted else "DECLINED"
    row.consented_at = datetime.utcnow() if body.accepted else None
    await audit(db, actor, user.id, "MEETING_CONSENT_UPDATED", "company_meeting", meeting.id, {"accepted": body.accepted})
    await db.commit(); return {"ok": True, "consent_status": row.consent_status}


@router.post("/{company_id}/meetings/{meeting_id}/finish")
async def finish_meeting(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    if actor.id != meeting.organizer_membership_id:
        raise HTTPException(403, "Завершить встречу может её организатор")
    if meeting.consent_required and any(row.consent_status != "ACCEPTED" for row in participants):
        raise HTTPException(409, "Сначала все участники должны подтвердить согласие на обработку итогов")
    meeting.status = "PROCESSING"; meeting.finished_at = datetime.utcnow()
    await db.commit(); return {"ok": True, "status": meeting.status}


@router.post("/{company_id}/meetings/{meeting_id}/transcript", status_code=201)
async def add_transcript_segment(company_id: int, meeting_id: int, body: TranscriptIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    participant_ids = {row.membership_id for row in participants}
    if body.speaker_membership_id and body.speaker_membership_id not in participant_ids:
        raise HTTPException(422, "Говорящий должен быть участником встречи")
    row = CompanyMeetingTranscriptSegment(meeting_id=meeting.id, **body.model_dump())
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "text": row.text, "start_ms": row.start_ms, "end_ms": row.end_ms}


@router.get("/{company_id}/meetings/{meeting_id}/transcript")
async def get_transcript(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _, _, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    rows = list((await db.scalars(select(CompanyMeetingTranscriptSegment).where(
        CompanyMeetingTranscriptSegment.meeting_id == meeting_id
    ).order_by(CompanyMeetingTranscriptSegment.start_ms, CompanyMeetingTranscriptSegment.id))).all())
    return [{"id": row.id, "speaker_membership_id": row.speaker_membership_id, "speaker": await _member_name(db, row.speaker_membership_id) if row.speaker_membership_id else "Не определён",
             "start_ms": row.start_ms, "end_ms": row.end_ms, "text": row.text, "confidence": row.confidence,
             "excluded_from_analysis": bool(row.excluded_from_analysis)} for row in rows]


@router.post("/{company_id}/meetings/{meeting_id}/analyze")
async def analyze_meeting(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    if actor.id != meeting.organizer_membership_id:
        raise HTTPException(403, "Запустить подготовку итогов может организатор")
    segments = list((await db.scalars(select(CompanyMeetingTranscriptSegment).where(
        CompanyMeetingTranscriptSegment.meeting_id == meeting_id, CompanyMeetingTranscriptSegment.excluded_from_analysis == 0
    ).order_by(CompanyMeetingTranscriptSegment.start_ms, CompanyMeetingTranscriptSegment.id))).all())
    summary, suggestions = draft_from_segments([{"id": row.id, "text": row.text} for row in segments])
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None:
        protocol = CompanyMeetingProtocol(meeting_id=meeting_id, status="REVIEW", summary=summary)
        db.add(protocol); await db.flush()
    else:
        protocol.version += 1; protocol.status = "REVIEW"; protocol.summary = summary
        await db.execute(delete(CompanyMeetingProtocolItem).where(CompanyMeetingProtocolItem.protocol_id == protocol.id))
    for item in suggestions:
        db.add(CompanyMeetingProtocolItem(protocol_id=protocol.id, kind=item["kind"], title=item["title"],
               source_segment_ids=json.dumps(item["source_segment_ids"]), confidence=item["confidence"]))
    await db.flush(); await _refresh_validation(db, protocol)
    meeting.status = "REVIEW"; await audit(db, actor, user.id, "MEETING_PROTOCOL_DRAFTED", "company_meeting", meeting.id, {"version": protocol.version})
    await db.commit(); return await _protocol_payload(db, protocol)


@router.post("/{company_id}/meetings/{meeting_id}/protocol/items", status_code=201)
async def add_protocol_item(company_id: int, meeting_id: int, body: ProtocolItemIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None or protocol.status == "PUBLISHED":
        raise HTTPException(409, "Протокол недоступен для изменений")
    if body.assignee_membership_id:
        await active_company_member(db, company_id, body.assignee_membership_id)
    row = CompanyMeetingProtocolItem(protocol_id=protocol.id, **body.model_dump(exclude={"source_segment_ids"}),
                                     source_segment_ids=json.dumps(body.source_segment_ids))
    db.add(row); protocol.version += 1; await db.flush(); await _refresh_validation(db, protocol); await db.commit()
    return await _protocol_payload(db, protocol)


@router.put("/{company_id}/meetings/{meeting_id}/protocol")
async def update_protocol(company_id: int, meeting_id: int, body: ProtocolUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None or protocol.status == "PUBLISHED": raise HTTPException(409, "Протокол недоступен для изменений")
    if body.version != protocol.version: raise HTTPException(409, "Протокол изменился. Обновите страницу и проверьте последнюю версию.")
    protocol.summary = body.summary.strip(); protocol.version += 1; await _refresh_validation(db, protocol); await db.commit()
    return await _protocol_payload(db, protocol)


@router.post("/{company_id}/meetings/{meeting_id}/protocol/approve")
async def approve_protocol(company_id: int, meeting_id: int, body: ApprovalIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None: raise HTTPException(404, "Черновик протокола ещё не подготовлен")
    if body.version != protocol.version: raise HTTPException(409, "Подтверждается только актуальная версия протокола")
    existing = await db.scalar(select(CompanyMeetingApproval).where(CompanyMeetingApproval.protocol_id == protocol.id,
        CompanyMeetingApproval.membership_id == actor.id, CompanyMeetingApproval.version == body.version))
    if existing: existing.status = body.status; existing.comment = body.comment.strip()
    else: db.add(CompanyMeetingApproval(protocol_id=protocol.id, membership_id=actor.id, version=body.version, status=body.status, comment=body.comment.strip()))
    await db.commit(); return await _protocol_payload(db, protocol)


@router.post("/{company_id}/meetings/{meeting_id}/protocol/publish")
async def publish_protocol(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    if actor.id != meeting.organizer_membership_id: raise HTTPException(403, "Опубликовать протокол может организатор")
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None: raise HTTPException(404, "Черновик протокола ещё не подготовлен")
    await _refresh_validation(db, protocol)
    issues = list((await db.scalars(select(CompanyMeetingValidationIssue).where(CompanyMeetingValidationIssue.protocol_id == protocol.id,
        CompanyMeetingValidationIssue.severity == "BLOCKER", CompanyMeetingValidationIssue.resolved_at.is_(None)))).all())
    if issues: raise HTTPException(409, "Исправьте обязательные пункты перед публикацией")
    approvals = list((await db.scalars(select(CompanyMeetingApproval).where(CompanyMeetingApproval.protocol_id == protocol.id,
        CompanyMeetingApproval.version == protocol.version, CompanyMeetingApproval.status == "APPROVED"))).all())
    required = {row.membership_id for row in participants}
    if not required.issubset({row.membership_id for row in approvals}):
        raise HTTPException(409, "Не все участники подтвердили актуальную версию протокола")
    protocol.status = "PUBLISHED"; protocol.published_at = datetime.utcnow(); protocol.published_by_membership_id = actor.id
    meeting.status = "COMPLETED"
    published_items = list((await db.scalars(select(CompanyMeetingProtocolItem).where(
        CompanyMeetingProtocolItem.protocol_id == protocol.id
    ))).all())
    for item in published_items:
        if item.kind == "ACTION" and item.status == "DRAFT":
            item.status = "OPEN"
    if meeting.episode_id:
        await materialize_protocol_commitments(db, meeting.episode_id, meeting.id, published_items, actor.id)
    for participant in participants:
        if allows_member_notification(await db.get(CompanyMembership, participant.membership_id), "room"):
            db.add(Notification(user_id=(await db.get(CompanyMembership, participant.membership_id)).user_id, type="MEETING_PROTOCOL_PUBLISHED", payload=json.dumps({"company_id": company_id, "meeting_id": meeting.id, "title": meeting.title}, ensure_ascii=False)))
            db.add(CompanyInboxMessage(company_id=company_id, membership_id=participant.membership_id, type="MEETING_PROTOCOL_PUBLISHED", title="Опубликован итог встречи", text=meeting.title, payload=json.dumps({"meeting_id": meeting.id}, ensure_ascii=False)))
    await audit(db, actor, user.id, "MEETING_PROTOCOL_PUBLISHED", "company_meeting", meeting.id, {"version": protocol.version})
    await db.commit(); await deliver_company_event(db, company_id, {"type": "MEETING_PROTOCOL_PUBLISHED", "meeting_id": meeting.id, "title": meeting.title})
    return await _protocol_payload(db, protocol)
