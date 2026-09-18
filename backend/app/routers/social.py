"""Social profiles, friends, messages, challenges, and online arena rooms."""

import json
from datetime import datetime

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.db import SessionLocal, get_db
from app.engine.scenario import SCENARIOS
from app.features.progression import RANKS
from app.models import Challenge, DirectMessage, Friendship, Notification, OnlineRoom, Session, User
from app.schemas import ChallengeIn, DirectMessageIn, OnlineRoomIn, PersonalProfileIn

router = APIRouter(prefix="/social", tags=["social"])
room_connections: dict[int, set[WebSocket]] = {}


def public_user(user: User, *, relationship: str = "NONE", include_personal: bool = False, sessions_total: int = 0) -> dict:
    visible_personal = include_personal or user.profile_visibility == "public"
    return {
        "id": user.id, "username": user.username,
        "display_name": (" ".join(part for part in [user.first_name, user.last_name] if part) or user.display_name) if visible_personal else None,
        "title": RANKS.get(user.level, "Переговорщик"),
        "rank": user.level, "rank_name": RANKS.get(user.level, "Переговорщик"),
        "xp": user.xp, "stars": user.stars, "avatar_code": user.avatar_code,
        "frame_code": user.frame_code, "specialization": user.specialization,
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


async def notify(db: AsyncSession, user_id: int, kind: str, payload: dict) -> None:
    db.add(Notification(user_id=user_id, type=kind, payload=json.dumps(payload, ensure_ascii=False)))


async def require_friend(db: AsyncSession, user_id: int, other_id: int) -> None:
    status, _ = await relation(db, user_id, other_id)
    if status != "FRIENDS":
        raise HTTPException(403, "Это действие доступно после подтверждения дружбы")


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
    query = select(User).where(User.id != user.id, User.search_visibility != "none")
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
        status, _ = await relation(db, user.id, other.id)
        total = await db.scalar(select(func.count()).select_from(Session).where(Session.user_id == other.id, Session.status == "finished"))
        result.append(public_user(other, relationship=status, include_personal=status == "FRIENDS", sessions_total=total or 0))
    return result


@router.get("/people/{username}")
async def person(username: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    other = await db.scalar(select(User).where(User.username == username))
    if not other:
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
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    if action == "accept" and status == "REQUEST_RECEIVED":
        row.status = "FRIENDS"; await notify(db, other_id, "FRIEND_ACCEPTED", {"from": user.username, "user_id": user.id})
    elif action == "decline" and status == "REQUEST_RECEIVED":
        await db.delete(row)
    elif action == "block":
        if row.user_id != user.id:
            await db.delete(row); db.add(Friendship(user_id=user.id, friend_id=other_id, status="BLOCKED"))
        else:
            row.status = "BLOCKED"
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


def message_payload(row: DirectMessage) -> dict:
    return {
        "id": row.id, "sender_id": row.sender_id, "receiver_id": row.receiver_id,
        "text": row.text, "type": row.type, "payload": json.loads(row.payload or "{}"),
        "is_read": bool(row.is_read), "created_at": row.created_at.isoformat(),
    }


@router.get("/messages/{other_id}")
async def messages(other_id: int, mark_read: bool = True, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_friend(db, user.id, other_id)
    rows = (await db.scalars(select(DirectMessage).where(or_(and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == other_id), and_(DirectMessage.sender_id == other_id, DirectMessage.receiver_id == user.id))).order_by(DirectMessage.created_at))).all()
    if mark_read:
        for row in rows:
            if row.receiver_id == user.id:
                row.is_read = 1
        await db.commit()
    return [message_payload(row) for row in rows]


@router.post("/messages/{other_id}")
async def send_message(other_id: int, body: DirectMessageIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    other = await db.get(User, other_id)
    if not other: raise HTTPException(404, "Пользователь не найден")
    if other.messages_visibility == "none": raise HTTPException(403, "Пользователь отключил личные сообщения")
    if other.messages_visibility == "friends": await require_friend(db, user.id, other_id)
    row = DirectMessage(sender_id=user.id, receiver_id=other_id, text=body.text.strip())
    db.add(row); await notify(db, other_id, "MESSAGE_RECEIVED", {"from": user.username, "user_id": user.id}); await db.commit(); await db.refresh(row)
    return message_payload(row)


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
    try:
        user_id = int(jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm]).get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError):
        await websocket.close(code=1008); return
    await websocket.accept()
    room_connections.setdefault(room_id, set()).add(websocket)
    try:
        async with SessionLocal() as db:
            room = await db.get(OnlineRoom, room_id)
            if not room or user_id not in {room.creator_id, room.guest_id}:
                await websocket.close(code=1008); return
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
