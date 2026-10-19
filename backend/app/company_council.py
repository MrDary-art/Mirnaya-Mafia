"""Keep a corporate Decision Council and its meeting report in one workflow."""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import delete, select

from app.company_meeting_models import CompanyMeeting, CompanyMeetingProtocol, CompanyMeetingProtocolItem
from app.council_models import CouncilMeeting


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
    """Publish the Council's factual result as a reviewable company protocol.

    This intentionally does not publish the protocol: the corporate meeting
    owner can still check the automatically assembled summary and decide which
    action items should become company commitments.
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
    if protocol is None:
        protocol = CompanyMeetingProtocol(meeting_id=meeting.id, status="REVIEW", summary=_report_summary(report))
        db.add(protocol)
        await db.flush()
    else:
        protocol.status = "REVIEW"
        protocol.version += 1
        protocol.summary = _report_summary(report)
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
