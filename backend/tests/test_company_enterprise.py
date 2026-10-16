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


def test_enterprise_roles_capabilities_and_license_limit():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            users = [User(id=index, username=name, password_hash="unused", display_name=name.title())
                     for index, name in ((1, "owner"), (2, "mentor"), (3, "candidate"))]
            db.add_all(users)
            db.add(Company(id=1, name="Enterprise", slug="enterprise", created_by=1))
            db.add_all([
                CompanyMembership(id=1, company_id=1, user_id=1, corporate_role="COMPANY_OWNER", status="ACTIVE", joined_at=datetime.now(), verified_at=datetime.now()),
                CompanyMembership(id=2, company_id=1, user_id=2, corporate_role="EMPLOYEE", status="ACTIVE", joined_at=datetime.now(), verified_at=datetime.now()),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    owner = {"Authorization": f"Bearer {create_token(1, 'owner')}"}
    mentor = {"Authorization": f"Bearer {create_token(2, 'mentor')}"}
    try:
        client = TestClient(app)
        access = client.get("/api/company/1/access", headers=owner)
        assert access.status_code == 200
        assert {role["code"] for role in access.json()["roles"]} >= {"MENTOR", "AUDITOR"}
        mentor_profile = next(role for role in access.json()["roles"] if role["code"] == "MENTOR")
        assert mentor_profile["capabilities"]["review_results"] is True
        assert mentor_profile["capabilities"]["manage_assignments"] is False
        assert access.json()["subscription"]["used_seats"] == 2

        changed = client.put("/api/company/1/access/2", headers=owner, json={
            "corporate_role": "MENTOR", "capability_overrides": {},
        })
        assert changed.status_code == 200
        assert changed.json()["effective"]["review_results"] is True
        assert changed.json()["effective"]["manage_assignments"] is False
        assert client.get("/api/company/1/analytics", headers=mentor).status_code == 200
        assert client.get("/api/company/1/assignments/catalog", headers=mentor).status_code == 403

        overridden = client.put("/api/company/1/access/2", headers=owner, json={
            "corporate_role": "MENTOR", "capability_overrides": {"manage_assignments": True},
        })
        assert overridden.status_code == 400
        assert client.get("/api/company/1/assignments/catalog", headers=mentor).status_code == 403
        restricted = client.put("/api/company/1/access/2", headers=owner, json={
            "corporate_role": "MENTOR", "capability_overrides": {"review_results": False},
        })
        assert restricted.status_code == 200
        assert restricted.json()["effective"]["review_results"] is False

        subscription = client.put("/api/company/1/subscription", headers=owner, json={
            "plan_code": "BUSINESS", "status": "ACTIVE", "licensed_seats": 2, "billing_provider": "MANUAL",
        })
        assert subscription.status_code == 200
        assert subscription.json()["available_seats"] == 0
        invitation = client.post("/api/company/1/employees/invite", headers=owner, json={
            "username": "candidate", "job_title": "Специалист", "corporate_role": "EMPLOYEE",
        })
        assert invitation.status_code == 409
        assert "лиценз" in invitation.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
