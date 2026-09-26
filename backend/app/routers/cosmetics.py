"""Shop, collection and custom-avatar HTTP endpoints."""
from __future__ import annotations

import struct
import zlib

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.features.cosmetics import catalog_for_user, equip_cosmetic, equipment
from app.features.progression import purchase
from app.models import User, UserAvatarImage, UserInventory

router = APIRouter(tags=["cosmetics"])


class EquipRequest(BaseModel):
    item_code: str | None = None
    category: str | None = None


def valid_png(content: bytes) -> bool:
    if not content.startswith(b"\x89PNG\r\n\x1a\n"):
        return False
    offset = 8
    chunks = []
    image_data = bytearray()
    while offset + 12 <= len(content):
        size = struct.unpack(">I", content[offset:offset + 4])[0]
        end = offset + 12 + size
        if end > len(content):
            return False
        kind = content[offset + 4:offset + 8]
        body = content[offset + 8:offset + 8 + size]
        checksum = struct.unpack(">I", content[end - 4:end])[0]
        if zlib.crc32(kind + body) != checksum:
            return False
        chunks.append(kind)
        if kind == b"IHDR":
            if len(chunks) != 1 or size != 13:
                return False
            width, height = struct.unpack(">II", body[:8])
            if not (1 <= width <= 1024 and 1 <= height <= 1024):
                return False
        elif kind == b"IDAT":
            image_data.extend(body)
        elif kind == b"IEND":
            break
        offset = end
    if not chunks or chunks[0] != b"IHDR" or chunks[-1] != b"IEND" or offset + 12 != len(content) or not image_data:
        return False
    try:
        decoder = zlib.decompressobj()
        pixels = decoder.decompress(image_data, 9_000_000)
        return decoder.eof and not decoder.unconsumed_tail and bool(pixels)
    except zlib.error:
        return False


@router.get("/shop")
async def shop(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"items": await catalog_for_user(db, user), "stars": user.stars, "equipment": equipment(user),
            "username": user.username, "level": user.level, "user_id": user.id,
            "has_custom_avatar": bool(await db.get(UserAvatarImage, user.id))}


@router.get("/shop/items/{item_code}")
async def shop_item(item_code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = next((entry for entry in await catalog_for_user(db, user) if entry["code"] == item_code), None)
    if not item:
        raise HTTPException(404, "Предмет не найден")
    return item


@router.get("/me/cosmetics")
async def my_cosmetics(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    items = await catalog_for_user(db, user)
    custom_avatar = await db.get(UserAvatarImage, user.id)
    owned_items = [item for item in items if item["owned"]]
    if custom_avatar:
        owned_items.append({"code": "avatar_custom", "name": "Моё фото", "category": "avatar", "category_name": "Аватары",
                            "cost": 0, "rarity": "личный", "owned": True, "equipped": user.avatar_code == "avatar_custom",
                            "is_active": True, "obtained_at": custom_avatar.updated_at.isoformat() if custom_avatar.updated_at else None})
    return {"items": owned_items, "equipment": equipment(user),
            "stars": user.stars, "username": user.username, "level": user.level, "user_id": user.id,
            "has_custom_avatar": bool(custom_avatar)}


@router.post("/shop/items/{item_code}/purchase")
async def purchase_item(item_code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        await db.execute(select(User).where(User.id == user.id).with_for_update())
        item = await purchase(db, user, item_code)
        if item["category"] not in ("avatar", "frame", "theme", "badge", "status"):
            raise ValueError("Предмет не относится к оформлению профиля")
        await db.commit()
    except KeyError as exc:
        await db.rollback()
        raise HTTPException(404, "Предмет не найден") from exc
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(400, str(exc)) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Предмет уже получен") from exc
    except OperationalError as exc:
        await db.rollback()
        raise HTTPException(409, "Покупка не завершена, попробуйте ещё раз") from exc
    return {"success": True, "new_balance": user.stars, "item": {"code": item_code, **item}, "owned": True}


@router.put("/me/cosmetics/equip")
async def equip_item(body: EquipRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        result = await equip_cosmetic(db, user, body.item_code, body.category)
    except KeyError as exc:
        raise HTTPException(404, "Предмет не найден") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await db.commit()
    return result


@router.post("/me/avatar")
async def upload_avatar(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if file.content_type != "image/png":
        raise HTTPException(400, "Загрузите изображение PNG")
    content = await file.read(2_000_001)
    if len(content) > 2_000_000 or len(content) < 33 or not valid_png(content):
        raise HTTPException(400, "Некорректное изображение или размер больше 2 МБ")
    stored = await db.get(UserAvatarImage, user.id)
    if stored:
        stored.content = content
    else:
        db.add(UserAvatarImage(user_id=user.id, content=content))
    if not await db.scalar(select(UserInventory.id).where(UserInventory.user_id == user.id, UserInventory.item_code == "avatar_custom")):
        db.add(UserInventory(user_id=user.id, item_code="avatar_custom", category="avatar"))
    await db.commit()
    return {"avatar_code": "avatar_custom", "user_id": user.id, "equipped": user.avatar_code == "avatar_custom"}


@router.get("/avatars/{user_id}")
async def avatar_image(user_id: int, db: AsyncSession = Depends(get_db)):
    stored = await db.get(UserAvatarImage, user_id)
    if not stored:
        raise HTTPException(404, "Изображение не найдено")
    return Response(stored.content, media_type="image/png", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
