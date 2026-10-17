"""Editable council briefs and audience."""
from alembic import op
import sqlalchemy as sa

revision = "0049_council_configuration"
down_revision = "0048_enterprise_completion"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("council_meetings", sa.Column("configuration", sa.Text(), nullable=False, server_default="{}"))

def downgrade():
    op.drop_column("council_meetings", "configuration")
