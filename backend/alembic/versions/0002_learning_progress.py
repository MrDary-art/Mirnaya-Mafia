"""add learning progress

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("program_id", sa.String(), nullable=False),
        sa.Column("completed", sa.Text(), server_default="[]"),
        sa.Column("errors", sa.Text(), server_default="[]"),
        sa.Column("mastery", sa.Text(), server_default="{}"),
        sa.Column("attempts", sa.Text(), server_default="[]"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "program_id", name="uq_learning_user_program"),
    )


def downgrade() -> None:
    op.drop_table("learning_progress")
