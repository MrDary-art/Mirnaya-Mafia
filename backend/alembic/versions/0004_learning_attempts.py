"""add learning attempts

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa
revision="0004"; down_revision="0003"; branch_labels=None; depends_on=None
def upgrade():
    op.create_table("learning_attempts",sa.Column("id",sa.Integer(),primary_key=True),sa.Column("user_id",sa.Integer(),sa.ForeignKey("users.id"),nullable=False),sa.Column("level_id",sa.String(),nullable=False),sa.Column("status",sa.String(),server_default="active"),sa.Column("answers",sa.Text(),server_default="[]"),sa.Column("score",sa.Integer()),sa.Column("stars",sa.Integer()),sa.Column("report",sa.Text()),sa.Column("created_at",sa.DateTime(),server_default=sa.func.now()),sa.Column("completed_at",sa.DateTime()))
def downgrade(): op.drop_table("learning_attempts")
