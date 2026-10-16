"""Add integration health history and CRM lead workflow fields."""
from alembic import op
import sqlalchemy as sa

revision = "0036_enterprise_integrations_crm"
down_revision = "0035_enterprise_access_billing"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_integrations") as batch:
        batch.add_column(sa.Column("status", sa.String(32), nullable=False, server_default="NOT_CONFIGURED"))
        batch.add_column(sa.Column("capabilities", sa.Text(), nullable=False, server_default="[]"))
        batch.add_column(sa.Column("last_checked_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("last_error", sa.Text(), nullable=True))
    op.create_table(
        "company_integration_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("integration_id", sa.Integer(), sa.ForeignKey("company_integrations.id"), nullable=False),
        sa.Column("operation", sa.String(60), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detail", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_company_integration_runs_company_created", "company_integration_runs", ["company_id", "created_at"])
    with op.batch_alter_table("business_leads") as batch:
        batch.add_column(sa.Column("assignee_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_business_leads_assignee_id_users", "users", ["assignee_id"], ["id"])
        batch.add_column(sa.Column("internal_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("next_action_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))


def downgrade():
    with op.batch_alter_table("business_leads") as batch:
        batch.drop_column("updated_at")
        batch.drop_column("next_action_at")
        batch.drop_column("internal_note")
        batch.drop_constraint("fk_business_leads_assignee_id_users", type_="foreignkey")
        batch.drop_column("assignee_id")
    op.drop_index("ix_company_integration_runs_company_created", table_name="company_integration_runs")
    op.drop_table("company_integration_runs")
    with op.batch_alter_table("company_integrations") as batch:
        batch.drop_column("last_error")
        batch.drop_column("last_checked_at")
        batch.drop_column("capabilities")
        batch.drop_column("status")
