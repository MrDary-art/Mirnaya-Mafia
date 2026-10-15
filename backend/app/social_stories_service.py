"""Story and highlight access checks shared by story DTOs and private media."""
from fastapi import HTTPException
from sqlalchemy import exists, select

from app.social_access import AccessContext
from app.social_models import SocialHighlightItem, SocialStory
from app.social_service import now


async def visible_story(db, user, story_id, *, context=None, allow_highlight=False):
    context = context or await AccessContext.load(db, user)
    story = await db.scalar(select(SocialStory).where(
        SocialStory.id == story_id, SocialStory.status == "PUBLISHED", SocialStory.deleted_at.is_(None),
        context.audience_clause(SocialStory, author_field="owner_user_id")))
    if story is None:
        raise HTTPException(404, "История недоступна")
    if story.expires_at <= now():
        highlighted = allow_highlight and await db.scalar(select(exists().where(SocialHighlightItem.story_id == story.id)))
        if not highlighted:
            raise HTTPException(404, "Время показа истории истекло")
    return story


def can_manage_story(context, story):
    return story.as_company_id in context.managed_companies if story.as_company_id else story.owner_user_id == context.user.id
