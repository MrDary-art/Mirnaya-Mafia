"""Working episodes: the business thread between preparation, a meeting and action."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_access import active_company_member, capabilities, visible_membership_ids
from app.company_episode_models import CompanyEpisodeCommitment, CompanyWorkEpisode, CompanyWorkEpisodeParticipant
from app.company_meeting_models import CompanyMeeting, CompanyMeetingParticipant
from app.company_models import CompanyAssignment, CompanyAssignmentTarget, CompanyInboxMessage, CompanyMembership
from app.db import get_db
from app.models import Notification, User
from app.routers.company import allows_member_notification, audit, require_membership

router = APIRouter(prefix="/company", tags=["company-episodes"])

EPISODE_STATUSES = {"PREPARING", "READY", "IN_MEETING", "PROTOCOL_REVIEW", "ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVED"}
COMMITMENT_STATUSES = {"PENDING", "ACCEPTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED", "DISPUTED"}
COMMITMENT_TRANSITIONS = {
    "PENDING": {"ACCEPTED", "DISPUTED"},
    "ACCEPTED": {"IN_PROGRESS", "BLOCKED", "COMPLETED", "DISPUTED"},
    "IN_PROGRESS": {"BLOCKED", "COMPLETED", "DISPUTED"},
    "BLOCKED": {"IN_PROGRESS", "DISPUTED"},
    "COMPLETED": {"VERIFIED"},
    "VERIFIED": set(),
    "DISPUTED": {"ACCEPTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"},
}
STATUS_TRANSITIONS = {
    "PREPARING": {"READY", "CANCELLED"},
    "READY": {"PREPARING", "IN_MEETING", "ACTIVE", "CANCELLED"},
    "IN_MEETING": {"PROTOCOL_REVIEW", "CANCELLED"},
    "PROTOCOL_REVIEW": {"ACTIVE", "CANCELLED"},
    "ACTIVE": {"COMPLETED", "CANCELLED"},
    "COMPLETED": {"ARCHIVED"},
    "CANCELLED": {"ARCHIVED"},
    "ARCHIVED": set(),
}
PREPARATION_FIELDS = {
    "goal", "other_party", "facts", "assumptions", "questions", "red_lines",
    "proposal_options", "risks", "stop_criteria", "opening_plan", "batna", "zopa",
}
RETROSPECTIVE_FIELDS = {"outcome", "what_worked", "next_step"}


class EpisodeCreateIn(BaseModel):
    title: str = Field(min_length=3, max_length=220)
    situation_type: Literal["NEGOTIATION", "FEEDBACK", "ALIGNMENT", "ESCALATION", "OTHER"] = "NEGOTIATION"
    expected_result: str = Field(default="", max_length=3000)
    scheduled_at: datetime | None = None
    visibility: Literal["PRIVATE", "PARTICIPANTS", "TEAM"] = "PRIVATE"
    participant_ids: list[int] = Field(default_factory=list, max_length=40)
    practice_target_id: int | None = None
    preparation: dict[str, str] = Field(default_factory=dict)


class EpisodeUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=220)
    situation_type: Literal["NEGOTIATION", "FEEDBACK", "ALIGNMENT", "ESCALATION", "OTHER"] | None = None
    expected_result: str | None = Field(default=None, max_length=3000)
    scheduled_at: datetime | None = None
    visibility: Literal["PRIVATE", "PARTICIPANTS", "TEAM"] | None = None
    practice_target_id: int | None = None
    preparation: dict[str, str] | None = None
    retrospective: dict[str, str] | None = None


class EpisodeStatusIn(BaseModel):
    status: Literal["PREPARING", "READY", "IN_MEETING", "PROTOCOL_REVIEW", "ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVED"]


class ParticipantIn(BaseModel):
    membership_id: int
    role: Literal["PARTICIPANT", "OBSERVER", "MENTOR"] = "PARTICIPANT"


class CommitmentUpdateIn(BaseModel):
    status: Literal["ACCEPTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED", "DISPUTED"]
    blocker_note: str = Field(default="", max_length=1200)


def _json(value, fallback):
    try:
        decoded = json.loads(value or "")
        return decoded if isinstance(decoded, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback


def _safe_preparation(value: dict[str, str] | None) -> dict[str, str]:
    return {key: str(text).strip()[:3000] for key, text in (value or {}).items()
            if key in PREPARATION_FIELDS and str(text).strip()}


def _safe_retrospective(value: dict[str, str] | None) -> dict[str, str]:
    return {key: str(text).strip()[:3000] for key, text in (value or {}).items()
            if key in RETROSPECTIVE_FIELDS and str(text).strip()}


async def _owned_practice_target(
    db: AsyncSession, actor: CompanyMembership, company_id: int, target_id: int | None,
) -> CompanyAssignmentTarget | None:
    """Only the episode owner's own assigned practice can be linked to their preparation."""
    if target_id is None:
        return None
    target = await db.get(CompanyAssignmentTarget, target_id)
    if target is None or target.company_id != company_id or target.membership_id != actor.id:
        raise HTTPException(422, "Можно связать только свою назначенную практику")
    assignment = await db.get(CompanyAssignment, target.assignment_id)
    if assignment is None or assignment.company_id != company_id or assignment.status != "ACTIVE":
        raise HTTPException(409, "Эта практика больше недоступна")
    return target


async def _practice_payload(
    db: AsyncSession, actor: CompanyMembership, episode: CompanyWorkEpisode,
) -> dict | None:
    """A rehearsal remains personal even inside a shared episode."""
    if episode.practice_target_id is None or actor.id != episode.owner_membership_id:
        return None
    target = await db.get(CompanyAssignmentTarget, episode.practice_target_id)
    if target is None or target.company_id != episode.company_id or target.membership_id != actor.id:
        return None
    assignment = await db.get(CompanyAssignment, target.assignment_id)
    if assignment is None:
        return None
    return {
        "target_id": target.id,
        "assignment_id": assignment.id,
        "title": assignment.title,
        "status": target.status,
        "deadline": assignment.deadline.isoformat() if assignment.deadline else None,
    }


async def _episode_or_404(db: AsyncSession, company_id: int, episode_id: int) -> CompanyWorkEpisode:
    episode = await db.get(CompanyWorkEpisode, episode_id)
    if episode is None or episode.company_id != company_id:
        raise HTTPException(404, "Рабочий эпизод не найден")
    return episode


async def _participant_rows(db: AsyncSession, episode_id: int) -> list[CompanyWorkEpisodeParticipant]:
    return list((await db.scalars(select(CompanyWorkEpisodeParticipant).where(
        CompanyWorkEpisodeParticipant.episode_id == episode_id
    ))).all())


async def _member_name(db: AsyncSession, membership_id: int) -> str:
    member = await db.get(CompanyMembership, membership_id)
    if member is None:
        return "Сотрудник"
    person = await db.get(User, member.user_id)
    return (person.display_name or person.username) if person else "Сотрудник"


async def _notify_episode_invite(
    db: AsyncSession, episode: CompanyWorkEpisode, membership_id: int, actor_membership_id: int,
) -> None:
    """Notify new participants without exposing the owner's private preparation."""
    if membership_id == actor_membership_id:
        return
    recipient = await db.get(CompanyMembership, membership_id)
    if recipient is None or not allows_member_notification(recipient, "room"):
        return
    payload = json.dumps({"company_id": episode.company_id, "episode_id": episode.id, "title": episode.title}, ensure_ascii=False)
    db.add(Notification(user_id=recipient.user_id, type="WORK_EPISODE", payload=payload))
    db.add(CompanyInboxMessage(company_id=episode.company_id, membership_id=recipient.id,
                               type="WORK_EPISODE", title="Новый рабочий эпизод", text=episode.title, payload=payload))


async def episode_access(db: AsyncSession, actor: CompanyMembership, episode: CompanyWorkEpisode) -> str | None:
    """Return a role-specific view; preparation always belongs to its author."""
    participants = await _participant_rows(db, episode.id)
    participant_ids = {row.membership_id for row in participants}
    if actor.id == episode.owner_membership_id:
        return "full"
    if actor.id in participant_ids:
        return "participant"
    if episode.visibility != "TEAM" or not capabilities(actor).get("manage_team"):
        return None
    if episode.owner_membership_id in set(await visible_membership_ids(db, actor)):
        return "summary"
    return None


async def linked_episode_or_403(db: AsyncSession, company_id: int, episode_id: int | None, actor: CompanyMembership):
    """Validate a meeting link without leaking an episode or its preparation."""
    if episode_id is None:
        return None
    episode = await _episode_or_404(db, company_id, episode_id)
    if await episode_access(db, actor, episode) != "full":
        raise HTTPException(403, "Связать встречу можно только со своим или доступным вам эпизодом")
    if episode.status in {"CANCELLED", "ARCHIVED"}:
        raise HTTPException(409, "Нельзя связать встречу с закрытым эпизодом")
    if episode.status != "READY":
        raise HTTPException(409, "Сначала завершите подготовку эпизода")
    return episode


async def _meeting_rows(db: AsyncSession, episode_id: int) -> list[CompanyMeeting]:
    return list((await db.scalars(select(CompanyMeeting).where(CompanyMeeting.episode_id == episode_id).order_by(
        CompanyMeeting.scheduled_at.desc(), CompanyMeeting.id.desc()
    ))).all())


async def _serialize_episode(db: AsyncSession, actor: CompanyMembership, episode: CompanyWorkEpisode, access: str) -> dict:
    participants = await _participant_rows(db, episode.id)
    meetings = await _meeting_rows(db, episode.id)
    commitments = list((await db.scalars(select(CompanyEpisodeCommitment).where(
        CompanyEpisodeCommitment.episode_id == episode.id
    ).order_by(CompanyEpisodeCommitment.due_at, CompanyEpisodeCommitment.id))).all())
    result = {
        "id": episode.id, "title": episode.title, "situation_type": episode.situation_type,
        "expected_result": episode.expected_result, "scheduled_at": episode.scheduled_at.isoformat() if episode.scheduled_at else None,
        "visibility": episode.visibility, "status": episode.status, "source_type": episode.source_type,
        "created_at": episode.created_at.isoformat() if episode.created_at else None,
        "updated_at": episode.updated_at.isoformat() if episode.updated_at else None,
        "owner_membership_id": episode.owner_membership_id, "owner_name": await _member_name(db, episode.owner_membership_id),
        "participant_count": len(participants), "access": access,
        "meetings": [{"id": row.id, "title": row.title, "status": row.status,
                      "scheduled_at": row.scheduled_at.isoformat() if row.scheduled_at else None} for row in meetings],
        "commitments": [{"id": row.id, "title": row.title, "status": row.status,
                         "owner_membership_id": row.owner_membership_id,
                         "owner_name": await _member_name(db, row.owner_membership_id) if row.owner_membership_id else None,
                         "due_at": row.due_at.isoformat() if row.due_at else None,
                         "acceptance_criteria": row.acceptance_criteria, "blocker_note": row.blocker_note,
                         "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
                         "completed_at": row.completed_at.isoformat() if row.completed_at else None,
                         "verified_at": row.verified_at.isoformat() if row.verified_at else None,
                         "is_mine": row.owner_membership_id == actor.id,
                         "can_verify": episode.owner_membership_id == actor.id and row.status == "COMPLETED"} for row in commitments],
    }
    if access == "full":
        result["preparation"] = _json(episode.preparation, {})
        result["retrospective"] = _json(episode.retrospective, {})
        result["participants"] = [{"membership_id": row.membership_id, "name": await _member_name(db, row.membership_id),
                                  "role": row.role, "status": row.status} for row in participants]
        result["can_edit"] = episode.owner_membership_id == actor.id
        result["practice"] = await _practice_payload(db, actor, episode)
    return result


async def _check_participants(db: AsyncSession, actor: CompanyMembership, company_id: int, participant_ids: list[int]) -> list[int]:
    ids = list(dict.fromkeys([actor.id, *participant_ids]))
    visible = set(await visible_membership_ids(db, actor))
    if set(ids) - visible:
        raise HTTPException(403, "Можно пригласить только сотрудников из доступной вам области")
    for membership_id in ids:
        await active_company_member(db, company_id, membership_id)
    return ids


async def ensure_episode_participants(db: AsyncSession, episode: CompanyWorkEpisode, membership_ids: list[int]) -> None:
    """A linked meeting grants its invited people access to the shared episode, never to a private draft."""
    ids = set(membership_ids)
    if episode.visibility == "PRIVATE" and ids - {episode.owner_membership_id}:
        raise HTTPException(422, "Сначала сделайте эпизод общим, затем приглашайте участников на встречу")
    existing = {row.membership_id for row in await _participant_rows(db, episode.id)}
    for membership_id in ids - existing:
        db.add(CompanyWorkEpisodeParticipant(episode_id=episode.id, membership_id=membership_id, role="PARTICIPANT"))


@router.get("/{company_id}/episodes")
async def list_episodes(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    rows = list((await db.scalars(select(CompanyWorkEpisode).where(
        CompanyWorkEpisode.company_id == company_id
    ).order_by(CompanyWorkEpisode.updated_at.desc(), CompanyWorkEpisode.id.desc()))).all())
    result = []
    for episode in rows:
        access = await episode_access(db, actor, episode)
        if access:
            result.append(await _serialize_episode(db, actor, episode, access))
    return result


@router.post("/{company_id}/episodes", status_code=201)
async def create_episode(company_id: int, body: EpisodeCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    await _owned_practice_target(db, actor, company_id, body.practice_target_id)
    participant_ids = await _check_participants(db, actor, company_id, body.participant_ids)
    if body.visibility == "PRIVATE" and len(participant_ids) > 1:
        raise HTTPException(422, "Приватный эпизод не может включать других участников")
    episode = CompanyWorkEpisode(company_id=company_id, owner_membership_id=actor.id, title=body.title.strip(),
                                 situation_type=body.situation_type, expected_result=body.expected_result.strip(),
                                 scheduled_at=body.scheduled_at, visibility=body.visibility,
                                 practice_target_id=body.practice_target_id,
                                 preparation=json.dumps(_safe_preparation(body.preparation), ensure_ascii=False))
    db.add(episode); await db.flush()
    for membership_id in participant_ids:
        db.add(CompanyWorkEpisodeParticipant(episode_id=episode.id, membership_id=membership_id,
                                              role="OWNER" if membership_id == actor.id else "PARTICIPANT",
                                              status="ACCEPTED" if membership_id == actor.id else "INVITED"))
        await _notify_episode_invite(db, episode, membership_id, actor.id)
    await audit(db, actor, user.id, "EPISODE_CREATED", "company_work_episode", episode.id, {"visibility": episode.visibility})
    await db.commit()
    return await _serialize_episode(db, actor, episode, "full")


@router.get("/{company_id}/episodes/{episode_id}")
async def episode_detail(company_id: int, episode_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episode = await _episode_or_404(db, company_id, episode_id)
    access = await episode_access(db, actor, episode)
    if not access:
        raise HTTPException(403, "Этот рабочий эпизод вам недоступен")
    return await _serialize_episode(db, actor, episode, access)


@router.put("/{company_id}/episodes/{episode_id}")
async def update_episode(company_id: int, episode_id: int, body: EpisodeUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episode = await _episode_or_404(db, company_id, episode_id)
    if episode.owner_membership_id != actor.id:
        raise HTTPException(403, "Изменять подготовку может только владелец эпизода")
    values = body.model_dump(exclude_unset=True)
    if "preparation" in values:
        episode.preparation = json.dumps(_safe_preparation(values.pop("preparation")), ensure_ascii=False)
    if "retrospective" in values:
        episode.retrospective = json.dumps(_safe_retrospective(values.pop("retrospective")), ensure_ascii=False)
    if "practice_target_id" in values:
        await _owned_practice_target(db, actor, company_id, values["practice_target_id"])
    for field, value in values.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(episode, field, value)
    await audit(db, actor, user.id, "EPISODE_UPDATED", "company_work_episode", episode.id, {"fields": sorted(values)})
    await db.commit()
    await db.refresh(episode)
    return await _serialize_episode(db, actor, episode, "full")


@router.post("/{company_id}/episodes/{episode_id}/participants", status_code=201)
async def add_participant(company_id: int, episode_id: int, body: ParticipantIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episode = await _episode_or_404(db, company_id, episode_id)
    if episode.owner_membership_id != actor.id or episode.visibility == "PRIVATE":
        raise HTTPException(403, "Участников можно добавлять только в общий эпизод, которым вы владеете")
    await _check_participants(db, actor, company_id, [body.membership_id])
    existing = await db.scalar(select(CompanyWorkEpisodeParticipant).where(
        CompanyWorkEpisodeParticipant.episode_id == episode.id, CompanyWorkEpisodeParticipant.membership_id == body.membership_id
    ))
    if existing:
        raise HTTPException(409, "Этот сотрудник уже участвует в эпизоде")
    db.add(CompanyWorkEpisodeParticipant(episode_id=episode.id, membership_id=body.membership_id, role=body.role))
    await _notify_episode_invite(db, episode, body.membership_id, actor.id)
    await audit(db, actor, user.id, "EPISODE_PARTICIPANT_ADDED", "company_work_episode", episode.id, {"membership_id": body.membership_id})
    await db.commit()
    return await _serialize_episode(db, actor, episode, "full")


@router.post("/{company_id}/episodes/{episode_id}/status")
async def update_episode_status(company_id: int, episode_id: int, body: EpisodeStatusIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episode = await _episode_or_404(db, company_id, episode_id)
    if await episode_access(db, actor, episode) != "full":
        raise HTTPException(403, "Менять состояние эпизода может только его владелец")
    if body.status != episode.status and body.status not in STATUS_TRANSITIONS[episode.status]:
        raise HTTPException(409, "Эпизод нельзя перевести в это состояние из текущего шага")
    if body.status == "COMPLETED":
        if episode.owner_membership_id != actor.id:
            raise HTTPException(403, "Завершить эпизод может его владелец")
        open_commitment = await db.scalar(select(CompanyEpisodeCommitment.id).where(
            CompanyEpisodeCommitment.episode_id == episode.id,
            CompanyEpisodeCommitment.status.notin_(("VERIFIED",)),
        ).limit(1))
        if open_commitment is not None:
            raise HTTPException(409, "Сначала подтвердите или разберите открытые обязательства")
    episode.status = body.status
    await audit(db, actor, user.id, "EPISODE_STATUS_UPDATED", "company_work_episode", episode.id, {"status": episode.status})
    await db.commit()
    await db.refresh(episode)
    return await _serialize_episode(db, actor, episode, "full")


@router.patch("/{company_id}/episodes/{episode_id}/commitments/{commitment_id}")
async def update_commitment(company_id: int, episode_id: int, commitment_id: int, body: CommitmentUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episode = await _episode_or_404(db, company_id, episode_id)
    access = await episode_access(db, actor, episode)
    commitment = await db.get(CompanyEpisodeCommitment, commitment_id)
    if not access or commitment is None or commitment.company_id != company_id or commitment.episode_id != episode.id:
        raise HTTPException(404, "Обязательство не найдено")
    is_assignee = commitment.owner_membership_id == actor.id
    is_reviewer = episode.owner_membership_id == actor.id
    if body.status == "VERIFIED":
        if not is_reviewer:
            raise HTTPException(403, "Подтвердить выполнение может только владелец эпизода")
        if commitment.status != "COMPLETED":
            raise HTTPException(409, "Подтверждать можно только выполненное обязательство")
    elif body.status == "IN_PROGRESS" and commitment.status == "COMPLETED":
        if not is_reviewer:
            raise HTTPException(403, "Вернуть обязательство в работу может только владелец эпизода")
    else:
        if not is_assignee:
            raise HTTPException(403, "Изменять обязательство может только его исполнитель")
        if body.status not in COMMITMENT_TRANSITIONS.get(commitment.status, set()):
            raise HTTPException(409, "Обязательство нельзя перевести в это состояние из текущего шага")
    note = body.blocker_note.strip()
    if body.status == "BLOCKED" and len(note) < 3:
        raise HTTPException(422, "Кратко опишите, какая помощь нужна")
    commitment.status = body.status
    commitment.blocker_note = note if body.status == "BLOCKED" else ""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if body.status == "ACCEPTED":
        commitment.accepted_at = now
    elif body.status == "COMPLETED":
        commitment.completed_at = now
    elif body.status == "VERIFIED":
        commitment.verified_at = now
        commitment.verified_by_membership_id = actor.id
    elif body.status == "IN_PROGRESS" and commitment.completed_at:
        commitment.completed_at = None
        commitment.verified_at = None
        commitment.verified_by_membership_id = None
    await audit(db, actor, user.id, "EPISODE_COMMITMENT_UPDATED", "company_episode_commitment", commitment.id, {"status": commitment.status})
    await db.commit()
    return {"id": commitment.id, "status": commitment.status, "blocker_note": commitment.blocker_note}


@router.get("/{company_id}/my-arena")
async def my_arena(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await require_membership(db, user, company_id)
    episodes = list((await db.scalars(select(CompanyWorkEpisode).where(
        CompanyWorkEpisode.company_id == company_id
    ).order_by(CompanyWorkEpisode.scheduled_at, CompanyWorkEpisode.updated_at.desc()))).all())
    mine = []
    for episode in episodes:
        access = await episode_access(db, actor, episode)
        if access in {"full", "participant"}:
            mine.append(await _serialize_episode(db, actor, episode, access))
    commitments = list((await db.scalars(select(CompanyEpisodeCommitment).where(
        CompanyEpisodeCommitment.company_id == company_id,
        CompanyEpisodeCommitment.owner_membership_id == actor.id,
        CompanyEpisodeCommitment.status.notin_(("VERIFIED",))
    ).order_by(CompanyEpisodeCommitment.due_at, CompanyEpisodeCommitment.id))).all())
    meetings = list((await db.scalars(select(CompanyMeeting).join(CompanyMeetingParticipant,
        CompanyMeetingParticipant.meeting_id == CompanyMeeting.id).where(
            CompanyMeeting.company_id == company_id, CompanyMeetingParticipant.membership_id == actor.id,
            CompanyMeeting.status.notin_(("COMPLETED", "CANCELLED"))
        ).order_by(CompanyMeeting.scheduled_at))).all())
    return {
        "episodes": mine,
        "commitments": [{"id": row.id, "episode_id": row.episode_id, "title": row.title, "status": row.status,
                         "due_at": row.due_at.isoformat() if row.due_at else None, "blocker_note": row.blocker_note} for row in commitments],
        "meetings": [{"id": row.id, "episode_id": row.episode_id, "title": row.title, "status": row.status,
                      "scheduled_at": row.scheduled_at.isoformat() if row.scheduled_at else None} for row in meetings],
    }


async def materialize_protocol_commitments(db: AsyncSession, episode_id: int, meeting_id: int, items, actor_membership_id: int) -> None:
    """Turn only human-published ACTION items into actionable episode commitments."""
    episode = await db.get(CompanyWorkEpisode, episode_id)
    if episode is None:
        return
    for item in items:
        if item.kind != "ACTION" or item.assignee_membership_id is None:
            continue
        existing = await db.scalar(select(CompanyEpisodeCommitment.id).where(
            CompanyEpisodeCommitment.source_protocol_item_id == item.id
        ))
        if existing is None:
            db.add(CompanyEpisodeCommitment(company_id=episode.company_id, episode_id=episode.id,
                   source_meeting_id=meeting_id, source_protocol_item_id=item.id,
                   owner_membership_id=item.assignee_membership_id, title=item.title, detail=item.detail,
                   acceptance_criteria=item.acceptance_criteria, due_at=item.due_at,
                   created_by_membership_id=actor_membership_id))
    if episode.status not in {"CANCELLED", "ARCHIVED", "COMPLETED"}:
        episode.status = "ACTIVE"
