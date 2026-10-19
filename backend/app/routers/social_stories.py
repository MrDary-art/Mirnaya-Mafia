"""Month-long stories and explicit own highlights, separate from negotiation stories."""
import json
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import Company
from app.config import settings
from app.db import get_db
from app.deployment_security import rate_limit
from app.models import DirectMessage, User
from app.routers.social import notify, require_contact_allowed
from app.social_access import AccessContext
from app.social_media_storage import acquire_media_write_lock
from app.social_models import SocialHighlight, SocialHighlightItem, SocialMedia, SocialPreference, SocialStory, SocialStoryView
from app.social_service import cursor_decode, cursor_encode, dumps, iso, media_payload, now, public_author, public_company
from app.social_stories_service import can_manage_story, can_moderate_stories, visible_story

router = APIRouter(prefix="/social", tags=["social-stories"])
admin_router = APIRouter(prefix="/admin/social", tags=["social-stories-moderation"])
Audience = Literal["PUBLIC", "FRIENDS", "FOLLOWERS", "ONLY_ME", "COMPANY_INTERNAL"]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StoryInput(StrictInput):
    text: str = Field(default="", max_length=1000)
    background: Literal["forest", "mint", "gold", "night", "rose"] = "forest"
    media_id: int | None = Field(default=None, gt=0)
    audience: Audience = "FRIENDS"
    as_company_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def has_content(self):
        if not self.text and self.media_id is None:
            raise ValueError("Добавьте текст или медиа")
        return self


class ReplyInput(StrictInput):
    text: str = Field(min_length=1, max_length=1000)


class HighlightInput(StrictInput):
    title: str = Field(min_length=1, max_length=100)
    story_ids: list[int] = Field(min_length=1, max_length=30)
    cover_media_id: int | None = Field(default=None, gt=0)
    position: int = Field(default=0, ge=0, le=1000)


class HighlightPatch(StrictInput):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    story_ids: list[int] | None = Field(default=None, min_length=1, max_length=30)
    cover_media_id: int | None = Field(default=None, gt=0)
    position: int | None = Field(default=None, ge=0, le=1000)


async def story_payloads(db, rows, context, *, highlighted=False):
    if not rows:
        return []
    moderator = await can_moderate_stories(db, context.user)
    ids = [row.id for row in rows]
    authors = {row.id: row for row in (await db.scalars(select(User).where(User.id.in_({story.owner_user_id for story in rows})))).all()}
    companies = {row.id: row for row in (await db.scalars(select(Company).where(Company.id.in_({story.as_company_id for story in rows if story.as_company_id})))).all()}
    media = {row.id: row for row in (await db.scalars(select(SocialMedia).where(
        SocialMedia.id.in_({story.media_id for story in rows if story.media_id}), SocialMedia.deleted_at.is_(None)))).all()}
    seen = set((await db.scalars(select(SocialStoryView.story_id).where(
        SocialStoryView.story_id.in_(ids), SocialStoryView.viewer_id == context.user.id))).all())
    owned = [row.id for row in rows if row.owner_user_id == context.user.id]
    counts = dict((await db.execute(select(SocialStoryView.story_id, func.count()).where(
        SocialStoryView.story_id.in_(owned)).group_by(SocialStoryView.story_id))).all()) if owned else {}
    result = []
    for row in rows:
        author = authors[row.owner_user_id]
        value = {"id": row.id, "text": row.text, "background": row.background,
                 "author": public_author(author, context),
                 "company": public_company(companies[row.as_company_id]) if row.as_company_id in companies else None,
                 "media": media_payload(media[row.media_id]) if row.media_id in media else None,
                 "created_at": iso(row.created_at), "expires_at": iso(row.expires_at), "is_highlight": highlighted,
                 "viewed": row.id in seen or row.owner_user_id == context.user.id,
                 "audience": row.audience if can_manage_story(context, row) else None,
                 "can_delete": can_manage_story(context, row) or moderator,
                 "can_reply": row.owner_user_id != context.user.id and row.owner_user_id not in context.blocked
                     and author.messages_visibility != "none"
                     and (row.owner_user_id in context.friends or author.messages_visibility == "all")}
        if row.owner_user_id == context.user.id:
            value["views_count"] = counts.get(row.id, 0)
        result.append(value)
    return result


@router.get("/stories")
async def list_stories(scope: Literal["all", "following", "friends"] = "all",
                       user_id: int | None = Query(default=None, gt=0),
                       cursor: str | None = Query(default=None, max_length=400), limit: int = Query(default=20, ge=1, le=40),
                       db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await AccessContext.load(db, user)
    moment, row_id, anchor = cursor_decode(cursor)
    query = select(SocialStory).where(SocialStory.status == "PUBLISHED", SocialStory.deleted_at.is_(None),
        SocialStory.expires_at > now(), SocialStory.created_at <= anchor,
        context.audience_clause(SocialStory, author_field="owner_user_id"), SocialStory.owner_user_id.not_in(context.muted))
    if user_id is not None:
        query = query.where(SocialStory.owner_user_id == user_id)
    if scope == "friends":
        query = query.where(SocialStory.owner_user_id.in_(context.friends | {user.id}), SocialStory.as_company_id.is_(None))
    elif scope == "following":
        query = query.where(or_(and_(SocialStory.as_company_id.is_(None), SocialStory.owner_user_id.in_(context.following | {user.id})),
                               SocialStory.as_company_id.in_(context.followed_companies)))
    if moment:
        query = query.where(or_(SocialStory.created_at < moment, and_(SocialStory.created_at == moment, SocialStory.id < row_id)))
    rows = list((await db.scalars(query.order_by(SocialStory.created_at.desc(), SocialStory.id.desc()).limit(limit + 1))).all())
    page = rows[:limit]
    return {"items": await story_payloads(db, page, context),
            "next_cursor": cursor_encode(page[-1].created_at, page[-1].id, anchor) if len(rows) > limit else None}


@router.post("/stories")
async def create_story(body: StoryInput, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rate_limit("social-story-create", user.id, 20, 3600)
    await acquire_media_write_lock(db)
    context = await AccessContext.load(db, user)
    context.require_publisher(body.as_company_id, body.audience)
    if body.media_id:
        media = await db.get(SocialMedia, body.media_id)
        if not media or media.owner_user_id != user.id or media.deleted_at:
            raise HTTPException(404, "Медиа недоступно")
        if media.post_id is not None or media.story_id is not None:
            raise HTTPException(409, "Это медиа уже используется. Загрузите отдельную копию")
        if media.kind == "VIDEO" and (not media.duration_seconds or media.duration_seconds > settings.social_media_story_video_seconds):
            raise HTTPException(422, f"Видео истории должно быть не длиннее {settings.social_media_story_video_seconds} секунд")
    moment = now()
    row = SocialStory(owner_user_id=user.id, **body.model_dump(), status="PUBLISHED", created_at=moment,
                      expires_at=moment + timedelta(days=30))
    db.add(row)
    await db.flush()
    if body.media_id:
        changed = await db.execute(update(SocialMedia).where(SocialMedia.id == body.media_id,
            SocialMedia.owner_user_id == user.id, SocialMedia.post_id.is_(None), SocialMedia.story_id.is_(None),
            SocialMedia.deleted_at.is_(None)).values(story_id=row.id))
        if changed.rowcount != 1:
            raise HTTPException(409, "Медиа уже используется")
    await db.commit()
    await db.refresh(row)
    return (await story_payloads(db, [row], context))[0]


@router.get("/stories/{story_id}")
async def read_story(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await AccessContext.load(db, user)
    row = await visible_story(db, user, story_id, context=context)
    return (await story_payloads(db, [row], context))[0]


@router.delete("/stories/{story_id}")
async def remove_story(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await acquire_media_write_lock(db)
    context = await AccessContext.load(db, user)
    row = await db.get(SocialStory, story_id)
    if not row or (not can_manage_story(context, row) and not await can_moderate_stories(db, user)):
        raise HTTPException(404, "История недоступна")
    if row.deleted_at or row.status == "DELETED":
        return {"ok": True}
    if not can_manage_story(context, row):
        from app.routers.operations import audit
        await audit(db, user, "delete_social_story", str(row.id), "Удаление истории модератором")
    row.status, row.deleted_at = "DELETED", now()
    await db.execute(delete(SocialHighlightItem).where(SocialHighlightItem.story_id == row.id))
    if row.media_id:
        await db.execute(update(SocialHighlight).where(SocialHighlight.cover_media_id == row.media_id).values(cover_media_id=None))
    await db.commit()
    return {"ok": True}


@admin_router.delete("/stories/{story_id}")
async def admin_remove_story(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not await can_moderate_stories(db, user):
        raise HTTPException(403, "Нужны права модератора")
    return await remove_story(story_id, db, user)


@admin_router.get("/stories")
async def moderation_stories(before_id: int | None = Query(default=None, gt=0),
                             db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not await can_moderate_stories(db, user):
        raise HTTPException(403, "Нужны права модератора")
    query = select(SocialStory, User).join(User, User.id == SocialStory.owner_user_id).where(
        SocialStory.status == "PUBLISHED", SocialStory.deleted_at.is_(None), SocialStory.expires_at > now())
    if before_id:
        query = query.where(SocialStory.id < before_id)
    rows = (await db.execute(query.order_by(SocialStory.id.desc()).limit(41))).all()
    # Moderation inventory does not bypass private story/media access.
    return {"items": [{"id": row.id, "author": author.display_name or author.username,
                       "created_at": iso(row.created_at), "expires_at": iso(row.expires_at),
                       "audience": row.audience, "has_media": bool(row.media_id)} for row, author in rows[:40]],
            "next_cursor": rows[39][0].id if len(rows) > 40 else None}


@router.post("/stories/{story_id}/view")
async def view_story(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await visible_story(db, user, story_id, allow_highlight=True)
    if row.owner_user_id != user.id:
        rate_limit("social-story-view", user.id, 180, 60)
        await db.execute(insert(SocialStoryView).values(story_id=row.id, viewer_id=user.id).on_conflict_do_nothing())
        await db.commit()
    return {"viewed": True}


@router.get("/stories/{story_id}/viewers")
async def story_viewers(story_id: int, cursor: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50),
                        db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await AccessContext.load(db, user)
    row = await db.get(SocialStory, story_id)
    if (not row or row.owner_user_id != user.id or row.status != "PUBLISHED" or
            not await context.can_view_actor(db, row.owner_user_id, row.as_company_id, row.audience)):
        raise HTTPException(404, "Статистика недоступна")
    rows = (await db.execute(select(SocialStoryView, User).join(User, User.id == SocialStoryView.viewer_id).where(
        SocialStoryView.story_id == story_id, SocialStoryView.viewer_id > cursor,
        SocialStoryView.viewer_id.not_in(context.blocked)).order_by(SocialStoryView.viewer_id).limit(limit + 1))).all()
    total = await db.scalar(select(func.count()).select_from(SocialStoryView).where(SocialStoryView.story_id == story_id))
    return {"count": total, "items": [{"user": public_author(viewer, context), "viewed_at": iso(view.first_viewed_at)}
                                     for view, viewer in rows[:limit]],
            "next_cursor": rows[limit - 1][0].viewer_id if len(rows) > limit else None}


@router.post("/stories/{story_id}/reply")
async def reply_story(story_id: int, body: ReplyInput, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rate_limit("social-story-reply", user.id, 15, 60)
    row = await visible_story(db, user, story_id, allow_highlight=True)
    recipient = await db.get(User, row.owner_user_id)
    await require_contact_allowed(db, user, recipient)
    # Existing TEXT semantics preserve dialogs/unread counts. No private story snapshot is copied.
    message = DirectMessage(sender_id=user.id, receiver_id=recipient.id, type="TEXT",
                            text=f"Ответ на историю #{row.id}: {body.text}", payload=dumps({"story_id": row.id}))
    db.add(message)
    await db.flush()
    preferences = await db.get(SocialPreference, recipient.id)
    if not preferences or json.loads(preferences.settings).get("stories") is not False:
        await notify(db, recipient.id, "MESSAGE_RECEIVED", {"kind": "STORY_REPLY", "actor_id": user.id, "user_id": user.id,
                     "story_id": row.id, "message_id": message.id, "path": f"/people?chat={user.id}"})
    await db.commit()
    return {"ok": True, "message_id": message.id, "path": f"/people?chat={recipient.id}"}


async def _owned_highlight_stories(db, context, story_ids, cover_media_id):
    if len(set(story_ids)) != len(story_ids) or any(type(value) is not int or value <= 0 for value in story_ids):
        raise HTTPException(422, "Укажите разные идентификаторы своих историй")
    rows = list((await db.scalars(select(SocialStory).where(SocialStory.id.in_(story_ids),
        SocialStory.owner_user_id == context.user.id, SocialStory.status == "PUBLISHED", SocialStory.deleted_at.is_(None)))).all())
    if len(rows) != len(story_ids):
        raise HTTPException(404, "В актуальное можно добавить только собственные доступные истории")
    for story in rows:
        context.require_publisher(story.as_company_id, story.audience)
        if story.media_id:
            media = await db.get(SocialMedia, story.media_id)
            if not media or media.deleted_at:
                raise HTTPException(410, "Медиа старой истории уже удалено")
    if cover_media_id is not None and cover_media_id not in {row.media_id for row in rows if row.media_id}:
        raise HTTPException(422, "Обложка должна принадлежать одной из выбранных историй")
    return rows


async def _highlight_payloads(db, highlights, context):
    if not highlights:
        return []
    rows = (await db.execute(select(SocialHighlightItem, SocialStory).join(SocialStory,
        SocialHighlightItem.story_id == SocialStory.id).where(SocialHighlightItem.highlight_id.in_([row.id for row in highlights]),
        SocialStory.status == "PUBLISHED", SocialStory.deleted_at.is_(None),
        context.audience_clause(SocialStory, author_field="owner_user_id"))
        .order_by(SocialHighlightItem.position, SocialStory.id))).all()
    unique_stories = {story.id: story for _, story in rows}
    payloads = {row["id"]: row for row in await story_payloads(db, list(unique_stories.values()), context, highlighted=True)}
    grouped = {}
    for item, story in rows:
        grouped.setdefault(item.highlight_id, []).append(payloads[story.id])
    result = []
    for highlight in highlights:
        items = grouped.get(highlight.id, [])
        if not items and highlight.owner_user_id != context.user.id:
            continue
        cover = next((item["media"] for item in items if item["media"] and item["media"]["id"] == highlight.cover_media_id), None)
        result.append({"id": highlight.id, "owner_user_id": highlight.owner_user_id, "title": highlight.title,
                       "position": highlight.position, "cover": cover, "can_edit": highlight.owner_user_id == context.user.id,
                       "story_ids": [item["id"] for item in items], "items": items})
    return result


async def _highlight_payload(db, highlight, context):
    values = await _highlight_payloads(db, [highlight], context)
    return values[0] if values else None


@router.get("/users/{user_id}/highlights")
async def list_highlights(user_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await AccessContext.load(db, user)
    if not await context.can_view_actor(db, user_id, None, "PUBLIC"):
        raise HTTPException(404, "Профиль недоступен")
    rows = (await db.scalars(select(SocialHighlight).where(SocialHighlight.owner_user_id == user_id)
                            .order_by(SocialHighlight.position, SocialHighlight.id).limit(30))).all()
    return {"items": await _highlight_payloads(db, rows, context)}


@router.post("/highlights")
async def create_highlight(body: HighlightInput, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rate_limit("social-highlight-create", user.id, 30, 3600)
    await acquire_media_write_lock(db)
    context = await AccessContext.load(db, user)
    count = await db.scalar(select(func.count()).select_from(SocialHighlight).where(SocialHighlight.owner_user_id == user.id))
    if count >= 30:
        raise HTTPException(409, "В профиле может быть не больше 30 подборок актуального")
    await _owned_highlight_stories(db, context, body.story_ids, body.cover_media_id)
    row = SocialHighlight(owner_user_id=user.id, title=body.title, cover_media_id=body.cover_media_id, position=body.position)
    db.add(row)
    await db.flush()
    db.add_all([SocialHighlightItem(highlight_id=row.id, story_id=story_id, position=index) for index, story_id in enumerate(body.story_ids)])
    await db.commit()
    return await _highlight_payload(db, row, context)


@router.get("/highlights/{highlight_id}")
async def read_highlight(highlight_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await AccessContext.load(db, user)
    row = await db.get(SocialHighlight, highlight_id)
    if not row or not await context.can_view_actor(db, row.owner_user_id, None, "PUBLIC"):
        raise HTTPException(404, "Актуальное недоступно")
    value = await _highlight_payload(db, row, context)
    if value is None:
        raise HTTPException(404, "Актуальное недоступно")
    return value


@router.patch("/highlights/{highlight_id}")
async def edit_highlight(highlight_id: int, body: HighlightPatch, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await acquire_media_write_lock(db)
    row = await db.get(SocialHighlight, highlight_id)
    if not row or row.owner_user_id != user.id:
        raise HTTPException(404, "Актуальное недоступно")
    context = await AccessContext.load(db, user)
    ids = body.story_ids or list((await db.scalars(select(SocialHighlightItem.story_id).where(
        SocialHighlightItem.highlight_id == row.id).order_by(SocialHighlightItem.position))).all())
    cover = body.cover_media_id if "cover_media_id" in body.model_fields_set else row.cover_media_id
    await _owned_highlight_stories(db, context, ids, cover)
    if body.title is not None:
        row.title = body.title
    if body.position is not None:
        row.position = body.position
    row.cover_media_id = cover
    if body.story_ids is not None:
        await db.execute(delete(SocialHighlightItem).where(SocialHighlightItem.highlight_id == row.id))
        db.add_all([SocialHighlightItem(highlight_id=row.id, story_id=story_id, position=index) for index, story_id in enumerate(ids)])
    await db.commit()
    return await _highlight_payload(db, row, context)


@router.delete("/highlights/{highlight_id}")
async def delete_highlight(highlight_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await acquire_media_write_lock(db)
    row = await db.get(SocialHighlight, highlight_id)
    if not row or row.owner_user_id != user.id:
        raise HTTPException(404, "Актуальное недоступно")
    await db.execute(delete(SocialHighlightItem).where(SocialHighlightItem.highlight_id == row.id))
    await db.delete(row)
    await db.commit()
    return {"ok": True}
