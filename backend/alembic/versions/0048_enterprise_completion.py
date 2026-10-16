"""Complete additive enterprise workflows without replacing existing tables."""
import sqlalchemy as sa
from alembic import op

from app.company_completion_models import (
    CompanyCorporateIdentity,
    CompanyOwnershipTransfer,
    CompanyProductRequest,
    CompanyProfessionScenario,
    CompanyProfessionalProfile,
    CompanyScenarioSnapshot,
    CompanySpecialty,
)

revision = "0048_enterprise_completion"
down_revision = "0047_merge_optional_mail_and_council"
branch_labels = None
depends_on = None

TABLES = [
    CompanyCorporateIdentity,
    CompanyOwnershipTransfer,
    CompanySpecialty,
    CompanyProfessionalProfile,
    CompanyProfessionScenario,
    CompanyScenarioSnapshot,
    CompanyProductRequest,
]


def upgrade():
    bind = op.get_bind()
    for model in TABLES:
        model.__table__.create(bind=bind, checkfirst=True)
    existing = {column["name"] for column in sa.inspect(bind).get_columns("company_mode_policies")}
    additions = (
        sa.Column("ai_daily_limit", sa.Integer(), nullable=True),
        sa.Column("voice_allowed", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("video_allowed", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("experimental_allowed", sa.Integer(), nullable=False, server_default="0"),
    )
    for column in additions:
        if column.name not in existing:
            op.add_column("company_mode_policies", column)


def downgrade():
    bind = op.get_bind()
    existing = {column["name"] for column in sa.inspect(bind).get_columns("company_mode_policies")}
    with op.batch_alter_table("company_mode_policies") as batch:
        for name in ("experimental_allowed", "video_allowed", "voice_allowed", "ai_daily_limit"):
            if name in existing:
                batch.drop_column(name)
    for model in reversed(TABLES):
        model.__table__.drop(bind=bind, checkfirst=True)
