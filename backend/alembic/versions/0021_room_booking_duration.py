"""store duration for corporate online bookings"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("company_room_bookings", sa.Column("duration_minutes", sa.Integer, nullable=False, server_default="15"))


def downgrade():
    op.drop_column("company_room_bookings", "duration_minutes")
