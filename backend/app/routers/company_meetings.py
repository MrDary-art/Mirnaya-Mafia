"""Corporate meeting reports: consent, review and controlled delivery."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import active_company_member, capabilities, visible_membership_ids
from app.company_meeting_models import (
    CompanyMeeting, CompanyMeetingApproval, CompanyMeetingParticipant,
    CompanyMeetingProtocol, CompanyMeetingProtocolItem, CompanyMeetingTranscriptSegment,
    CompanyMeetingValidationIssue,
)
from app.company_episode_models import CompanyWorkEpisode
from app.council_models import CouncilMeeting, CouncilMember
from app.company_council import create_preparation_council
from app.routers.company_episodes import ensure_episode_participants, linked_episode_or_403, materialize_protocol_commitments, utc_schedule_iso
from app.company_models import CompanyInboxMessage, CompanyMembership
from app.company_notifications import deliver_company_event
from app.db import get_db
from app.engine.meeting_protocol import draft_from_segments, refine_summary_with_ai, validate_items
from app.models import Notification, User
from app.routers.company import allows_member_notification, audit, require_membership

router = APIRouter(prefix="/company", tags=["company-meetings"])
CONSENT_PURPOSE_LABELS = {
    "TRANSCRIPT_ANALYSIS": "Черновик итогов по заметкам встречи",
    "PROTOCOL_SHARING": "Передача итогового отчёта участникам",
}


class MeetingCreateIn(BaseModel):
    kind: Literal["MEETING", "NEGOTIATION", "ONE_TO_ONE", "COUNCIL", "PREPARATION_CALL"] = "MEETING"
    title: str = Field(min_length=3, max_length=220)
    description: str = Field(default="", max_length=3000)
    agenda: list[str] = Field(default_factory=list, max_length=20)
    membership_ids: list[int] = Field(default_factory=list, max_length=80)
    scheduled_at: datetime | None = None
    duration_minutes: int = Field(default=30, ge=5, le=480)
    consent_required: bool = True
    consent_purposes: list[Literal["TRANSCRIPT_ANALYSIS", "PROTOCOL_SHARING"]] = Field(default_factory=lambda: list(CONSENT_PURPOSE_LABELS))
    episode_id: int | None = None


class ConsentIn(BaseModel):
    accepted: bool
    purposes: list[Literal["TRANSCRIPT_ANALYSIS", "PROTOCOL_SHARING"]] | None = Field(default=None, max_length=2)


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


class ProtocolAssigneeIn(BaseModel):
    version: int = Field(ge=1)
    assignee_membership_id: int = Field(ge=1)


class ApprovalIn(BaseModel):
    version: int = Field(ge=1)
    status: Literal["APPROVED", "CHANGES_REQUESTED"]
    comment: str = Field(default="", max_length=2000)


def _json(value, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def _meeting_consent_purposes(meeting: CompanyMeeting) -> list[str]:
    purposes = [item for item in _json(meeting.consent_purposes, []) if item in CONSENT_PURPOSE_LABELS]
    return purposes or (list(CONSENT_PURPOSE_LABELS) if meeting.consent_required else [])


def _consent_preferences(participant: CompanyMeetingParticipant, purposes: list[str]) -> dict[str, str]:
    saved = _json(participant.consent_preferences, {})
    if not isinstance(saved, dict):
        saved = {}
    if not saved and participant.consent_status == "ACCEPTED":
        return {purpose: "ACCEPTED" for purpose in purposes}
    return {purpose: saved.get(purpose, "PENDING") for purpose in purposes}


def _consent_status(preferences: dict[str, str], purposes: list[str]) -> str:
    if not purposes:
        return "NOT_REQUIRED"
    if all(preferences.get(purpose) == "ACCEPTED" for purpose in purposes):
        return "ACCEPTED"
    if any(preferences.get(purpose) == "DECLINED" for purpose in purposes):
        return "DECLINED"
    return "PENDING"


def _all_required_consented(meeting: CompanyMeeting, participants: list[CompanyMeetingParticipant], purpose: str | None = None) -> bool:
    purposes = _meeting_consent_purposes(meeting)
    required = [purpose] if purpose else purposes
    return not required or all(
        all(_consent_preferences(participant, purposes).get(item) == "ACCEPTED" for item in required)
        for participant in participants
    )


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
    participant_ids = {row.membership_id for row in participants}
    can_view_as_manager = capabilities(actor).get("manage_team") and participant_ids <= set(await visible_membership_ids(db, actor))
    if actor.id not in participant_ids and not can_view_as_manager:
        raise HTTPException(403, "Эта встреча доступна только её участникам")
    return actor, meeting, participants


async def _is_report_reviewer(db: AsyncSession, meeting: CompanyMeeting, actor: CompanyMembership) -> bool:
    """Return whether the actor may check and release the meeting report.

    In a working situation the report belongs to the person who created that
    situation. A standalone meeting has no separate owner, so its organiser
    is the reviewer. This preserves older standalone meetings without adding a
    second role for people to understand.
    """
    if meeting.episode_id is not None:
        episode = await db.get(CompanyWorkEpisode, meeting.episode_id)
        if episode is not None:
            return episode.owner_membership_id == actor.id
    return meeting.organizer_membership_id == actor.id


async def _member_name(db: AsyncSession, membership_id: int) -> str:
    member = await db.get(CompanyMembership, membership_id)
    person = await db.get(User, member.user_id) if member else None
    return (person.display_name or person.username) if person else "Сотрудник"


async def _create_linked_decision_council(
    db: AsyncSession,
    *,
    company_meeting: CompanyMeeting,
    participant_membership_ids: list[int],
    organizer: CompanyMembership,
) -> CouncilMeeting:
    """Create the group-call counterpart for a corporate Decision Council.

    A company meeting remains the canonical place for the agenda and protocol.
    The Council record only provides the existing four-person video room and
    private role mechanics.  Corporate participants are added immediately:
    joining a work meeting is an assignment, not a separate RSVP.
    """
    from app.routers.council import assign_roles

    scheduled_at = company_meeting.scheduled_at
    if scheduled_at is None:
        raise HTTPException(422, "Для Совета решений укажите дату и время")
    council = CouncilMeeting(
        organizer_id=organizer.user_id,
        organizer_plays=1,
        company_id=company_meeting.company_id,
        visibility="private",
        # Roles are immediately available. The existing Council runtime moves
        # the call to preparation shortly before its scheduled time.
        status="roles",
        scheduled_at=scheduled_at,
        agreement="{}",
        agreement_version=0,
        configuration=json.dumps({
            "capacity": 4,
            "title": company_meeting.title,
            "goal": company_meeting.description,
            "audience": "invited",
            "packets": [],
            "reservation_minutes": company_meeting.duration_minutes,
            "game_mode": "business-council-v1",
            "format": "company",
            "audio_required": True,
            "registration_cutoff_minutes": 0,
            "business_meeting_id": company_meeting.id,
        }, ensure_ascii=False),
    )
    db.add(council)
    await db.flush()

    members: list[CouncilMember] = []
    for seat, membership_id in enumerate(participant_membership_ids, start=1):
        membership = await db.get(CompanyMembership, membership_id)
        if membership is None:
            raise HTTPException(422, "Не удалось добавить участника Совета решений")
        member = CouncilMember(
            meeting_id=council.id,
            user_id=membership.user_id,
            company_id=company_meeting.company_id,
            seat=seat,
            status="confirmed",
            ready=1,
            role_read=0,
            notes="",
        )
        db.add(member)
        members.append(member)
    await db.flush()
    assign_roles(members, council)
    company_meeting.council_meeting_id = council.id
    return council


async def _serialize_meeting(db: AsyncSession, meeting: CompanyMeeting, actor: CompanyMembership) -> dict:
    participants = await _participants(db, meeting.id)
    purposes = _meeting_consent_purposes(meeting)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting.id))
    can_review_report = await _is_report_reviewer(db, meeting, actor)
    can_view_report = bool(protocol and (can_review_report or protocol.status == "PUBLISHED"))
    council = await db.get(CouncilMeeting, meeting.council_meeting_id) if meeting.council_meeting_id else None
    council_config = _json(council.configuration, {}) if council else {}
    council_audio_status = (council_config.get("audio_analysis", {}).get("status", "waiting")
                            if council_config.get("audio_required") else None)
    people = []
    for row in participants:
        people.append({"membership_id": row.membership_id, "name": await _member_name(db, row.membership_id),
                       "role": row.role, "invite_status": row.invite_status, "consent_status": row.consent_status})
    mine = next((row for row in participants if row.membership_id == actor.id), None)
    council_state = None
    if council:
        from app.routers import council as council_core
        members = await council_core.members_for(db, council.id)
        council_state = council_core.summary(council, members, actor.user_id)
        council_state.update(can_manage=await council_core.can_manage(db, council, await db.get(User, actor.user_id)),
            team=[{"user_id": member.user_id, "status": member.status, "ready": bool(member.ready)} for member in members])
    return {"id": meeting.id, "episode_id": meeting.episode_id, "kind": meeting.kind, "title": meeting.title, "description": meeting.description,
            "agenda": _json(meeting.agenda, []), "status": meeting.status,
            "council_meeting_id": meeting.council_meeting_id,
            "council": council_state,
            "company_id": meeting.company_id,
            "council_audio_status": council_audio_status,
            "scheduled_at": utc_schedule_iso(meeting.scheduled_at),
            "duration_minutes": meeting.duration_minutes, "consent_required": bool(meeting.consent_required),
            "consent_purposes": [{"id": item, "label": CONSENT_PURPOSE_LABELS[item]} for item in purposes],
            "participants": people, "is_organizer": actor.id == meeting.organizer_membership_id,
            "can_review_report": can_review_report, "can_view_report": can_view_report,
            "report_status": ("SENT" if protocol and protocol.status == "PUBLISHED" else "AWAITING_REVIEW" if protocol else None),
            "my_consent": mine.consent_status if mine else "PENDING",
            "my_consent_preferences": _consent_preferences(mine, purposes) if mine else {},
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
    if not capabilities(actor).get("manage_team"):
        raise HTTPException(403, "Создавать встречи может только руководитель")
    episode = await linked_episode_or_403(db, company_id, body.episode_id, actor, body.kind)
    visible = set(await visible_membership_ids(db, actor))
    ids = list(dict.fromkeys([actor.id, *body.membership_ids]))
    if set(ids) - visible:
        raise HTTPException(403, "Можно приглашать только сотрудников из доступной вам области")
    if body.kind == "COUNCIL" and len(ids) != 4:
        raise HTTPException(422, "Для Совета решений выберите ровно трёх сотрудников: вместе с вами будет четыре участника")
    if body.kind in {"COUNCIL", "PREPARATION_CALL"} and body.scheduled_at is None:
        raise HTTPException(422, "Для группового созвона укажите дату и время")
    for membership_id in ids:
        await active_company_member(db, company_id, membership_id)
    if episode:
        await ensure_episode_participants(db, episode, ids)
    purposes = list(dict.fromkeys(body.consent_purposes)) if body.consent_required else []
    scheduled_at = body.scheduled_at
    if scheduled_at and scheduled_at.tzinfo:
        scheduled_at = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
    meeting = CompanyMeeting(company_id=company_id, episode_id=episode.id if episode else None, organizer_membership_id=actor.id, kind=body.kind,
                             title=body.title.strip(), description=body.description.strip(), agenda=json.dumps(body.agenda, ensure_ascii=False),
                             scheduled_at=scheduled_at, duration_minutes=body.duration_minutes,
                             consent_required=int(bool(purposes)), consent_purposes=json.dumps(purposes))
    db.add(meeting); await db.flush()
    if episode and body.kind != "PREPARATION_CALL":
        episode.status = "IN_MEETING"
    for membership_id in ids:
        db.add(CompanyMeetingParticipant(meeting_id=meeting.id, membership_id=membership_id,
               role="ORGANIZER" if membership_id == actor.id else "PARTICIPANT",
               invite_status="ACCEPTED" if body.kind in {"COUNCIL", "PREPARATION_CALL"} or membership_id == actor.id else "INVITED",
               consent_status="PENDING" if purposes else "NOT_REQUIRED"))
        if membership_id != actor.id:
            recipient = await db.get(CompanyMembership, membership_id)
            if recipient and allows_member_notification(recipient, "room"):
                payload = json.dumps({"company_id": company_id, "meeting_id": meeting.id, "title": meeting.title}, ensure_ascii=False)
                db.add(Notification(user_id=recipient.user_id, type="COMPANY_MEETING", payload=payload))
                db.add(CompanyInboxMessage(company_id=company_id, membership_id=recipient.id, type="COMPANY_MEETING",
                    title="Совет решений назначен" if body.kind == "COUNCIL" else "Тестовый созвон" if body.kind == "PREPARATION_CALL" else "Приглашение на встречу",
                    text=meeting.title, payload=payload))
    if body.kind == "COUNCIL":
        await _create_linked_decision_council(db, company_meeting=meeting, participant_membership_ids=ids, organizer=actor)
    elif body.kind == "PREPARATION_CALL":
        await create_preparation_council(db, meeting, ids, actor)
    await audit(db, actor, user.id, "MEETING_CREATED", "company_meeting", meeting.id, {"kind": body.kind, "participants": ids})
    await db.commit()
    await deliver_company_event(db, company_id, {"type": "MEETING_CREATED", "meeting_id": meeting.id, "title": meeting.title})
    return await _serialize_meeting(db, meeting, actor)


@router.get("/{company_id}/meetings")
async def list_meetings(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    visible = set(await visible_membership_ids(db, actor))
    can_manage_team = capabilities(actor).get("manage_team")
    rows = list((await db.scalars(select(CompanyMeeting).where(CompanyMeeting.company_id == company_id).order_by(
        CompanyMeeting.scheduled_at.desc(), CompanyMeeting.created_at.desc()
    ))).all())
    result = []
    for meeting in rows:
        participants = await _participants(db, meeting.id)
        participant_ids = {row.membership_id for row in participants}
        if actor.id in participant_ids or (can_manage_team and participant_ids <= visible):
            result.append(await _serialize_meeting(db, meeting, actor))
    return result


@router.get("/{company_id}/meetings/{meeting_id}")
async def meeting_detail(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    result = await _serialize_meeting(db, meeting, actor)
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol and result["can_view_report"]:
        # Storage and legacy routes retain their names, but a draft report is
        # visible only to its reviewer until it has been sent to participants.
        result["report"] = await _protocol_payload(db, protocol)
        if meeting.council_meeting_id:
            council = await db.get(CouncilMeeting, meeting.council_meeting_id)
            config = _json(council.configuration, {}) if council else {}
            if council and (not config.get("audio_required") or config.get("audio_analysis", {}).get("status") == "complete"):
                outcome = _json(council.result, {})
                result["report"]["council_analysis"] = {key: outcome[key] for key in (
                    "feasible", "issues", "ended_by_organizer", "ended_by_timeout", "episodes", "evidence_note", "audio_coverage") if key in outcome}
    return result


@router.post("/{company_id}/meetings/{meeting_id}/consent")
async def set_consent(company_id: int, meeting_id: int, body: ConsentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    row = next(row for row in participants if row.membership_id == actor.id)
    purposes = _meeting_consent_purposes(meeting)
    if not purposes:
        raise HTTPException(409, "Для этой встречи не запрашивается согласие")
    selected = body.purposes if body.purposes is not None else purposes
    if not selected or set(selected) - set(purposes):
        raise HTTPException(422, "Можно выбрать только заявленные назначения обработки")
    preferences = _consent_preferences(row, purposes)
    for purpose in selected:
        preferences[purpose] = "ACCEPTED" if body.accepted else "DECLINED"
    row.consent_preferences = json.dumps(preferences, ensure_ascii=False)
    row.consent_status = _consent_status(preferences, purposes)
    row.consented_at = datetime.now(timezone.utc).replace(tzinfo=None) if row.consent_status == "ACCEPTED" else None
    await audit(db, actor, user.id, "MEETING_CONSENT_UPDATED", "company_meeting", meeting.id, {"accepted": body.accepted, "purposes": selected})
    await db.commit(); return {"ok": True, "consent_status": row.consent_status}


@router.post("/{company_id}/meetings/{meeting_id}/finish")
async def finish_meeting(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Завершить встречу может только создатель рабочей ситуации")
    if meeting.kind == "PREPARATION_CALL" and meeting.council_meeting_id:
        raise HTTPException(409, "Завершите тестовый созвон в Совете решений")
    meeting.status = "PROCESSING"; meeting.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if meeting.episode_id:
        episode = await db.get(CompanyWorkEpisode, meeting.episode_id)
        if episode and episode.status == "IN_MEETING":
            episode.status = "PROTOCOL_REVIEW"
    await db.commit(); return {"ok": True, "status": meeting.status}


@router.post("/{company_id}/meetings/{meeting_id}/transcript", status_code=201)
async def add_transcript_segment(company_id: int, meeting_id: int, body: TranscriptIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Заметки встречи доступны только создателю рабочей ситуации до отправки отчёта")
    if meeting.status == "COMPLETED":
        raise HTTPException(409, "Отчёт уже отправлен; заметки встречи больше нельзя изменять")
    if not body.text.strip():
        raise HTTPException(422, "Добавьте текст заметки или расшифровки")
    participant_ids = {row.membership_id for row in participants}
    if body.speaker_membership_id and body.speaker_membership_id not in participant_ids:
        raise HTTPException(422, "Говорящий должен быть участником встречи")
    row = CompanyMeetingTranscriptSegment(meeting_id=meeting.id, **body.model_dump())
    db.add(row); await db.commit(); await db.refresh(row)
    return {"id": row.id, "text": row.text, "start_ms": row.start_ms, "end_ms": row.end_ms}


@router.get("/{company_id}/meetings/{meeting_id}/transcript")
async def get_transcript(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Расшифровка доступна только создателю рабочей ситуации")
    rows = list((await db.scalars(select(CompanyMeetingTranscriptSegment).where(
        CompanyMeetingTranscriptSegment.meeting_id == meeting_id
    ).order_by(CompanyMeetingTranscriptSegment.start_ms, CompanyMeetingTranscriptSegment.id))).all())
    return [{"id": row.id, "speaker_membership_id": row.speaker_membership_id, "speaker": await _member_name(db, row.speaker_membership_id) if row.speaker_membership_id else "Не определён",
             "start_ms": row.start_ms, "end_ms": row.end_ms, "text": row.text, "confidence": row.confidence,
             "excluded_from_analysis": bool(row.excluded_from_analysis)} for row in rows]


@router.post("/{company_id}/meetings/{meeting_id}/analyze")
async def analyze_meeting(company_id: int, meeting_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, participants = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Подготовить отчёт может только создатель рабочей ситуации")
    if meeting.status not in {"PROCESSING", "REVIEW"}:
        raise HTTPException(409, "Сначала завершите встречу; отправленный отчёт нельзя пересоздать")
    segments = list((await db.scalars(select(CompanyMeetingTranscriptSegment).where(
        CompanyMeetingTranscriptSegment.meeting_id == meeting_id, CompanyMeetingTranscriptSegment.excluded_from_analysis == 0
    ).order_by(CompanyMeetingTranscriptSegment.start_ms, CompanyMeetingTranscriptSegment.id))).all())
    if not any(row.text.strip() for row in segments):
        raise HTTPException(409, "Добавьте заметки или расшифровку встречи перед подготовкой отчёта")
    evidence = [{"id": row.id, "text": row.text} for row in segments]
    summary, suggestions = draft_from_segments(evidence)
    summary = await refine_summary_with_ai(summary, evidence)
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
    meeting.status = "REVIEW"; await audit(db, actor, user.id, "MEETING_REPORT_DRAFTED", "company_meeting", meeting.id, {"version": protocol.version})
    await db.commit(); return await _protocol_payload(db, protocol)


@router.post("/{company_id}/meetings/{meeting_id}/protocol/items", status_code=201)
async def add_protocol_item(company_id: int, meeting_id: int, body: ProtocolItemIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Изменять черновик отчёта может только его проверяющий")
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
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Изменять черновик отчёта может только его проверяющий")
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None or protocol.status == "PUBLISHED": raise HTTPException(409, "Протокол недоступен для изменений")
    if body.version != protocol.version: raise HTTPException(409, "Протокол изменился. Обновите страницу и проверьте последнюю версию.")
    protocol.summary = body.summary.strip(); protocol.version += 1; await _refresh_validation(db, protocol); await db.commit()
    return await _protocol_payload(db, protocol)


@router.patch("/{company_id}/meetings/{meeting_id}/protocol/items/{item_id}/assignee")
async def assign_protocol_action(company_id: int, meeting_id: int, item_id: int, body: ProtocolAssigneeIn,
                                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Назначить исполнителя может только проверяющий отчёт")
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None or protocol.status == "PUBLISHED":
        raise HTTPException(409, "Протокол недоступен для изменений")
    if body.version != protocol.version:
        raise HTTPException(409, "Протокол изменился. Обновите страницу и проверьте последнюю версию.")
    item = await db.get(CompanyMeetingProtocolItem, item_id)
    if item is None or item.protocol_id != protocol.id or item.kind != "ACTION":
        raise HTTPException(404, "Задача в отчёте не найдена")
    await active_company_member(db, company_id, body.assignee_membership_id)
    item.assignee_membership_id = body.assignee_membership_id
    protocol.version += 1
    await db.flush(); await _refresh_validation(db, protocol); await db.commit()
    return await _protocol_payload(db, protocol)


@router.post("/{company_id}/meetings/{meeting_id}/protocol/approve")
async def approve_protocol(company_id: int, meeting_id: int, body: ApprovalIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor, meeting, _ = await _require_meeting_access(db, company_id, meeting_id, user)
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Подтвердить отчёт может только создатель рабочей ситуации")
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
    if not await _is_report_reviewer(db, meeting, actor):
        raise HTTPException(403, "Подтвердить и отправить отчёт может только создатель рабочей ситуации")
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(CompanyMeetingProtocol.meeting_id == meeting_id))
    if protocol is None: raise HTTPException(404, "Черновик протокола ещё не подготовлен")
    if protocol.status == "PUBLISHED":
        raise HTTPException(409, "Отчёт уже отправлен участникам")
    if meeting.council_meeting_id:
        council = await db.get(CouncilMeeting, meeting.council_meeting_id)
        council_config = _json(council.configuration, {}) if council else {}
        analysis_status = council_config.get("audio_analysis", {}).get("status")
        if council_config.get("audio_required") and analysis_status not in {"complete", "error"}:
            raise HTTPException(409, "Дождитесь расшифровки записи созвона перед отправкой отчёта")
    if not protocol.summary.strip():
        raise HTTPException(409, "Добавьте краткий итог перед отправкой отчёта")
    await _refresh_validation(db, protocol)
    issues = list((await db.scalars(select(CompanyMeetingValidationIssue).where(CompanyMeetingValidationIssue.protocol_id == protocol.id,
        CompanyMeetingValidationIssue.severity == "BLOCKER", CompanyMeetingValidationIssue.resolved_at.is_(None)))).all())
    if issues: raise HTTPException(409, "Исправьте обязательные пункты перед публикацией")
    approval = await db.scalar(select(CompanyMeetingApproval).where(
        CompanyMeetingApproval.protocol_id == protocol.id,
        CompanyMeetingApproval.membership_id == actor.id,
        CompanyMeetingApproval.version == protocol.version,
    ))
    if approval is None:
        db.add(CompanyMeetingApproval(protocol_id=protocol.id, membership_id=actor.id,
                                      version=protocol.version, status="APPROVED", comment=""))
    else:
        approval.status = "APPROVED"
    protocol.status = "PUBLISHED"; protocol.published_at = datetime.now(timezone.utc).replace(tzinfo=None); protocol.published_by_membership_id = actor.id
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
        if participant.membership_id == actor.id:
            continue
        if allows_member_notification(await db.get(CompanyMembership, participant.membership_id), "room"):
            db.add(Notification(user_id=(await db.get(CompanyMembership, participant.membership_id)).user_id, type="MEETING_REPORT_SENT", payload=json.dumps({"company_id": company_id, "meeting_id": meeting.id, "title": meeting.title}, ensure_ascii=False)))
            db.add(CompanyInboxMessage(company_id=company_id, membership_id=participant.membership_id, type="MEETING_REPORT_SENT", title="Готов отчёт по встрече", text=meeting.title, payload=json.dumps({"meeting_id": meeting.id}, ensure_ascii=False)))
    await audit(db, actor, user.id, "MEETING_REPORT_SENT", "company_meeting", meeting.id, {"version": protocol.version})
    await db.commit(); await deliver_company_event(db, company_id, {"type": "MEETING_REPORT_SENT", "meeting_id": meeting.id, "title": meeting.title})
    return await _protocol_payload(db, protocol)
