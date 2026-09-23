"""Add persisted theory lesson progress.

Revision ID: 0012
Revises: 0011
"""

from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("theory_progress"):
        return
    op.create_table(
        "theory_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("lesson_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="not_started"),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("theory_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("answers", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("best_practice_score", sa.Integer()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "lesson_id", name="uq_theory_user_lesson"),
    )


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("theory_progress"):
        op.drop_table("theory_progress")
