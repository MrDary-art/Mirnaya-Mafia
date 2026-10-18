"""Company tournament affiliations and seat allocations."""
from alembic import op
import sqlalchemy as sa

revision = "0053_council_companies"
down_revision = "0052_support_tickets"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("council_companies",
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("council_meetings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), primary_key=True),
        sa.Column("seats", sa.Integer(), nullable=False))
    op.create_index("ix_council_companies_company_id", "council_companies", ["company_id"])
    with op.batch_alter_table("council_members") as batch:
        batch.add_column(sa.Column("company_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_council_member_company", "companies", ["company_id"], ["id"])
    op.execute("UPDATE council_members SET company_id = (SELECT company_id FROM council_meetings WHERE council_meetings.id = council_members.meeting_id)")


def downgrade():
    with op.batch_alter_table("council_members") as batch:
        batch.drop_constraint("fk_council_member_company", type_="foreignkey")
        batch.drop_column("company_id")
    op.drop_table("council_companies")
