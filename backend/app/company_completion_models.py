"""Additive enterprise workflows that complement the current company model.

The established advanced models remain canonical for archive, messenger, mode
policies, roles and approvals.  These tables cover the remaining lifecycle
features without redefining existing metadata.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CompanyCorporateIdentity(Base):
    __tablename__ = "company_corporate_identities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True)
    organization_code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    email_domain: Mapped[str | None] = mapped_column(String(190))
    require_verified_email: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyOwnershipTransfer(Base):
    __tablename__ = "company_ownership_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    from_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    to_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    confirmation_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CompanySpecialty(Base):
    __tablename__ = "company_specialties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    profession_id: Mapped[int] = mapped_column(ForeignKey("company_professions.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    catalog_version: Mapped[str] = mapped_column(String(40), default="v1", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "code", "catalog_version", name="uq_company_specialty_version"),)


class CompanyProfessionalProfile(Base):
    __tablename__ = "company_professional_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id", ondelete="CASCADE"), nullable=False, unique=True)
    specialty_id: Mapped[int | None] = mapped_column(ForeignKey("company_specialties.id", ondelete="SET NULL"))
    professional_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    level_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    level_verified_by: Mapped[int | None] = mapped_column(ForeignKey("company_memberships.id"))
    share_results: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    policy_version: Mapped[str] = mapped_column(String(40), default="company-data-v1", nullable=False)
    rehire_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CompanyProfessionScenario(Base):
    __tablename__ = "company_profession_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    profession_id: Mapped[int] = mapped_column(ForeignKey("company_professions.id", ondelete="CASCADE"), nullable=False)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("company_scenarios.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (UniqueConstraint("profession_id", "scenario_id", name="uq_profession_scenario"),)


class CompanyScenarioSnapshot(Base):
    __tablename__ = "company_scenario_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("company_scenarios.id", ondelete="CASCADE"), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("scenario_id", "revision", name="uq_company_scenario_snapshot_revision"),)


class CompanyProductRequest(Base):
    __tablename__ = "company_product_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by_membership_id: Mapped[int] = mapped_column(ForeignKey("company_memberships.id"), nullable=False)
    request_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    materials: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="SUBMITTED", nullable=False)
    admin_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
