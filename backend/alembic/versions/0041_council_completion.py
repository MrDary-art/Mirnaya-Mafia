"""Council facilitator, corporate calendar, presence and call signaling."""
from alembic import op
import sqlalchemy as sa

revision = "0041_council_completion"
down_revision = "0040_decision_council"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("council_meetings") as batch:
        batch.add_column(sa.Column("organizer_plays", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", name="fk_council_company")))
    with op.batch_alter_table("council_members") as batch:
        batch.add_column(sa.Column("last_seen_at", sa.DateTime()))
        batch.add_column(sa.Column("offered_at", sa.DateTime()))
    op.create_table("council_signals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("council_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False), sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_index("ix_council_signals_meeting_id", "council_signals", ["meeting_id"])
    op.create_index("ix_council_signals_recipient_id", "council_signals", ["recipient_id"])


def downgrade():
    op.drop_table("council_signals")
    with op.batch_alter_table("council_members") as batch:
        batch.drop_column("offered_at")
        batch.drop_column("last_seen_at")
    with op.batch_alter_table("council_meetings") as batch:
        batch.drop_constraint("fk_council_company", type_="foreignkey")
        batch.drop_column("company_id")
        batch.drop_column("organizer_plays")
