"""store stable learning attempt exercise snapshots

Revision ID: 0005
Revises: 0004
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learning_attempts", sa.Column("exercise_snapshot", sa.Text(), server_default="[]", nullable=False))


def downgrade() -> None:
    op.drop_column("learning_attempts", "exercise_snapshot")
