"""Privacy-first corporate extensions.

The core company models intentionally stay stable.  These tables hold the
capabilities that need a stricter lifecycle: employee-owned archive records,
explicit grants, explainable negotiation twins, multi-party sessions, HR
taxonomy, integration jobs and league consent.  Every row is tenant scoped.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CompanyArchiveRecord(Base):
    __tablename__ = "company_archive_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    owner_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"))
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    record_type: Mapped[str] = mapped_column(String(40), default="NEGOTIATION", nullable=False)
    data_scope: Mapped[str] = mapped_column(String(80), default="METRICS_AND_REPORT", nullable=False)
    payload: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    methodology_version: Mapped[str] = mapped_column(String(40), default="arena-v1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyArchiveGrant(Base):
    __tablename__ = "company_archive_grants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    archive_id: Mapped[int] = mapped_column(ForeignKey("company_archive_records.id", ondelete="CASCADE"), nullable=False)
    owner_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    grantee_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    data_scope: Mapped[str] = mapped_column(String(80), nullable=False)
    purpose: Mapped[str] = mapped_column(String(500), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(40), default="archive-consent-v1", nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("archive_id", "grantee_membership_id", "revoked_at", name="uq_archive_grant_lifecycle"),)


class CompanyArchiveConsent(Base):
    __tablename__ = "company_archive_consents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    archive_id: Mapped[int] = mapped_column(ForeignKey("company_archive_records.id", ondelete="CASCADE"), nullable=False)
    grant_id: Mapped[int | None] = mapped_column(ForeignKey("company_archive_grants.id", ondelete="SET NULL"))
    actor_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(24), nullable=False)
    data_scope: Mapped[str] = mapped_column(String(80), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(40), default="archive-consent-v1", nullable=False)
    details: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_archive_consents_record_time", "archive_id", "created_at"),)


class CompanyOnboarding(Base):
    __tablename__ = "company_onboarding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False, unique=True)
    policy_version: Mapped[str] = mapped_column(String(40), default="company-data-v1", nullable=False)
    policy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    manager_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    first_tasks: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyProfession(Base):
    __tablename__ = "company_professions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    catalog_version: Mapped[str] = mapped_column(String(40), default="v1", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "code", "catalog_version", name="uq_company_profession_version"),)


class CompanyCustomRole(Base):
    __tablename__ = "company_custom_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    capabilities: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    scope: Mapped[str] = mapped_column(String(32), default="SELF", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_company_custom_role_code"),)


class CompanyCompetency(Base):
    __tablename__ = "company_competencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    catalog_version: Mapped[str] = mapped_column(String(40), default="v1", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "code", "catalog_version", name="uq_company_competency_version"),)


class CompanyProfessionCompetency(Base):
    __tablename__ = "company_profession_competencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profession_id: Mapped[int] = mapped_column(ForeignKey("company_professions.id", ondelete="CASCADE"), nullable=False)
    competency_id: Mapped[int] = mapped_column(ForeignKey("company_competencies.id", ondelete="CASCADE"), nullable=False)
    target_level: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    __table_args__ = (UniqueConstraint("profession_id", "competency_id", name="uq_profession_competency"),)


class CompanyMembershipProfession(Base):
    __tablename__ = "company_membership_professions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    profession_id: Mapped[int] = mapped_column(ForeignKey("company_professions.id"), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("membership_id", "profession_id", name="uq_membership_profession"),)


class CompanyProgramProfession(Base):
    __tablename__ = "company_program_professions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    program_id: Mapped[int] = mapped_column(ForeignKey("company_programs.id", ondelete="CASCADE"), nullable=False)
    profession_id: Mapped[int] = mapped_column(ForeignKey("company_professions.id"), nullable=False)

    __table_args__ = (UniqueConstraint("program_id", "profession_id", name="uq_program_profession"),)


class CompanyCareerTrack(Base):
    __tablename__ = "company_career_tracks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    profession_id: Mapped[int] = mapped_column(ForeignKey("company_professions.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyCareerStep(Base):
    __tablename__ = "company_career_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("company_career_tracks.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    required_competencies: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    recommended_program_ids: Mapped[str] = mapped_column(Text, default="[]", nullable=False)


class CompanySkillGap(Base):
    __tablename__ = "company_skill_gaps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    competency_id: Mapped[int] = mapped_column(ForeignKey("company_competencies.id"), nullable=False)
    current_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    target_level: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    calculated_with: Mapped[str] = mapped_column(String(40), default="hr-v1", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyLearningRecommendation(Base):
    __tablename__ = "company_learning_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[int | None] = mapped_column(ForeignKey("company_programs.id"))
    competency_id: Mapped[int | None] = mapped_column(ForeignKey("company_competencies.id"))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="OPEN", nullable=False)
    methodology_version: Mapped[str] = mapped_column(String(40), default="hr-v1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyAnalyticsMethod(Base):
    __tablename__ = "company_analytics_methods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "version", name="uq_company_analytics_method"),)


class CompanyTwinProfile(Base):
    __tablename__ = "company_twin_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False, unique=True)
    opt_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rule_version: Mapped[str] = mapped_column(String(40), default="twin-rules-v1", nullable=False)
    profile: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    sources_snapshot: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyTwinSource(Base):
    __tablename__ = "company_twin_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    twin_id: Mapped[int] = mapped_column(ForeignKey("company_twin_profiles.id", ondelete="CASCADE"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("twin_id", "source_type", name="uq_twin_source"),)


class CompanyTwinTrainingUse(Base):
    __tablename__ = "company_twin_training_uses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    twin_id: Mapped[int] = mapped_column(ForeignKey("company_twin_profiles.id", ondelete="CASCADE"), nullable=False)
    actor_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    scenario_id: Mapped[str | None] = mapped_column(String(100))
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyMultiPartySession(Base):
    __tablename__ = "company_multipart_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(String(24), default="HUMAN_MEDIATOR", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT", nullable=False)
    current_turn: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyMultiPartyParticipant(Base):
    __tablename__ = "company_multipart_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    session_id: Mapped[int] = mapped_column(ForeignKey("company_multipart_sessions.id", ondelete="CASCADE"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(40), default="PARTICIPANT", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="INVITED", nullable=False)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("session_id", "membership_id", name="uq_multipart_participant"),)


class CompanyMultiPartyTurn(Base):
    __tablename__ = "company_multipart_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    session_id: Mapped[int] = mapped_column(ForeignKey("company_multipart_sessions.id", ondelete="CASCADE"), nullable=False)
    participant_id: Mapped[int | None] = mapped_column(ForeignKey("company_multipart_participants.id"))
    author_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(24), default="MESSAGE", nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_multipart_turns_session_order", "session_id", "turn_number"),)


class CompanyMultiPartyReport(Base):
    __tablename__ = "company_multipart_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    session_id: Mapped[int] = mapped_column(ForeignKey("company_multipart_sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    methodology_version: Mapped[str] = mapped_column(String(40), default="multipart-v1", nullable=False)
    participant_scores: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    outcome: Mapped[str] = mapped_column(String(24), default="OPEN", nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanyModePolicy(Base):
    __tablename__ = "company_mode_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    mode: Mapped[str] = mapped_column(String(40), nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    allowed_roles: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    allowed_departments: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    limit_per_member: Mapped[int | None] = mapped_column(Integer)
    voice_video_allowed: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "mode", name="uq_company_mode_policy"),)


class CompanyModeUsage(Base):
    __tablename__ = "company_mode_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    mode: Mapped[str] = mapped_column(String(40), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "membership_id", "mode", "period", name="uq_company_mode_usage_period"),)


class CompanyScenarioApproval(Base):
    __tablename__ = "company_scenario_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("company_scenarios.id", ondelete="CASCADE"), nullable=False)
    reviewer_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    expert_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="REQUESTED", nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyScenarioRequest(Base):
    __tablename__ = "company_scenario_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    requested_by_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    brief: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(String(40), default="SCENARIO", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="SUBMITTED", nullable=False)
    secure_material: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    admin_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyLeagueConsent(Base):
    __tablename__ = "company_league_consents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    league_id: Mapped[int] = mapped_column(ForeignKey("company_leagues.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    accepted_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    aggregate_scope: Mapped[str] = mapped_column(String(80), default="COMPANY_AVERAGE", nullable=False)
    policy_version: Mapped[str] = mapped_column(String(40), default="league-privacy-v1", nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("league_id", "company_id", name="uq_league_company_consent"),)


class CompanyIntegrationRequest(Base):
    __tablename__ = "company_integration_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="SUBMITTED", nullable=False)
    admin_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyIntegrationJob(Base):
    __tablename__ = "company_integration_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    integration_id: Mapped[int] = mapped_column(ForeignKey("company_integrations.id"), nullable=False)
    operation: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="QUEUED", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime)
    payload: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyBillingInvoice(Base):
    __tablename__ = "company_billing_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    external_invoice_id: Mapped[str | None] = mapped_column(String(180))
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="RUB", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT", nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyBillingEvent(Base):
    __tablename__ = "company_billing_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    event_id: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanySsoIdentity(Base):
    __tablename__ = "company_sso_identities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[str] = mapped_column(String(240), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    email: Mapped[str | None] = mapped_column(String(254))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "provider", "subject", name="uq_company_sso_identity"),)


class CompanyActiveSession(Base):
    __tablename__ = "company_active_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(500))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyChat(Base):
    __tablename__ = "company_chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="GROUP", nullable=False)
    title: Mapped[str | None] = mapped_column(String(220))
    created_by_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyChatMember(Base):
    __tablename__ = "company_chat_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("company_chats.id", ondelete="CASCADE"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(24), default="MEMBER", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("chat_id", "membership_id", name="uq_company_chat_member"),)


class CompanyChatMessage(Base):
    __tablename__ = "company_chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("company_chats.id", ondelete="CASCADE"), nullable=False, index=True)
    author_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (Index("ix_company_chat_messages_order", "chat_id", "created_at"),)


class CompanyChatReaction(Base):
    __tablename__ = "company_chat_reactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    message_id: Mapped[int] = mapped_column(ForeignKey("company_chat_messages.id", ondelete="CASCADE"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False)
    reaction: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("message_id", "membership_id", "reaction", name="uq_company_chat_reaction"),)


class CompanyChatTask(Base):
    __tablename__ = "company_chat_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    message_id: Mapped[int] = mapped_column(ForeignKey("company_chat_messages.id", ondelete="CASCADE"), nullable=False)
    assignee_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="OPEN", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_by_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
