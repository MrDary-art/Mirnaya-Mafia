"""company material library"""

from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "company_materials",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("content_type", sa.String(40), nullable=False, server_default="TEXT"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("confidential", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("company_materials")
