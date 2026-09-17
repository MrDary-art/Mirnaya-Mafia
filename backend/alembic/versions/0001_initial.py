"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.Text(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("level", sa.Integer(), server_default="1"),
        sa.Column("stars", sa.Integer(), server_default="0"),
        sa.Column("is_admin", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("mode", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("opponent_role", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text()),
        sa.Column("settings", sa.Text()),
        sa.Column("status", sa.Text(), server_default="active"),
        sa.Column("verdict", sa.Text()),
        sa.Column("metrics", sa.Text()),
        sa.Column("report", sa.Text()),
        sa.Column("state", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime()),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("sender", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("analysis", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "achievements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "code", name="uq_user_achievement"),
    )
    op.create_table(
        "daily_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("completed", sa.Integer(), server_default="0"),
        sa.Column("streak", sa.Integer(), server_default="0"),
    )
    op.create_table(
        "app_settings",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("daily_challenges")
    op.drop_table("achievements")
    op.drop_table("messages")
    op.drop_table("sessions")
    op.drop_table("users")
