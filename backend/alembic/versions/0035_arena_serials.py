"""Visual novel save slots, permanent scene purchases and collected endings."""
from alembic import op
import sqlalchemy as sa

revision = "0035_arena_serials"
down_revision = "0034_merge_business_social"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "serial_runs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("story_id", sa.String(80), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "story_id", "slot", name="uq_serial_run_slot"),
        sa.CheckConstraint("slot >= 1 AND slot <= 3", name="ck_serial_slot_range"),
        sa.CheckConstraint("revision >= 0", name="ck_serial_revision"),
    )
    op.create_index("ix_serial_runs_user_id", "serial_runs", ["user_id"])
    for table, key_columns, constraint in (
        ("serial_unlocks", [sa.Column("content_key", sa.String(240), nullable=False), sa.Column("cost", sa.Integer(), nullable=False)], "uq_serial_unlock"),
        ("serial_completions", [sa.Column("episode_id", sa.String(80), nullable=False)], "uq_serial_completion"),
        ("serial_endings", [sa.Column("episode_id", sa.String(80), nullable=False), sa.Column("ending_id", sa.String(80), nullable=False)], "uq_serial_ending"),
    ):
        unique = ["user_id", "story_id"] + [column.name for column in key_columns if column.name != "cost"]
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("story_id", sa.String(80), nullable=False),
            *key_columns,
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(*unique, name=constraint),
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade():
    for table in ("serial_endings", "serial_completions", "serial_unlocks", "serial_runs"):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_table(table)
