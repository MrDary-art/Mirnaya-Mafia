"""Backfill social tables after the canonical Game Lab migration.

Some installations were stamped at an older company/Game Lab revision before
the community merge.  This compatibility step fills only missing social DDL
and never replays company or Game Lab tables.
"""

from pathlib import Path
import runpy

from alembic import op
from sqlalchemy import inspect


revision = "0039_social_feed_backfill"
down_revision = "0039_game_lab"
branch_labels = None
depends_on = None


def _run_migration(filename: str) -> None:
    module = runpy.run_path(str(Path(__file__).with_name(filename)))
    module["upgrade"]()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("stories"):
        _run_migration("0032_interactive_stories.py")
    inspector = inspect(bind)
    if not inspector.has_table("social_posts"):
        _run_migration("0033_social_feed.py")


def downgrade():
    # The canonical branch migrations own these tables.  This compatibility
    # migration only fills a gap and intentionally has no destructive rollback.
    pass
