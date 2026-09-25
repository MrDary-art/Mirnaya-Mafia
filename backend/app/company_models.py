"""Корпоративный контур Arena.

Личные пользователи и игровые сессии остаются общими моделями платформы.
Все корпоративные данные явно привязаны к company_id, а доступ к ним выдаётся
только через подтверждённое CompanyMembership.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    industry: Mapped[str | None] = mapped_column(String(120))
    company_size: Mapped[str | None] = mapped_column(String(60))
    country: Mapped[str | None] = mapped_column(String(100))
    city: Mapped[str | None] = mapped_column(String(100))
    website: Mapped[str | None] = mapped_column(String(300))
    corporate_color: Mapped[str] = mapped_column(String(20), default="#63E6F0", nullable=False)
    secondary_color: Mapped[str] = mapped_column(String(20), default="#8B7CFF", nullable=False)
    academy_name: Mapped[str | None] = mapped_column(String(160))
    timezone: Mapped[str] = mapped_column(String(80), default="Europe/Moscow", nullable=False)
    language: Mapped[str] = mapped_column(String(20), default="ru", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    settings: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanyDepartment(Base):
    __tablename__ = "company_departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    parent_department_id: Mapped[int | None] = mapped_column(ForeignKey("company_departments.id"))
    manager_membership_id: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_company_department_name"),)


class CompanyMembership(Base):
    __tablename__ = "company_memberships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("company_departments.id"))
    job_title: Mapped[str | None] = mapped_column(String(160))
    employee_number: Mapped[str | None] = mapped_column(String(80))
    corporate_role: Mapped[str] = mapped_column(String(40), default="EMPLOYEE", nullable=False)
    manager_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    status: Mapped[str] = mapped_column(String(24), default="INVITED", nullable=False)
    company_visibility: Mapped[str] = mapped_column(String(32), default="company", nullable=False)
    is_primary: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime)
    invited_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    mentor_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    notification_settings: Mapped[str] = mapped_column(Text, default="{}", nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_company_membership_user"),)


class CompanyScenario(Base):
    __tablename__ = "company_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    industry: Mapped[str | None] = mapped_column(String(120))
    employee_role: Mapped[str] = mapped_column(String(160), nullable=False)
    opponent_role: Mapped[str] = mapped_column(String(160), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    employee_goal: Mapped[str] = mapped_column(Text, nullable=False)
    opponent_goal: Mapped[str | None] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(32), default="средняя", nullable=False)
    tone: Mapped[str | None] = mapped_column(String(80))
    batna: Mapped[str | None] = mapped_column(Text)
    zopa: Mapped[str | None] = mapped_column(Text)
    restrictions: Mapped[str | None] = mapped_column(Text)
    success_criteria: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    source_materials: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    scenario_steps: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT", nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    last_editor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class CompanyKPI(Base):
    __tablename__ = "company_kpis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(String(40), default="баллы", nullable=False)
    rule: Mapped[str] = mapped_column(String(40), default="MIN", nullable=False)
    threshold: Mapped[int | None] = mapped_column(Integer)
    weight: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    required: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanyProgram(Base):
    __tablename__ = "company_programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    audience: Mapped[str | None] = mapped_column(Text)
    steps: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT", nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class CompanyAssignment(Base):
    __tablename__ = "company_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    goal: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(32), default="ARENA_SCENARIO", nullable=False)
    scenario_id: Mapped[str | None] = mapped_column(String(100))
    company_scenario_id: Mapped[int | None] = mapped_column(ForeignKey("company_scenarios.id"))
    program_id: Mapped[int | None] = mapped_column(ForeignKey("company_programs.id"))
    difficulty: Mapped[str] = mapped_column(String(32), default="средняя", nullable=False)
    employee_role: Mapped[str | None] = mapped_column(String(160))
    opponent: Mapped[str | None] = mapped_column(String(160))
    deadline: Mapped[datetime | None] = mapped_column(DateTime)
    attempts_allowed: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    attempt_policy: Mapped[str] = mapped_column(String(16), default="BEST", nullable=False)
    required: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    passing_score: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    hints_allowed: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ghost_allowed: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    repeat_allowed: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    show_result_immediately: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    show_team_comparison: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    issue_certificate: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    arena_weight: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    company_weight: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    kpi_snapshot: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    assignment_snapshot: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class CompanyAssignmentTarget(Base):
    __tablename__ = "company_assignment_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("company_assignments.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ASSIGNED", nullable=False)
    best_score: Mapped[int | None] = mapped_column(Integer)
    attempts_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("assignment_id", "membership_id", name="uq_company_assignment_target"),)


class CompanyAssignmentAttempt(Base):
    __tablename__ = "company_assignment_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("company_assignments.id"), nullable=False)
    target_id: Mapped[int] = mapped_column(ForeignKey("company_assignment_targets.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"))
    arena_score: Mapped[int | None] = mapped_column(Integer)
    company_score: Mapped[int | None] = mapped_column(Integer)
    final_score: Mapped[int | None] = mapped_column(Integer)
    metrics_snapshot: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    kpi_results: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="IN_PROGRESS", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class CompanyCertificate(Base):
    __tablename__ = "company_certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    program_id: Mapped[int | None] = mapped_column(ForeignKey("company_programs.id"))
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    certificate_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    verification_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoke_reason: Mapped[str | None] = mapped_column(Text)


class CompanyInboxMessage(Base):
    __tablename__ = "company_inbox_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    is_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanyAuditLog(Base):
    __tablename__ = "company_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(80))
    details: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanySurvey(Base):
    __tablename__ = "company_surveys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("company_assignments.id"))
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    questions: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    anonymous: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanySurveyResponse(Base):
    __tablename__ = "company_survey_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    survey_id: Mapped[int] = mapped_column(ForeignKey("company_surveys.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    answers: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("survey_id", "membership_id", name="uq_company_survey_response"),)


class CompanyResultComment(Base):
    __tablename__ = "company_result_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("company_assignment_attempts.id"), nullable=False)
    author_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanyProgramEnrollment(Base):
    __tablename__ = "company_program_enrollments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    program_id: Mapped[int] = mapped_column(ForeignKey("company_programs.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    unlocked_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    completed_steps: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("program_id", "membership_id", name="uq_company_program_enrollment"),)


class CompanyProgramStep(Base):
    __tablename__ = "company_program_steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    program_id: Mapped[int] = mapped_column(ForeignKey("company_programs.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), default="ASSIGNMENT", nullable=False)
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("company_assignments.id"))
    unlock_rule: Mapped[str] = mapped_column(String(32), default="PREVIOUS", nullable=False)
    min_score: Mapped[int | None] = mapped_column(Integer)
    required: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    __table_args__ = (UniqueConstraint("program_id", "position", name="uq_company_program_step_position"),)


class CompanyRoomBooking(Base):
    __tablename__ = "company_room_bookings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    room_id: Mapped[int] = mapped_column(ForeignKey("arena_rooms.id"), unique=True, nullable=False)
    host_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    guest_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="SCHEDULED", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanyCompetition(Base):
    __tablename__ = "company_competitions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("company_assignments.id"))
    kind: Mapped[str] = mapped_column(String(24), default="TOURNAMENT", nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rules: Mapped[str] = mapped_column(Text, default="{}", nullable=False)


class CompanyCompetitionParticipant(Base):
    __tablename__ = "company_competition_participants"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("company_competitions.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    team_name: Mapped[str | None] = mapped_column(String(120))
    __table_args__ = (UniqueConstraint("competition_id", "membership_id", name="uq_company_competition_participant"),)


class CompanyTeamGoal(Base):
    __tablename__ = "company_team_goals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    target_score: Mapped[int] = mapped_column(Integer, nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("company_departments.id"))
    deadline: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)


class CompanyApplication(Base):
    __tablename__ = "company_applications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    desired_job_title: Mapped[str] = mapped_column(String(160), nullable=False)
    specialization: Mapped[str | None] = mapped_column(String(120))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="PENDING", nullable=False)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    review_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_company_application_user"),)


class CompanyIntegration(Base):
    """Configuration is encrypted before it reaches this table."""

    __tablename__ = "company_integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    encrypted_config: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("company_id", "provider", name="uq_company_integration_provider"),)


class CompanyCohort(Base):
    __tablename__ = "company_cohorts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("company_id", "title", name="uq_company_cohort_title"),)


class CompanyCohortMember(Base):
    __tablename__ = "company_cohort_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("company_cohorts.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("cohort_id", "membership_id", name="uq_company_cohort_member"),)


class CompanyAchievement(Base):
    __tablename__ = "company_achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(16), default="🏅", nullable=False)
    conditions: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CompanyAchievementGrant(Base):
    __tablename__ = "company_achievement_grants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    achievement_id: Mapped[int] = mapped_column(ForeignKey("company_achievements.id"), nullable=False)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    assignment_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("company_assignment_attempts.id"))
    granted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("achievement_id", "membership_id", name="uq_company_achievement_grant"),)


class CompanyTournamentMatch(Base):
    __tablename__ = "company_tournament_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("company_competitions.id"), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    first_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    second_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    winner_membership_id: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    status: Mapped[str] = mapped_column(String(24), default="SCHEDULED", nullable=False)

    __table_args__ = (UniqueConstraint("competition_id", "round_number", "position", name="uq_company_tournament_match"),)


class CompanyMaterial(Base):
    __tablename__ = "company_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(40), default="TEXT", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255))
    scope_type: Mapped[str] = mapped_column(String(24), default="COMPANY", nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("company_departments.id"))
    program_id: Mapped[int | None] = mapped_column(ForeignKey("company_programs.id"))
    scenario_id: Mapped[int | None] = mapped_column(ForeignKey("company_scenarios.id"))
    confidential: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_allowed: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
