"""add personal name fields

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None
def upgrade():
    op.add_column("users", sa.Column("first_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("middle_name", sa.String(), nullable=True))
    op.execute("UPDATE users SET first_name = COALESCE(display_name, username), last_name = '' WHERE first_name IS NULL")
def downgrade():
    op.drop_column("users", "middle_name")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
