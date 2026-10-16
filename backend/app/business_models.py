"""Sales enquiries share the installed database and never expose a public directory."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class BusinessLead(Base):
    __tablename__ = "business_leads"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    company: Mapped[str] = mapped_column(String(180), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    interest: Mapped[str] = mapped_column(String(30), nullable=False, default="demo")
    consent_version: Mapped[str] = mapped_column(String(40), nullable=False)
    consented_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="NEW")
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    internal_note: Mapped[str | None] = mapped_column(Text)
    next_action_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (Index("ix_business_leads_source_created", "source_hash", "created_at"),
                     Index("ix_business_leads_email_created", "email_hash", "created_at"))
