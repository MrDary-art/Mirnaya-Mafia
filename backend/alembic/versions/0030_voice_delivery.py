"""Remember downstream delivery of a recognized utterance."""
from alembic import op
import sqlalchemy as sa
revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("speech_jobs", sa.Column("delivery_state", sa.String(20)))
    op.add_column("speech_jobs", sa.Column("delivery_result", sa.Text()))


def downgrade():
    op.drop_column("speech_jobs", "delivery_result")
    op.drop_column("speech_jobs", "delivery_state")
