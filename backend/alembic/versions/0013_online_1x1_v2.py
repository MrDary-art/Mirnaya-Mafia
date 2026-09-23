"""Persist 1x1 recordings, feedback, jobs, and team records.

Revision ID: 0013
Revises: 0012
"""

from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("arena_recordings"):
        op.create_table("arena_recordings",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="recording"),
            sa.Column("consented", sa.Integer(), nullable=False, server_default="0"), sa.Column("mime_type", sa.String(120)),
            sa.Column("manifest", sa.Text(), nullable=False, server_default="{}"), sa.Column("total_bytes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()), sa.Column("finalized_at", sa.DateTime()), sa.Column("expires_at", sa.DateTime()),
            sa.UniqueConstraint("room_id", "user_id", name="uq_arena_recording_owner"))
        op.create_table("arena_recording_chunks",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("recording_id", sa.Integer(), sa.ForeignKey("arena_recordings.id"), nullable=False),
            sa.Column("segment_id", sa.String(64), nullable=False), sa.Column("chunk_index", sa.Integer(), nullable=False),
            sa.Column("checksum", sa.String(64), nullable=False), sa.Column("size", sa.Integer(), nullable=False),
            sa.Column("start_ms", sa.Integer(), nullable=False), sa.Column("end_ms", sa.Integer(), nullable=False),
            sa.Column("storage_key", sa.String(300), nullable=False), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint("recording_id", "segment_id", "chunk_index", name="uq_arena_recording_chunk"))
    if not inspector.has_table("arena_room_feedback"):
        op.create_table("arena_room_feedback",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="not_received"),
            sa.Column("answers", sa.Text(), nullable=False, server_default="{}"), sa.Column("share_with_peer", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("publish_team_result", sa.Integer(), nullable=False, server_default="0"), sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint("room_id", "user_id", name="uq_arena_room_feedback"))
    if not inspector.has_table("arena_room_jobs"):
        op.create_table("arena_room_jobs",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), nullable=False),
            sa.Column("kind", sa.String(32), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"), sa.Column("payload", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("error", sa.Text()), sa.Column("available_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()), sa.Column("finished_at", sa.DateTime()),
            sa.UniqueConstraint("room_id", "kind", name="uq_arena_room_job"))
    if not inspector.has_table("arena_team_records"):
        op.create_table("arena_team_records",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), unique=True, nullable=False),
            sa.Column("user_a_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("user_b_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("team_key", sa.String(80), nullable=False), sa.Column("challenge_key", sa.String(160), nullable=False),
            sa.Column("score", sa.Integer(), nullable=False), sa.Column("eligible", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("public", sa.Integer(), nullable=False, server_default="0"), sa.Column("details", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))


def downgrade() -> None:
    for table in ("arena_team_records", "arena_room_jobs", "arena_room_feedback", "arena_recording_chunks", "arena_recordings"):
        if sa.inspect(op.get_bind()).has_table(table):
            op.drop_table(table)
