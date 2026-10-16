"""Four-person decision council."""
from alembic import op
import sqlalchemy as sa

revision = "0040_decision_council"
down_revision = "0039_game_lab"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "council_meetings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organizer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visibility", sa.String(12), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False),
        sa.Column("agreement", sa.Text(), nullable=False),
        sa.Column("agreement_version", sa.Integer(), nullable=False),
        sa.Column("result", sa.Text()),
        sa.Column("reminder_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("decision_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_council_meetings_scheduled_at", "council_meetings", ["scheduled_at"])
    op.create_table(
        "council_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("council_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seat", sa.Integer()),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("preferred_role", sa.String(32)),
        sa.Column("role_key", sa.String(32)),
        sa.Column("ready", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("role_read", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("vote_version", sa.Integer()),
        sa.Column("joined_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("meeting_id", "user_id", name="uq_council_member_user"),
        sa.UniqueConstraint("meeting_id", "seat", name="uq_council_member_seat"),
        sa.UniqueConstraint("meeting_id", "role_key", name="uq_council_member_role"),
        sa.CheckConstraint("seat IS NULL OR seat BETWEEN 1 AND 4", name="ck_council_seat"),
    )
    op.create_index("ix_council_members_meeting_id", "council_members", ["meeting_id"])
    op.create_index("ix_council_members_user_id", "council_members", ["user_id"])
    op.create_table(
        "council_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("council_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_council_messages_meeting_id", "council_messages", ["meeting_id"])


def downgrade():
    op.drop_index("ix_council_messages_meeting_id", table_name="council_messages")
    op.drop_table("council_messages")
    op.drop_index("ix_council_members_user_id", table_name="council_members")
    op.drop_index("ix_council_members_meeting_id", table_name="council_members")
    op.drop_table("council_members")
    op.drop_index("ix_council_meetings_scheduled_at", table_name="council_meetings")
    op.drop_table("council_meetings")
