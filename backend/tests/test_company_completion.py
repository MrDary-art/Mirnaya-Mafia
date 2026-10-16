import asyncio
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token, hash_password
from app.company_models import Company, CompanyMembership
from app.db import Base, get_db
from app.main import app
from app.models import User


def test_corporate_login_professional_profile_and_session_revocation():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner_hash = hash_password("owner-pass")
    employee_hash = hash_password("employee-pass")

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([
                User(id=9101, username="enterprise-owner", password_hash=owner_hash, email="owner@example.test", email_verified_at=datetime.now()),
                User(id=9102, username="enterprise-employee", password_hash=employee_hash, email="employee@example.test", email_verified_at=datetime.now()),
            ])
            await db.flush()
            db.add(Company(id=9101, name="Enterprise", slug="enterprise-completion", created_by=9101))
            await db.flush()
            db.add_all([
                CompanyMembership(id=9101, company_id=9101, user_id=9101, corporate_role="COMPANY_OWNER", status="ACTIVE"),
                CompanyMembership(id=9102, company_id=9101, user_id=9102, corporate_role="EMPLOYEE", status="ACTIVE"),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    owner = {"Authorization": f"Bearer {create_token(9101, 'enterprise-owner', owner_hash)}"}
    try:
        client = TestClient(app)
        identity = client.put("/api/company/9101/corporate-identity", headers=owner, json={
            "organization_code": "ENTERPRISE", "email_domain": "example.test", "require_verified_email": True,
        })
        assert identity.status_code == 200, identity.text
        logged_in = client.post("/api/company/auth/login", json={
            "organization_code": "enterprise", "username": "enterprise-employee", "password": "employee-pass",
        })
        assert logged_in.status_code == 200, logged_in.text
        corporate = {"Authorization": f"Bearer {logged_in.json()['access_token']}"}
        assert client.get("/api/company/9101/me/professional-profile", headers=corporate).status_code == 200

        profession = client.post("/api/company/9101/catalog/professions", headers=owner, json={"code":"sales","title":"Sales"})
        assert profession.status_code == 201, profession.text
        specialty = client.post("/api/company/9101/catalog/specialties", headers=owner, json={
            "profession_id": profession.json()["id"], "code":"b2b", "title":"B2B",
        })
        assert specialty.status_code == 201, specialty.text
        profile = client.put("/api/company/9101/me/professional-profile", headers=corporate, json={
            "profession_id": profession.json()["id"], "specialty_id": specialty.json()["id"],
            "professional_level": 3, "share_results": True,
        })
        assert profile.status_code == 200, profile.text
        assert profile.json()["specialty"]["code"] == "b2b"
        assert profile.json()["level_verified"] is False
        verified = client.post("/api/company/9101/employees/9102/verify-professional-level", headers=owner, json={"professional_level": 3})
        assert verified.status_code == 200, verified.text

        session_id = logged_in.json()["corporate_session_id"]
        assert client.delete(f"/api/company/9101/active-sessions/{session_id}", headers=owner).status_code == 200
        assert client.get("/api/company/9101/me/professional-profile", headers=corporate).status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
        asyncio.run(engine.dispose())
