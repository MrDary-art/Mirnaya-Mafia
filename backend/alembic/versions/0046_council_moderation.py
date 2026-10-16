"""Council organizers and persistent participant controls."""
from alembic import op
import sqlalchemy as sa
revision = "0046_council_moderation"
down_revision = "0045_council_merge"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("council_moderators",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("appointed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()))
    with op.batch_alter_table("council_members") as batch:
        batch.add_column(sa.Column("muted", sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("camera_blocked", sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("role_override", sa.Text()))

def downgrade():
    with op.batch_alter_table("council_members") as batch:
        batch.drop_column("role_override")
        batch.drop_column("camera_blocked")
        batch.drop_column("muted")
    op.drop_table("council_moderators")
