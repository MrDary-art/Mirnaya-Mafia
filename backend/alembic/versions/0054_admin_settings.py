"""Admin confirmation challenges, security signals and recoverable mail archive."""
from alembic import op
import sqlalchemy as sa
revision = "0054_admin_settings"
down_revision = "0053_council_companies"
branch_labels = None
depends_on = None

def upgrade():
    from app.deployment_models import AdminChallenge, SecurityAlert
    bind = op.get_bind()
    AdminChallenge.__table__.create(bind)
    SecurityAlert.__table__.create(bind)
    op.add_column("email_outbox", sa.Column("archived_at", sa.DateTime(), nullable=True))

def downgrade():
    op.drop_column("email_outbox", "archived_at")
    op.drop_table("security_alerts")
    op.drop_table("admin_challenges")
