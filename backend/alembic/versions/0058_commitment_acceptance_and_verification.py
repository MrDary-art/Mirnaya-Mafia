"""Add acceptance and verification evidence to episode commitments."""
from alembic import op
import sqlalchemy as sa


revision = "0058_commitment_acceptance_and_verification"
down_revision = "0057_episode_practice_and_retrospective"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("company_episode_commitments") as batch:
        batch.add_column(sa.Column("accepted_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("completed_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("verified_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("verified_by_membership_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_company_episode_commitments_verified_by",
            "company_memberships", ["verified_by_membership_id"], ["id"],
        )
    # A completed commitment from the former two-state flow was already final.
    op.execute("""
        UPDATE company_episode_commitments
        SET status = 'VERIFIED',
            completed_at = COALESCE(completed_at, updated_at),
            verified_at = COALESCE(verified_at, updated_at)
        WHERE status = 'COMPLETED'
    """)


def downgrade():
    with op.batch_alter_table("company_episode_commitments") as batch:
        batch.drop_constraint("fk_company_episode_commitments_verified_by", type_="foreignkey")
        batch.drop_column("verified_by_membership_id")
        batch.drop_column("verified_at")
        batch.drop_column("completed_at")
        batch.drop_column("accepted_at")
