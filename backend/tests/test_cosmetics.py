import asyncio
import struct
import zlib

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.db import Base, get_db
from app.main import app
from app.models import StarTransaction, User, UserInventory


def test_shop_purchase_equipment_upload_and_public_avatar():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add(User(id=7001, username="cosmetic-test", password_hash="unused", stars=14))
            db.add_all([
                UserInventory(user_id=7001, item_code="avatar_analyst", category="avatar"),
                UserInventory(user_id=7001, item_code="frame_classic", category="frame"),
                UserInventory(user_id=7001, item_code="theme_arena", category="theme"),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    headers = {"Authorization": f"Bearer {create_token(7001, 'cosmetic-test')}"}
    try:
        client = TestClient(app)
        assert client.get("/api/shop").status_code == 401
        catalog = client.get("/api/shop", headers=headers)
        assert catalog.status_code == 200
        assert len(catalog.json()["items"]) >= 34
        assert catalog.json()["equipment"]["avatar_code"] == "avatar_analyst"
        assert next(item for item in catalog.json()["items"] if item["code"] == "frame_gold")["state"] == "LOCKED_BY_ACHIEVEMENT"

        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": "frame_neon", "category": "frame"}).status_code == 400
        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": "avatar_analyst", "category": "frame"}).status_code == 400
        assert client.post("/api/shop/items/frame_gold/purchase", headers=headers).status_code == 400
        assert client.post("/api/shop/items/frame_neon/purchase", headers=headers).status_code == 200
        assert client.post("/api/shop/items/frame_neon/purchase", headers=headers).status_code == 400
        assert client.get("/api/shop", headers=headers).json()["stars"] == 2
        assert client.post("/api/shop/items/status_online/purchase", headers=headers).status_code == 200
        assert client.get("/api/shop", headers=headers).json()["stars"] == 0
        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": "frame_neon", "category": "frame"}).json()["frame_code"] == "frame_neon"
        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": "status_online", "category": "status"}).json()["status_code"] == "status_online"
        assert client.get("/api/profile", headers=headers).json()["cosmetics"]["status_code"] == "status_online"
        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": None, "category": "status"}).json()["status_code"] is None
        assert client.post("/api/shop/items/badge_spark/purchase", headers=headers).status_code == 400

        async def count_purchases():
            async with factory() as db:
                return await db.scalar(select(func.count()).select_from(StarTransaction).where(StarTransaction.user_id == 7001, StarTransaction.type == "PURCHASE"))

        assert asyncio.run(count_purchases()) == 2

        def chunk(kind, body):
            return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

        png = (b"\x89PNG\r\n\x1a\n"
               + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
               + chunk(b"IDAT", zlib.compress(b"\x00\xff\x80\x40\xff"))
               + chunk(b"IEND", b""))
        upload = client.post("/api/me/avatar", headers=headers, files={"file": ("avatar.png", png, "image/png")})
        assert upload.status_code == 200
        assert client.get("/api/avatars/7001").content == png
        assert client.get("/api/profile", headers=headers).json()["cosmetics"]["avatar_code"] == "avatar_analyst"
        assert client.get("/api/me/cosmetics", headers=headers).json()["has_custom_avatar"] is True
        assert any(item["code"] == "avatar_custom" for item in client.get("/api/me/cosmetics", headers=headers).json()["items"])
        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": "avatar_custom", "category": "frame"}).status_code == 400
        assert client.put("/api/me/cosmetics/equip", headers=headers, json={"item_code": "avatar_custom", "category": "avatar"}).json()["avatar_code"] == "avatar_custom"
        assert client.get("/api/profile", headers=headers).json()["cosmetics"]["avatar_code"] == "avatar_custom"
        assert client.post("/api/me/avatar", headers=headers, files={"file": ("bad.png", b"bad", "image/png")}).status_code == 400
        corrupt_png = png[:-8] + b"bad" + png[-5:]
        assert client.post("/api/me/avatar", headers=headers, files={"file": ("bad.png", corrupt_png, "image/png")}).status_code == 400
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
