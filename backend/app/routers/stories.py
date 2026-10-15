"""Authenticated story feed, private playthroughs, authoring and reviewed publication."""

import json
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, get_current_user
from app.db import get_db
from app.deployment_security import rate_limit
from app.features.stories import (
    METRICS, TOPICS, Key, StoryGraph, StoryIn, StrictModel, advance, attempt_payload,
    author_payload, blocked_ids, dumps, get_story, summaries, summary, timestamp, utcnow, visible_clause,
)
from app.models import User
from app.story_models import Story, StoryAttempt, StoryComment, StoryFollow, StoryLike, StoryReport, StorySave

router = APIRouter(prefix="/stories", tags=["stories"])
admin_router = APIRouter(prefix="/admin/stories", tags=["admin-stories"])


class ActiveIn(StrictModel):
    active: bool = Field(strict=True)


class AttemptIn(StrictModel):
    role_id: Key


class ChoiceIn(StrictModel):
    node_id: Key
    option_id: Key
    revision: int = Field(ge=0, strict=True)


class CommentIn(StrictModel):
    text: str = Field(min_length=1, max_length=1000)


class ReportIn(StrictModel):
    reason: str = Field(min_length=3, max_length=1000)


class ModerateIn(StrictModel):
    action: Literal["publish", "reject", "hide", "dismiss"]
    note: str | None = Field(default=None, max_length=1000)


@router.get("")
async def feed(
    tab: Literal["for_you", "following", "saved", "mine"] = "for_you",
    topic: Literal["all", "career", "clients", "team"] = "all", q: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0), limit: int = Query(default=12, ge=1, le=20),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    excluded = await blocked_ids(db, user.id)
    query = select(Story).where(visible_clause(excluded))
    if tab == "mine":
        query = query.where(Story.author_id == user.id)
    else:
        query = query.where(Story.status == "published")
    if tab == "following":
        query = query.where(Story.author_id.in_(select(StoryFollow.author_id).where(StoryFollow.user_id == user.id)))
    elif tab == "saved":
        query = query.where(Story.id.in_(select(StorySave.story_id).where(StorySave.user_id == user.id)))
    if topic != "all":
        query = query.where(Story.topic == topic)
    needle = q.strip()
    if needle:
        query = query.where(Story.search_text.contains(needle.casefold(), autoescape=True))
    query = query.order_by(Story.published_at.desc(), Story.id.desc())
    rows = list((await db.scalars(query.offset(offset).limit(limit + 1))).all())
    completed = await db.scalar(select(func.count()).select_from(StoryAttempt).where(
        StoryAttempt.user_id == user.id, StoryAttempt.status == "finished"))
    saved = await db.scalar(select(func.count()).select_from(StorySave).join(Story).where(
        StorySave.user_id == user.id, Story.status == "published", visible_clause(excluded)))
    following = await db.scalar(select(func.count()).select_from(StoryFollow).where(
        StoryFollow.user_id == user.id, StoryFollow.author_id.not_in(excluded)))
    return {"items": await summaries(db, rows[:limit], user),
            "next_offset": offset + limit if len(rows) > limit else None, "topics": TOPICS,
            "stats": {"completed": completed or 0, "saved": saved or 0, "following": following or 0}}


@router.post("")
async def create_story(body: StoryIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rate_limit("story-create", user.id, 12, 3600)
    values = body.model_dump()
    values["graph"] = dumps(values["graph"])
    values["search_text"] = f"{values['title']} {values['hook']}".casefold()
    row = Story(**values, slug=f"story-{secrets.token_hex(10)}", author_id=user.id, status="draft")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await summary(db, row, user)


@router.put("/authors/{author_id}/follow")
async def follow_author(author_id: int, body: ActiveIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not body.active:
        await set_relation(db, StoryFollow, {"user_id": user.id, "author_id": author_id}, False)
        return {"following": False}
    author = await db.get(User, author_id)
    if not author or author.is_admin or author_id == user.id or author_id in await blocked_ids(db, user.id):
        raise HTTPException(404, "Автор недоступен")
    if author.profile_visibility != "public" or author.search_visibility == "none":
        raise HTTPException(403, "Этот профиль не принимает открытые подписки")
    # A private account is discoverable here only after publishing a public story.
    if not await db.scalar(select(Story.id).where(Story.author_id == author_id, Story.status == "published").limit(1)):
        raise HTTPException(404, "Автор недоступен")
    await set_relation(db, StoryFollow, {"user_id": user.id, "author_id": author_id}, body.active)
    return {"following": body.active}


async def owned_attempt(db: AsyncSession, attempt_id: int, user: User) -> StoryAttempt:
    attempt = await db.get(StoryAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise HTTPException(404, "Прохождение не найдено")
    await get_story(db, attempt.story_id, user)
    return attempt


@router.get("/attempts/{attempt_id}")
async def read_attempt(attempt_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return attempt_payload(await owned_attempt(db, attempt_id, user))


@router.post("/attempts/{attempt_id}/choices")
async def choose(attempt_id: int, body: ChoiceIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await owned_attempt(db, attempt_id, user)
    if row.status != "active" or row.revision != body.revision:
        raise HTTPException(409, "Ответ уже принят или история завершена. Обновите прохождение")
    values = advance(row, body.node_id, body.option_id)
    changed = await db.execute(update(StoryAttempt).where(
        StoryAttempt.id == row.id, StoryAttempt.user_id == user.id,
        StoryAttempt.revision == body.revision, StoryAttempt.status == "active",
    ).values(**values).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Ответ уже принят. Обновите прохождение")
    await db.commit()
    await db.refresh(row)
    return attempt_payload(row)


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(StoryComment, comment_id)
    if not row:
        raise HTTPException(404, "Комментарий не найден")
    if row.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "Можно удалить только свой комментарий")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/{story_id}")
async def read_story(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await get_story(db, story_id, user)
    # Resume an active playthrough first; otherwise restore the latest report.
    latest = await db.scalar(select(StoryAttempt).where(
        StoryAttempt.story_id == row.id, StoryAttempt.user_id == user.id,
        StoryAttempt.status.in_(["active", "finished"]),
    ).order_by((StoryAttempt.status == "active").desc(), StoryAttempt.id.desc()).limit(1))
    return {"story": await summary(db, row, user), "attempt": attempt_payload(latest) if latest else None}


@router.get("/{story_id}/draft")
async def read_draft(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await get_story(db, story_id, user)
    if row.author_id != user.id:
        raise HTTPException(403, "Черновик доступен только автору")
    return {"story": await summary(db, row, user), "graph": json.loads(row.graph)}


@router.put("/{story_id}")
async def edit_story(story_id: int, body: StoryIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await get_story(db, story_id, user)
    if row.author_id != user.id:
        raise HTTPException(403, "Историю может изменить только автор")
    values = body.model_dump()
    values.update(graph=dumps(values["graph"]), status="draft", moderation_note=None)
    values["search_text"] = f"{values['title']} {values['hook']}".casefold()
    changed = await db.execute(update(Story).where(
        Story.id == row.id, Story.author_id == user.id, Story.status.in_(["draft", "rejected"]),
    ).values(**values).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Редактировать можно только черновик или возвращённую историю")
    await db.commit()
    await db.refresh(row)
    return await summary(db, row, user)


@router.post("/{story_id}/submit")
async def submit_story(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await get_story(db, story_id, user)
    if row.author_id != user.id:
        raise HTTPException(403, "Отправить историю может только автор")
    StoryGraph.model_validate_json(row.graph)
    rate_limit("story-submit", user.id, 12, 3600)
    changed = await db.execute(update(Story).where(
        Story.id == row.id, Story.author_id == user.id, Story.status.in_(["draft", "rejected"]),
    ).values(status="pending", moderation_note=None).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "История уже отправлена или опубликована")
    await db.commit()
    await db.refresh(row)
    return await summary(db, row, user)


@router.post("/{story_id}/attempts")
async def start_attempt(story_id: int, body: AttemptIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    story = await get_story(db, story_id, user)
    graph = json.loads(story.graph)
    role = next((role for role in graph["roles"] if role["id"] == body.role_id), None)
    if not role:
        raise HTTPException(422, "Выберите роль из этой истории")
    existing = await db.scalar(select(StoryAttempt).where(
        StoryAttempt.story_id == story.id, StoryAttempt.user_id == user.id, StoryAttempt.role_id == body.role_id,
        StoryAttempt.status == "active",
    ).order_by(StoryAttempt.id.desc()).limit(1))
    if existing:
        return attempt_payload(existing)
    rate_limit("story-start", user.id, 60, 60)
    # The partial unique index makes simultaneous starts resume the same attempt.
    # Read the conflict winner before releasing the SQLite write transaction.
    attempt_id = await db.scalar(insert(StoryAttempt).values(
        story_id=story.id, user_id=user.id, role_id=body.role_id, graph=story.graph,
        state=dumps({"current": role["start"], "metrics": {key: 50 for key in METRICS}, "history": []}),
        revision=0, status="active",
    ).on_conflict_do_nothing(index_elements=["story_id", "user_id", "role_id"],
                             index_where=StoryAttempt.status == "active").returning(StoryAttempt.id))
    if attempt_id is None:
        attempt_id = await db.scalar(select(StoryAttempt.id).where(
            StoryAttempt.story_id == story.id, StoryAttempt.user_id == user.id,
            StoryAttempt.role_id == body.role_id, StoryAttempt.status == "active"))
    row = await db.get(StoryAttempt, attempt_id)
    await db.commit()
    await db.refresh(row)
    return attempt_payload(row)


async def set_relation(db: AsyncSession, model, keys: dict, active: bool) -> None:
    if active:
        await db.execute(insert(model).values(**keys).on_conflict_do_nothing())
    else:
        await db.execute(delete(model).where(*(getattr(model, key) == value for key, value in keys.items())))
    await db.commit()


@router.put("/{story_id}/like")
async def like_story(story_id: int, body: ActiveIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await get_story(db, story_id, user, published=True)
    await set_relation(db, StoryLike, {"story_id": row.id, "user_id": user.id}, body.active)
    return await summary(db, row, user)


@router.put("/{story_id}/save")
async def save_story(story_id: int, body: ActiveIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await get_story(db, story_id, user, published=True)
    await set_relation(db, StorySave, {"story_id": row.id, "user_id": user.id}, body.active)
    return await summary(db, row, user)


def comment_payload(row: StoryComment, author: User, user: User) -> dict:
    author_data = author_payload(author, viewer_id=user.id)
    author_data.pop("following")
    return {"id": row.id, "text": row.text, "created_at": timestamp(row.created_at),
            "author": author_data, "can_delete": row.user_id == user.id or bool(user.is_admin)}


@router.get("/{story_id}/comments")
async def comments(
    story_id: int, offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    await get_story(db, story_id, user, published=True)
    excluded = await blocked_ids(db, user.id)
    rows = (await db.execute(select(StoryComment, User).join(User, User.id == StoryComment.user_id).where(
        StoryComment.story_id == story_id, StoryComment.user_id.not_in(excluded),
    ).order_by(StoryComment.id.desc()).offset(offset).limit(limit + 1))).all()
    return {"items": [comment_payload(row, author, user) for row, author in rows[:limit]],
            "next_offset": offset + limit if len(rows) > limit else None}


@router.post("/{story_id}/comments")
async def add_comment(story_id: int, body: CommentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await get_story(db, story_id, user, published=True)
    rate_limit("story-comment", user.id, 12, 60)
    row = StoryComment(story_id=story_id, user_id=user.id, text=body.text)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return comment_payload(row, user, user)


@router.post("/{story_id}/report")
async def report_story(story_id: int, body: ReportIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await get_story(db, story_id, user, published=True)
    rate_limit("story-report", user.id, 10, 60)
    await db.execute(insert(StoryReport).values(story_id=story_id, user_id=user.id, reason=body.reason)
                     .on_conflict_do_nothing(index_elements=["story_id", "user_id"]))
    await db.commit()
    return {"ok": True}


@admin_router.get("/queue")
async def moderation_queue(db: AsyncSession = Depends(get_db), user: User = Depends(get_admin)):
    report_counts = select(StoryReport.story_id, func.count().label("count")).group_by(StoryReport.story_id).subquery()
    rows = (await db.execute(select(Story, report_counts.c.count).outerjoin(
        report_counts, Story.id == report_counts.c.story_id,
    ).where(or_(Story.status == "pending", (Story.status == "published") & (report_counts.c.count > 0)))
       .order_by(Story.created_at.asc(), Story.id.asc()).limit(100))).all()
    items = await summaries(db, [row for row, _ in rows], user)
    reports = {}
    if rows:
        ranked = select(
            StoryReport.id, StoryReport.story_id, StoryReport.reason, StoryReport.created_at,
            func.row_number().over(partition_by=StoryReport.story_id, order_by=StoryReport.id.desc()).label("position"),
        ).where(StoryReport.story_id.in_([row.id for row, _ in rows])).subquery()
        report_rows = (await db.execute(select(ranked).where(ranked.c.position <= 10)
                                       .order_by(ranked.c.id.desc()))).mappings().all()
        for report in report_rows:
            reports.setdefault(report["story_id"], []).append({
                "id": report["id"], "reason": report["reason"], "created_at": timestamp(report["created_at"]),
            })
    return {"items": [{**item, "graph": json.loads(row.graph), "reports_count": count or 0,
                       "reports": reports.get(row.id, [])}
                      for item, (row, count) in zip(items, rows)]}


@admin_router.get("/{story_id}/draft")
async def admin_draft(story_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_admin)):
    row = await get_story(db, story_id, user)
    return {"story": await summary(db, row, user), "graph": json.loads(row.graph)}


@admin_router.post("/{story_id}/moderate")
async def moderate_story(story_id: int, body: ModerateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_admin)):
    row = await get_story(db, story_id, user)
    if row.author_id == user.id:
        raise HTTPException(403, "Автор не может модерировать собственную историю")
    if body.action == "dismiss":
        if row.status != "published":
            raise HTTPException(409, "Закрыть жалобы можно только у опубликованной истории")
        await db.execute(delete(StoryReport).where(StoryReport.story_id == row.id))
        await db.commit()
        return await summary(db, row, user)
    if body.action == "publish":
        StoryGraph.model_validate_json(row.graph)
        allowed, state = ["pending"], "published"
    elif body.action == "reject":
        allowed, state = ["pending"], "rejected"
    else:
        allowed, state = ["published"], "hidden"
    values = {"status": state, "moderation_note": body.note}
    if state == "published":
        values["published_at"] = utcnow()
    changed = await db.execute(update(Story).where(Story.id == row.id, Story.status.in_(allowed))
                               .values(**values).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Статус истории уже изменился или действие недоступно")
    await db.commit()
    await db.refresh(row)
    return await summary(db, row, user)


@admin_router.delete("/comments/{comment_id}")
async def moderate_comment(comment_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_admin)):
    return await delete_comment(comment_id, db, user)


@admin_router.get("/{story_id}/comments")
async def moderation_comments(
    story_id: int, offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_admin),
):
    return await comments(story_id, offset, limit, db, user)
