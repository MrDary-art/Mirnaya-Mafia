"""Tenant-isolated company messenger tables."""

from alembic import op
from app.company_advanced_models import CompanyChat, CompanyChatMember, CompanyChatMessage, CompanyChatReaction, CompanyChatTask

revision = "0041_company_messenger"
down_revision = "0040_company_advanced"
branch_labels = None
depends_on = None

TABLES = [CompanyChat, CompanyChatMember, CompanyChatMessage, CompanyChatReaction, CompanyChatTask]


def upgrade():
    bind = op.get_bind()
    for model in TABLES:
        model.__table__.create(bind=bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    for model in reversed(TABLES):
        model.__table__.drop(bind=bind, checkfirst=True)
