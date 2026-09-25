"""encrypted company integration settings"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "company_integrations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("enabled", sa.Integer, nullable=False, server_default="0"),
        sa.Column("encrypted_config", sa.Text, nullable=False),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "provider", name="uq_company_integration_provider"),
    )


def downgrade():
    op.drop_table("company_integrations")
