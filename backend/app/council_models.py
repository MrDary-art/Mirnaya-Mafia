"""A four-person decision council, separate from the two-person Arena rooms."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CouncilMeeting(Base):
    __tablename__ = "council_meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organizer_plays: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    visibility: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    agreement: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    agreement_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result: Mapped[str | None] = mapped_column(Text)
    reminder_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    decision_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    configuration: Mapped[str] = mapped_column(Text, nullable=False, default="{}", server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CouncilMember(Base):
    __tablename__ = "council_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("council_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seat: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    preferred_role: Mapped[str | None] = mapped_column(String(32))
    role_key: Mapped[str | None] = mapped_column(String(32))
    ready: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    vote_version: Mapped[int | None] = mapped_column(Integer)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime)
    offered_at: Mapped[datetime | None] = mapped_column(DateTime)
    muted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    camera_blocked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    role_override: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_council_member_user"),
        UniqueConstraint("meeting_id", "seat", name="uq_council_member_seat"),
        UniqueConstraint("meeting_id", "role_key", name="uq_council_member_role"),
    )


class CouncilMessage(Base):
    __tablename__ = "council_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("council_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="message")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CouncilSignal(Base):
    __tablename__ = "council_signals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("council_meetings.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CouncilModerator(Base):
    __tablename__ = "council_moderators"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    appointed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
