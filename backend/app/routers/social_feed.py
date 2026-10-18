"""Social feed HTTP boundary; legacy friends, dialogs and rooms retain their routes."""
import json
import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.dialects.sqlite import insert
from app.auth import get_admin, get_current_user
from app.routers.operations import staff
from app.db import get_db
from app.deployment_security import rate_limit
from app.models import Achievement, DirectMessage, Notification, Session, User
from app.company_models import Company, CompanyCertificate, CompanyMembership
from app.social_access import AccessContext, get_post
from app.social_models import (SocialBookmark, SocialCollection, SocialCollectionFollow, SocialCollectionItem,
    SocialComment, SocialCommentLike, SocialCompanyFollow, SocialMedia, SocialMute, SocialPollOption,
    SocialPollVote, SocialPost, SocialPostLike, SocialPreference, SocialReport, SocialStory, SocialUserFollow)
from app.social_service import (cursor_decode, cursor_encode, dumps, hydrate_post_previews, iso, now, notify,
    linked_cards, public_author, public_company, ranked_page, scenario_card, serialize_comments, serialize_posts, validate_link)

router = APIRouter(prefix="/social", tags=["social-feed"])
admin_router = APIRouter(prefix="/admin/social", tags=["social-moderation"])
Audience = Literal["PUBLIC", "FRIENDS", "FOLLOWERS", "ONLY_ME", "COMPANY_INTERNAL"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LinkedIn(Strict):
    kind: Literal["SCENARIO", "ACHIEVEMENT", "RESULT", "LESSON", "CERTIFICATE"]
    id: str = Field(min_length=1, max_length=100)


class PollIn(Strict):
    options: list[str] = Field(min_length=2, max_length=6)

    @model_validator(mode="after")
    def validate_options(self):
        self.options = [value.strip() for value in self.options]
        if any(not value or len(value) > 200 for value in self.options) or len(set(self.options)) != len(self.options):
            raise ValueError("Опрос: от 2 до 6 разных непустых ответов длиной до 200 символов")
        return self


class PostIn(Strict):
    body: str = Field(default="", max_length=10000)
    audience: Audience = "PUBLIC"
    status: Literal["DRAFT", "PUBLISHED"] = "PUBLISHED"
    as_company_id: int | None = Field(default=None, gt=0)
    comments_enabled: bool = True
    media_ids: list[int] = Field(default_factory=list, max_length=10)
    linked_content: LinkedIn | None = None
    poll: PollIn | None = None


class PostPatch(Strict):
    body: str | None = Field(default=None, max_length=10000)
    audience: Audience | None = None
    status: Literal["DRAFT", "PUBLISHED"] | None = None
    comments_enabled: bool | None = None
    media_ids: list[int] | None = Field(default=None, max_length=10)
    linked_content: LinkedIn | None = None
    pinned: bool | None = None


class CommentIn(Strict):
    text: str = Field(min_length=1, max_length=2000)
    parent_id: int | None = Field(default=None, gt=0)


class CommentPatch(Strict):
    text: str = Field(min_length=1, max_length=2000)


class RepostIn(Strict):
    body: str = Field(default="", max_length=10000)
    audience: Literal["PUBLIC", "FRIENDS", "FOLLOWERS", "ONLY_ME"] = "PUBLIC"


class ShareIn(Strict):
    recipient_id: int = Field(gt=0)
    text: str = Field(default="", max_length=2000)


class VoteIn(Strict):
    option_id: int = Field(gt=0)


class CollectionIn(Strict):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    audience: Literal["PRIVATE", "PUBLIC"] = "PRIVATE"


class ItemIn(Strict):
    post_id: int | None = Field(default=None, gt=0)
    scenario_id: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def one_target(self):
        if (self.post_id is None) == (self.scenario_id is None): raise ValueError("Выберите пост или сценарий")
        return self


class ReorderIn(Strict):
    item_ids: list[int] = Field(max_length=200)


class ReportIn(Strict):
    target_type: Literal["POST", "COMMENT", "STORY"]
    target_id: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=1000)


class ModerationIn(Strict):
    action: Literal["hide", "restore", "dismiss"]


class PreferencesIn(Strict):
    likes: bool = True
    comments: bool = True
    follows: bool = True
    reposts: bool = True
    mentions: bool = True
    stories: bool = True


@router.get("/preferences")
async def preferences(db=Depends(get_db), user=Depends(get_current_user)):
    row = await db.get(SocialPreference, user.id)
    return PreferencesIn.model_validate(json.loads(row.settings) if row else {}).model_dump()


@router.put("/preferences")
async def update_preferences(body: PreferencesIn, db=Depends(get_db), user=Depends(get_current_user)):
    await db.execute(insert(SocialPreference).values(user_id=user.id, settings=dumps(body.model_dump()))
        .on_conflict_do_update(index_elements=["user_id"], set_={"settings": dumps(body.model_dump())}))
    await db.commit()
    return body.model_dump()


async def dto(db, user, row, context=None):
    return (await serialize_posts(db, user, [row], context=context))[0]


async def bind_media(db, user, post_id, ids):
    from app.social_media_storage import acquire_media_write_lock
    await acquire_media_write_lock(db)
    if len(set(ids)) != len(ids): raise HTTPException(422, "Повторяющееся вложение")
    reusable = or_(SocialMedia.owner_user_id == user.id, SocialMedia.post_id == post_id)
    rows = (await db.scalars(select(SocialMedia).where(SocialMedia.id.in_(ids), reusable,
        SocialMedia.deleted_at.is_(None), SocialMedia.story_id.is_(None),
        or_(SocialMedia.post_id.is_(None), SocialMedia.post_id == post_id)))).all()
    if len(rows) != len(ids): raise HTTPException(422, "Вложение отсутствует, занято или принадлежит другому пользователю")
    await db.execute(update(SocialMedia).where(SocialMedia.post_id == post_id, SocialMedia.id.not_in(ids)).values(post_id=None))
    for position, media_id in enumerate(ids):
        result = await db.execute(update(SocialMedia).where(SocialMedia.id == media_id, reusable,
            SocialMedia.deleted_at.is_(None), SocialMedia.story_id.is_(None),
            or_(SocialMedia.post_id.is_(None), SocialMedia.post_id == post_id)).values(post_id=post_id, position=position))
        if result.rowcount != 1: raise HTTPException(409, "Вложение уже используется")


async def mention_notifications(db, user, post):
    names = set(re.findall(r"(?<!\w)@([\w.-]{2,40})", post.body))
    if not names: return
    context = await AccessContext.load(db, user)
    people = (await db.scalars(select(User).where(User.username.in_(names), User.id.not_in(context.blocked),
        or_(User.search_visibility == "all", User.id.in_(context.friends))))).all()
    for person in people:
        recipient_context = await AccessContext.load(db, person)
        if await db.scalar(select(SocialPost.id).where(SocialPost.id == post.id, recipient_context.post_clause())):
            await notify(db, person.id, user, "SOCIAL_MENTION", post_id=post.id)


@router.get("/publishers")
async def publishers(db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    rows = (await db.scalars(select(Company).where(Company.id.in_(ctx.managed_companies)))).all()
    return {"items": [public_company(row) for row in rows]}


@router.get("/attachments")
async def attachment_catalog(kind: Literal["SCENARIO", "ACHIEVEMENT", "RESULT", "LESSON", "CERTIFICATE"] | None = None,
    db=Depends(get_db), user=Depends(get_current_user)):
    from app.engine.learning import PROGRAMS
    from app.engine.scenario import SCENARIOS
    choices = []
    if kind in {None, "SCENARIO"}: choices.extend(("SCENARIO", str(key)) for key in list(SCENARIOS)[:100])
    if kind in {None, "LESSON"}: choices.extend(("LESSON", str(key)) for key in list(PROGRAMS)[:100])
    if kind in {None, "ACHIEVEMENT"}:
        rows = (await db.scalars(select(Achievement).where(Achievement.user_id == user.id).order_by(Achievement.id.desc()).limit(100))).all()
        choices.extend(("ACHIEVEMENT", str(row.id)) for row in rows)
    if kind in {None, "RESULT"}:
        rows = (await db.scalars(select(Session).where(Session.user_id == user.id, Session.mode == "scenario", Session.status == "finished").order_by(Session.id.desc()).limit(100))).all()
        choices.extend(("RESULT", str(row.id)) for row in rows)
    if kind in {None, "CERTIFICATE"}:
        rows = (await db.scalars(select(CompanyCertificate).join(CompanyMembership,
            CompanyMembership.id == CompanyCertificate.membership_id).where(CompanyMembership.user_id == user.id).limit(100))).all()
        choices.extend(("CERTIFICATE", str(row.id)) for row in rows)
    probes = [SocialPost(id=-index-1, author_user_id=user.id, linked_kind=choice_kind, linked_id=key)
              for index, (choice_kind, key) in enumerate(choices)]
    cards = await linked_cards(db, probes)
    return {"items": [card for card in cards.values() if card.get("available")][:300]}


@router.post("/posts")
async def create_post(body: PostIn, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-post", user.id, 20, 3600)
    ctx = await AccessContext.load(db, user)
    ctx.require_publisher(body.as_company_id, body.audience)
    if not body.body and not body.media_ids and not body.linked_content and not body.poll:
        raise HTTPException(422, "Добавьте текст, вложение или опрос")
    if body.linked_content: await validate_link(db, user, body.linked_content.kind, body.linked_content.id)
    row = SocialPost(author_user_id=user.id, as_company_id=body.as_company_id, body=body.body, search_text=body.body.casefold(),
        audience=body.audience, status=body.status, comments_enabled=body.comments_enabled,
        kind="POLL" if body.poll else body.linked_content.kind if body.linked_content else "MEDIA" if body.media_ids else "TEXT",
        linked_kind=body.linked_content.kind if body.linked_content else None,
        linked_id=body.linked_content.id if body.linked_content else None,
        published_at=now() if body.status == "PUBLISHED" else None)
    db.add(row)
    await db.flush()
    await bind_media(db, user, row.id, body.media_ids)
    if body.poll:
        db.add_all([SocialPollOption(post_id=row.id, text=text, position=i) for i, text in enumerate(body.poll.options)])
    if row.status == "PUBLISHED": await mention_notifications(db, user, row)
    await db.commit()
    await db.refresh(row)
    return await dto(db, user, row, ctx)


@router.get("/posts/{post_id}")
async def read_post(post_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    return await dto(db, user, await get_post(db, user, post_id))


@router.patch("/posts/{post_id}")
async def edit_post(post_id: int, body: PostPatch, db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    row = await get_post(db, user, post_id, context=ctx)
    if not ctx.can_edit_post(row): raise HTTPException(403, "Редактировать может только автор или управляющий компании")
    changes = body.model_dump(exclude_unset=True)
    if any(value is None for key, value in changes.items() if key != "linked_content"):
        raise HTTPException(422, "Поле не может быть пустым")
    audience = changes.get("audience", row.audience)
    ctx.require_publisher(row.as_company_id, audience)
    if row.repost_of_id and ("media_ids" in changes or "linked_content" in changes):
        raise HTTPException(422, "Вложения репоста принадлежат оригиналу")
    if "media_ids" in changes: await bind_media(db, user, row.id, changes.pop("media_ids"))
    if "linked_content" in changes:
        linked = changes.pop("linked_content")
        unchanged = bool(linked and (linked["kind"], linked["id"]) == (row.linked_kind, row.linked_id))
        if linked and not unchanged:
            if row.author_user_id != user.id and linked["kind"] not in {"SCENARIO", "LESSON"}:
                raise HTTPException(403, "Личные достижения, результаты и сертификаты может прикрепить только автор публикации")
            await validate_link(db, user, linked["kind"], linked["id"])
        row.linked_kind, row.linked_id = (linked["kind"], linked["id"]) if linked else (None, None)
    pinned = changes.pop("pinned", None)
    if pinned is not None:
        if pinned:
            actor_filter = SocialPost.as_company_id == row.as_company_id if row.as_company_id else and_(SocialPost.author_user_id == user.id, SocialPost.as_company_id.is_(None))
            await db.execute(update(SocialPost).where(actor_filter).values(pinned_at=None))
        row.pinned_at = now() if pinned else None
    for key, value in changes.items(): setattr(row, key, value)
    has_media = bool(await db.scalar(select(SocialMedia.id).where(SocialMedia.post_id == row.id, SocialMedia.deleted_at.is_(None)).limit(1)))
    if not row.body and not row.linked_kind and not row.repost_of_id and row.kind != "POLL" and not has_media:
        raise HTTPException(422, "Публикация не может быть пустой")
    if row.kind not in {"REPOST", "POLL"}: row.kind = row.linked_kind or ("MEDIA" if has_media else "TEXT")
    if row.status == "PUBLISHED" and not row.published_at: row.published_at = now()
    row.search_text, row.updated_at = row.body.casefold(), now()
    await db.commit()
    await db.refresh(row)
    return await dto(db, user, row, ctx)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    row = await db.get(SocialPost, post_id)
    if not row or not ctx.can_edit_post(row): raise HTTPException(404, "Публикация недоступна")
    row.status, row.deleted_at, row.pinned_at = "DELETED", now(), None
    await db.commit()
    return {"ok": True}


async def feed_page(db, user, *, scope="for_you", cursor=None, limit=20, user_id=None, company_id=None, kind="posts", q=""):
    ctx = await AccessContext.load(db, user)
    moment, last_id, anchor = (None, None, now()) if scope == "popular" else cursor_decode(cursor)
    clock = func.coalesce(SocialPost.published_at, SocialPost.created_at)
    query = select(SocialPost).where(ctx.post_clause(drafts=user_id == user.id or scope == "company"), clock <= anchor)
    if user_id is not None:
        query = query.where(SocialPost.author_user_id == user_id, SocialPost.as_company_id.is_(None))
        if kind == "reposts": query = query.where(SocialPost.repost_of_id.is_not(None))
        elif kind == "media": query = query.where(SocialPost.id.in_(select(SocialMedia.post_id).where(SocialMedia.deleted_at.is_(None))))
        else: query = query.where(SocialPost.repost_of_id.is_(None))
    elif scope == "following":
        query = query.where(or_(and_(SocialPost.as_company_id.is_(None), SocialPost.author_user_id.in_(ctx.following)), SocialPost.as_company_id.in_(ctx.followed_companies)))
    elif scope == "friends": query = query.where(SocialPost.author_user_id.in_(ctx.friends), SocialPost.as_company_id.is_(None))
    elif scope == "companies": query = query.where(SocialPost.as_company_id.is_not(None))
    elif scope == "company":
        if company_id is None: raise HTTPException(422, "Выберите компанию")
        query = query.where(SocialPost.as_company_id == company_id)
    elif scope == "saved": query = query.where(SocialPost.id.in_(select(SocialBookmark.post_id).where(SocialBookmark.user_id == user.id)))
    if scope in {"for_you", "popular"} and user_id is None: query = query.where(SocialPost.author_user_id.not_in(ctx.muted))
    if q: query = query.where(SocialPost.search_text.contains(q.casefold(), autoescape=True))
    if scope == "popular":
        likes = select(SocialPostLike.post_id, func.count().label("count")).group_by(SocialPostLike.post_id).subquery()
        comments = select(SocialComment.post_id, func.count(func.distinct(SocialComment.author_user_id)).label("count")).where(SocialComment.status == "ACTIVE",
            SocialComment.author_user_id.not_in(ctx.blocked)).group_by(SocialComment.post_id).subquery()
        query = query.outerjoin(likes, likes.c.post_id == SocialPost.id).outerjoin(comments, comments.c.post_id == SocialPost.id)
        score = func.coalesce(likes.c.count, 0) + 2 * func.coalesce(comments.c.count, 0)
        purpose = dumps(["popular-posts", user_id, company_id, kind, q])
        page, next_cursor = await ranked_page(db, user, query, SocialPost, score, cursor=cursor,
            purpose=purpose, limit=limit, tie_breaker=clock)
        return {"items": await serialize_posts(db, user, page, context=ctx), "next_cursor": next_cursor}
    if moment: query = query.where(or_(clock < moment, and_(clock == moment, SocialPost.id < last_id)))
    rows = list((await db.scalars(query.order_by(clock.desc(), SocialPost.id.desc()).limit(limit + 1))).all())
    page = rows[:limit]
    next_cursor = cursor_encode(page[-1].published_at or page[-1].created_at, page[-1].id, anchor) if len(rows) > limit else None
    return {"items": await serialize_posts(db, user, page, context=ctx), "next_cursor": next_cursor}


@router.get("/feed")
async def feed(scope: Literal["for_you", "following", "friends", "companies", "popular", "company", "saved"] = "for_you",
    cursor: str | None = None, limit: int = Query(default=20, ge=1, le=20), user_id: int | None = None,
    company_id: int | None = None, q: str = Query(default="", max_length=100), db=Depends(get_db), user=Depends(get_current_user)):
    query_text = q.strip()
    result = await feed_page(db, user, scope=scope, cursor=cursor, limit=limit, user_id=user_id, company_id=company_id, q=query_text)
    if scope == "company" and user_id is None and not cursor:
        ctx = await AccessContext.load(db, user)
        pinned_query = select(SocialPost).where(SocialPost.as_company_id == company_id,
            SocialPost.pinned_at.is_not(None), ctx.post_clause())
        if query_text:
            pinned_query = pinned_query.where(SocialPost.search_text.contains(query_text.casefold(), autoescape=True))
        pinned = await db.scalar(pinned_query.limit(1))
        result["pinned_post"] = await dto(db, user, pinned, ctx) if pinned else None
    return result


@router.get("/users/{user_id}/posts")
async def wall(user_id: int, kind: Literal["posts", "reposts", "media"] = "posts", cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=20), q: str = Query(default="", max_length=100),
    db=Depends(get_db), user=Depends(get_current_user)):
    query_text = q.strip()
    result = await feed_page(db, user, user_id=user_id, kind=kind, cursor=cursor, limit=limit, q=query_text)
    if not cursor and kind == "posts":
        ctx = await AccessContext.load(db, user)
        pinned_query = select(SocialPost).where(SocialPost.author_user_id == user_id,
            SocialPost.as_company_id.is_(None), SocialPost.pinned_at.is_not(None), ctx.post_clause())
        if query_text:
            pinned_query = pinned_query.where(SocialPost.search_text.contains(query_text.casefold(), autoescape=True))
        pinned = await db.scalar(pinned_query.limit(1))
        result["pinned_post"] = await dto(db, user, pinned, ctx) if pinned else None
    return result


@router.get("/bookmarks")
async def bookmarks(cursor: str | None = None, limit: int = Query(default=20, ge=1, le=20), db=Depends(get_db), user=Depends(get_current_user)):
    return await feed_page(db, user, scope="saved", cursor=cursor, limit=limit)


async def toggle(db, model, keys, active):
    if active: result = await db.execute(insert(model).values(**keys).on_conflict_do_nothing())
    else: result = await db.execute(delete(model).where(*(getattr(model, key) == value for key, value in keys.items())))
    return result.rowcount > 0


@router.post("/posts/{post_id}/like")
async def like(post_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-reaction", user.id, 120, 60)
    row = await get_post(db, user, post_id, drafts=False)
    if await toggle(db, SocialPostLike, {"post_id": post_id, "user_id": user.id}, True):
        await notify(db, row.author_user_id, user, "SOCIAL_LIKE", post_id=post_id)
    await db.commit()
    return await dto(db, user, row)


@router.delete("/posts/{post_id}/like")
async def unlike(post_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_post(db, user, post_id, drafts=False)
    await toggle(db, SocialPostLike, {"post_id": post_id, "user_id": user.id}, False)
    await db.commit()
    return await dto(db, user, row)


@router.post("/posts/{post_id}/bookmark")
async def bookmark(post_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_post(db, user, post_id, drafts=False)
    await toggle(db, SocialBookmark, {"post_id": post_id, "user_id": user.id}, True)
    await db.commit()
    return await dto(db, user, row)


@router.delete("/posts/{post_id}/bookmark")
async def unbookmark(post_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await toggle(db, SocialBookmark, {"post_id": post_id, "user_id": user.id}, False)
    await db.commit()
    return {"ok": True, "bookmarked": False}


@router.get("/posts/{post_id}/likes")
async def likers(post_id: int, cursor: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50), db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    await get_post(db, user, post_id, context=ctx, drafts=False)
    rows = list((await db.scalars(select(User).join(SocialPostLike, SocialPostLike.user_id == User.id).where(
        SocialPostLike.post_id == post_id, User.id > cursor, ctx.profile_clause(User.id),
        or_(User.search_visibility == "all", User.id.in_(ctx.friends), User.id == user.id)).order_by(User.id).limit(limit + 1))).all())
    return {"items": [public_author(row, ctx) for row in rows[:limit]], "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.get("/posts/{post_id}/comments")
async def comments(post_id: int, cursor: str | None = None, limit: int = Query(default=30, ge=1, le=50),
    sort: Literal["new", "popular"] = "new", db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    await get_post(db, user, post_id, context=ctx, drafts=False)
    query = select(SocialComment).where(SocialComment.post_id == post_id, SocialComment.status != "HIDDEN", SocialComment.author_user_id.not_in(ctx.blocked))
    if sort == "popular":
        likes = select(SocialCommentLike.comment_id, func.count().label("count")).group_by(SocialCommentLike.comment_id).subquery()
        query = query.outerjoin(likes, likes.c.comment_id == SocialComment.id)
        rows, next_cursor = await ranked_page(db, user, query, SocialComment, func.coalesce(likes.c.count, 0),
            cursor=cursor, purpose=f"popular-comments:{post_id}", limit=limit)
        return {"items": await serialize_comments(db, user, rows, context=ctx), "next_cursor": next_cursor}
    if cursor:
        if not cursor.isdigit(): raise HTTPException(422, "Некорректный курсор комментариев")
        query = query.where(SocialComment.id < int(cursor))
    rows = list((await db.scalars(query.order_by(SocialComment.id.desc()).limit(limit + 1))).all())
    items = await serialize_comments(db, user, rows[:limit], context=ctx)
    return {"items": items, "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.post("/posts/{post_id}/comments")
async def add_comment(post_id: int, body: CommentIn, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-comment", user.id, 20, 60)
    post = await get_post(db, user, post_id, drafts=False)
    if not post.comments_enabled: raise HTTPException(403, "Автор отключил комментарии")
    parent = None
    if body.parent_id:
        parent = await db.get(SocialComment, body.parent_id)
        ctx = await AccessContext.load(db, user)
        if not parent or parent.post_id != post.id or parent.status == "HIDDEN" or parent.author_user_id in ctx.blocked:
            raise HTTPException(422, "Комментарий для ответа недоступен")
        if parent.parent_id: raise HTTPException(422, "Ответьте на начало ветки: доступно два уровня комментариев")
    row = SocialComment(post_id=post.id, parent_id=body.parent_id, author_user_id=user.id, text=body.text)
    db.add(row)
    await notify(db, post.author_user_id, user, "SOCIAL_COMMENT", post_id=post.id)
    if parent: await notify(db, parent.author_user_id, user, "SOCIAL_COMMENT_REPLY", post_id=post.id)
    await db.commit()
    await db.refresh(row)
    return (await serialize_comments(db, user, [row]))[0]


async def get_comment(db, user, comment_id):
    row = await db.get(SocialComment, comment_id)
    ctx = await AccessContext.load(db, user)
    if not row or row.status != "ACTIVE" or row.author_user_id in ctx.blocked: raise HTTPException(404, "Комментарий недоступен")
    await get_post(db, user, row.post_id, context=ctx, drafts=False)
    return row


@router.patch("/comments/{comment_id}")
async def edit_comment(comment_id: int, body: CommentPatch, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_comment(db, user, comment_id)
    if row.author_user_id != user.id: raise HTTPException(403, "Редактировать можно только свой комментарий")
    row.text, row.edited_at = body.text, now()
    await db.commit()
    return (await serialize_comments(db, user, [row]))[0]


@router.delete("/comments/{comment_id}")
async def remove_comment(comment_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    row = await db.get(SocialComment, comment_id)
    if not row or row.author_user_id != user.id: raise HTTPException(404, "Комментарий недоступен")
    row.status, row.text, row.deleted_at = "DELETED", "", now()
    await db.commit()
    return {"ok": True}


@router.post("/comments/{comment_id}/like")
async def like_comment(comment_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-reaction", user.id, 120, 60)
    row = await get_comment(db, user, comment_id)
    await toggle(db, SocialCommentLike, {"comment_id": comment_id, "user_id": user.id}, True)
    await db.commit()
    return (await serialize_comments(db, user, [row]))[0]


@router.delete("/comments/{comment_id}/like")
async def unlike_comment(comment_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_comment(db, user, comment_id)
    await toggle(db, SocialCommentLike, {"comment_id": comment_id, "user_id": user.id}, False)
    await db.commit()
    return (await serialize_comments(db, user, [row]))[0]


@router.post("/posts/{post_id}/repost")
async def repost(post_id: int, body: RepostIn, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-repost", user.id, 20, 3600)
    original = await get_post(db, user, post_id, drafts=False)
    source = await dto(db, user, original)
    if not source["viewer_state"]["can_repost"]: raise HTTPException(403, "Репост разрешён только для публичного оригинала")
    result = await db.scalar(insert(SocialPost).values(author_user_id=user.id, body=body.body, search_text=body.body.casefold(),
        audience=body.audience, status="PUBLISHED", kind="REPOST", repost_of_id=post_id, comments_enabled=True, published_at=now())
        .on_conflict_do_nothing().returning(SocialPost.id))
    if result:
        await notify(db, original.author_user_id, user, "SOCIAL_REPOST", post_id=post_id)
    else:
        result = await db.scalar(select(SocialPost.id).where(SocialPost.author_user_id == user.id, SocialPost.repost_of_id == post_id, SocialPost.status != "DELETED"))
    await db.commit()
    return await dto(db, user, await db.get(SocialPost, result))


@router.post("/posts/{post_id}/share-message")
async def share_message(post_id: int, body: ShareIn, db=Depends(get_db), user=Depends(get_current_user)):
    from app.routers.social import require_contact_allowed
    rate_limit("social-share", user.id, 20, 60)
    await get_post(db, user, post_id, drafts=False)
    recipient = await db.get(User, body.recipient_id)
    if not recipient: raise HTTPException(404, "Получатель недоступен")
    await require_contact_allowed(db, user, recipient)
    await get_post(db, recipient, post_id, drafts=False)
    row = DirectMessage(sender_id=user.id, receiver_id=recipient.id, type="POST_SHARE", text=body.text or "Публикация Арены", payload=dumps({"post_id": post_id}))
    db.add(row)
    await db.flush()
    db.add(Notification(user_id=recipient.id, type="MESSAGE_RECEIVED", payload=dumps({"from": user.username, "user_id": user.id})))
    await db.commit()
    return {"ok": True, "message_id": row.id, "path": f"/people?chat={recipient.id}"}


@router.post("/posts/{post_id}/vote")
async def vote(post_id: int, body: VoteIn, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_post(db, user, post_id, drafts=False)
    option = await db.get(SocialPollOption, body.option_id)
    if not option or option.post_id != post_id: raise HTTPException(422, "Ответ не относится к этому опросу")
    rate_limit("social-vote", user.id, 30, 60)
    await db.execute(insert(SocialPollVote).values(post_id=post_id, user_id=user.id, option_id=option.id)
        .on_conflict_do_update(index_elements=["post_id", "user_id"], set_={"option_id": option.id}))
    await db.commit()
    return await dto(db, user, row)


@router.post("/follows/users/{user_id}")
async def follow_user(user_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-follow", user.id, 40, 60)
    ctx = await AccessContext.load(db, user)
    target = await db.get(User, user_id)
    if not target or target.is_admin or user_id == user.id or user_id in ctx.blocked: raise HTTPException(404, "Пользователь недоступен")
    if target.profile_visibility != "public" or target.search_visibility == "none":
        raise HTTPException(403, "Этот профиль не принимает открытые подписки")
    if await toggle(db, SocialUserFollow, {"user_id": user.id, "author_id": user_id}, True):
        await notify(db, user_id, user, "SOCIAL_FOLLOW")
    await db.commit()
    return {"following": True}


@router.delete("/follows/users/{user_id}")
async def unfollow_user(user_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await toggle(db, SocialUserFollow, {"user_id": user.id, "author_id": user_id}, False)
    await db.commit()
    return {"following": False}


@router.post("/follows/companies/{company_id}")
async def follow_company(company_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-follow", user.id, 40, 60)
    company = await db.get(Company, company_id)
    if not company or company.status != "ACTIVE": raise HTTPException(404, "Компания недоступна")
    await toggle(db, SocialCompanyFollow, {"user_id": user.id, "company_id": company_id}, True)
    await db.commit()
    return {"following": True}


@router.delete("/follows/companies/{company_id}")
async def unfollow_company(company_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await toggle(db, SocialCompanyFollow, {"user_id": user.id, "company_id": company_id}, False)
    await db.commit()
    return {"following": False}


async def visible_profile(db, user, user_id, ctx=None):
    ctx = ctx or await AccessContext.load(db, user)
    target = await db.scalar(select(User).where(User.id == user_id, ctx.profile_clause(User.id)))
    if not target or target.is_admin: raise HTTPException(404, "Профиль недоступен")
    return target


@router.get("/users/{user_id}/stats")
async def user_stats(user_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    target = await visible_profile(db, user, user_id, ctx)
    posts = await db.scalar(select(func.count()).select_from(SocialPost).where(SocialPost.author_user_id == user_id, SocialPost.as_company_id.is_(None), ctx.post_clause()))
    followers = await db.scalar(select(func.count()).select_from(SocialUserFollow).where(SocialUserFollow.author_id == user_id, SocialUserFollow.user_id.not_in(ctx.blocked)))
    following = await db.scalar(select(func.count()).select_from(SocialUserFollow).where(SocialUserFollow.user_id == user_id, SocialUserFollow.author_id.not_in(ctx.blocked)))
    target_context = await AccessContext.load(db, target)
    return {"posts": posts or 0, "followers": followers or 0, "following": following or 0,
            "friends": len(target_context.friends - ctx.blocked), "following_author": user_id in ctx.following,
            "is_self": user_id == user.id, "muted": user_id in ctx.muted}


@router.get("/users/{user_id}/followers")
@router.get("/users/{user_id}/following")
async def follow_list(user_id: int, request: Request,
    cursor: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50), db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    await visible_profile(db, user, user_id, ctx)
    following = request.url.path.endswith("/following")
    target_col = SocialUserFollow.author_id if following else SocialUserFollow.user_id
    own_col = SocialUserFollow.user_id if following else SocialUserFollow.author_id
    query = select(User).where(User.id.in_(select(target_col).where(own_col == user_id)), User.id > cursor,
        ctx.profile_clause(User.id), or_(User.search_visibility == "all", User.id.in_(ctx.friends), User.id == user.id))
    rows = list((await db.scalars(query.order_by(User.id).limit(limit + 1))).all())
    return {"items": [public_author(row, ctx) for row in rows[:limit]], "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.post("/mutes/users/{user_id}")
async def mute(user_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    if user_id == user.id or not await db.get(User, user_id): raise HTTPException(404, "Пользователь недоступен")
    await toggle(db, SocialMute, {"owner_user_id": user.id, "muted_user_id": user_id}, True)
    await db.commit()
    return {"muted": True}


@router.delete("/mutes/users/{user_id}")
async def unmute(user_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await toggle(db, SocialMute, {"owner_user_id": user.id, "muted_user_id": user_id}, False)
    await db.commit()
    return {"muted": False}


async def get_collection(db, user, collection_id, *, owner=False, context=None):
    ctx = context or await AccessContext.load(db, user)
    row = await db.get(SocialCollection, collection_id)
    if not row or (row.owner_user_id != user.id and (owner or row.audience != "PUBLIC")):
        raise HTTPException(404, "Подборка недоступна")
    await visible_profile(db, user, row.owner_user_id, ctx)
    return row


async def collection_dto(db, user, row, *, content=False, context=None):
    ctx = context or await AccessContext.load(db, user)
    owner = await db.get(User, row.owner_user_id)
    followed = bool(await db.scalar(select(SocialCollectionFollow.collection_id).where(SocialCollectionFollow.collection_id == row.id, SocialCollectionFollow.user_id == user.id)))
    result = {"id": row.id, "title": row.title, "description": row.description, "audience": row.audience,
        "author": public_author(owner, ctx), "created_at": iso(row.created_at), "can_edit": row.owner_user_id == user.id,
        "followed": followed, "path": f"/collections/{row.id}"}
    items = list((await db.scalars(select(SocialCollectionItem).where(SocialCollectionItem.collection_id == row.id).order_by(SocialCollectionItem.position, SocialCollectionItem.id).limit(200))).all())
    posts = list((await db.scalars(select(SocialPost).where(SocialPost.id.in_({item.post_id for item in items if item.post_id}), ctx.post_clause()))).all())
    visible = {post.id for post in posts}
    result["items_count"] = sum(item.post_id in visible or bool(item.scenario_id and scenario_card(item.scenario_id)) for item in items)
    if content:
        post_map = {post["id"]: post for post in await serialize_posts(db, user, posts, context=ctx)}
        result["items"] = [{"id": item.id, "position": item.position,
            "post": post_map.get(item.post_id), "scenario": scenario_card(item.scenario_id) if item.scenario_id else None,
            "available": item.post_id in visible or bool(item.scenario_id and scenario_card(item.scenario_id))}
            for item in items if item.post_id in visible or item.scenario_id or row.owner_user_id == user.id]
    return result


@router.get("/collections")
async def collections(user_id: int | None = None, scope: Literal["mine", "public", "followed"] = "mine",
    cursor: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=30), db=Depends(get_db), user=Depends(get_current_user)):
    ctx = await AccessContext.load(db, user)
    query = select(SocialCollection).where(SocialCollection.id > cursor, ctx.profile_clause(SocialCollection.owner_user_id))
    if user_id is not None:
        await visible_profile(db, user, user_id, ctx)
        query = query.where(SocialCollection.owner_user_id == user_id)
        if user_id != user.id: query = query.where(SocialCollection.audience == "PUBLIC")
    elif scope == "mine": query = query.where(SocialCollection.owner_user_id == user.id)
    elif scope == "public": query = query.where(SocialCollection.audience == "PUBLIC")
    else: query = query.where(SocialCollection.audience == "PUBLIC", SocialCollection.id.in_(select(SocialCollectionFollow.collection_id).where(SocialCollectionFollow.user_id == user.id)))
    rows = list((await db.scalars(query.order_by(SocialCollection.id).limit(limit + 1))).all())
    return {"items": [await collection_dto(db, user, row, context=ctx) for row in rows[:limit]],
            "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.post("/collections")
async def create_collection(body: CollectionIn, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-collection", user.id, 20, 3600)
    row = SocialCollection(owner_user_id=user.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await collection_dto(db, user, row, content=True)


@router.get("/collections/{collection_id}")
async def read_collection(collection_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    return await collection_dto(db, user, await get_collection(db, user, collection_id), content=True)


@router.patch("/collections/{collection_id}")
async def edit_collection(collection_id: int, body: CollectionIn, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_collection(db, user, collection_id, owner=True)
    for key, value in body.model_dump().items(): setattr(row, key, value)
    row.updated_at = now()
    await db.commit()
    return await collection_dto(db, user, row, content=True)


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_collection(db, user, collection_id, owner=True)
    await db.execute(delete(SocialCollectionFollow).where(SocialCollectionFollow.collection_id == row.id))
    await db.execute(delete(SocialCollectionItem).where(SocialCollectionItem.collection_id == row.id))
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.post("/collections/{collection_id}/items")
async def add_collection_item(collection_id: int, body: ItemIn, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_collection(db, user, collection_id, owner=True)
    if body.post_id:
        await get_post(db, user, body.post_id, drafts=False)
        await toggle(db, SocialBookmark, {"user_id": user.id, "post_id": body.post_id}, True)
    elif not scenario_card(body.scenario_id): raise HTTPException(422, "Сценарий не найден")
    # Serialize appends so capacity and positions are checked against current items.
    await db.execute(update(SocialCollection).where(SocialCollection.id == row.id).values(updated_at=now()))
    target_filter = SocialCollectionItem.post_id == body.post_id if body.post_id else SocialCollectionItem.scenario_id == body.scenario_id
    existing = await db.scalar(select(SocialCollectionItem.id).where(SocialCollectionItem.collection_id == row.id, target_filter))
    if existing:
        await db.commit()
        return await collection_dto(db, user, row, content=True)
    count = await db.scalar(select(func.count()).select_from(SocialCollectionItem).where(SocialCollectionItem.collection_id == row.id))
    if count >= 200: raise HTTPException(422, "В подборке может быть до 200 материалов")
    last_position = await db.scalar(select(func.max(SocialCollectionItem.position)).where(SocialCollectionItem.collection_id == row.id))
    position = last_position + 1 if last_position is not None else 0
    await db.execute(insert(SocialCollectionItem).values(collection_id=row.id, **body.model_dump(), position=position).on_conflict_do_nothing())
    await db.commit()
    return await collection_dto(db, user, row, content=True)


@router.delete("/collections/{collection_id}/items/{item_id}")
async def remove_collection_item(collection_id: int, item_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await get_collection(db, user, collection_id, owner=True)
    await db.execute(delete(SocialCollectionItem).where(SocialCollectionItem.id == item_id, SocialCollectionItem.collection_id == collection_id))
    await db.commit()
    return {"ok": True}


@router.post("/collections/{collection_id}/reorder")
async def reorder_collection(collection_id: int, body: ReorderIn, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_collection(db, user, collection_id, owner=True)
    ids = set((await db.scalars(select(SocialCollectionItem.id).where(SocialCollectionItem.collection_id == row.id))).all())
    if ids != set(body.item_ids) or len(ids) != len(body.item_ids): raise HTTPException(409, "Состав подборки изменился. Обновите страницу")
    for position, item_id in enumerate(body.item_ids):
        await db.execute(update(SocialCollectionItem).where(SocialCollectionItem.id == item_id, SocialCollectionItem.collection_id == row.id).values(position=position))
    await db.commit()
    return await collection_dto(db, user, row, content=True)


@router.post("/collections/{collection_id}/follow")
async def follow_collection(collection_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    row = await get_collection(db, user, collection_id)
    if row.audience != "PUBLIC" or row.owner_user_id == user.id: raise HTTPException(422, "Выберите публичную подборку другого автора")
    if await toggle(db, SocialCollectionFollow, {"collection_id": row.id, "user_id": user.id}, True):
        await notify(db, row.owner_user_id, user, "SOCIAL_COLLECTION_FOLLOW", collection_id=row.id)
    await db.commit()
    return {"followed": True}


@router.delete("/collections/{collection_id}/follow")
async def unfollow_collection(collection_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await toggle(db, SocialCollectionFollow, {"collection_id": collection_id, "user_id": user.id}, False)
    await db.commit()
    return {"followed": False}


@router.post("/reports")
async def report(body: ReportIn, request:Request, db=Depends(get_db), user=Depends(get_current_user)):
    rate_limit("social-report", user.id, 10, 60)
    if body.target_type == "POST": await get_post(db, user, body.target_id, drafts=False)
    elif body.target_type == "COMMENT": await get_comment(db, user, body.target_id)
    else:
        ctx = await AccessContext.load(db, user)
        story = await db.scalar(select(SocialStory).where(SocialStory.id == body.target_id, SocialStory.status == "PUBLISHED",
            SocialStory.expires_at > now(), ctx.audience_clause(SocialStory, "owner_user_id")))
        if not story: raise HTTPException(404, "История недоступна")
    await db.execute(insert(SocialReport).values(reporter_user_id=user.id, **body.model_dump(), status="PENDING").on_conflict_do_nothing())
    from app.support_service import ensure_community_ticket,diagnostic_snapshot
    report_row=await db.scalar(select(SocialReport).where(SocialReport.reporter_user_id==user.id,SocialReport.target_type==body.target_type,SocialReport.target_id==body.target_id))
    await ensure_community_ticket(db,report_row,await diagnostic_snapshot(db,user,request,"/feed"))
    await db.commit()
    return {"ok": True}


@router.get("/notifications/unread-count")
async def notification_count(db=Depends(get_db), user=Depends(get_current_user)):
    count = await db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.is_read == 0, Notification.type.like("SOCIAL_%")))
    return {"count": count or 0}


@router.post("/notifications/read-all")
async def notifications_read_all(db=Depends(get_db), user=Depends(get_current_user)):
    await db.execute(update(Notification).where(Notification.user_id == user.id, Notification.type.like("SOCIAL_%")).values(is_read=1))
    await db.commit()
    return {"ok": True}


@admin_router.get("/reports")
async def report_queue(status: Literal["pending", "resolved", "all"] = "pending", db=Depends(get_db), user=Depends(staff)):
    query = select(SocialReport)
    if status != "all":
        query = query.where(SocialReport.status == status.upper())
    rows = (await db.scalars(query.order_by(SocialReport.id).limit(100))).all()
    results = []
    for row in rows:
        model = {"POST": SocialPost, "COMMENT": SocialComment, "STORY": SocialStory}[row.target_type]
        target = await db.get(model, row.target_id)
        text = target.body if isinstance(target, SocialPost) else target.text if target else "Удалено"
        results.append({"id": row.id, "status": row.status, "target_type": row.target_type, "target_id": row.target_id,
            "reason": row.reason, "created_at": iso(row.created_at), "target_text": text, "target_status": target.status if target else "DELETED"})
    return {"items": results}


@admin_router.post("/reports/{report_id}/moderate")
async def moderate(report_id: int, body: ModerationIn, db=Depends(get_db), user=Depends(staff)):
    row = await db.get(SocialReport, report_id)
    if not row: raise HTTPException(404, "Жалоба не найдена")
    from app.support_models import SupportTicket
    from app.support_service import lock_ticket,may_work
    ticket_id=await db.scalar(select(SupportTicket.id).where(SupportTicket.source_report_id==report_id))
    if ticket_id:
        ticket=await lock_ticket(db,ticket_id)
        if ticket.status=="OPEN" and ticket.assigned_to is None and user.is_admin:
            ticket.assigned_to=user.id
            ticket.status="IN_PROGRESS"
        may_work(ticket,user)
    await apply_report_moderation(db,row,body.action,user.id)
    await db.commit()
    return {"ok":True}


async def apply_report_moderation(db,row,action,user_id):
    model = {"POST": SocialPost, "COMMENT": SocialComment, "STORY": SocialStory}[row.target_type]
    target = await db.get(model, row.target_id)
    if action != "dismiss":
        if not target or target.status == "DELETED": raise HTTPException(409, "Объект уже удалён")
        if action == "hide": target.status = "HIDDEN"
        else:
            if target.status != "HIDDEN": raise HTTPException(409, "Объект не скрыт")
            target.status = "ACTIVE" if row.target_type == "COMMENT" else "PUBLISHED"
    row.status, row.moderator_id, row.resolved_at = "RESOLVED", user_id, now()
