"""store system invitations in direct messages

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("direct_messages", sa.Column("type", sa.String(), nullable=False, server_default="TEXT"))
    op.add_column("direct_messages", sa.Column("payload", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("direct_messages", "payload")
    op.drop_column("direct_messages", "type")
