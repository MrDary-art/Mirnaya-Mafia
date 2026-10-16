"""Add recurring assignments and privacy-safe intercompany leagues."""
from alembic import op
import sqlalchemy as sa

revision = "0037_growth_automation"
down_revision = "0036_enterprise_integrations_crm"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("company_assignment_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("template_assignment_id", sa.Integer(), sa.ForeignKey("company_assignments.id"), nullable=False),
        sa.Column("cadence", sa.String(20), nullable=False), sa.Column("interval_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("next_run_at", sa.DateTime(), nullable=False), sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("deadline_offset_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("recipient_membership_ids", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_company_assignment_schedules_due", "company_assignment_schedules", ["status", "next_run_at"])
    op.create_table("company_leagues",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("title", sa.String(220), nullable=False),
        sa.Column("season", sa.String(80), nullable=False), sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="OPEN"),
        sa.Column("min_sample_size", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("starts_at", sa.DateTime(), nullable=True), sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("company_league_entries",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("league_id", sa.Integer(), sa.ForeignKey("company_leagues.id"), nullable=False),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("public_name", sa.String(120), nullable=False), sa.Column("public_logo", sa.String(500), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="JOINED"), sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("sample_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("joined_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("league_id", "company_id", name="uq_company_league_entry"))
    op.create_index("ix_company_league_entries_league", "company_league_entries", ["league_id", "status"])


def downgrade():
    op.drop_index("ix_company_league_entries_league", table_name="company_league_entries")
    op.drop_table("company_league_entries")
    op.drop_table("company_leagues")
    op.drop_index("ix_company_assignment_schedules_due", table_name="company_assignment_schedules")
    op.drop_table("company_assignment_schedules")
