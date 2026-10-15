"""One-use company invitations and metadata for existing learning teams."""
from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("company_memberships", sa.Column("personalization_enabled", sa.Integer(), nullable=False, server_default="0"))
    with op.batch_alter_table("company_cohorts") as batch:
        batch.add_column(sa.Column("leader_membership_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("starts_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("ends_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("goal", sa.Text(), nullable=True))
        batch.add_column(sa.Column("focus_skills", sa.Text(), nullable=False, server_default="[]"))
        batch.create_foreign_key("fk_company_cohort_leader", "company_memberships", ["leader_membership_id"], ["id"])
    op.create_table("company_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("corporate_role", sa.String(40), nullable=False, server_default="EMPLOYEE"),
        sa.Column("job_title", sa.String(160), nullable=False, server_default="Сотрудник"),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("company_departments.id"), nullable=True),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.create_index("ix_company_invitations_company_id", "company_invitations", ["company_id"])


def downgrade():
    op.drop_column("company_memberships", "personalization_enabled")
    op.drop_index("ix_company_invitations_company_id", table_name="company_invitations")
    op.drop_table("company_invitations")
    with op.batch_alter_table("company_cohorts") as batch:
        batch.drop_constraint("fk_company_cohort_leader", type_="foreignkey")
        for column in ("focus_skills", "goal", "ends_at", "starts_at", "leader_membership_id"):
            batch.drop_column(column)
