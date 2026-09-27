"""Installation and speech persistence; independent from game scoring."""
from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from app.db import Base


class InstallationConfig(Base):
    __tablename__ = "installation_config"
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    value = Column(Text, nullable=False, default="{}")


class AdminAudit(Base):
    __tablename__ = "admin_audit"
    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(80), nullable=False)
    detail = Column(Text, nullable=False, default="{}")
    created = Column(Float, nullable=False)


class SpeechWorker(Base):
    __tablename__ = "speech_workers"
    id = Column(String(36), primary_key=True)
    name = Column(String(80), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    revoked = Column(Integer, nullable=False, default=0)
    ready = Column(Integer, nullable=False, default=0)
    last_seen = Column(Float, nullable=False, default=0)
    diagnostic = Column(Text, nullable=False, default="{}")


class SpeechEnrollment(Base):
    __tablename__ = "speech_enrollments"
    id = Column(Integer, primary_key=True)
    code_hash = Column(String(64), nullable=False)
    name = Column(String(80), nullable=False)
    expires = Column(Float, nullable=False)
    used = Column(Integer, nullable=False, default=0)


class SpeechJob(Base):
    __tablename__ = "speech_jobs"
    __table_args__ = (UniqueConstraint("owner_id", "context", "request_key"),)
    id = Column(String(36), primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    context = Column(String(120), nullable=False)
    request_key = Column(String(100), nullable=False)
    audio_hash = Column(String(64), nullable=False)
    audio_size = Column(Integer, nullable=False)
    policy = Column(String(16), nullable=False)
    revision = Column(Integer, nullable=False)
    state = Column(String(20), nullable=False, index=True)
    created = Column(Float, nullable=False)
    deadline = Column(Float, nullable=False)
    worker_id = Column(String(36), ForeignKey("speech_workers.id"), nullable=True)
    lease_token = Column(String(64), nullable=True)
    lease_until = Column(Float, nullable=True)
    attempt = Column(Integer, nullable=False, default=0)
    result = Column(Text, nullable=True)
    error = Column(String(80), nullable=True)
    provider = Column(String(24), nullable=True)
    model = Column(String(100), nullable=True)
    finished = Column(Float, nullable=True)

    delivery_state = Column(String(20), nullable=True)
    delivery_result = Column(Text, nullable=True)
