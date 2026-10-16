"""Persistent saves and permanent entitlements for authored visual novels."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SerialRun(Base):
    __tablename__ = "serial_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    story_id: Mapped[str] = mapped_column(String(80))
    slot: Mapped[int] = mapped_column(Integer)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="active")
    state: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("user_id", "story_id", "slot", name="uq_serial_run_slot"),
        CheckConstraint("slot >= 1 AND slot <= 3", name="ck_serial_slot_range"),
        CheckConstraint("revision >= 0", name="ck_serial_revision"),
    )


class SerialUnlock(Base):
    __tablename__ = "serial_unlocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    story_id: Mapped[str] = mapped_column(String(80))
    content_key: Mapped[str] = mapped_column(String(240))
    cost: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("user_id", "story_id", "content_key", name="uq_serial_unlock"),)


class SerialCompletion(Base):
    __tablename__ = "serial_completions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    story_id: Mapped[str] = mapped_column(String(80))
    episode_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("user_id", "story_id", "episode_id", name="uq_serial_completion"),)


class SerialEnding(Base):
    __tablename__ = "serial_endings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    story_id: Mapped[str] = mapped_column(String(80))
    episode_id: Mapped[str] = mapped_column(String(80))
    ending_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("user_id", "story_id", "episode_id", "ending_id", name="uq_serial_ending"),)
