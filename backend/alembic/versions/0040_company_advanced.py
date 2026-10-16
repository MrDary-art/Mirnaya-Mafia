"""Privacy, HR, multi-party and enterprise workflow tables."""

from alembic import op

from app.company_advanced_models import (
    CompanyActiveSession,
    CompanyChat,
    CompanyChatMember,
    CompanyChatMessage,
    CompanyChatReaction,
    CompanyChatTask,
    CompanyAnalyticsMethod,
    CompanyArchiveConsent,
    CompanyArchiveGrant,
    CompanyArchiveRecord,
    CompanyCareerStep,
    CompanyCareerTrack,
    CompanyCompetency,
    CompanyIntegrationJob,
    CompanyIntegrationRequest,
    CompanyBillingEvent,
    CompanyBillingInvoice,
    CompanyLeagueConsent,
    CompanyLearningRecommendation,
    CompanyMembershipProfession,
    CompanyModePolicy,
    CompanyMultiPartyParticipant,
    CompanyMultiPartyReport,
    CompanyMultiPartySession,
    CompanyMultiPartyTurn,
    CompanyOnboarding,
    CompanyProfession,
    CompanyProfessionCompetency,
    CompanyProgramProfession,
    CompanyScenarioApproval,
    CompanyScenarioRequest,
    CompanySkillGap,
    CompanySsoIdentity,
    CompanyTwinProfile,
    CompanyTwinSource,
    CompanyTwinTrainingUse,
)

revision = "0040_company_advanced"
down_revision = "0039_social_feed_backfill"
branch_labels = None
depends_on = None

TABLES = [
    CompanyArchiveRecord,
    CompanyArchiveGrant,
    CompanyArchiveConsent,
    CompanyOnboarding,
    CompanyProfession,
    CompanyCompetency,
    CompanyProfessionCompetency,
    CompanyMembershipProfession,
    CompanyProgramProfession,
    CompanyCareerTrack,
    CompanyCareerStep,
    CompanySkillGap,
    CompanyLearningRecommendation,
    CompanyAnalyticsMethod,
    CompanyTwinProfile,
    CompanyTwinSource,
    CompanyTwinTrainingUse,
    CompanyMultiPartySession,
    CompanyMultiPartyParticipant,
    CompanyMultiPartyTurn,
    CompanyMultiPartyReport,
    CompanyModePolicy,
    CompanyScenarioApproval,
    CompanyScenarioRequest,
    CompanyLeagueConsent,
    CompanyIntegrationRequest,
    CompanyIntegrationJob,
    CompanyBillingInvoice,
    CompanyBillingEvent,
    CompanySsoIdentity,
    CompanyActiveSession,
    CompanyChat,
    CompanyChatMember,
    CompanyChatMessage,
    CompanyChatReaction,
    CompanyChatTask,
]


def upgrade():
    bind = op.get_bind()
    for model in TABLES:
        model.__table__.create(bind=bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    for model in reversed(TABLES):
        model.__table__.drop(bind=bind, checkfirst=True)
