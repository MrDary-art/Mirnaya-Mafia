"""Persistent support workflow; diagnostic context is never part of public messages."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="SUPPORT")
    source_report_id: Mapped[int | None] = mapped_column(ForeignKey("social_reports.id"), unique=True)
    status: Mapped[str] = mapped_column(String(24), default="OPEN", index=True)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    developer_only: Mapped[int] = mapped_column(Integer, default=0)
    private_context: Mapped[str] = mapped_column(Text, default="{}")
    internal_note: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (CheckConstraint("status IN ('OPEN','IN_PROGRESS','DEVELOPER','WAITING_USER','CLOSED')", name="ck_support_ticket_status"),)


class SupportTicketMessage(Base):
    __tablename__ = "support_ticket_messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("support_tickets.id"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    staff: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    receipt: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SupportActionLog(Base):
    __tablename__ = "support_action_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80))
    route: Mapped[str] = mapped_column(String(200))
    method: Mapped[str] = mapped_column(String(8))
    status_code: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (Index("ix_support_actions_user_id", "user_id", "id"),)
