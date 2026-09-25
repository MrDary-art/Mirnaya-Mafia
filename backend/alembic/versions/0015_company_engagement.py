"""company engagement, feedback and program enrolments

Revision ID: 0015
Revises: 0014
"""

from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("company_surveys",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("company_assignments.id")), sa.Column("title", sa.String(220), nullable=False),
        sa.Column("questions", sa.Text(), nullable=False, server_default="[]"), sa.Column("anonymous", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"), sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))
    op.create_table("company_survey_responses",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("survey_id", sa.Integer(), sa.ForeignKey("company_surveys.id"), nullable=False), sa.Column("membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("answers", sa.Text(), nullable=False, server_default="{}"), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()), sa.UniqueConstraint("survey_id", "membership_id", name="uq_company_survey_response"))
    op.create_table("company_result_comments",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("attempt_id", sa.Integer(), sa.ForeignKey("company_assignment_attempts.id"), nullable=False), sa.Column("author_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))
    op.create_table("company_program_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False), sa.Column("program_id", sa.Integer(), sa.ForeignKey("company_programs.id"), nullable=False),
        sa.Column("membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"), sa.Column("unlocked_step", sa.Integer(), nullable=False, server_default="1"), sa.Column("completed_steps", sa.Text(), nullable=False, server_default="[]"), sa.Column("enrolled_at", sa.DateTime(), server_default=sa.func.now()), sa.Column("completed_at", sa.DateTime()), sa.UniqueConstraint("program_id", "membership_id", name="uq_company_program_enrollment"))


def downgrade() -> None:
    op.drop_table("company_program_enrollments")
    op.drop_table("company_result_comments")
    op.drop_table("company_survey_responses")
    op.drop_table("company_surveys")
