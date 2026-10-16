"""Personal social discussion and feed controls."""
from alembic import op
import sqlalchemy as sa

revision = "0045_social_feed_controls"
down_revision = "0044_company_mode_usage"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "social_thread_subscriptions",
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("social_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_social_thread_subscriptions_user",
        "social_thread_subscriptions",
        ["user_id", "created_at"],
    )
    op.create_table(
        "social_post_hides",
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("social_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_social_post_hides_user", "social_post_hides", ["user_id", "created_at"])


def downgrade():
    op.drop_index("ix_social_post_hides_user", table_name="social_post_hides")
    op.drop_table("social_post_hides")
    op.drop_index("ix_social_thread_subscriptions_user", table_name="social_thread_subscriptions")
    op.drop_table("social_thread_subscriptions")
