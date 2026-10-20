import asyncio
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token, hash_password
from app.business_models import BusinessLead
from app.db import Base, get_db
from app.main import app
from app.models import User


def test_admin_can_filter_and_process_business_leads():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    admin = User(id=90, username="crm-admin", password_hash=hash_password("crm-test-password"), display_name="CRM", is_admin=1)
    member = User(id=91, username="crm-member", password_hash="unused", display_name="Member", is_admin=0)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add(admin)
            db.add(member)
            db.add(BusinessLead(name="Анна", company="Альфа", email="anna@example.test", message="Демо",
                interest="demo", consent_version="v1", consented_at=datetime.now(), source_hash="source",
                email_hash="email", status="NEW"))
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    try:
        client = TestClient(app)
        created = client.post("/api/business/leads", json={
            "name": "Анна", "company": "Бета", "email": "beta@example.test",
            "message": "Демо с сайта", "consent": True, "website": "https://company.example",
        })
        assert created.status_code == 201
        created_id = created.json()["id"]
        assert client.get("/api/admin/business/leads").status_code == 401
        assert client.get("/api/admin/business/leads", headers={
            "Authorization": f"Bearer {create_token(member.id, member.username)}",
        }).status_code == 403
        client.headers["Authorization"] = f"Bearer {create_token(admin.id, admin.username, admin.password_hash)}"
        listed = client.get("/api/admin/business/leads?q=Бета")
        assert listed.status_code == 200
        assert listed.json()["total"] == 1
        lead_id = listed.json()["items"][0]["id"]
        assert lead_id == created_id
        assert listed.json()["items"][0]["message"] == "Демо с сайта"
        updated = client.put(f"/api/admin/business/leads/{lead_id}", json={
            "status": "CONTACTED", "internal_note": "Созвон назначен", "assign_to_me": True,
        })
        assert updated.status_code == 200
        assert updated.json()["status"] == "CONTACTED"
        assert updated.json()["assignee_id"] == admin.id
        assert client.get("/api/business/leads").status_code == 404
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
