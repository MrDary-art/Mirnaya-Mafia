"""Store the primary profession on a company membership."""

import sqlalchemy as sa
from alembic import op

revision = "0042_membership_profession"
down_revision = "0041_company_messenger"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_memberships") as batch:
        batch.add_column(sa.Column("profession_id", sa.Integer(), sa.ForeignKey("company_professions.id", name="fk_company_memberships_profession_id"), nullable=True))


def downgrade():
    with op.batch_alter_table("company_memberships") as batch:
        batch.drop_column("profession_id")
