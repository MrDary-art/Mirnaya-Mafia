"""Add configurable corporate capabilities and license accounting."""
from alembic import op
import sqlalchemy as sa

revision = "0035_enterprise_access_billing"
down_revision = "0034_merge_business_social"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("company_memberships", sa.Column("capability_overrides", sa.Text(), nullable=False, server_default="{}"))
    op.create_table(
        "company_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False, unique=True),
        sa.Column("plan_code", sa.String(32), nullable=False, server_default="TEAM"),
        sa.Column("status", sa.String(24), nullable=False, server_default="TRIAL"),
        sa.Column("licensed_seats", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("billing_provider", sa.String(40), nullable=False, server_default="MANUAL"),
        sa.Column("external_customer_id", sa.String(180), nullable=True),
        sa.Column("external_subscription_id", sa.String(180), nullable=True),
        sa.Column("period_started_at", sa.DateTime(), nullable=True),
        sa.Column("period_ends_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("company_subscriptions")
    op.drop_column("company_memberships", "capability_overrides")
