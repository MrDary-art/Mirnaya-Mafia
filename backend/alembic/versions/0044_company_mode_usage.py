"""Periodic usage ledger for company mode limits."""

from alembic import op

from app.company_advanced_models import CompanyModeUsage

revision = "0044_company_mode_usage"
down_revision = "0043_company_custom_roles"
branch_labels = None
depends_on = None


def upgrade():
    CompanyModeUsage.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade():
    CompanyModeUsage.__table__.drop(bind=op.get_bind(), checkfirst=True)
