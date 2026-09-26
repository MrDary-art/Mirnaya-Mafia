"""Add equipped cosmetic status.

Revision ID: 0028
Revises: 0027
"""
from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("status_code", sa.String(), nullable=True))


def downgrade():
    op.drop_column("users", "status_code")
