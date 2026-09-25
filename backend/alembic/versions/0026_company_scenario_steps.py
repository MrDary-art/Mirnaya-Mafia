"""store deterministic steps for corporate scenarios"""

from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_scenarios") as batch:
        batch.add_column(sa.Column("scenario_steps", sa.Text(), nullable=False, server_default="[]"))


def downgrade():
    with op.batch_alter_table("company_scenarios") as batch:
        batch.drop_column("scenario_steps")
