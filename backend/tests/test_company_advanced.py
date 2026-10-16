import asyncio
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import Company, CompanyMembership
from app.db import Base, get_db
from app.main import app
from app.models import User


def test_archive_consent_and_messenger_are_tenant_scoped():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            users = [User(id=2101, username="advanced-owner", password_hash="unused", display_name="Owner"),
                     User(id=2102, username="advanced-employee", password_hash="unused", display_name="Employee"),
                     User(id=2103, username="advanced-outsider", password_hash="unused", display_name="Outsider")]
            db.add_all(users)
            await db.flush()
            company = Company(id=2101, name="Advanced company", slug="advanced-company", created_by=2101)
            other = Company(id=2102, name="Other company", slug="other-company", created_by=2103)
            db.add_all([company, other])
            await db.flush()
            db.add_all([
                CompanyMembership(id=2101, company_id=2101, user_id=2101, corporate_role="COMPANY_OWNER", status="ACTIVE", is_primary=1, joined_at=datetime.now()),
                CompanyMembership(id=2102, company_id=2101, user_id=2102, corporate_role="EMPLOYEE", status="ACTIVE", is_primary=1, joined_at=datetime.now()),
                CompanyMembership(id=2103, company_id=2102, user_id=2103, corporate_role="COMPANY_OWNER", status="ACTIVE", is_primary=1, joined_at=datetime.now()),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    owner = {"Authorization": f"Bearer {create_token(2101, 'advanced-owner')}"}
    employee = {"Authorization": f"Bearer {create_token(2102, 'advanced-employee')}"}
    outsider = {"Authorization": f"Bearer {create_token(2103, 'advanced-outsider')}"}
    try:
        client = TestClient(app)
        record = client.post("/api/company/2101/archive", headers=owner, json={
            "title": "Private result", "data_scope": "FULL_TRANSCRIPT",
            "payload": {"metrics": {"trust": 80}, "transcript": ["private"], "report": "report"},
        })
        assert record.status_code == 201
        record_id = record.json()["id"]
        assert client.get(f"/api/company/2101/archive/{record_id}", headers=employee).status_code == 403
        assert client.get(f"/api/company/2101/archive/{record_id}", headers=outsider).status_code == 403
        grant = client.post(f"/api/company/2101/archive/{record_id}/grants", headers=owner, json={
            "grantee_membership_id": 2102, "data_scope": "METRICS_ONLY", "purpose": "HR calibration", "duration_days": 2, "confirm_preview": True,
        })
        assert grant.status_code == 201
        visible = client.get(f"/api/company/2101/archive/{record_id}", headers=employee)
        assert visible.status_code == 200 and "transcript" not in visible.json()["data"]
        assert client.get(f"/api/company/2101/archive/{record_id}/consents", headers=employee).status_code == 403
        assert client.post(f"/api/company/2101/archive/{record_id}/grants/{grant.json()['id']}/revoke", headers=owner).status_code == 200
        assert client.get(f"/api/company/2101/archive/{record_id}", headers=employee).status_code == 403

        chat = client.post("/api/company/2101/messenger/chats", headers=owner, json={"kind": "DIRECT", "membership_ids": [2102]})
        assert chat.status_code == 201
        chat_id = chat.json()["id"]
        message = client.post(f"/api/company/2101/messenger/chats/{chat_id}/messages", headers=owner, json={"text": "hello"})
        assert message.status_code == 201
        assert client.get(f"/api/company/2101/messenger/chats/{chat_id}/messages", headers=outsider).status_code == 403
        assert client.post("/api/company/2102/messenger/chats", headers=outsider, json={"kind": "DIRECT", "membership_ids": [2101]}).status_code == 404
        assert client.delete(f"/api/company/2101/messenger/chats/{chat_id}/members/2102", headers=owner).status_code == 200
        assert client.get(f"/api/company/2101/messenger/chats/{chat_id}/messages", headers=employee).status_code == 403

        role = client.post("/api/company/2101/roles", headers=owner, json={
            "code": "reviewer", "title": "Ревьюер", "capabilities": ["view_analytics", "review_results"], "scope": "TEAM",
        })
        assert role.status_code == 201
        assigned = client.post(f"/api/company/2101/roles/{role.json()['id']}/assign?membership_id=2102", headers=owner)
        assert assigned.status_code == 200
        profile = client.get("/api/company/2101/me", headers=employee)
        assert profile.status_code == 200
        assert profile.json()["membership"]["custom_role"]["title"] == "Ревьюер"
        assert profile.json()["privacy"]["personal_arena_data_shared"] is False

        policy = client.put("/api/company/2101/mode-policies/SCENARIOS", headers=owner, json={"enabled": True, "limit_per_member": 1})
        assert policy.status_code == 200
        assert client.post("/api/company/2101/mode-usage/SCENARIOS", headers=owner).status_code == 201
        assert client.post("/api/company/2101/mode-usage/SCENARIOS", headers=owner).status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
