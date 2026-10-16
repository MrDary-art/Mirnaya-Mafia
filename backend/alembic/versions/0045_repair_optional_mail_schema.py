"""Repair installations stamped past the optional-mail migration.

Some local installations were stamped at the latest revision after the
business/social merge without actually applying revision 0031.  The ORM
therefore selected ``users.email`` even though the column was absent, making
authentication, profiles and every authenticated company endpoint fail with
an internal error.  This migration is deliberately idempotent so it can run
against both affected SQLite databases and fully migrated installations.
"""

from alembic import op
import sqlalchemy as sa


revision = "0045_repair_optional_mail_schema"
down_revision = "0044_company_mode_usage"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return any(item["name"] == column for item in inspector.get_columns(table))


def _has_table(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "users"):
        if not _has_column(inspector, "users", "email"):
            op.add_column("users", sa.Column("email", sa.String(254), nullable=True))
        if not _has_column(inspector, "users", "email_verified_at"):
            op.add_column("users", sa.Column("email_verified_at", sa.DateTime(), nullable=True))
        inspector = sa.inspect(bind)
        indexes = {item["name"] for item in inspector.get_indexes("users")}
        if "ix_users_email" not in indexes:
            op.create_index("ix_users_email", "users", ["email"], unique=True)

    inspector = sa.inspect(bind)
    if not _has_table(inspector, "email_tokens"):
        op.create_table(
            "email_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("purpose", sa.String(30), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("email", sa.String(254), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
        )

    inspector = sa.inspect(bind)
    if not _has_table(inspector, "email_outbox"):
        op.create_table(
            "email_outbox",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("dedupe_key", sa.String(200), nullable=False, unique=True),
            sa.Column("recipient", sa.String(254), nullable=False),
            sa.Column("subject", sa.String(200), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("state", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("next_attempt_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_error", sa.String(300), nullable=True),
        )


def downgrade() -> None:
    # Keep data safe on downgrade.  The original optional-mail migration owns
    # these objects; this compatibility migration only repairs them forward.
    pass
