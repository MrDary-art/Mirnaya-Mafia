"""Interactive stories, immutable attempts and real social interactions."""
from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("stories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("title", sa.String(140), nullable=False),
        sa.Column("hook", sa.String(500), nullable=False),
        sa.Column("search_text", sa.String(700), nullable=False),
        sa.Column("topic", sa.String(20), nullable=False),
        sa.Column("theme", sa.String(20), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("graph", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("moderation_note", sa.String(1000)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime()))
    op.create_index("ix_stories_feed", "stories", ["status", "published_at", "id"])
    op.create_index("ix_stories_author", "stories", ["author_id", "status"])
    op.create_table("story_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.String(64), nullable=False),
        sa.Column("graph", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime()))
    op.create_index("ix_story_attempts_user", "story_attempts", ["user_id", "story_id", "status"])
    op.create_index("ix_story_attempts_story", "story_attempts", ["story_id"])
    op.create_index("uq_story_attempts_active", "story_attempts", ["story_id", "user_id", "role_id"],
                    unique=True, sqlite_where=sa.text("status = 'active'"))
    for table in ("story_likes", "story_saves"):
        op.create_table(table,
            sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True))
        op.create_index(f"ix_{table}_user", table, ["user_id"])
    op.create_table("story_follows",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True))
    op.create_table("story_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_story_comments_story", "story_comments", ["story_id", "id"])
    op.create_table("story_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("story_id", "user_id", name="uq_story_report_user"))


def downgrade():
    for table in ("story_reports", "story_comments", "story_follows", "story_saves", "story_likes", "story_attempts", "stories"):
        op.drop_table(table)
