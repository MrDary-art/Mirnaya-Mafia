"""immutable corporate assignment snapshot"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("company_assignments", sa.Column("assignment_snapshot", sa.Text, nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("company_assignments", "assignment_snapshot")
