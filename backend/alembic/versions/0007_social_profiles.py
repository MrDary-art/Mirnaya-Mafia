"""add social profiles and arena interactions

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("arena_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("display_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("title", sa.String(), nullable=True))
    op.add_column("users", sa.Column("specialization", sa.String(), nullable=True))
    op.add_column("users", sa.Column("about", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(), nullable=True))
    op.add_column("users", sa.Column("organization", sa.String(), nullable=True))
    op.add_column("users", sa.Column("profile_visibility", sa.String(), server_default="public", nullable=False))
    op.add_column("users", sa.Column("search_visibility", sa.String(), server_default="all", nullable=False))
    op.add_column("users", sa.Column("messages_visibility", sa.String(), server_default="friends", nullable=False))
    op.execute("UPDATE users SET arena_id = 'ARENA-' || printf('%05d', id) WHERE arena_id IS NULL")
    op.create_index("uq_users_arena_id", "users", ["arena_id"], unique=True)
    op.create_table("friendships", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("friend_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("status", sa.String(), nullable=False, server_default="REQUEST_SENT"), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()), sa.UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"))
    op.create_table("direct_messages", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("receiver_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("text", sa.Text(), nullable=False), sa.Column("is_read", sa.Integer(), server_default="0", nullable=False), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))
    op.create_table("online_rooms", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("guest_id", sa.Integer(), sa.ForeignKey("users.id")), sa.Column("scenario_id", sa.String(), nullable=False), sa.Column("creator_role", sa.String(), nullable=False), sa.Column("guest_role", sa.String(), nullable=False), sa.Column("difficulty", sa.String(), nullable=False, server_default="medium"), sa.Column("status", sa.String(), nullable=False, server_default="waiting"), sa.Column("messages", sa.Text(), nullable=False, server_default="[]"), sa.Column("metrics", sa.Text(), nullable=False, server_default="{}"), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()), sa.Column("finished_at", sa.DateTime()))
    op.create_table("challenges", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("receiver_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("scenario_id", sa.String(), nullable=False), sa.Column("type", sa.String(), nullable=False, server_default="scenario"), sa.Column("status", sa.String(), nullable=False, server_default="pending"), sa.Column("result", sa.Text()), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))
    op.create_table("notifications", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("type", sa.String(), nullable=False), sa.Column("payload", sa.Text(), nullable=False, server_default="{}"), sa.Column("is_read", sa.Integer(), nullable=False, server_default="0"), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("challenges")
    op.drop_table("online_rooms")
    op.drop_table("direct_messages")
    op.drop_table("friendships")
    op.drop_index("uq_users_arena_id", table_name="users")
    for column in ("messages_visibility", "search_visibility", "profile_visibility", "organization", "city", "about", "specialization", "title", "display_name", "arena_id"):
        op.drop_column("users", column)
