"""Authenticated one-process WebSocket hub for paired rooms.

The bearer token is sent as the second WebSocket subprotocol, so it never
appears in an URL or reverse-proxy access log.
"""

from __future__ import annotations

import json
from collections import defaultdict

from fastapi import WebSocket

import jwt

from app.config import settings
from app.db import SessionLocal
from app.models import ArenaRoom, User

connections: dict[int, dict[int, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))


async def authenticate_room_socket(websocket: WebSocket, room_id: int) -> tuple[User, ArenaRoom] | None:
    origin = websocket.headers.get("origin")
    allowed = settings.room_allowed_origin_list
    if origin and allowed and origin not in allowed:
        await websocket.close(code=4403, reason="origin_not_allowed")
        return None
    protocols = [part.strip() for part in websocket.headers.get("sec-websocket-protocol", "").split(",")]
    if len(protocols) < 2 or protocols[0] != "arena-room":
        await websocket.close(code=4401, reason="missing_credentials")
        return None
    try:
        payload = jwt.decode(protocols[1], settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
    except Exception:
        await websocket.close(code=4401, reason="invalid_credentials")
        return None
    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        room = await db.get(ArenaRoom, room_id)
        if not user or not room or user_id not in {room.host_id, room.guest_id}:
            await websocket.close(code=4404, reason="room_not_found")
            return None
        await websocket.accept(subprotocol="arena-room")
        return user, room


async def connect(room_id: int, user_id: int, websocket: WebSocket) -> None:
    connections[room_id][user_id].add(websocket)


def disconnect(room_id: int, user_id: int, websocket: WebSocket) -> None:
    connections[room_id][user_id].discard(websocket)
    if not connections[room_id][user_id]:
        connections[room_id].pop(user_id, None)
    if not connections[room_id]:
        connections.pop(room_id, None)


async def broadcast(room_id: int, event: dict, *, exclude_user: int | None = None) -> None:
    encoded = json.dumps(event, ensure_ascii=False)
    stale: list[tuple[int, WebSocket]] = []
    for user_id, sockets in list(connections.get(room_id, {}).items()):
        if user_id == exclude_user:
            continue
        for socket in list(sockets):
            try:
                await socket.send_text(encoded)
            except Exception:
                stale.append((user_id, socket))
    for user_id, socket in stale:
        disconnect(room_id, user_id, socket)
