"""Safe tenant-scoped custom roles."""

import sqlalchemy as sa
from alembic import op

from app.company_advanced_models import CompanyCustomRole

revision = "0043_company_custom_roles"
down_revision = "0042_membership_profession"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    CompanyCustomRole.__table__.create(bind=bind, checkfirst=True)
    with op.batch_alter_table("company_memberships") as batch:
        batch.add_column(sa.Column("custom_role_id", sa.Integer(), sa.ForeignKey("company_custom_roles.id", name="fk_company_memberships_custom_role_id"), nullable=True))


def downgrade():
    bind = op.get_bind()
    with op.batch_alter_table("company_memberships") as batch:
        batch.drop_column("custom_role_id")
    CompanyCustomRole.__table__.drop(bind=bind, checkfirst=True)
