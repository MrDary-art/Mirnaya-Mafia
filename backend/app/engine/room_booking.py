"""Reservation time windows and account limits shared by room entry points."""
import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.engine.room_v2 import utcnow
from app.models import ArenaRoom, Notification, Session

OPEN_STATUSES = ("waiting", "lobby", "active")


def booking_access(room, state, now=None):
    now = now or utcnow()
    scheduled = datetime.fromisoformat(state["scheduled_at"])
    opens = scheduled - timedelta(minutes=15)
    end = scheduled + timedelta(minutes=int(state.get("duel_window_minutes") or state.get("duration_minutes") or 15))
    pending = room.status in ("waiting", "lobby")
    return {"entry_opens_at": opens.isoformat(), "reservation_ends_at": end.isoformat(),
            "entry_available": room.status in OPEN_STATUSES and now >= opens and (not state.get("reservation") or now < end),
            "can_cancel": pending, "awaiting_schedule": pending and now < opens,
            "invite_path": f"/rooms?code={room.code}", "room_path": f"/room/{room.id}"}


async def booking_quota(db, user, exclude_room_id=None):
    rows = (await db.scalars(select(ArenaRoom).where(
        ArenaRoom.status.in_(OPEN_STATUSES),
        (ArenaRoom.host_id == user.id) | (ArenaRoom.guest_id == user.id)))).all()
    now = utcnow()
    current = 0
    for room in rows:
        if room.id == exclude_room_id:
            continue
        state = json.loads(room.state or "{}")
        if room.status == "active" or not state.get("scheduled_at") or datetime.fromisoformat(booking_access(room, state)["reservation_ends_at"]) > now:
            current += 1
    unlimited = user.username in {"demo", "admin"} or bool(user.is_admin)
    return {"active": current, "limit": None if unlimited else 3, "remaining": None if unlimited else max(0, 3-current)}


async def enforce_booking_quota(db, user, exclude_room_id=None):
    quota = await booking_quota(db, user, exclude_room_id)
    if quota["limit"] is not None and quota["active"] >= quota["limit"]:
        raise HTTPException(409, "У вас уже 3 активные записи. Отмените одну или завершите встречу, чтобы записаться снова.")


async def update_booking_notifications(db, room, state):
    """Runs under the room lock; flags and notifications are committed together."""
    access = booking_access(room, state)
    now = utcnow()
    if room.status in ("waiting", "lobby") and state.get("reservation") and now >= datetime.fromisoformat(access["reservation_ends_at"]):
        room.status = "expired"
        state.update(phase="expired", end_reason="not_started")
        for sid in state.get("sessions", {}).values():
            session = await db.get(Session, sid)
            if session and session.status == "active":
                session.status = "stopped"
    if room.status not in OPEN_STATUSES or not access["entry_available"]:
        return
    sent = state.setdefault("entry_notified", [])
    for uid in (room.host_id, room.guest_id):
        if uid and uid not in sent:
            db.add(Notification(user_id=uid, type="ROOM_ENTRY_OPEN", payload=json.dumps({
                "room_id": room.id, "title": state.get("request_text"), "scheduled_at": state["scheduled_at"],
                "path": f"/room/{room.id}", "message": "Вход в лобби открыт. Встреча начнётся в назначенное время."}, ensure_ascii=False)))
            sent.append(uid)
