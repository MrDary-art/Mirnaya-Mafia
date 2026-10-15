"""Join the business and community migration lines without replaying either branch."""

revision = "0034_merge_business_social"
down_revision = ("0033", "0033_social_feed")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
