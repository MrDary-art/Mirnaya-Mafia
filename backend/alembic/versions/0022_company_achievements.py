"""measurable corporate achievements"""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "company_achievements",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("icon", sa.String(16), nullable=False, server_default="??"),
        sa.Column("conditions", sa.Text, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_table(
        "company_achievement_grants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("achievement_id", sa.Integer, sa.ForeignKey("company_achievements.id"), nullable=False),
        sa.Column("membership_id", sa.Integer, sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("assignment_attempt_id", sa.Integer, sa.ForeignKey("company_assignment_attempts.id")),
        sa.Column("granted_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("achievement_id", "membership_id", name="uq_company_achievement_grant"),
    )


def downgrade():
    op.drop_table("company_achievement_grants")
    op.drop_table("company_achievements")
