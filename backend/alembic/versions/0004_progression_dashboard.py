"""add progression dashboard persistence

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_code", sa.String(), server_default="avatar_orbit", nullable=False))
    op.add_column("users", sa.Column("frame_code", sa.String(), server_default="frame_standard", nullable=False))
    op.add_column("users", sa.Column("profile_theme", sa.String(), server_default="arena", nullable=False))
    op.add_column("users", sa.Column("streak_freezes", sa.Integer(), server_default="1", nullable=False))
    op.create_table(
        "star_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_id", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "type", "source", "source_id", name="uq_star_transaction_source"),
    )
    op.create_table(
        "user_inventory",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("item_code", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("acquired_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "item_code", name="uq_user_inventory_item"),
    )
    op.create_table(
        "user_activity",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("activity_types", sa.Text(), server_default="[]", nullable=False),
        sa.Column("streak", sa.Integer(), server_default="0", nullable=False),
        sa.Column("freeze_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("milestones", sa.Text(), server_default="[]", nullable=False),
        sa.Column("daily_challenge_completed", sa.Integer(), server_default="0", nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_user_activity_date"),
    )


def downgrade() -> None:
    op.drop_table("user_activity")
    op.drop_table("user_inventory")
    op.drop_table("star_transactions")
    op.drop_column("users", "streak_freezes")
    op.drop_column("users", "profile_theme")
    op.drop_column("users", "frame_code")
    op.drop_column("users", "avatar_code")
