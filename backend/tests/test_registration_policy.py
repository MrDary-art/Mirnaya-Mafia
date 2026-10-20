import json

import pytest
from sqlalchemy import select, func

from app.auth import create_token, hash_password
from app.company_models import Company, CompanyMembership
from app.council_models import CouncilModerator
from app.deployment_models import InstallationConfig, AdminAudit
from app.models import User
from app import deployment_security
from .test_installation_security import client, storage, admin_token


@pytest.fixture(autouse=True)
def clear_limits():
    deployment_security._limits.clear()
    yield
    deployment_security._limits.clear()


async def toggle(client, headers, enabled):
    current = await client.get("/api/admin/registration", headers=headers)
    assert current.status_code == 200
    response = await client.put("/api/admin/registration", headers=headers,
        json={"enabled": enabled, "revision": current.json()["revision"]})
    assert response.status_code == 200, response.text
    return response.json()


async def test_existing_installations_start_open_without_exposing_settings(client, storage):
    status = await client.get("/api/auth/registration")
    assert status.headers["cache-control"] == "no-store"
    assert status.json() == {"enabled": True, "message": ""}
    response = await client.post("/api/auth/register", json={"username": "new-person", "password": "demo-password"})
    assert response.status_code == 200, response.text
    async with storage() as db:
        assert await db.scalar(select(User.id).where(User.username == "new-person"))


async def test_closed_registration_is_persistent_and_existing_logins_work(client, storage):
    headers = await admin_token(storage)
    registered = await client.post("/api/auth/register", json={"username": "existing-demo", "password": "demo-password"})
    assert registered.status_code == 200
    await toggle(client, headers, False)
    async with storage() as db:
        row = await db.get(InstallationConfig, 1)
        assert json.loads(row.value)["registration_enabled"] is False
        before = await db.scalar(select(func.count()).select_from(User))
        assert await db.scalar(select(AdminAudit.id).where(AdminAudit.action == "admin.registration.disabled"))
    public = (await client.get("/api/auth/registration")).json()
    assert public["enabled"] is False and "существующий аккаунт" in public["message"]
    for kind in ("personal", "company", "participant"):
        response = await client.post("/api/auth/register", json={"username": "blocked-" + kind,
            "password": "demo-password", "registration_kind": kind,
            "full_name": "Иван Петров", "email": "person@example.test", "company_code": "ABCD-EFGHJ"})
        assert response.status_code == 403, response.text
    for username, password in (("admin", "secure-password-for-tests"), ("existing-demo", "demo-password")):
        login = await client.post("/api/auth/login", json={"username": username, "password": password})
        assert login.status_code == 200, login.text
    async with storage() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == before


async def test_only_site_admin_can_read_or_change_policy(client, storage):
    assert (await client.get("/api/admin/registration")).status_code == 401
    assert (await client.put("/api/admin/registration", json={"enabled": False, "revision": 1})).status_code == 401
    headers = {"Authorization": "Bearer " + create_token(1, "alice")}
    async with storage() as db:
        db.add(CouncilModerator(user_id=1, appointed_by=1))
        await db.commit()
    assert (await client.get("/api/admin/registration", headers=headers)).status_code == 403
    assert (await client.put("/api/admin/registration", headers=headers, json={"enabled": False, "revision": 1})).status_code == 403
    assert (await client.get("/api/auth/registration")).json()["enabled"] is True


async def test_reopening_conflicts_and_strict_boolean(client, storage):
    headers = await admin_token(storage)
    closed = await toggle(client, headers, False)
    stale = await client.put("/api/admin/registration", headers=headers, json={"enabled": True, "revision": closed["revision"] - 1})
    assert stale.status_code == 409
    invalid = await client.put("/api/admin/registration", headers=headers, json={"enabled": "false", "revision": closed["revision"]})
    assert invalid.status_code == 422
    assert (await client.get("/api/auth/registration")).json()["enabled"] is False
    await toggle(client, headers, True)
    response = await client.post("/api/auth/register", json={"username": "reopened-person", "password": "demo-password"})
    assert response.status_code == 200, response.text


async def test_public_business_demo_cannot_bypass_registration_gate(client, storage):
    headers = await admin_token(storage)
    await toggle(client, headers, False)
    async with storage() as db:
        before = await db.scalar(select(func.count()).select_from(User))
    response = await client.post("/api/business/demo")
    assert response.status_code == 403
    async with storage() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == before


async def test_company_sso_cannot_create_new_user_but_can_map_existing_one(client, storage):
    headers = await admin_token(storage)
    async with storage() as db:
        db.add(User(id=3, username="existing@example.test", password_hash=hash_password("demo-password")))
        db.add(Company(id=701, name="Company", slug="policy-company", created_by=1))
        await db.flush()
        db.add(CompanyMembership(company_id=701, user_id=1, corporate_role="COMPANY_OWNER", status="ACTIVE"))
        await db.commit()
    await toggle(client, headers, False)
    owner = {"Authorization": "Bearer " + create_token(1, "alice")}
    body = {"provider": "oidc", "subject": "new-member", "email": "new@example.test", "display_name": "Новый сотрудник"}
    blocked = await client.post("/api/company/701/sso/provision", headers=owner, json=body)
    assert blocked.status_code == 403, blocked.text
    body.update(subject="existing-member", email="existing@example.test")
    existing = await client.post("/api/company/701/sso/provision", headers=owner, json=body)
    assert existing.status_code == 201 and existing.json()["created_user"] is False, existing.text
