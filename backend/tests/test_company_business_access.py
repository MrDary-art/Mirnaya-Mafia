"""Tenant, hierarchy, consent and one-use invitation regression tests."""
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import Company, CompanyDepartment, CompanyInvitation, CompanyMembership, CompanyCohortMember
from app.db import Base, get_db
from app.main import app
from app.models import User


@pytest.fixture
def business():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([User(id=i, username=f"business-{i}", password_hash="unused", display_name=f"Участник {i}") for i in range(1, 14)])
            await db.flush()
            db.add_all([Company(id=1, name="Компания А", slug="business-a", created_by=1), Company(id=2, name="Компания Б", slug="business-b", created_by=6)])
            await db.flush()
            db.add_all([CompanyDepartment(id=1, company_id=1, name="Корень"), CompanyDepartment(id=20, company_id=2, name="Чужой отдел")])
            await db.flush()
            db.add_all([CompanyDepartment(id=2, company_id=1, name="Продажи", parent_department_id=1, manager_membership_id=3), CompanyDepartment(id=4, company_id=1, name="Поддержка", parent_department_id=1)])
            await db.flush()
            db.add(CompanyDepartment(id=3, company_id=1, name="Команда продаж", parent_department_id=2, manager_membership_id=4))
            await db.flush()
            now = datetime.now()
            for mid, role, department, manager in [(1,"COMPANY_OWNER",1,None),(2,"COMPANY_ADMIN",1,None),(3,"DEPARTMENT_MANAGER",2,None),(4,"TEAM_LEAD",3,3),(5,"EMPLOYEE",3,4),(7,"EMPLOYEE",4,None),(8,"EMPLOYEE",4,3),(9,"EMPLOYEE",None,None),(10,"LND_MANAGER",1,None)]:
                db.add(CompanyMembership(id=mid, company_id=1, user_id=mid, corporate_role=role, department_id=department, manager_membership_id=manager,
                    status="ACTIVE", joined_at=now, verified_at=now))
            db.add(CompanyMembership(id=61, company_id=2, user_id=6, corporate_role="COMPANY_OWNER", department_id=20, status="ACTIVE", joined_at=now, verified_at=now))
            db.add(CompanyMembership(id=101, company_id=2, user_id=1, corporate_role="EMPLOYEE", department_id=20, status="ACTIVE", joined_at=now, verified_at=now))
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    client = TestClient(app)
    headers = {i: {"Authorization": f"Bearer {create_token(i, f'business-{i}')}"} for i in range(1, 14)}
    try:
        yield client, headers, factory
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def test_explicit_company_context_never_falls_back(business):
    client, headers, _ = business
    for invalid in (0, 999):
        assert client.get(f"/api/company/context?company_id={invalid}", headers=headers[1]).status_code == 403
    assert client.get("/api/company/context?company_id=2", headers=headers[3]).status_code == 403
    context = client.get("/api/company/context?company_id=2", headers=headers[1])
    assert context.status_code == 200
    assert context.json()["company"]["id"] == 2
    assert context.json()["permissions"]["scope"] == "SELF"
    assert context.json()["permissions"]["manage_company"] is False
    assert {item["company_id"] for item in context.json()["companies"]} == {1, 2}


def test_hierarchy_scope_includes_descendants_and_reports_without_other_departments(business):
    client, headers, _ = business
    department_rows = client.get("/api/company/1/employees", headers=headers[3])
    assert department_rows.status_code == 200
    assert {row["membership_id"] for row in department_rows.json()} == {3, 4, 5, 8}
    assert {row["membership_id"] for row in client.get("/api/company/1/employees", headers=headers[4]).json()} == {4, 5}
    assert client.get("/api/company/1/employees/7/overview", headers=headers[3]).status_code == 403
    assert client.get("/api/company/2/employees", headers=headers[3]).status_code == 403
    assert client.post("/api/company/1/departments", headers=headers[5], json={"name":"Запрещено"}).status_code == 403


def test_department_cycles_and_foreign_managers_are_rejected_and_links_can_be_cleared(business):
    client, headers, _ = business
    path = "/api/company/1/departments/2"
    assert client.put(path, headers=headers[1], json={"parent_department_id":3}).status_code == 400
    assert client.put(path, headers=headers[1], json={"parent_department_id":20}).status_code == 400
    assert client.put(path, headers=headers[1], json={"manager_membership_id":61}).status_code == 400
    assert client.put(path, headers=headers[1], json={"manager_membership_id":5}).status_code == 400
    assert client.request("DELETE", path, headers=headers[1], json={"move_members_to_department_id":3}).status_code == 400
    cleared = client.put(path, headers=headers[1], json={"parent_department_id":None,"manager_membership_id":None})
    assert cleared.status_code == 200
    assert cleared.json()["parent_department_id"] is None
    assert cleared.json()["manager_membership_id"] is None


def test_manager_and_mentor_tenant_cycles_and_deactivation(business):
    client, headers, _ = business
    path = "/api/company/1/employees/5"
    assert client.put(path, headers=headers[1], json={"manager_membership_id":61}).status_code == 400
    assert client.put(path, headers=headers[1], json={"mentor_membership_id":61}).status_code == 400
    assert client.put(path, headers=headers[1], json={"mentor_membership_id":5}).status_code == 400
    assert client.put("/api/company/1/employees/3", headers=headers[1], json={"manager_membership_id":4}).status_code == 400
    assert client.delete("/api/company/1/employees/4", headers=headers[1]).status_code == 409
    assert client.put(path, headers=headers[1], json={"manager_membership_id":None,"mentor_membership_id":4,"department_id":None}).status_code == 200
    rows = client.get("/api/company/1/employees", headers=headers[1]).json()
    employee = next(row for row in rows if row["membership_id"] == 5)
    assert employee["manager_membership_id"] is None
    assert employee["mentor_membership_id"] == 4
    assert employee["department_id"] is None
    assert client.put(path, headers=headers[5], json={"corporate_role":"COMPANY_OWNER"}).status_code == 403


def test_owner_authority_last_owner_and_invitation_consent(business):
    client, headers, _ = business
    assert client.put("/api/company/1/employees/1", headers=headers[2], json={"corporate_role":"EMPLOYEE"}).status_code == 403
    assert client.put("/api/company/1/employees/1", headers=headers[1], json={"status":"SUSPENDED"}).status_code == 409
    assert client.put("/api/company/1/employees/1", headers=headers[1], json={"corporate_role":"EMPLOYEE"}).status_code == 409
    invite = {"username":"business-11","corporate_role":"COMPANY_OWNER"}
    assert client.post("/api/company/1/employees/invite", headers=headers[2], json=invite).status_code == 403
    assert client.post("/api/company/1/employees/invite", headers=headers[1], json={**invite,"department_id":20}).status_code == 400
    response = client.post("/api/company/1/employees/invite", headers=headers[1], json={**invite,"corporate_role":"EMPLOYEE"})
    assert response.status_code == 200
    member = response.json()["membership_id"]
    invited_rows = client.get("/api/company/1/employees", headers=headers[1]).json()
    invited = next(row for row in invited_rows if row["membership_id"] == member)
    assert invited["username"] == "business-11" and invited["status"] == "INVITED"
    assert client.put(f"/api/company/1/employees/{member}", headers=headers[1], json={"status":"ACTIVE"}).status_code == 409
    assert client.post(f"/api/company/memberships/{member}/accept", headers=headers[12]).status_code == 404
    assert client.post(f"/api/company/memberships/{member}/accept", headers=headers[11]).status_code == 200
    assert client.get("/api/company/context?company_id=1", headers=headers[11]).status_code == 200
    assert client.put(f"/api/company/1/employees/{member}", headers=headers[1], json={"corporate_role":"COMPANY_OWNER"}).status_code == 200
    assert client.put("/api/company/1/employees/5", headers=headers[11], json={"corporate_role":"COMPANY_OWNER"}).status_code == 200
    executives = [row for row in client.get("/api/company/1/employees", headers=headers[11]).json() if row["role"] == "COMPANY_OWNER"]
    assert {row["membership_id"] for row in executives} == {1, 5, member}


def test_csv_preview_and_import_use_the_same_validation(business):
    client, headers, _ = business
    csv = b"username,department,job_title,corporate_role\nbusiness-11,Prod,Sales,EMPLOYEE\nbusiness-12,,Sales,EMPLOYEE\nbusiness-12,,Sales,EMPLOYEE\nbusiness-13,,Owner,COMPANY_OWNER\n"
    files = {"file":("people.csv",csv,"text/csv")}
    preview = client.post("/api/company/1/employees/import-csv/preview", headers=headers[2], files=files)
    assert preview.status_code == 200
    assert [row["status"] for row in preview.json()["rows"]] == ["ERROR","READY","ERROR","ERROR"]
    imported = client.post("/api/company/1/employees/import-csv", headers=headers[2], files=files)
    assert imported.status_code == 200
    assert [row["status"] for row in imported.json()["rows"]] == ["ERROR","INVITED","ERROR","ERROR"]
    assert imported.json()["invited"] == 1
    assert client.get("/api/company/context", headers=headers[12]).json()["has_company"] is False
    assert len(client.get("/api/company/context", headers=headers[12]).json()["pending_invitations"]) == 1


def test_invitation_link_tokens_are_private_one_use_and_account_bound(business):
    client, headers, factory = business
    created = client.post("/api/company/1/invitation-links", headers=headers[1], json={"username":"business-11","department_id":3})
    assert created.status_code == 200, created.json()
    token = created.json()["token"]
    assert created.json()["url"] == f"/business/login?invitation={token}"
    preview = client.get(f"/api/company/invitations/{token}")
    assert preview.status_code == 200
    assert preview.json()["company"] == {"id":1,"name":"Компания А"}
    assert "username" not in preview.text
    assert client.post(f"/api/company/invitations/{token}/accept").status_code == 401
    assert client.post(f"/api/company/invitations/{token}/accept", headers=headers[12]).status_code == 403
    accepted = client.post(f"/api/company/invitations/{token}/accept", headers=headers[11])
    assert accepted.status_code == 200, accepted.json()
    assert accepted.json()["company_id"] == 1
    assert client.post(f"/api/company/invitations/{token}/accept", headers=headers[12]).status_code == 410
    assert client.get(f"/api/company/invitations/{token}").status_code == 410
    listed = client.get("/api/company/1/invitation-links", headers=headers[1])
    assert listed.status_code == 200
    assert token not in listed.text and "token_hash" not in listed.text
    assert listed.json()[0]["status"] == "ACCEPTED"
    assert client.get("/api/company/1/invitation-links", headers=headers[5]).status_code == 403
    async def stored():
        async with factory() as db:
            row = await db.scalar(select(CompanyInvitation))
            return row.token_hash
    assert token not in asyncio.run(stored())
    assert len(asyncio.run(stored())) == 64


def test_invitation_expiry_revocation_and_cross_tenant_link_controls(business):
    client, headers, factory = business
    created = client.post("/api/company/1/invitation-links", headers=headers[1], json={})
    assert created.status_code == 200
    invitation_id, token = created.json()["id"], created.json()["token"]
    assert client.post(f"/api/company/2/invitation-links/{invitation_id}/revoke", headers=headers[6]).status_code == 404
    assert client.post(f"/api/company/1/invitation-links/{invitation_id}/revoke", headers=headers[1]).status_code == 200
    assert client.post(f"/api/company/invitations/{token}/accept", headers=headers[11]).status_code == 410
    assert client.get("/api/company/invitations/not-a-real-token").status_code == 404
    expired = client.post("/api/company/1/invitation-links", headers=headers[1], json={}).json()
    async def expire():
        async with factory() as db:
            row = await db.get(CompanyInvitation, expired["id"])
            row.expires_at = datetime.now() - timedelta(seconds=1)
            await db.commit()
    asyncio.run(expire())
    assert client.get(f"/api/company/invitations/{expired['token']}").status_code == 410
    assert client.post("/api/company/1/invitation-links", headers=headers[2], json={"corporate_role":"COMPANY_OWNER"}).status_code == 403
    assert client.post("/api/company/1/invitation-links", headers=headers[1], json={"department_id":20}).status_code == 400


def test_cohort_scope_metadata_and_foreign_members(business):
    client, headers, _ = business
    own = client.post("/api/company/1/cohorts", headers=headers[4], json={"title":"Своя команда","membership_ids":[4,5],"leader_membership_id":4,"goal":"Практика","focus_skills":["Уточнение"]})
    assert own.status_code == 200, own.json()
    cid = own.json()["id"]
    assert client.post("/api/company/1/cohorts", headers=headers[4], json={"title":"Чужая команда","membership_ids":[7]}).status_code == 403
    assert client.post("/api/company/1/cohorts", headers=headers[1], json={"title":"Чужой tenant","membership_ids":[61]}).status_code == 403
    assert client.put(f"/api/company/1/cohorts/{cid}/members", headers=headers[4], json={"membership_ids":[4,7]}).status_code == 403
    changed = client.put(f"/api/company/1/cohorts/{cid}", headers=headers[4], json={"leader_membership_id":None,"ends_at":"2026-12-01T10:00:00","focus_skills":["Аргументация"]})
    assert changed.status_code == 200
    assert changed.json()["leader_membership_id"] is None
    assert changed.json()["focus_skills"] == ["Аргументация"]
    assert client.put(f"/api/company/1/cohorts/{cid}", headers=headers[4], json={"starts_at":"2027-01-01T10:00:00"}).status_code == 400
    other = client.post("/api/company/1/cohorts", headers=headers[1], json={"title":"Поддержка","membership_ids":[7]})
    assert other.status_code == 200
    assert {row["id"] for row in client.get("/api/company/1/cohorts", headers=headers[4]).json()} == {cid}
    assert client.put(f"/api/company/1/cohorts/{other.json()['id']}", headers=headers[4], json={"goal":"Недоступно"}).status_code == 403
    assert client.get("/api/company/1/cohorts", headers=headers[5]).json()[0]["id"] == cid
    assert client.delete(f"/api/company/1/cohorts/{cid}", headers=headers[4]).status_code == 200
    assert client.get("/api/company/1/cohorts", headers=headers[5]).json() == []


def test_personalization_is_voluntary_and_scoped_to_own_membership(business):
    client, headers, _ = business
    assert client.get("/api/company/context?company_id=1", headers=headers[5]).json()["membership"]["personalization_enabled"] is False
    response = client.put("/api/company/1/personalization", headers=headers[5], json={"enabled":True,"membership_id":7})
    assert response.status_code == 200
    assert response.json() == {"enabled":True}
    assert client.get("/api/company/context?company_id=1", headers=headers[5]).json()["membership"]["personalization_enabled"] is True
    assert client.get("/api/company/context?company_id=1", headers=headers[7]).json()["membership"]["personalization_enabled"] is False
    assert client.put("/api/company/2/personalization", headers=headers[5], json={"enabled":True}).status_code == 403
    assert client.put("/api/company/1/personalization", headers=headers[5], json={"enabled":False}).json() == {"enabled":False}


def test_employee_context_does_not_expose_draft_programs(business):
    client, headers, _ = business
    created = client.post("/api/company/1/programs", headers=headers[1], json={"title":"Private draft program"})
    assert created.status_code == 200
    program_id = created.json()["id"]
    owner_programs = client.get("/api/company/context?company_id=1", headers=headers[1]).json()["programs"]
    assert any(row["id"] == program_id for row in owner_programs)
    for actor in (3, 4, 5):
        context = client.get("/api/company/context?company_id=1", headers=headers[actor])
        assert context.status_code == 200
        assert all(row["id"] != program_id for row in context.json()["programs"])
