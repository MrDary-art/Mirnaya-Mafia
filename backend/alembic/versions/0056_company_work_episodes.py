"""Add working episodes that link preparation, meetings and commitments."""
from alembic import op
import sqlalchemy as sa

from app.company_episode_models import CompanyEpisodeCommitment, CompanyWorkEpisode, CompanyWorkEpisodeParticipant

revision = "0056_company_work_episodes"
down_revision = "0055_user_login"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    for model in (CompanyWorkEpisode, CompanyWorkEpisodeParticipant, CompanyEpisodeCommitment):
        model.__table__.create(bind=bind, checkfirst=True)
    columns = {column["name"] for column in sa.inspect(bind).get_columns("company_meetings")}
    if "episode_id" not in columns:
        with op.batch_alter_table("company_meetings") as batch:
            batch.add_column(sa.Column("episode_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_company_meetings_episode", "company_work_episodes", ["episode_id"], ["id"])
        op.create_index("ix_company_meetings_episode_id", "company_meetings", ["episode_id"])


def downgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("company_meetings")}
    if "episode_id" in columns:
        with op.batch_alter_table("company_meetings") as batch:
            batch.drop_constraint("fk_company_meetings_episode", type_="foreignkey")
            batch.drop_column("episode_id")
    for model in (CompanyEpisodeCommitment, CompanyWorkEpisodeParticipant, CompanyWorkEpisode):
        model.__table__.drop(bind=bind, checkfirst=True)
