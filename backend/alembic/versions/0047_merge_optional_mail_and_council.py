"""Merge the optional mail repair and decision council migration branches."""

from alembic import op


revision = "0047_merge_optional_mail_and_council"
down_revision = ("0045_repair_optional_mail_schema", "0046_council_moderation")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
