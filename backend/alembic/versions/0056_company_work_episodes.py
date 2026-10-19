"""Add working episodes that link preparation, meetings and commitments."""
from alembic import op
import sqlalchemy as sa

revision = "0056_company_work_episodes"
down_revision = "0055_user_login"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # Keep this revision at its original schema. Importing the live ORM models
    # would also create columns introduced by revisions 0057 and 0058.
    if not inspector.has_table("company_work_episodes"):
        op.create_table(
            "company_work_episodes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("owner_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
            sa.Column("title", sa.String(220), nullable=False),
            sa.Column("situation_type", sa.String(32), nullable=False),
            sa.Column("expected_result", sa.Text(), nullable=False),
            sa.Column("scheduled_at", sa.DateTime()),
            sa.Column("visibility", sa.String(24), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("preparation", sa.Text(), nullable=False),
            sa.Column("source_type", sa.String(24), nullable=False),
            sa.Column("source_reference", sa.String(160)),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_company_work_episodes_company_id", "company_work_episodes", ["company_id"])
        op.create_index("ix_company_work_episodes_owner_membership_id", "company_work_episodes", ["owner_membership_id"])
    if not inspector.has_table("company_work_episode_participants"):
        op.create_table(
            "company_work_episode_participants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("episode_id", sa.Integer(), sa.ForeignKey("company_work_episodes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id"), nullable=False),
            sa.Column("role", sa.String(24), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("episode_id", "membership_id", name="uq_company_work_episode_participant"),
        )
        op.create_index("ix_company_work_episode_participants_episode_id", "company_work_episode_participants", ["episode_id"])
    if not inspector.has_table("company_episode_commitments"):
        op.create_table(
            "company_episode_commitments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("episode_id", sa.Integer(), sa.ForeignKey("company_work_episodes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("source_meeting_id", sa.Integer(), sa.ForeignKey("company_meetings.id")),
            sa.Column("source_protocol_item_id", sa.Integer(), sa.ForeignKey("company_meeting_protocol_items.id"), unique=True),
            sa.Column("owner_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id")),
            sa.Column("title", sa.String(240), nullable=False),
            sa.Column("detail", sa.Text(), nullable=False),
            sa.Column("acceptance_criteria", sa.Text(), nullable=False),
            sa.Column("due_at", sa.DateTime()),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("blocker_note", sa.Text(), nullable=False),
            sa.Column("created_by_membership_id", sa.Integer(), sa.ForeignKey("company_memberships.id")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_company_episode_commitments_company_id", "company_episode_commitments", ["company_id"])
        op.create_index("ix_company_episode_commitments_episode_id", "company_episode_commitments", ["episode_id"])
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
        if any(index["name"] == "ix_company_meetings_episode_id" for index in sa.inspect(bind).get_indexes("company_meetings")):
            op.drop_index("ix_company_meetings_episode_id", table_name="company_meetings")
        has_episode_fk = any(
            foreign_key["name"] == "fk_company_meetings_episode"
            for foreign_key in sa.inspect(bind).get_foreign_keys("company_meetings")
        )
        with op.batch_alter_table("company_meetings") as batch:
            if has_episode_fk:
                batch.drop_constraint("fk_company_meetings_episode", type_="foreignkey")
            batch.drop_column("episode_id")
    for table in ("company_episode_commitments", "company_work_episode_participants", "company_work_episodes"):
        if sa.inspect(bind).has_table(table):
            op.drop_table(table)
