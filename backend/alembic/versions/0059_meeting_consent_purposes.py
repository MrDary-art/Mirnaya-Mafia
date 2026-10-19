"""Store meeting consent by declared processing purpose."""
from alembic import op
import sqlalchemy as sa


revision = "0059_meeting_consent_purposes"
down_revision = "0058_commitment_acceptance_and_verification"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    meeting_columns = {column["name"] for column in sa.inspect(bind).get_columns("company_meetings")}
    if "consent_purposes" not in meeting_columns:
        with op.batch_alter_table("company_meetings") as batch:
            batch.add_column(sa.Column("consent_purposes", sa.Text(), nullable=False, server_default="[]"))
    participant_columns = {column["name"] for column in sa.inspect(bind).get_columns("company_meeting_participants")}
    if "consent_preferences" not in participant_columns:
        with op.batch_alter_table("company_meeting_participants") as batch:
            batch.add_column(sa.Column("consent_preferences", sa.Text(), nullable=False, server_default="{}"))
    op.execute("""
        UPDATE company_meetings
        SET consent_purposes = '["TRANSCRIPT_ANALYSIS", "PROTOCOL_SHARING"]'
        WHERE consent_required = 1
    """)


def downgrade():
    with op.batch_alter_table("company_meeting_participants") as batch:
        batch.drop_column("consent_preferences")
    with op.batch_alter_table("company_meetings") as batch:
        batch.drop_column("consent_purposes")
