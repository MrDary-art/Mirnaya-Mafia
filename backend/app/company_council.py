"""Keep a corporate Decision Council and its meeting report in one workflow."""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, select

from app.company_meeting_models import CompanyMeeting, CompanyMeetingParticipant, CompanyMeetingProtocol, CompanyMeetingProtocolItem, CompanyMeetingTranscriptSegment
from app.company_episode_models import CompanyWorkEpisode
from app.company_models import CompanyMembership
from app.council_models import CouncilMeeting, CouncilMember, CouncilMessage

PREPARATION_CALL_MAX_PEOPLE = 8


def _preparation_packet(number: int, goal: str) -> dict:
    return {"key": f"role_{number}", "name": f"Участник {number}",
            "goal": goal or "Обсудить рабочую ситуацию и зафиксировать следующий шаг.",
            "private_facts": [], "limits": [], "can_offer": "Свои предложения по рабочей ситуации",
            "ask": "Какие условия и следующие шаги нужно уточнить?"}


async def create_preparation_council(db, meeting: CompanyMeeting,
                                     membership_ids: list[int], organizer: CompanyMembership) -> CouncilMeeting:
    """Reuse the Council's private group call for a working-situation rehearsal."""
    if meeting.scheduled_at is None:
        raise HTTPException(422, "Для тестового созвона укажите дату и время")
    if not 2 <= len(membership_ids) <= PREPARATION_CALL_MAX_PEOPLE:
        raise HTTPException(422, f"Для тестового созвона нужно от 2 до {PREPARATION_CALL_MAX_PEOPLE} участников")
    episode = await db.get(CompanyWorkEpisode, meeting.episode_id) if meeting.episode_id else None
    goal = (_json(meeting.agenda, []) or [""])[0] or (episode.expected_result if episode else "") or meeting.description
    context = (episode.brief if episode else "") or meeting.description
    packets = [_preparation_packet(number, goal) for number in range(1, len(membership_ids) + 1)]
    council = CouncilMeeting(
        organizer_id=organizer.user_id, organizer_plays=1,
        company_id=meeting.company_id, visibility="private", status="roles",
        scheduled_at=meeting.scheduled_at, agreement="{}", agreement_version=0,
        configuration=json.dumps({
            "capacity": len(membership_ids), "title": meeting.title,
            "goal": context, "audience": "invited", "packets": packets,
            "reservation_minutes": meeting.duration_minutes,
            "game_mode": "business-preparation-v1", "format": "company",
            "audio_required": False, "registration_cutoff_minutes": 0,
            "business_meeting_id": meeting.id,
        }, ensure_ascii=False),
    )
    db.add(council)
    await db.flush()
    for number, membership_id in enumerate(membership_ids, start=1):
        membership = await db.get(CompanyMembership, membership_id)
        if membership is None:
            raise HTTPException(422, "Участник тестового созвона не найден")
        db.add(CouncilMember(
            meeting_id=council.id, user_id=membership.user_id,
            company_id=meeting.company_id, seat=number, status="confirmed", ready=0,
            role_read=0, notes="", role_key=packets[number - 1]["key"],
            role_override=json.dumps(packets[number - 1], ensure_ascii=False),
        ))
    meeting.council_meeting_id = council.id
    await db.flush()
    return council


async def change_preparation_council_member(db, meeting: CompanyMeeting,
                                            membership_id: int, *, adding: bool) -> None:
    """Keep late participant edits and the linked call's roster in sync."""
    if meeting.kind != "PREPARATION_CALL" or not meeting.council_meeting_id:
        return
    council = await db.get(CouncilMeeting, meeting.council_meeting_id)
    if council is None:
        raise HTTPException(409, "Связанный тестовый созвон не найден")
    if council.status not in {"roles", "preparation"} or datetime.now(timezone.utc).replace(tzinfo=None) >= council.scheduled_at:
        raise HTTPException(409, "После начала созвона состав участников изменить нельзя")
    membership = await db.get(CompanyMembership, membership_id)
    members = list((await db.scalars(select(CouncilMember).where(CouncilMember.meeting_id == council.id))).all())
    settings = _json(council.configuration, {})
    packets = settings.get("packets", [])
    if adding:
        if len(members) >= PREPARATION_CALL_MAX_PEOPLE:
            raise HTTPException(422, f"В тестовом созвоне может быть не более {PREPARATION_CALL_MAX_PEOPLE} участников")
        if membership is None or any(member.user_id == membership.user_id for member in members):
            raise HTTPException(409, "Участник уже есть в созвоне или не найден")
        number = max((int(packet["key"].removeprefix("role_")) for packet in packets), default=0) + 1
        seat = next(value for value in range(1, PREPARATION_CALL_MAX_PEOPLE + 1)
                    if value not in {member.seat for member in members})
        episode = await db.get(CompanyWorkEpisode, meeting.episode_id) if meeting.episode_id else None
        goal = (_json(meeting.agenda, []) or [""])[0] or (episode.expected_result if episode else "") or meeting.description
        packet = _preparation_packet(number, goal)
        packets.append(packet)
        db.add(CouncilMember(meeting_id=council.id, user_id=membership.user_id,
                             company_id=meeting.company_id, seat=seat, status="confirmed",
                             ready=0, role_read=0, notes="", role_key=packet["key"],
                             role_override=json.dumps(packet, ensure_ascii=False)))
    else:
        target = next((member for member in members if membership and member.user_id == membership.user_id), None)
        if target is None:
            raise HTTPException(409, "Участник не найден в связанном созвоне")
        packets = [packet for packet in packets if packet["key"] != target.role_key]
        await db.delete(target)
    settings["packets"] = packets
    settings["capacity"] = len(members) + (1 if adding else -1)
    council.configuration = json.dumps(settings, ensure_ascii=False)
    await db.flush()


async def preparation_recording_allowed(db, council: CouncilMeeting, user_id: int) -> bool:
    """A participant may transmit media without agreeing to store their voice."""
    settings = _json(council.configuration, {})
    if settings.get("game_mode") != "business-preparation-v1":
        return True
    meeting = await db.get(CompanyMeeting, settings.get("business_meeting_id"))
    if meeting is None or meeting.council_meeting_id != council.id:
        return False
    membership = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == meeting.company_id,
        CompanyMembership.user_id == user_id,
    ))
    if membership is None:
        return False
    participant = await db.scalar(select(CompanyMeetingParticipant).where(
        CompanyMeetingParticipant.meeting_id == meeting.id,
        CompanyMeetingParticipant.membership_id == membership.id,
    ))
    if participant is None:
        return False
    from app.routers.company_meetings import _consent_preferences, _meeting_consent_purposes
    purposes = _meeting_consent_purposes(meeting)
    return ("TRANSCRIPT_ANALYSIS" in purposes
            and _consent_preferences(participant, purposes).get("TRANSCRIPT_ANALYSIS") == "ACCEPTED")


def _json(value, fallback):
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback


def _report_summary(report: dict) -> str:
    summary = report.get("summary") if isinstance(report, dict) else ""
    if isinstance(summary, str) and summary.strip():
        return summary.strip()
    return "Совет завершён. Откройте запись встречи, чтобы посмотреть общий результат."


async def sync_council_report_to_company_meeting(db, council: CouncilMeeting) -> None:
    """Store the Council outcome as a draft report for the situation creator.

    The result remains private until that person checks it and sends the report
    to the people invited to the associated company meeting.
    """
    config = _json(council.configuration, {})
    company_meeting_id = config.get("business_meeting_id")
    if not isinstance(company_meeting_id, int):
        return
    meeting = await db.get(CompanyMeeting, company_meeting_id)
    if meeting is None or meeting.council_meeting_id != council.id:
        return
    report = _json(council.result, {})
    agreement = _json(council.agreement, {})
    protocol = await db.scalar(select(CompanyMeetingProtocol).where(
        CompanyMeetingProtocol.meeting_id == meeting.id
    ))
    if protocol and protocol.status == "PUBLISHED":
        return
    is_preparation = meeting.kind == "PREPARATION_CALL"
    public_messages = []
    if is_preparation:
        public_messages = list((await db.scalars(select(CouncilMessage).where(
            CouncilMessage.meeting_id == council.id, CouncilMessage.recipient_id.is_(None),
            CouncilMessage.kind.in_(["message", "proposal", "transcript"]),
        ).order_by(CouncilMessage.id))).all())
        participants = list((await db.scalars(select(CompanyMembership).where(
            CompanyMembership.company_id == meeting.company_id,
            CompanyMembership.user_id.in_([row.author_id for row in public_messages] or [-1]),
        ))).all())
        membership_by_user = {row.user_id: row.id for row in participants}
        existing = list((await db.scalars(select(CompanyMeetingTranscriptSegment).where(
            CompanyMeetingTranscriptSegment.meeting_id == meeting.id,
        ))).all())
        known = Counter((row.speaker_membership_id, row.text) for row in existing)
        seen = Counter()
        for message in public_messages:
            key = (membership_by_user.get(message.author_id), message.text[:10000])
            seen[key] += 1
            if known[key] < seen[key]:
                db.add(CompanyMeetingTranscriptSegment(meeting_id=meeting.id,
                       speaker_membership_id=key[0], start_ms=0, end_ms=0,
                       text=message.text[:10000], confidence=100))
                known[key] += 1
    report_summary = _report_summary(report)
    if is_preparation:
        if public_messages and not report.get("ai_summary"):
            from app.engine.meeting_protocol import draft_from_segments
            report_summary, _ = draft_from_segments([{"id": row.id, "text": row.text} for row in public_messages])
        elif isinstance(report.get("ai_summary"), str) and report["ai_summary"].strip():
            report_summary = report["ai_summary"].strip()
        elif not agreement.get("decision"):
            report_summary = "Созвон завершён. В доступных материалах нет записанных реплик или решения; уточните итог перед отправкой."
        if agreement.get("decision") and not public_messages:
            report_summary = f"По итогам созвона зафиксировано решение: {str(agreement['decision']).strip()}"
        report["summary"] = report_summary
        report["discussed"] = []
        report["unobserved"] = []
        council.result = json.dumps(report, ensure_ascii=False)
        # An audio transcript may arrive after the reviewer has edited the
        # draft. Keep the new evidence, but never erase their changes.
        if protocol and protocol.version > 1:
            meeting.status = "REVIEW"
            return
    if protocol is None:
        protocol = CompanyMeetingProtocol(meeting_id=meeting.id, status="REVIEW", summary=report_summary)
        db.add(protocol)
        await db.flush()
    else:
        protocol.status = "REVIEW"
        protocol.version += 1
        protocol.summary = report_summary
        await db.execute(delete(CompanyMeetingProtocolItem).where(
            CompanyMeetingProtocolItem.protocol_id == protocol.id
        ))

    decision = agreement.get("decision") if isinstance(agreement.get("decision"), str) else ""
    owner = agreement.get("owner") if isinstance(agreement.get("owner"), str) else ""
    unresolved = agreement.get("open_issues") if isinstance(agreement.get("open_issues"), str) else ""
    if decision.strip():
        db.add(CompanyMeetingProtocolItem(
            protocol_id=protocol.id,
            kind="DECISION",
            status="DRAFT",
            title=decision.strip(),
            detail=(f"Ответственный: {owner.strip()}" if owner.strip() else ""),
            confidence=100,
        ))
    if unresolved.strip():
        db.add(CompanyMeetingProtocolItem(
            protocol_id=protocol.id,
            kind="QUESTION",
            status="DRAFT",
            title=unresolved.strip(),
            detail="Открытый вопрос из итогового соглашения Совета решений.",
            confidence=100,
        ))
    meeting.status = "REVIEW"
    meeting.finished_at = meeting.finished_at or datetime.now()
