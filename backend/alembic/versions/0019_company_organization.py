"""company cohorts, mentoring and personal notification settings"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_memberships") as batch_op:
        batch_op.add_column(sa.Column("mentor_membership_id", sa.Integer, nullable=True))
        batch_op.add_column(sa.Column("notification_settings", sa.Text, nullable=False, server_default="{}"))
        batch_op.create_foreign_key("fk_company_memberships_mentor", "company_memberships", ["mentor_membership_id"], ["id"])
    op.create_table(
        "company_cohorts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "title", name="uq_company_cohort_title"),
    )
    op.create_table(
        "company_cohort_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("cohort_id", sa.Integer, sa.ForeignKey("company_cohorts.id"), nullable=False),
        sa.Column("membership_id", sa.Integer, sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("added_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("cohort_id", "membership_id", name="uq_company_cohort_member"),
    )


def downgrade():
    op.drop_table("company_cohort_members")
    op.drop_table("company_cohorts")
    with op.batch_alter_table("company_memberships") as batch_op:
        batch_op.drop_constraint("fk_company_memberships_mentor", type_="foreignkey")
        batch_op.drop_column("notification_settings")
        batch_op.drop_column("mentor_membership_id")
