"""Persist consented business enquiries without storing raw network addresses."""
from alembic import op
import sqlalchemy as sa

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("business_leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("company", sa.String(180), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("interest", sa.String(30), nullable=False),
        sa.Column("consent_version", sa.String(40), nullable=False),
        sa.Column("consented_at", sa.DateTime(), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("email_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_business_leads_source_created", "business_leads", ["source_hash", "created_at"])
    op.create_index("ix_business_leads_email_created", "business_leads", ["email_hash", "created_at"])


def downgrade():
    op.drop_index("ix_business_leads_email_created", table_name="business_leads")
    op.drop_index("ix_business_leads_source_created", table_name="business_leads")
    op.drop_table("business_leads")
