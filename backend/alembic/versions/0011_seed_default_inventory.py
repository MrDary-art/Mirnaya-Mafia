"""Normalize starter cosmetics and grant them to existing users.

Revision ID: 0011
Revises: 0010
"""

from alembic import op


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET avatar_code = 'avatar_analyst' WHERE avatar_code IS NULL OR avatar_code = 'avatar_orbit'")
    op.execute("UPDATE users SET frame_code = 'frame_classic' WHERE frame_code IS NULL OR frame_code = 'frame_standard'")
    op.execute("UPDATE users SET profile_theme = 'theme_arena' WHERE profile_theme IS NULL OR profile_theme = 'arena'")
    op.execute("INSERT OR IGNORE INTO user_inventory (user_id, item_code, category) SELECT id, avatar_code, 'avatar' FROM users")
    op.execute("INSERT OR IGNORE INTO user_inventory (user_id, item_code, category) SELECT id, frame_code, 'frame' FROM users")
    op.execute("INSERT OR IGNORE INTO user_inventory (user_id, item_code, category) SELECT id, profile_theme, 'theme' FROM users")


def downgrade() -> None:
    # Starter items must stay owned after rollback so that equipped cosmetics remain valid.
    pass
