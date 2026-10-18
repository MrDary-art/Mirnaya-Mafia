"""Store meeting consent by declared processing purpose."""
from alembic import op
import sqlalchemy as sa


revision = "0059_meeting_consent_purposes"
down_revision = "0058_commitment_acceptance_and_verification"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_meetings") as batch:
        batch.add_column(sa.Column("consent_purposes", sa.Text(), nullable=False, server_default="[]"))
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
