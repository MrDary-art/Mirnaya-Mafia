"""company applications"""
from alembic import op
import sqlalchemy as sa
revision="0017"
down_revision="0016"
branch_labels=None
depends_on=None
def upgrade():
    op.create_table("company_applications",sa.Column("id",sa.Integer,primary_key=True),sa.Column("company_id",sa.Integer,sa.ForeignKey("companies.id"),nullable=False),sa.Column("user_id",sa.Integer,sa.ForeignKey("users.id"),nullable=False),sa.Column("desired_job_title",sa.String(160),nullable=False),sa.Column("specialization",sa.String(120)),sa.Column("message",sa.Text),sa.Column("status",sa.String(24),nullable=False,server_default="PENDING"),sa.Column("reviewed_by",sa.Integer,sa.ForeignKey("users.id")),sa.Column("review_note",sa.Text),sa.Column("created_at",sa.DateTime,server_default=sa.func.now()),sa.Column("reviewed_at",sa.DateTime),sa.UniqueConstraint("company_id","user_id",name="uq_company_application_user"))
def downgrade(): op.drop_table("company_applications")
