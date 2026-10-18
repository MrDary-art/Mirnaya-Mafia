"""Tenant-scoped working episodes that connect preparation, meetings and commitments.

An episode is intentionally smaller than a CRM deal or task tracker.  It is the
safe, auditable container for one consequential conversation.  Private
preparation remains with its owner; only the shared meeting outcome and
published commitments can become visible to the wider team.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CompanyWorkEpisode(Base):
    __tablename__ = "company_work_episodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    owner_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    situation_type: Mapped[str] = mapped_column(String(32), nullable=False, default="NEGOTIATION")
    expected_result: Mapped[str] = mapped_column(Text, default="", nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime)
    visibility: Mapped[str] = mapped_column(String(24), nullable=False, default="PRIVATE")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PREPARING")
    practice_target_id: Mapped[int | None] = mapped_column(ForeignKey("company_assignment_targets.id"))
    preparation: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    retrospective: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    source_type: Mapped[str] = mapped_column(String(24), nullable=False, default="MANUAL")
    source_reference: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyWorkEpisodeParticipant(Base):
    __tablename__ = "company_work_episode_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("company_work_episodes.id", ondelete="CASCADE"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="PARTICIPANT")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="INVITED")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("episode_id", "membership_id", name="uq_company_work_episode_participant"),)


class CompanyEpisodeCommitment(Base):
    __tablename__ = "company_episode_commitments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("company_work_episodes.id", ondelete="CASCADE"), nullable=False, index=True)
    source_meeting_id: Mapped[int | None] = mapped_column(ForeignKey("company_meetings.id"))
    source_protocol_item_id: Mapped[int | None] = mapped_column(ForeignKey("company_meeting_protocol_items.id"), unique=True)
    owner_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    acceptance_criteria: Mapped[str] = mapped_column(Text, default="", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING")
    blocker_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_by_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    verified_by_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
