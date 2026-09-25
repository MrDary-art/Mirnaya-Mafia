"""persistent corporate tournament bracket"""

from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("company_competitions", sa.Column("rules", sa.Text, nullable=False, server_default="{}"))
    op.create_table(
        "company_tournament_matches",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("competition_id", sa.Integer, sa.ForeignKey("company_competitions.id"), nullable=False),
        sa.Column("round_number", sa.Integer, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("first_membership_id", sa.Integer, sa.ForeignKey("company_memberships.id")),
        sa.Column("second_membership_id", sa.Integer, sa.ForeignKey("company_memberships.id")),
        sa.Column("winner_membership_id", sa.Integer, sa.ForeignKey("company_memberships.id")),
        sa.Column("status", sa.String(24), nullable=False, server_default="SCHEDULED"),
        sa.UniqueConstraint("competition_id", "round_number", "position", name="uq_company_tournament_match"),
    )


def downgrade():
    op.drop_table("company_tournament_matches")
    op.drop_column("company_competitions", "rules")
