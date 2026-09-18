"""Persist paired practice rooms and their human conversation.

Revision ID: 0010
Revises: 0009
"""

from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("arena_rooms"):
        op.create_table(
            "arena_rooms",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(length=32), unique=True, nullable=False),
            sa.Column("mode", sa.String(length=16), nullable=False),
            sa.Column("host_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("guest_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("status", sa.String(length=16), server_default="waiting", nullable=False),
            sa.Column("state", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("started_at", sa.DateTime()),
            sa.Column("finished_at", sa.DateTime()),
        )
    if not sa.inspect(op.get_bind()).has_table("arena_room_messages"):
        op.create_table(
            "arena_room_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("analysis", sa.Text()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
    if not sa.inspect(op.get_bind()).has_table("arena_room_signals"):
        op.create_table(
            "arena_room_signals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("payload", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("arena_room_signals")
    op.drop_table("arena_room_messages")
    op.drop_table("arena_rooms")
