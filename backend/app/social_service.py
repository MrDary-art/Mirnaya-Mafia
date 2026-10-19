"""Batch serialization and safe Arena links; never publish raw reports or user models."""
import base64
import json
import jwt
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from fastapi import HTTPException
from sqlalchemy import func, select
from app.company_models import Company, CompanyAssignmentAttempt, CompanyCertificate, CompanyMembership
from app.config import settings
from app.engine.learning import PROGRAMS
from app.engine.scenario import SCENARIOS
from app.features.cosmetics import equipment
from app.features.progression import SESSION_ACHIEVEMENTS
from app.models import Achievement, Notification, Session, User
from app.social_access import AccessContext
from app.social_models import (SocialBookmark, SocialComment, SocialCommentLike, SocialMedia, SocialPollOption,
    SocialPollVote, SocialPost, SocialPostLike, SocialPreference)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def public_author(user, context):
    personal = user.id == context.user.id or user.id in context.friends or user.profile_visibility == "public"
    return {"id": user.id, "username": user.username, "display_name": user.display_name if personal else user.username,
            **equipment(user), "path": f"/people/{quote(user.username, safe='')}"}


def public_company(company):
    # Logos can be arbitrary legacy URLs; do not expose external fetching here.
    return {"id": company.id, "name": company.name, "slug": company.slug, "logo": None,
            "path": f"/feed?scope=company&company_id={company.id}"}


def media_payload(row):
    return {"id": row.id, "kind": row.kind, "mime": row.mime, "alt": row.alt_text,
            "width": row.width, "height": row.height, "duration_seconds": row.duration_seconds,
            "bytes": row.bytes, "url": f"/api/social/media/{row.id}",
            "thumbnail_url": f"/api/social/media/{row.id}?thumbnail=true" if row.thumb_key else None}


def cursor_encode(moment, row_id, anchor, *, priority=None):
    values = [moment.isoformat(), row_id, anchor.isoformat()]
    if priority is not None: values.append(priority)
    return base64.urlsafe_b64encode(dumps(values).encode()).decode().rstrip("=")


def cursor_decode(value, *, with_priority=False):
    if not value: return (None, None, now(), 0) if with_priority else (None, None, now())
    try:
        if len(value) > 400: raise ValueError()
        values = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        priority = 0
        if with_priority and len(values) == 4:
            *values, priority = values
            if type(priority) is not int or priority not in {0, 1}: raise ValueError()
        moment, row_id, anchor = values
        if type(row_id) is not int or row_id < 1: raise ValueError()
        moment, anchor = datetime.fromisoformat(moment), datetime.fromisoformat(anchor)
        if moment.tzinfo or anchor.tzinfo: raise ValueError()
        return (moment, row_id, anchor, priority) if with_priority else (moment, row_id, anchor)
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Некорректный курсор страницы") from exc


async def ranked_page(db, viewer, query, model, score, *, cursor, purpose, limit, tie_breaker=None, priority=None):
    """Freeze at most 200 eligible IDs, then re-check current ACL for every page.

    A short-lived signed cursor carries ordering only, never text or identities.
    Reaction changes cannot reorder already-started pagination. New publications
    enter a fresh request after an explicit refresh.
    """
    if cursor:
        try:
            if len(cursor) > 12000: raise ValueError()
            payload = jwt.decode(cursor, settings.secret_key, algorithms=[settings.algorithm])
            ids, offset = payload["ids"], payload["offset"]
            if payload.get("sub") != str(viewer.id) or payload.get("purpose") != purpose:
                raise ValueError()
            if not isinstance(ids, list) or len(ids) > 200 or len(ids) != len(set(ids)) or any(type(key) is not int or key <= 0 for key in ids):
                raise ValueError()
            if type(offset) is not int or not 0 <= offset <= len(ids): raise ValueError()
        except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
            raise HTTPException(422, "Курсор устарел или относится к другой ленте. Обновите публикации") from exc
    else:
        ordering = [priority.desc()] if priority is not None else []
        ordering.append(score.desc())
        if tie_breaker is not None: ordering.append(tie_breaker.desc())
        ordering.append(model.id.desc())
        ids = list((await db.scalars(query.with_only_columns(model.id).order_by(*ordering).limit(200))).all())
        offset = 0
        payload = {"sub": str(viewer.id), "purpose": purpose, "ids": ids,
                   "exp": int(datetime.now(timezone.utc).timestamp()) + 900}
    rows = list((await db.scalars(query.where(model.id.in_(ids[offset:])))).all())
    by_id = {row.id: row for row in rows}
    visible = [key for key in ids[offset:] if key in by_id]
    selected = visible[:limit]
    next_cursor = None
    if len(visible) > limit:
        payload["offset"] = ids.index(selected[-1]) + 1
        next_cursor = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return [by_id[key] for key in selected], next_cursor


def scenario_card(scenario_id):
    scenario = SCENARIOS.get(scenario_id)
    if not scenario: return None
    return {"kind": "SCENARIO", "id": scenario_id, "title": scenario.get("title", scenario_id),
            "path": f"/setup?preset={quote(scenario_id, safe='')}", "available": True}


async def linked_cards(db, posts):
    groups = {}
    for post in posts:
        if post.linked_kind and post.linked_id:
            groups.setdefault(post.linked_kind, set()).add(post.linked_id)
    achievements = {str(row.id): row for row in (await db.scalars(select(Achievement).where(Achievement.id.in_(groups.get("ACHIEVEMENT", set()))))).all()}
    sessions = {str(row.id): row for row in (await db.scalars(select(Session).where(Session.id.in_(groups.get("RESULT", set()))))).all()}
    corporate_sessions = set((await db.scalars(select(CompanyAssignmentAttempt.session_id).where(
        CompanyAssignmentAttempt.session_id.in_([row.id for row in sessions.values()])))).all()) if sessions else set()
    certificates = {}
    if groups.get("CERTIFICATE"):
        rows = (await db.execute(select(CompanyCertificate, CompanyMembership, Company).join(
            CompanyMembership, CompanyMembership.id == CompanyCertificate.membership_id).join(
            Company, Company.id == CompanyCertificate.company_id).where(CompanyCertificate.id.in_(groups["CERTIFICATE"])))).all()
        certificates = {str(cert.id): (cert, member, company) for cert, member, company in rows}
    result = {}
    for post in posts:
        kind, key = post.linked_kind, post.linked_id
        card = None
        if kind == "SCENARIO": card = scenario_card(key)
        elif kind == "LESSON" and key in PROGRAMS:
            card = {"kind": kind, "id": key, "title": PROGRAMS[key]["title"], "path": f"/learn/{quote(key, safe='')}", "available": True}
        elif kind == "ACHIEVEMENT" and key in achievements:
            row = achievements[key]
            if row.user_id == post.author_user_id:
                title = SESSION_ACHIEVEMENTS.get(row.code, ("Достижение Арены", 0))[0]
                card = {"kind": kind, "id": key, "title": title, "code": row.code, "available": True,
                        "path": f"/feed?user_id={row.user_id}", "verified": True}
        elif kind == "RESULT" and key in sessions:
            row = sessions[key]
            if row.user_id == post.author_user_id and row.status == "finished" and row.id not in corporate_sessions and row.mode == "scenario":
                source = scenario_card(row.scenario_id)
                if source:
                    card = {**source, "kind": "RESULT", "id": key, "title": f"Тренировка завершена: {source['title']}", "verified": True}
        elif kind == "CERTIFICATE" and key in certificates:
            cert, member, company = certificates[key]
            settings = json.loads(company.settings or "{}")
            if (member.user_id == post.author_user_id and member.status == "ACTIVE" and cert.status == "ACTIVE"
                    and not cert.revoked_at and (not cert.expires_at or cert.expires_at > now())
                    and settings.get("allow_public_certificates") is True):
                card = {"kind": kind, "id": key, "title": cert.title, "verified": True, "available": True,
                        "path": f"/api/company/verify/{quote(cert.verification_code, safe='')}"}
        if kind: result[post.id] = card or {"kind": kind, "available": False, "title": "Материал недоступен", "path": None}
    return result


async def validate_link(db, user, kind, key):
    if not kind: return
    probe = SocialPost(id=-1, author_user_id=user.id, linked_kind=kind, linked_id=key)
    card = (await linked_cards(db, [probe])).get(-1)
    if not card or not card.get("available"):
        raise HTTPException(422, "Материал не найден, не принадлежит вам или не разрешён для публикации")


async def serialize_posts(db, viewer, posts, *, context=None, originals=True):
    if not posts: return []
    context = context or await AccessContext.load(db, viewer)
    ids = [row.id for row in posts]
    authors = {row.id: row for row in (await db.scalars(select(User).where(User.id.in_({p.author_user_id for p in posts})))).all()}
    companies = {row.id: row for row in (await db.scalars(select(Company).where(Company.id.in_({p.as_company_id for p in posts if p.as_company_id})))).all()}
    counts = {}
    for key, model in (("likes", SocialPostLike), ("comments", SocialComment)):
        query = select(model.post_id, func.count()).where(model.post_id.in_(ids))
        if model is SocialComment: query = query.where(model.status == "ACTIVE", model.author_user_id.not_in(context.blocked))
        counts[key] = dict((await db.execute(query.group_by(model.post_id))).all())
    counts["reposts"] = dict((await db.execute(select(SocialPost.repost_of_id, func.count()).where(
        SocialPost.repost_of_id.in_(ids), SocialPost.status == "PUBLISHED").group_by(SocialPost.repost_of_id))).all())
    liked = set((await db.scalars(select(SocialPostLike.post_id).where(SocialPostLike.user_id == viewer.id, SocialPostLike.post_id.in_(ids)))).all())
    saved = set((await db.scalars(select(SocialBookmark.post_id).where(SocialBookmark.user_id == viewer.id, SocialBookmark.post_id.in_(ids)))).all())
    media = {}
    for row in (await db.scalars(select(SocialMedia).where(SocialMedia.post_id.in_(ids), SocialMedia.deleted_at.is_(None)).order_by(SocialMedia.position, SocialMedia.id))).all():
        media.setdefault(row.post_id, []).append(media_payload(row))
    cards = await linked_cards(db, posts)
    options = (await db.scalars(select(SocialPollOption).where(SocialPollOption.post_id.in_(ids)).order_by(SocialPollOption.position))).all()
    vote_counts = dict((await db.execute(select(SocialPollVote.option_id, func.count()).where(SocialPollVote.post_id.in_(ids)).group_by(SocialPollVote.option_id))).all())
    my_votes = dict((await db.execute(select(SocialPollVote.post_id, SocialPollVote.option_id).where(SocialPollVote.post_id.in_(ids), SocialPollVote.user_id == viewer.id))).all())
    polls = {}
    for option in options:
        polls.setdefault(option.post_id, {"options": [], "voted_option_id": my_votes.get(option.post_id), "total_votes": 0})
        count = vote_counts.get(option.id, 0)
        polls[option.post_id]["options"].append({"id": option.id, "text": option.text, "votes": count})
        polls[option.post_id]["total_votes"] += count
    original_map = {}
    if originals:
        original_ids = {p.repost_of_id for p in posts if p.repost_of_id}
        rows = list((await db.scalars(select(SocialPost).where(SocialPost.id.in_(original_ids), context.post_clause()))).all())
        original_map = {row["id"]: row for row in await serialize_posts(db, viewer, rows, context=context, originals=False)} if rows else {}
    result = []
    for post in posts:
        author = authors[post.author_user_id]
        editable = context.can_edit_post(post)
        following = post.as_company_id in context.followed_companies if post.as_company_id else post.author_user_id in context.following
        result.append({"id": post.id, "author": public_author(author, context),
            "company": public_company(companies[post.as_company_id]) if post.as_company_id in companies else None,
            "body": post.body, "kind": post.kind, "status": post.status, "audience": post.audience,
            "created_at": iso(post.created_at), "published_at": iso(post.published_at), "edited_at": iso(post.updated_at),
            "pinned": bool(post.pinned_at), "comments_enabled": post.comments_enabled, "media": media.get(post.id, []),
            "linked_content": cards.get(post.id), "poll": polls.get(post.id), "path": f"/feed/post/{post.id}",
            "repost_original": original_map.get(post.repost_of_id, {"id": post.repost_of_id, "available": False}) if post.repost_of_id else None,
            "counts": {key: values.get(post.id, 0) for key, values in counts.items()},
            "viewer_state": {"liked": post.id in liked, "bookmarked": post.id in saved, "following_author": following,
                "can_edit": editable, "can_delete": editable, "can_comment": post.comments_enabled and post.status == "PUBLISHED",
                "can_repost": post.status == "PUBLISHED" and post.audience == "PUBLIC" and author.profile_visibility == "public" and not post.repost_of_id}})
    return result


async def hydrate_post_previews(db, viewer, ids):
    context = await AccessContext.load(db, viewer)
    rows = list((await db.scalars(select(SocialPost).where(SocialPost.id.in_(set(ids)), context.post_clause()))).all())
    payloads = await serialize_posts(db, viewer, rows, context=context)
    return {post["id"]: {"id": post["id"], "body": post["body"][:300], "author": post["author"],
            "company": post["company"], "linked_content": post["linked_content"], "path": post["path"]} for post in payloads}


async def notify(db, recipient_id, actor, kind, *, post_id=None, collection_id=None):
    if not recipient_id or recipient_id == actor.id: return
    preferences = await db.get(SocialPreference, recipient_id)
    category = {"SOCIAL_LIKE": "likes", "SOCIAL_COMMENT": "comments", "SOCIAL_COMMENT_REPLY": "comments",
                "SOCIAL_FOLLOW": "follows", "SOCIAL_REPOST": "reposts", "SOCIAL_MENTION": "mentions",
                "SOCIAL_COLLECTION_FOLLOW": "follows", "SOCIAL_STORY_REPLY": "stories"}.get(kind)
    if preferences and json.loads(preferences.settings).get(category) is False: return
    payload = {"actor_id": actor.id, "post_id": post_id, "collection_id": collection_id,
               "path": f"/feed/post/{post_id}" if post_id else f"/collections/{collection_id}" if collection_id else f"/people/{quote(actor.username, safe='')}"}
    encoded = dumps(payload)
    existing = await db.scalar(select(Notification.id).where(Notification.user_id == recipient_id,
        Notification.type == kind, Notification.payload == encoded, Notification.created_at >= now() - timedelta(hours=24)).limit(1))
    if not existing: db.add(Notification(user_id=recipient_id, type=kind, payload=encoded))


async def serialize_comments(db, viewer, rows, *, context=None):
    if not rows: return []
    context = context or await AccessContext.load(db, viewer)
    ids = [row.id for row in rows]
    authors = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_({r.author_user_id for r in rows})))).all()}
    counts = dict((await db.execute(select(SocialCommentLike.comment_id, func.count()).where(SocialCommentLike.comment_id.in_(ids)).group_by(SocialCommentLike.comment_id))).all())
    liked = set((await db.scalars(select(SocialCommentLike.comment_id).where(SocialCommentLike.comment_id.in_(ids), SocialCommentLike.user_id == viewer.id))).all())
    return [{"id": row.id, "post_id": row.post_id, "parent_id": row.parent_id, "author": public_author(authors[row.author_user_id], context),
        "text": row.text if row.status == "ACTIVE" else "Комментарий удалён", "status": row.status,
        "created_at": iso(row.created_at), "edited_at": iso(row.edited_at), "likes": counts.get(row.id, 0),
        "liked": row.id in liked, "can_edit": row.author_user_id == viewer.id and row.status == "ACTIVE",
        "can_delete": row.author_user_id == viewer.id and row.status == "ACTIVE"} for row in rows]
