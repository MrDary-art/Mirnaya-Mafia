"""Personal workspace layout and idempotent import of training reports."""
from alembic import op
import sqlalchemy as sa
revision = "0055_workspace_preferences"
down_revision = "0054_admin_settings"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("company_memberships", sa.Column("workspace_preferences", sa.Text(), server_default="{}", nullable=False))
    # Nullable source IDs allow manual records and preserve all existing archives.
    op.add_column("company_archive_records", sa.Column("source_attempt_id", sa.Integer(), nullable=True))
    op.create_index("uq_archive_source_attempt", "company_archive_records", ["source_attempt_id"], unique=True)

def downgrade():
    op.drop_index("uq_archive_source_attempt", table_name="company_archive_records")
    op.drop_column("company_archive_records", "source_attempt_id")
    op.drop_column("company_memberships", "workspace_preferences")
