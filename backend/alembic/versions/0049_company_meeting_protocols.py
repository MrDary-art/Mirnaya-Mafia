"""Add reviewable corporate meeting protocols."""
from alembic import op

from app.company_meeting_models import (
    CompanyMeeting, CompanyMeetingApproval, CompanyMeetingParticipant,
    CompanyMeetingProtocol, CompanyMeetingProtocolItem, CompanyMeetingTranscriptSegment,
    CompanyMeetingValidationIssue,
)

revision = "0049_company_meeting_protocols"
down_revision = "0048_enterprise_completion"
branch_labels = None
depends_on = None

TABLES = [
    CompanyMeeting, CompanyMeetingParticipant, CompanyMeetingTranscriptSegment,
    CompanyMeetingProtocol, CompanyMeetingProtocolItem, CompanyMeetingApproval,
    CompanyMeetingValidationIssue,
]


def upgrade():
    bind = op.get_bind()
    for model in TABLES:
        model.__table__.create(bind=bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    for model in reversed(TABLES):
        model.__table__.drop(bind=bind, checkfirst=True)
