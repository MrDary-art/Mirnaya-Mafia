"""Separate private account login from the public nickname."""
from alembic import op
import sqlalchemy as sa

revision = "0055_user_login"
down_revision = "0054_admin_settings"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("login", sa.String(length=80), nullable=True))
    op.execute(sa.text("UPDATE users SET login = username WHERE login IS NULL"))
    op.create_index("ix_users_login", "users", ["login"], unique=True)


def downgrade():
    op.drop_index("ix_users_login", table_name="users")
    op.drop_column("users", "login")
