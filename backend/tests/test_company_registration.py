import importlib.util
import re
from collections import OrderedDict
from pathlib import Path
import pytest

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, select, text

from app.company_models import Company, CompanySubscription
from app.config import settings
from app import deployment_security
from app.models import User
from .test_installation_security import client, storage


@pytest.fixture(autouse=True)
def isolated_rate_limits(monkeypatch):
    monkeypatch.setattr(deployment_security, "_limits", OrderedDict())


def headers(response):
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["access_token"]}


async def test_inline_registration_saves_name_and_creates_company_atomically(client, storage, monkeypatch):
    from fastapi import HTTPException
    from app.routers import auth
    monkeypatch.setattr(settings, "development_mailbox", True)
    payload = {"username": "inline-owner", "password": "inline-password-2026", "email": "inline@example.test",
        "full_name": "  Иванов   Иван Иванович  ", "registration_kind": "company",
        "company_details": {"name": "  Inline Company  ", "industry": "Образование"}}
    invalid = {**payload, "company_details": {"name": "  "}}
    assert (await client.post("/api/auth/register", json=invalid)).status_code == 422
    registered = await client.post("/api/auth/register", json=payload)
    owner = headers(registered)
    assert (await client.get("/api/auth/me", headers=owner)).json()["display_name"] == "Иванов Иван Иванович"
    cid = registered.json()["company_id"]
    assert cid is not None
    context = (await client.get(f"/api/company/context?company_id={cid}", headers=owner)).json()
    assert context["company"]["name"] == "Inline Company"
    assert context["membership"]["role"] == "COMPANY_OWNER"
    async with storage() as db:
        user = await db.scalar(select(User).where(User.username == "inline-owner"))
        assert (user.display_name, user.last_name, user.first_name, user.middle_name) == (
            "Иванов Иван Иванович", "Иванов", "Иван", "Иванович")
        subscription = await db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == cid))
        assert subscription.licensed_seats == 25
    async def failing_workspace(*args, **kwargs):
        raise HTTPException(409, "Проверка отката")
    monkeypatch.setattr(auth, "create_company_workspace", failing_workspace)
    failed = await client.post("/api/auth/register", json={**payload, "username": "rollback-owner", "email": "rollback@example.test"})
    assert failed.status_code == 409
    async with storage() as db:
        assert await db.scalar(select(User.id).where(User.username == "rollback-owner")) is None


async def test_login_portal_is_destination_not_role_gate(client, storage, monkeypatch):
    monkeypatch.setattr(settings, "development_mailbox", True)
    created = await client.post("/api/auth/register", json={"username": "portal-owner", "password": "test-password",
        "email": "portal-owner@example.test", "registration_kind": "company", "company_details": {"name": "Portal company"}})
    owner = headers(created)
    cid = created.json()["company_id"]
    company = (await client.get(f"/api/company/context?company_id={cid}", headers=owner)).json()["company"]
    headers(await client.post("/api/auth/register", json={"username": "portal-member", "password": "test-password",
        "registration_kind": "participant", "company_code": company["join_code"]}))
    applications = (await client.get(f"/api/company/{cid}/applications", headers=owner)).json()
    assert (await client.post(f"/api/company/{cid}/applications/{applications[0]['id']}/review", headers=owner,
        json={"action": "accept"})).status_code == 200
    headers(await client.post("/api/auth/register", json={"username": "portal-personal", "password": "test-password"}))
    for username, portal, company_id in [
        ("portal-owner", "company", cid), ("portal-owner", "personal", cid),
        ("portal-member", "personal", cid), ("portal-member", "company", cid),
        ("portal-personal", "personal", None), ("portal-personal", "company", None),
    ]:
        response = await client.post("/api/auth/login", json={"username": username, "password": "test-password", "portal": portal})
        assert response.status_code == 200, response.text
        assert response.json()["company_id"] == company_id
    assert (await client.post("/api/auth/login", json={"username": "portal-owner", "password": "wrong", "portal": "personal"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"username": "portal-owner", "password": "test-password"})).status_code == 200


async def test_registration_separates_full_name_nickname_and_login(client, storage):
    registered = await client.post("/api/auth/register", json={
        "full_name": "  Иванов   Иван Иванович  ",
        "username": "public-nickname",
        "login": "private-login",
        "password": "test-password",
    })
    assert registered.status_code == 200, registered.text
    assert registered.json()["username"] == "public-nickname"
    account = (await client.get("/api/auth/me", headers=headers(registered))).json()
    assert account["display_name"] == "Иванов Иван Иванович"
    async with storage() as db:
        user = await db.scalar(select(User).where(User.username == "public-nickname"))
        assert user.login == "private-login"

    signed_in = await client.post("/api/auth/login", json={"username": "private-login", "password": "test-password"})
    assert signed_in.status_code == 200, signed_in.text
    assert signed_in.json()["username"] == "public-nickname"
    assert (await client.post("/api/auth/login", json={
        "username": "public-nickname", "password": "test-password"})).status_code == 401

    nickname_conflict = await client.post("/api/auth/register", json={
        "username": "private-login", "login": "another-login", "password": "test-password"})
    login_conflict = await client.post("/api/auth/register", json={
        "username": "another-nickname", "login": "public-nickname", "password": "test-password"})
    assert nickname_conflict.status_code == 400
    assert login_conflict.status_code == 400

    other = await client.post("/api/auth/register", json={
        "username": "other-nickname", "login": "other-private-login", "password": "test-password"})
    assert other.status_code == 200, other.text
    rename = await client.put("/api/social/profile", headers=headers(registered), json={
        "username": "other-private-login",
        "first_name": "Иван",
        "last_name": "Иванов",
        "profile_visibility": "public",
        "search_visibility": "all",
        "messages_visibility": "friends",
    })
    assert rename.status_code == 400

    legacy = await client.post("/api/auth/register", json={"username": "legacy-identifier", "password": "test-password"})
    assert legacy.status_code == 200, legacy.text
    async with storage() as db:
        user = await db.scalar(select(User).where(User.username == "legacy-identifier"))
        assert user.login == "legacy-identifier"
    assert (await client.post("/api/auth/login", json={
        "username": "legacy-identifier", "password": "test-password"})).status_code == 200


async def test_registration_accepts_separate_name_fields_from_main(client):
    registered = await client.post("/api/auth/register", json={"username": "separate-name", "password": "test-password",
        "last_name": "  Петров  ", "first_name": " Пётр ", "middle_name": " Петрович "})
    me = (await client.get("/api/auth/me", headers=headers(registered))).json()
    assert (me["display_name"], me["last_name"], me["first_name"], me["middle_name"]) == (
        "Петров Пётр Петрович", "Петров", "Пётр", "Петрович")


async def test_three_registration_paths_and_approval(client, storage, monkeypatch):
    monkeypatch.setattr(settings, "development_mailbox", True)
    missing = await client.post("/api/auth/register", json={
        "username": "owner-without-email", "password": "test-password", "registration_kind": "company"})
    assert missing.status_code == 422
    personal = headers(await client.post("/api/auth/register", json={
        "username": "personal-user", "password": "test-password"}))
    assert (await client.get("/api/company/context", headers=personal)).json()["has_company"] is False
    assert (await client.post("/api/company", headers=personal, json={"name": "Missing email"})).status_code == 422
    owner = headers(await client.post("/api/auth/register", json={
        "username": "new-company-owner", "password": "test-password", "email": "owner@example.test",
        "registration_kind": "company"}))
    created = await client.post("/api/company", headers=owner, json={"name": "New Company", "company_size": "500"})
    assert created.status_code == 200, created.text
    company = created.json()
    assert company["company_size"] == "25"
    assert re.fullmatch(r"[A-Z0-9-]{10}", company["join_code"])
    async with storage() as db:
        subscription = await db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company["id"]))
        assert subscription.licensed_seats == 25
        assert await db.scalar(select(User.id).where(User.username == "owner-without-email")) is None
    invalid = await client.post("/api/auth/register", json={"username": "invalid-code-user", "password": "test-password",
        "registration_kind": "participant", "company_code": "WRNG-12345"})
    assert invalid.status_code == 422
    async with storage() as db:
        assert await db.scalar(select(User.id).where(User.username == "invalid-code-user")) is None
    participant = headers(await client.post("/api/auth/register", json={
        "username": "new-participant", "password": "test-password", "registration_kind": "participant",
        "company_code": company["join_code"].lower()}))
    cid = company["id"]
    assert (await client.get(f"/api/company/context?company_id={cid}", headers=participant)).status_code == 403
    assert (await client.get("/api/profile", headers=participant)).status_code == 200
    requests = (await client.get(f"/api/company/{cid}/applications", headers=owner)).json()
    assert len(requests) == 1 and requests[0]["status"] == "PENDING"
    assert (await client.get(f"/api/company/{cid}/applications", headers=participant)).status_code == 403
    assert (await client.get(f"/api/company/context?company_id={cid}", headers=owner)).json()["company"]["join_code"] == company["join_code"]
    search = await client.get("/api/company/search", headers=participant)
    assert company["join_code"] not in search.text
    approved = await client.post(f"/api/company/{cid}/applications/{requests[0]['id']}/review", headers=owner,
        json={"action": "accept"})
    assert approved.status_code == 200, approved.text
    member_context = (await client.get(f"/api/company/context?company_id={cid}", headers=participant)).json()
    assert member_context["membership"]["role"] == "EMPLOYEE"
    assert "join_code" not in member_context["company"]
    changed = await client.put(f"/api/company/{cid}/settings", headers=owner, json={"company_size": "40"})
    assert changed.status_code == 200 and changed.json()["company_size"] == "40"


async def test_archived_company_code_cannot_register_applicant(client, storage):
    async with storage() as db:
        company = Company(name="Archived", slug="archived", created_by=1, status="ARCHIVED")
        db.add(company)
        await db.commit()
        code = company.join_code
    response = await client.post("/api/auth/register", json={"username": "archived-applicant", "password": "test-password",
        "registration_kind": "participant", "company_code": code})
    assert response.status_code == 422


def test_join_code_migration_backfills_existing_companies_and_preserves_rows():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0051_company_join_code.py"
    spec = importlib.util.spec_from_file_location("company_code_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO companies VALUES (1, 'First'), (2, 'Second')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(text("SELECT id, name, join_code FROM companies ORDER BY id")).all()
        assert [r.name for r in rows] == ["First", "Second"]
        assert len({r.join_code for r in rows}) == 2
        assert all(re.fullmatch(r"[A-Z0-9-]{10}", r.join_code) for r in rows)
        assert any(c["column_names"] == ["join_code"] for c in inspect(connection).get_unique_constraints("companies"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()  # Also supports the fresh-install schema created from current models.
        assert connection.execute(text("SELECT join_code FROM companies ORDER BY id")).scalars().all() == [r.join_code for r in rows]
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(text("SELECT count(*) FROM companies")).scalar() == 2
        assert "join_code" not in {c["name"] for c in inspect(connection).get_columns("companies")}
    engine.dispose()


def test_user_login_migration_backfills_legacy_identifiers():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0055_user_login.py"
    spec = importlib.util.spec_from_file_location("user_login_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)"))
        connection.execute(text(
            "INSERT INTO users (id, username, password_hash) VALUES (1, 'first-user', 'hash'), (2, 'second-user', 'hash')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(text("SELECT login FROM users ORDER BY id")).scalars().all() == [
            "first-user", "second-user"]
        login_index = next(index for index in inspect(connection).get_indexes("users") if index["name"] == "ix_users_login")
        assert login_index["column_names"] == ["login"] and login_index["unique"]
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert "login" not in {column["name"] for column in inspect(connection).get_columns("users")}
        assert connection.execute(text("SELECT count(*) FROM users")).scalar() == 2
    engine.dispose()
