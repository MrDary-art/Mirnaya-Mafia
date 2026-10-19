"""Add reviewable corporate meeting protocols.

Keep this revision independent of live ORM models: later revisions extend
meetings with episodes and purpose-specific consent.
"""
from alembic import op
import sqlalchemy as sa

revision = "0050_company_meeting_protocols"
down_revision = "0049_council_configuration"
branch_labels = None
depends_on = None

def _create(name, *columns, indexes=()):
    if sa.inspect(op.get_bind()).has_table(name):
        return
    op.create_table(name, *columns)
    for column in indexes:
        op.create_index(f"ix_{name}_{column}", name, [column])


def upgrade():
    _create(
        "company_meetings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("organizer_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("arena_rooms.id"), unique=True),
        sa.Column("council_meeting_id", sa.Integer(), sa.ForeignKey("council_meetings.id"), unique=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("agenda", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("scheduled_at", sa.DateTime()),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("consent_required", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime()),
        indexes=("company_id",),
    )
    _create(
        "company_meeting_participants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("company_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("role", sa.String(24), nullable=False),
        sa.Column("invite_status", sa.String(24), nullable=False),
        sa.Column("consent_status", sa.String(24), nullable=False),
        sa.Column("consented_at", sa.DateTime()),
        sa.Column("joined_at", sa.DateTime()),
        sa.UniqueConstraint("meeting_id", "membership_id", name="uq_company_meeting_participant"),
        indexes=("meeting_id",),
    )
    _create(
        "company_meeting_transcript_segments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("company_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("speaker_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id")),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("excluded_from_analysis", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        indexes=("meeting_id",),
    )
    _create(
        "company_meeting_protocols",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("company_meetings.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime()),
        sa.Column("published_by_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    _create(
        "company_meeting_protocol_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("protocol_id", sa.Integer(), sa.ForeignKey("company_meeting_protocols.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("assignee_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id")),
        sa.Column("due_at", sa.DateTime()),
        sa.Column("acceptance_criteria", sa.Text(), nullable=False),
        sa.Column("source_segment_ids", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        indexes=("protocol_id",),
    )
    _create(
        "company_meeting_approvals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("protocol_id", sa.Integer(), sa.ForeignKey("company_meeting_protocols.id", ondelete="CASCADE"), nullable=False),
        sa.Column("membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("protocol_id", "membership_id", "version", name="uq_company_protocol_approval"),
        indexes=("protocol_id",),
    )
    _create(
        "company_meeting_validation_issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("protocol_id", sa.Integer(), sa.ForeignKey("company_meeting_protocols.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("company_meeting_protocol_items.id", ondelete="CASCADE")),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("resolved_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        indexes=("protocol_id",),
    )


def downgrade():
    for name in (
        "company_meeting_validation_issues", "company_meeting_approvals",
        "company_meeting_protocol_items", "company_meeting_protocols",
        "company_meeting_transcript_segments", "company_meeting_participants",
        "company_meetings",
    ):
        if sa.inspect(op.get_bind()).has_table(name):
            op.drop_table(name)
