"""Game Lab runs, completions and collected outcomes."""
from alembic import op
import sqlalchemy as sa

revision = "0039_game_lab"
down_revision = "0038_merge_enterprise_serials"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "lab_runs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trainer_id", sa.String(80), nullable=False),
        sa.Column("case_id", sa.String(80), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "trainer_id", "case_id", name="uq_lab_run_case"),
        sa.CheckConstraint("revision >= 0", name="ck_lab_run_revision"),
    )
    op.create_index("ix_lab_runs_user_id", "lab_runs", ["user_id"])
    for table, columns, constraint in (
        ("lab_completions", [], "uq_lab_completion"),
        ("lab_endings", [sa.Column("ending_id", sa.String(80), nullable=False)], "uq_lab_ending"),
    ):
        unique = ["user_id", "trainer_id", "case_id"] + [column.name for column in columns]
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("trainer_id", sa.String(80), nullable=False),
            sa.Column("case_id", sa.String(80), nullable=False),
            *columns,
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(*unique, name=constraint),
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade():
    for table in ("lab_endings", "lab_completions", "lab_runs"):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_table(table)
