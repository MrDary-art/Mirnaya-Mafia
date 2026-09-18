"""add skill tree progression and xp

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("xp", sa.Integer(), server_default="0", nullable=False))
    op.create_table(
        "training_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("completed", sa.Text(), server_default="{}"),
        sa.Column("errors", sa.Text(), server_default="[]"),
        sa.Column("attempts", sa.Text(), server_default="[]"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("training_progress")
    op.drop_column("users", "xp")
