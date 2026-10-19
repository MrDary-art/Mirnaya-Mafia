"""Link company assignments to AI-ready working-situation preparation plans."""
from alembic import op
import sqlalchemy as sa


revision = "0060_company_preparation_plan"
down_revision = "0059_meeting_consent_purposes"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    episode_columns = {column["name"] for column in sa.inspect(bind).get_columns("company_work_episodes")}
    with op.batch_alter_table("company_work_episodes") as batch:
        if "brief" not in episode_columns:
            batch.add_column(sa.Column("brief", sa.Text(), nullable=False, server_default=""))
        if "completion_reason" not in episode_columns:
            batch.add_column(sa.Column("completion_reason", sa.String(length=32), nullable=True))
        if "completed_at" not in episode_columns:
            batch.add_column(sa.Column("completed_at", sa.DateTime(), nullable=True))

    assignment_columns = {column["name"] for column in sa.inspect(bind).get_columns("company_assignments")}
    with op.batch_alter_table("company_assignments") as batch:
        if "episode_id" not in assignment_columns:
            batch.add_column(sa.Column("episode_id", sa.Integer(), nullable=True))
            batch.create_foreign_key(
                "fk_company_assignments_episode",
                "company_work_episodes", ["episode_id"], ["id"],
            )
        if "source_type" not in assignment_columns:
            batch.add_column(sa.Column("source_type", sa.String(length=24), nullable=False, server_default="MANUAL"))
    indexes = {item["name"] for item in sa.inspect(bind).get_indexes("company_assignments")}
    if "ix_company_assignments_episode_id" not in indexes:
        op.create_index("ix_company_assignments_episode_id", "company_assignments", ["episode_id"])


def downgrade():
    bind = op.get_bind()
    indexes = {item["name"] for item in sa.inspect(bind).get_indexes("company_assignments")}
    if "ix_company_assignments_episode_id" in indexes:
        op.drop_index("ix_company_assignments_episode_id", table_name="company_assignments")
    with op.batch_alter_table("company_assignments") as batch:
        batch.drop_constraint("fk_company_assignments_episode", type_="foreignkey")
        batch.drop_column("source_type")
        batch.drop_column("episode_id")
    with op.batch_alter_table("company_work_episodes") as batch:
        batch.drop_column("completed_at")
        batch.drop_column("completion_reason")
        batch.drop_column("brief")
