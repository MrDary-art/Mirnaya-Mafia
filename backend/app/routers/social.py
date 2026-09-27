"""Social profiles, friends, messages, challenges, and online arena rooms."""

import json
import hashlib
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.db import SessionLocal, get_db
from app.engine.scenario import SCENARIOS
from app.features.progression import RANKS
from app.features.cosmetics import equipment
from app.models import ArenaRoom, Challenge, DirectMessage, Friendship, Notification, OnlineRoom, Session, User
from app.schemas import ChallengeIn, ChatInvitationIn, DirectMessageIn, OnlineRoomIn, PersonalProfileIn
from app.services import create_session, dumps
from app.engine.room_booking import enforce_booking_quota
from app.routers.rooms import serialize_booking_change

router = APIRouter(prefix="/social", tags=["social"])
room_connections: dict[int, set[WebSocket]] = {}


def public_user(user: User, *, relationship: str = "NONE", include_personal: bool = False, sessions_total: int = 0) -> dict:
    visible_personal = include_personal or user.profile_visibility == "public"
    return {
        "id": user.id, "username": user.username,
        "display_name": (" ".join(part for part in [user.first_name, user.last_name] if part) or user.display_name) if visible_personal else None,
        "title": RANKS.get(user.level, "Переговорщик") if visible_personal else None,
        "rank": user.level, "rank_name": RANKS.get(user.level, "Переговорщик") if visible_personal else None,
        "xp": user.xp if visible_personal else None, "stars": user.stars if visible_personal else None, **equipment(user),
        "specialization": user.specialization if visible_personal else None,
        "about": user.about if visible_personal else None,
        "city": user.city if visible_personal else None,
        "sessions_total": sessions_total, "relationship": relationship,
    }


async def relation(db: AsyncSession, first_id: int, second_id: int) -> tuple[str, Friendship | None]:
    row = await db.scalar(select(Friendship).where(Friendship.user_id == first_id, Friendship.friend_id == second_id))
    if row:
        return row.status, row
    reverse = await db.scalar(select(Friendship).where(Friendship.user_id == second_id, Friendship.friend_id == first_id))
    if not reverse:
        return "NONE", None
    if reverse.status == "REQUEST_SENT":
        return "REQUEST_RECEIVED", reverse
    return reverse.status, reverse


async def discoverable_people_ids(db: AsyncSession, user_id: int) -> set[int]:
    """Return direct friends and friends of those friends for search visibility."""
    rows = (await db.scalars(select(Friendship).where(
        Friendship.status == "FRIENDS",
        or_(Friendship.user_id == user_id, Friendship.friend_id == user_id),
    ))).all()
    direct = {row.friend_id if row.user_id == user_id else row.user_id for row in rows}
    if not direct:
        return set()
    rows = (await db.scalars(select(Friendship).where(
        Friendship.status == "FRIENDS",
        or_(Friendship.user_id.in_(direct), Friendship.friend_id.in_(direct)),
    ))).all()
    indirect = {participant for row in rows for participant in (row.user_id, row.friend_id) if participant not in direct and participant != user_id}
    return direct | indirect


async def notify(db: AsyncSession, user_id: int, kind: str, payload: dict) -> None:
    db.add(Notification(user_id=user_id, type=kind, payload=json.dumps(payload, ensure_ascii=False)))


async def require_friend(db: AsyncSession, user_id: int, other_id: int) -> None:
    status, _ = await relation(db, user_id, other_id)
    if status != "FRIENDS":
        raise HTTPException(403, "Это действие доступно после подтверждения дружбы")


async def blocked_between(db: AsyncSession, first_id: int, second_id: int) -> bool:
    """A block is unilateral in storage but blocks new contact in both directions."""
    return bool(await db.scalar(select(Friendship.id).where(
        Friendship.status == "BLOCKED",
        or_(and_(Friendship.user_id == first_id, Friendship.friend_id == second_id),
            and_(Friendship.user_id == second_id, Friendship.friend_id == first_id)),
    )))


async def require_contact_allowed(db: AsyncSession, sender: User, recipient: User) -> None:
    if sender.id == recipient.id:
        raise HTTPException(400, "Нельзя связаться с собственным аккаунтом")
    if await blocked_between(db, sender.id, recipient.id):
        # Intentionally neutral: do not reveal which participant blocked contact.
        raise HTTPException(403, "Связь с этим пользователем сейчас недоступна")
    status, _ = await relation(db, sender.id, recipient.id)
    if status == "FRIENDS":
        return
    if recipient.messages_visibility != "all":
        raise HTTPException(403, "Пользователь принимает сообщения и приглашения только от друзей")


async def may_open_dialog(db: AsyncSession, user_id: int, other: User) -> bool:
    if await blocked_between(db, user_id, other.id):
        return False
    status, _ = await relation(db, user_id, other.id)
    if status == "FRIENDS":
        return True
    return bool(await db.scalar(select(DirectMessage.id).where(or_(
        and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == other.id),
        and_(DirectMessage.sender_id == other.id, DirectMessage.receiver_id == user_id),
    ))))


@router.put("/profile")
async def update_personal_profile(body: PersonalProfileIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    allowed = {"public", "friends", "private"}
    search_allowed = {"all", "friends_of_friends", "none"}
    message_allowed = {"all", "friends", "none"}
    if body.profile_visibility not in allowed or body.search_visibility not in search_allowed or body.messages_visibility not in message_allowed:
        raise HTTPException(400, "Некорректная настройка приватности")
    duplicate = await db.scalar(select(User).where(User.username == body.username, User.id != user.id))
    if duplicate:
        raise HTTPException(400, "Этот никнейм уже занят")
    for field, value in body.model_dump().items():
        setattr(user, field, value.strip() if isinstance(value, str) else value)
    user.display_name = f"{user.first_name} {user.last_name}".strip()
    await db.commit()
    return public_user(user, include_personal=True)


@router.get("/people")
async def search_people(
    q: str = "", rank: int | None = Query(default=None, ge=1, le=6), min_xp: int | None = Query(default=None, ge=0),
    specialization: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    discoverable = await discoverable_people_ids(db, user.id)
    discoverable_clause = User.id.in_(discoverable) if discoverable else User.id == -1
    query = select(User).where(
        User.id != user.id,
        or_(User.search_visibility == "all", and_(User.search_visibility == "friends_of_friends", discoverable_clause)),
    )
    if rank:
        query = query.where(User.level == rank)
    if min_xp is not None:
        query = query.where(User.xp >= min_xp)
    if specialization:
        query = query.where(User.specialization == specialization)
    needle = q.strip()
    if needle:
        like = f"%{needle}%"
        query = query.where(or_(User.username.ilike(like), User.display_name.ilike(like)))
    rows = (await db.scalars(query.order_by(User.xp.desc()).limit(50))).all()
    result = []
    for other in rows:
        if await blocked_between(db, user.id, other.id):
            continue
        status, _ = await relation(db, user.id, other.id)
        total = await db.scalar(select(func.count()).select_from(Session).where(Session.user_id == other.id, Session.status == "finished"))
        result.append(public_user(other, relationship=status, include_personal=status == "FRIENDS", sessions_total=total or 0))
    return result


@router.get("/people/{username}")
async def person(username: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    other = await db.scalar(select(User).where(User.username == username))
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    if other.id != user.id and await blocked_between(db, user.id, other.id):
        raise HTTPException(404, "Пользователь не найден")
    status, _ = await relation(db, user.id, other.id)
    if other.profile_visibility == "private" and status != "FRIENDS" and other.id != user.id:
        raise HTTPException(403, "Профиль доступен только друзьям")
    sessions_total = len((await db.scalars(select(Session).where(Session.user_id == other.id, Session.status == "finished"))).all())
    return public_user(other, relationship=status, include_personal=other.id == user.id or status == "FRIENDS", sessions_total=sessions_total)


@router.post("/friends/{other_id}/request")
async def request_friend(other_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if other_id == user.id or not await db.get(User, other_id):
        raise HTTPException(404, "Пользователь не найден")
    if await blocked_between(db, user.id, other_id):
        raise HTTPException(403, "Нельзя отправить заявку этому пользователю")
    status, row = await relation(db, user.id, other_id)
    if status == "REQUEST_RECEIVED":
        row.status = "FRIENDS"
    elif status == "NONE" or status == "REMOVED":
        db.add(Friendship(user_id=user.id, friend_id=other_id, status="REQUEST_SENT"))
        await notify(db, other_id, "FRIEND_REQUEST", {"from": user.username, "user_id": user.id})
    else:
        raise HTTPException(400, "Заявка уже существует или пользователь заблокирован")
    await db.commit()
    return {"status": "FRIENDS" if status == "REQUEST_RECEIVED" else "REQUEST_SENT"}


@router.post("/friends/{other_id}/{action}")
async def change_friendship(other_id: int, action: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    status, row = await relation(db, user.id, other_id)
    other = await db.get(User, other_id)
    if not other or other_id == user.id:
        raise HTTPException(404, "Пользователь не найден")
    if action == "accept" and status == "REQUEST_RECEIVED":
        row.status = "FRIENDS"; await notify(db, other_id, "FRIEND_ACCEPTED", {"from": user.username, "user_id": user.id})
    elif action == "decline" and status == "REQUEST_RECEIVED":
        await db.delete(row)
    elif action == "block":
        if not row:
            db.add(Friendship(user_id=user.id, friend_id=other_id, status="BLOCKED"))
        elif row.user_id != user.id:
            await db.delete(row); db.add(Friendship(user_id=user.id, friend_id=other_id, status="BLOCKED"))
        else:
            row.status = "BLOCKED"
    elif action == "unblock":
        own_block = await db.scalar(select(Friendship).where(Friendship.user_id == user.id, Friendship.friend_id == other_id, Friendship.status == "BLOCKED"))
        if not own_block:
            raise HTTPException(400, "Блокировка не найдена")
        await db.delete(own_block)
    elif action == "remove" and status == "FRIENDS":
        await db.delete(row)
    else:
        raise HTTPException(400, "Это действие сейчас недоступно")
    await db.commit()
    return {"ok": True}


@router.get("/friends")
async def friends(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(Friendship).where(or_(Friendship.user_id == user.id, Friendship.friend_id == user.id)))).all()
    items = []
    for row in rows:
        other_id = row.friend_id if row.user_id == user.id else row.user_id
        other = await db.get(User, other_id)
        status, _ = await relation(db, user.id, other_id)
        if other and status != "BLOCKED": items.append(public_user(other, relationship=status, include_personal=status == "FRIENDS"))
    return items


@router.get("/dialogs")
async def dialogs(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """One compact list for the inbox; do not request every message history."""
    rows = (await db.scalars(select(DirectMessage).where(or_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == user.id)).order_by(DirectMessage.created_at.desc()))).all()
    seen: set[int] = set(); result = []
    for message in rows:
        other_id = message.receiver_id if message.sender_id == user.id else message.sender_id
        if other_id in seen:
            continue
        seen.add(other_id)
        other = await db.get(User, other_id)
        if not other or not await may_open_dialog(db, user.id, other):
            continue
        unread = await db.scalar(select(func.count()).select_from(DirectMessage).where(DirectMessage.sender_id == other_id, DirectMessage.receiver_id == user.id, DirectMessage.is_read == 0))
        status, _ = await relation(db, user.id, other_id)
        result.append({**public_user(other, relationship=status, include_personal=status == "FRIENDS"), "preview": message.text, "time": message.created_at.isoformat(), "unread": unread or 0})
    return result


@router.get("/unread-count")
async def unread_message_count(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Canonical count for the chat notification badge."""
    count = await db.scalar(
        select(func.count()).select_from(DirectMessage).where(
            DirectMessage.receiver_id == user.id,
            DirectMessage.is_read == 0,
            DirectMessage.type == "TEXT",
        )
    )
    return {"count": count or 0}


@router.get("/blocked")
async def blocked_users(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(Friendship).where(Friendship.user_id == user.id, Friendship.status == "BLOCKED"))).all()
    people = [await db.get(User, row.friend_id) for row in rows]
    return [public_user(person, relationship="BLOCKED") for person in people if person]


def message_payload(row: DirectMessage) -> dict:
    return {
        "id": row.id, "sender_id": row.sender_id, "receiver_id": row.receiver_id,
        "text": row.text, "type": row.type, "payload": json.loads(row.payload or "{}"),
        "is_read": bool(row.is_read), "created_at": row.created_at.isoformat(),
    }


@router.get("/messages/{other_id}")
async def messages(other_id: int, mark_read: bool = True, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    other = await db.get(User, other_id)
    if not other or not await may_open_dialog(db, user.id, other):
        raise HTTPException(403, "Этот диалог сейчас недоступен")
    rows = (await db.scalars(select(DirectMessage).where(or_(and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == other_id), and_(DirectMessage.sender_id == other_id, DirectMessage.receiver_id == user.id))).order_by(DirectMessage.created_at))).all()
    if mark_read:
        for row in rows:
            if row.receiver_id == user.id:
                row.is_read = 1
        # A direct-message notification represents the same event as the
        # unread message.  Reading the dialog must therefore clear it too,
        # otherwise the home badge keeps showing a stale duplicate.
        unread_notifications = (await db.scalars(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == "MESSAGE_RECEIVED",
                Notification.is_read == 0,
            )
        )).all()
        for notification in unread_notifications:
            payload = json.loads(notification.payload or "{}")
            if payload.get("user_id") == other_id:
                notification.is_read = 1
        await db.commit()
    result = []
    for row in rows:
        item = message_payload(row)
        if row.type == "ROOM_INVITATION":
            room = await db.get(ArenaRoom, item["payload"].get("room_id"))
            if room:
                from app.engine.room_booking import booking_access
                from app.routers.rooms import state_for
                state = state_for(room)
                item["payload"].update(scheduled_at=state.get("scheduled_at"), mode=room.mode)
                status = item["payload"].get("status", "pending")
                if room.status in {"finished", "cancelled", "expired", "processing", "active"}:
                    status = room.status
                elif room.guest_id:
                    status = "accepted" if room.guest_id == row.receiver_id else "unavailable"
                elif state.get("reservation") and datetime.fromisoformat(booking_access(room,state)["reservation_ends_at"]) <= datetime.now(timezone.utc):
                    status = "expired"
                item["payload"]["status"] = status
        result.append(item)
    return result


class InvitationReply(BaseModel):
    scheduled_at: str | None = Field(default=None, max_length=60)


@router.post("/booked-invitations/{message_id}/{action}", dependencies=[Depends(serialize_booking_change)])
async def reply_booked_invitation(message_id: int, action: str, body: InvitationReply, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routers.rooms import room_lock, state_for, participant_bookings
    from app.engine.room_v2 import parse_schedule
    row = await db.get(DirectMessage,message_id)
    if not row or row.type != "ROOM_INVITATION" or user.id not in {row.sender_id,row.receiver_id}:
        raise HTTPException(404,"Приглашение не найдено")
    payload = json.loads(row.payload or "{}")
    async with room_lock(payload.get("room_id")):
        room = await db.get(ArenaRoom,payload.get("room_id"))
        if not room or room.status not in {"waiting","lobby"} or room.guest_id:
            raise HTTPException(409,"Условия этой встречи уже изменились. Обновите приглашение")
        state = state_for(room)
        if action == "decline" and user.id == row.receiver_id:
            payload["status"] = "declined"
        elif action == "propose" and user.id == row.receiver_id:
            try:
                if not body.scheduled_at: raise ValueError("Выберите новое время")
                proposed = parse_schedule(body.scheduled_at,"Europe/Moscow")
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            payload.update(status="time_proposed",proposed_at=proposed.isoformat())
        elif action == "accept-time" and user.id == row.sender_id and payload.get("status") == "time_proposed":
            try:
                proposed = parse_schedule(payload.get("proposed_at"),"Europe/Moscow")
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            until = proposed + timedelta(minutes=int(state.get("duel_window_minutes") or state["duration_minutes"]))
            for uid in (row.sender_id,row.receiver_id):
                if any(item["room_id"] != room.id and proposed < item["end"] and until > item["start"] for item in await participant_bookings(db,uid)):
                    raise HTTPException(409,"Это время пересекается с другой встречей участника")
            state.update(scheduled_at=proposed.isoformat(),reservation=True,entry_notified=[])
            room.state=dumps(state)
            payload.update(status="pending",scheduled_at=proposed.isoformat(),proposed_at=None)
        else:
            raise HTTPException(403,"Это действие недоступно")
        row.payload=dumps(payload)
        await notify(db,row.sender_id if user.id==row.receiver_id else row.receiver_id,"INVITATION_UPDATED",{"message_id":row.id,"status":payload["status"],"path":f"/people?chat={user.id}"})
        await db.commit()
    return payload


@router.post("/messages/{other_id}")
async def send_message(other_id: int, body: DirectMessageIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    other = await db.get(User, other_id)
    if not other: raise HTTPException(404, "Пользователь не найден")
    await require_contact_allowed(db, user, other)
    row = DirectMessage(sender_id=user.id, receiver_id=other_id, text=body.text.strip())
    db.add(row); await notify(db, other_id, "MESSAGE_RECEIVED", {"from": user.username, "user_id": user.id}); await db.commit(); await db.refresh(row)
    return message_payload(row)


@router.post("/invitations/{other_id}")
async def create_chat_invitation(other_id: int, body: ChatInvitationIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routers.rooms import validate_ai_task
    validate_ai_task(body.problem, body.goal)
    other = await db.get(User, other_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    await require_contact_allowed(db, user, other)
    invitation_type = "ONLINE_INVITE" if body.kind == "negotiation" else "CHALLENGE_INVITE"
    payload = {
        "status": "pending", "kind": body.kind, "mode": "human" if body.kind == "negotiation" else "duel",
        "display_name": body.display_name.strip(), "problem": body.problem.strip(), "goal": body.goal.strip(),
        "team_name": body.team_name, "scenario_id": body.scenario_id, "scheduled_at": body.scheduled_at,
        "timezone": body.timezone, "duration_minutes": body.duration_minutes, "ranked": body.ranked,
    }
    row = DirectMessage(
        sender_id=user.id, receiver_id=other_id, type=invitation_type,
        text="Ознакомьтесь с условиями и примите приглашение.", payload=json.dumps(payload, ensure_ascii=False),
    )
    db.add(row)
    await db.flush()
    await notify(db, other_id, invitation_type, {"from": user.username, "message_id": row.id})
    await db.commit()
    await db.refresh(row)
    return message_payload(row)


async def create_room_from_invitation(db: AsyncSession, creator: User, guest: User, invitation: dict) -> ArenaRoom:
    from app.engine.room_v2 import build_state, parse_schedule
    from app.routers.rooms import RANKED_INTERVIEW_QUESTIONS, ensure_duel_session, generate_interview_questions, generate_roles, has_participant_overlap

    await enforce_booking_quota(db, creator)
    await enforce_booking_quota(db, guest)

    mode = invitation["mode"]
    scheduled = parse_schedule(invitation.get("scheduled_at"), invitation.get("timezone") or "Europe/Moscow")
    duration = 60 if mode == "duel" else int(invitation.get("duration_minutes") or 15)
    if any([await has_participant_overlap(db, person.id, scheduled, duration) for person in (creator, guest)]):
        raise HTTPException(409, "Встреча пересекается с расписанием одного из участников")
    roles = await generate_roles(invitation["problem"], invitation["goal"]) if mode == "human" else None
    questions = (RANKED_INTERVIEW_QUESTIONS if invitation.get("ranked") and invitation.get("scenario_id") else
                 await generate_interview_questions(invitation["problem"])) if mode == "duel" else None
    state = build_state(mode=mode, host_id=creator.id, display_name=invitation["display_name"],
                        request_text=invitation["problem"], goal=invitation["goal"],
                        duration_minutes=int(invitation.get("duration_minutes") or 15), scheduled_at=scheduled,
                        timezone_name=invitation.get("timezone") or "Europe/Moscow", team_name=invitation.get("team_name"),
                        scenario_id=invitation.get("scenario_id"), ranked=bool(invitation.get("ranked")),
                        roles=roles, questions=questions, from_chat=True)
    state["participants"][str(guest.id)] = {
        "display_name": guest.display_name or guest.username, "role_id": "guest",
        "role": (roles or {}).get("guest_role") or ("Кандидат" if mode == "duel" else "Вторая сторона"),
        "public_role": (roles or {}).get("guest_role") or ("Кандидат" if mode == "duel" else "Вторая сторона"),
        "private_goal": (roles or {}).get("guest_goal") or invitation["goal"],
        "private_brief": (roles or {}).get("guest_brief") or invitation["problem"],
        "ready": mode == "duel", "transport_ready": mode == "duel", "present": True, "done": False, "recording_consent": False,
    }
    state["reservation"] = bool(invitation.get("scheduled_at"))
    room = ArenaRoom(
        code=secrets.token_urlsafe(8), mode=mode, host_id=creator.id, guest_id=guest.id,
        status="lobby", state=dumps(state), started_at=None,
    )
    db.add(room)
    await db.flush()
    if mode == "duel":
        for participant in (creator, guest):
            await ensure_duel_session(db, room, state, participant)
    room.state = dumps(state)
    return room


@router.post("/invitations/{message_id}/accept", dependencies=[Depends(serialize_booking_change)])
async def accept_chat_invitation(message_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    invitation_message = await db.get(DirectMessage, message_id)
    if not invitation_message or invitation_message.receiver_id != user.id or invitation_message.type not in {"ONLINE_INVITE", "CHALLENGE_INVITE"}:
        raise HTTPException(404, "Приглашение не найдено")
    payload = json.loads(invitation_message.payload or "{}")
    if payload.get("status") != "pending":
        raise HTTPException(409, "Это приглашение уже обработано")
    creator = await db.get(User, invitation_message.sender_id)
    if not creator:
        raise HTTPException(404, "Отправитель приглашения не найден")
    if await blocked_between(db, user.id, creator.id):
        raise HTTPException(403, "Это приглашение больше недоступно")
    room = await create_room_from_invitation(db, creator, user, payload)
    payload.update({"status": "accepted", "room_id": room.id})
    invitation_message.payload = json.dumps(payload, ensure_ascii=False)
    db.add(DirectMessage(
        sender_id=creator.id, receiver_id=user.id, type="ROOM_CREATED",
        text="Комната создана. Вы можете приступить к переговорам.",
        payload=json.dumps({"room_id": room.id, "kind": payload["kind"]}, ensure_ascii=False),
    ))
    await notify(db, creator.id, "ROOM_CREATED", {"room_id": room.id, "from": user.username})
    await notify(db, user.id, "ROOM_CREATED", {"room_id": room.id, "from": creator.username})
    await db.commit()
    return {"room_id": room.id, "status": "accepted"}


@router.post("/invitations/{message_id}/{action}")
async def update_chat_invitation(message_id: int, action: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    invitation = await db.get(DirectMessage, message_id)
    if not invitation or invitation.type not in {"ONLINE_INVITE", "CHALLENGE_INVITE"}:
        raise HTTPException(404, "Приглашение не найдено")
    payload = json.loads(invitation.payload or "{}")
    if payload.get("status") != "pending":
        raise HTTPException(409, "Это приглашение уже обработано")
    if action == "decline" and invitation.receiver_id == user.id:
        payload["status"] = "declined"
    elif action == "cancel" and invitation.sender_id == user.id:
        payload["status"] = "cancelled"
    else:
        raise HTTPException(403, "Это действие недоступно")
    invitation.payload = json.dumps(payload, ensure_ascii=False)
    await notify(db, invitation.sender_id if action == "decline" else invitation.receiver_id, "INVITATION_UPDATED", {"message_id": invitation.id, "status": payload["status"]})
    await db.commit()
    return {"status": payload["status"]}


@router.get("/notifications")
async def notifications(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50))).all()
    return [{"id": row.id, "type": row.type, "payload": json.loads(row.payload), "read": bool(row.is_read), "created_at": row.created_at.isoformat()} for row in rows]


@router.post("/notifications/{notification_id}/read")
async def read_notification(notification_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(Notification, notification_id)
    if not row or row.user_id != user.id: raise HTTPException(404, "Уведомление не найдено")
    row.is_read = 1; await db.commit(); return {"ok": True}


@router.post("/rooms")
async def create_room(body: OnlineRoomIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if body.scenario_id not in SCENARIOS: raise HTTPException(404, "Сценарий не найден")
    if body.guest_id: await require_friend(db, user.id, body.guest_id)
    room = OnlineRoom(creator_id=user.id, guest_id=body.guest_id, scenario_id=body.scenario_id, creator_role=body.creator_role, guest_role=body.guest_role, difficulty=body.difficulty)
    db.add(room); await db.flush()
    if body.guest_id:
        invitation = {"room_id": room.id, "scenario_id": body.scenario_id}
        db.add(DirectMessage(sender_id=user.id, receiver_id=body.guest_id, type="ONLINE_INVITE", text="Приглашение в переговоры", payload=json.dumps(invitation, ensure_ascii=False)))
        await notify(db, body.guest_id, "ONLINE_INVITE", {"from": user.username, **invitation})
    await db.commit(); return room_payload(room)


@router.get("/rooms")
async def rooms(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(OnlineRoom).where(or_(OnlineRoom.creator_id == user.id, OnlineRoom.guest_id == user.id)).order_by(OnlineRoom.created_at.desc()))).all()
    return [{**room_payload(row), "can_accept": row.guest_id == user.id and row.status == "waiting"} for row in rows]


@router.post("/rooms/{room_id}/accept")
async def accept_room(room_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    room = await db.get(OnlineRoom, room_id)
    if not room or room.guest_id != user.id: raise HTTPException(404, "Приглашение не найдено")
    room.status = "active"; await db.commit(); return room_payload(room)


@router.post("/challenges")
async def create_challenge(body: ChallengeIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_friend(db, user.id, body.receiver_id)
    row = Challenge(creator_id=user.id, receiver_id=body.receiver_id, scenario_id=body.scenario_id)
    db.add(row); await db.flush()
    invitation = {"challenge_id": row.id, "scenario_id": body.scenario_id}
    db.add(DirectMessage(sender_id=user.id, receiver_id=body.receiver_id, type="CHALLENGE_INVITE", text="Приглашение на соревнование", payload=json.dumps(invitation, ensure_ascii=False)))
    await notify(db, body.receiver_id, "CHALLENGE_RECEIVED", {"from": user.username, **invitation}); await db.commit(); await db.refresh(row)
    return {"id": row.id, "status": row.status}


def room_payload(room: OnlineRoom) -> dict:
    return {"id": room.id, "arena": f"АРЕНА #{room.id:05d}", "creator_id": room.creator_id, "guest_id": room.guest_id, "scenario_id": room.scenario_id, "creator_role": room.creator_role, "guest_role": room.guest_role, "difficulty": room.difficulty, "status": room.status, "messages": json.loads(room.messages or "[]"), "metrics": json.loads(room.metrics or "{}"), "created_at": room.created_at.isoformat()}


@router.websocket("/rooms/{room_id}/ws")
async def room_ws(websocket: WebSocket, room_id: int, token: str = Query(default="")):
    origin = websocket.headers.get("origin")
    if origin and settings.room_allowed_origin_list and origin not in settings.room_allowed_origin_list:
        await websocket.close(code=1008)
        return
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(claims.get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError):
        await websocket.close(code=1008); return
    try:
        async with SessionLocal() as db:
            user = await db.get(User, user_id)
            room = await db.get(OnlineRoom, room_id)
            if not user or user.is_admin or (claims.get("pv") and claims["pv"] != hashlib.sha256(user.password_hash.encode()).hexdigest()) or not room or user_id not in {room.creator_id, room.guest_id}:
                await websocket.close(code=1008); return
            await websocket.accept()
            room_connections.setdefault(room_id, set()).add(websocket)
            while True:
                payload = await websocket.receive_json()
                text = str(payload.get("text", "")).strip()
                if not text: continue
                history = json.loads(room.messages or "[]")
                event = {"sender_id": user_id, "text": text[:2000], "created_at": datetime.now().isoformat()}
                history.append(event); room.messages = json.dumps(history, ensure_ascii=False); await db.commit()
                for connection in list(room_connections.get(room_id, set())):
                    try:
                        await connection.send_json(event)
                    except RuntimeError:
                        room_connections[room_id].discard(connection)
    except WebSocketDisconnect:
        return
    finally:
        room_connections.get(room_id, set()).discard(websocket)
