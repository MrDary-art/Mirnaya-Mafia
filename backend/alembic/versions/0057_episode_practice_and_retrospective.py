"""Link a work episode to personal rehearsal and its retrospective."""
from alembic import op
import sqlalchemy as sa


revision = "0057_episode_practice_and_retrospective"
down_revision = "0056_company_work_episodes"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_work_episodes") as batch:
        batch.add_column(sa.Column("practice_target_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("retrospective", sa.Text(), nullable=False, server_default="{}"))
        batch.create_foreign_key(
            "fk_company_work_episodes_practice_target",
            "company_assignment_targets", ["practice_target_id"], ["id"],
        )
    op.create_index("ix_company_work_episodes_practice_target_id", "company_work_episodes", ["practice_target_id"])


def downgrade():
    op.drop_index("ix_company_work_episodes_practice_target_id", table_name="company_work_episodes")
    with op.batch_alter_table("company_work_episodes") as batch:
        batch.drop_constraint("fk_company_work_episodes_practice_target", type_="foreignkey")
        batch.drop_column("retrospective")
        batch.drop_column("practice_target_id")
