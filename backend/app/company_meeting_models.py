"""Tenant-scoped meeting records and reviewable protocol artifacts.

Raw speech can be useful context, but the published protocol is the canonical
company document.  The tables deliberately keep transcripts, AI runs and
human approvals separate so that a model can never silently publish work.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CompanyMeeting(Base):
    __tablename__ = "company_meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    organizer_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    room_id: Mapped[int | None] = mapped_column(ForeignKey("arena_rooms.id"), unique=True)
    council_meeting_id: Mapped[int | None] = mapped_column(ForeignKey("council_meetings.id"), unique=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="MEETING")
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    agenda: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    visibility: Mapped[str] = mapped_column(String(24), nullable=False, default="PARTICIPANTS")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="SCHEDULED")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    consent_required: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyMeetingParticipant(Base):
    __tablename__ = "company_meeting_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("company_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="PARTICIPANT")
    invite_status: Mapped[str] = mapped_column(String(24), nullable=False, default="INVITED")
    consent_status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING")
    consented_at: Mapped[datetime | None] = mapped_column(DateTime)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("meeting_id", "membership_id", name="uq_company_meeting_participant"),)


class CompanyMeetingTranscriptSegment(Base):
    __tablename__ = "company_meeting_transcript_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("company_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    speaker_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    start_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    excluded_from_analysis: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyMeetingProtocol(Base):
    __tablename__ = "company_meeting_protocols"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("company_meetings.id", ondelete="CASCADE"), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    published_by_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyMeetingProtocolItem(Base):
    __tablename__ = "company_meeting_protocol_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    protocol_id: Mapped[int] = mapped_column(ForeignKey("company_meeting_protocols.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTION")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    assignee_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    acceptance_criteria: Mapped[str] = mapped_column(Text, default="", nullable=False)
    source_segment_ids: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyMeetingApproval(Base):
    __tablename__ = "company_meeting_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    protocol_id: Mapped[int] = mapped_column(ForeignKey("company_meeting_protocols.id", ondelete="CASCADE"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("protocol_id", "membership_id", "version", name="uq_company_protocol_approval"),)


class CompanyMeetingValidationIssue(Base):
    __tablename__ = "company_meeting_validation_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    protocol_id: Mapped[int] = mapped_column(ForeignKey("company_meeting_protocols.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("company_meeting_protocol_items.id", ondelete="CASCADE"))
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
