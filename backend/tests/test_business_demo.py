"""Public demo runs real tasks inside a temporary, strongly scoped company."""
import asyncio
from datetime import datetime, timedelta, timezone
import json

import jwt
from sqlalchemy import select, func

from app.auth import create_token
from app.company_models import Company, CompanyAssignment, CompanyAssignmentAttempt, CompanyMembership, CompanyScenario
from app.company_advanced_models import CompanyCareerTrack, CompanyProfession
from app.company_completion_models import CompanyProductRequest
from app.config import settings
from app.deployment_security import _limits
from app.models import Session, User
from tests.test_company_business_access import business
from app.routers.business_demo import purge_expired_business_demos


def start_demo(client):
    # Keep each isolated database test independent of process-local production throttles.
    for key in list(_limits):
        if key[0].startswith("business-demo-"):
            del _limits[key]
    response = client.post("/api/business/demo")
    assert response.status_code == 201, response.json()
    demo = response.json()
    return demo, {row["role"]:{"Authorization":f"Bearer {row['access_token']}"} for row in demo["roles"]}


def test_demo_starts_with_real_uncompleted_tasks_and_stays_out_of_live_directories(business):
    client, ordinary, factory = business
    demo, headers = start_demo(client)
    company_id = demo["company_id"]
    assert {row["role"] for row in demo["roles"]} == {"owner","hr","manager","employee","employee2"}
    token = demo["roles"][0]["access_token"]
    claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert claims["business_demo_company_id"] == company_id
    assert 0 < claims["exp"] - datetime.now(timezone.utc).timestamp() <= 45*60
    owner = client.get(f"/api/company/context?company_id={company_id}", headers=headers["owner"])
    assert owner.status_code == 200, owner.json()
    assert owner.json()["company"]["status"] == "DEMO"
    assert owner.json()["permissions"]["manage_company"] is True
    assert len(client.get(f"/api/company/{company_id}/departments", headers=headers["owner"]).json()) == 2
    assert len(client.get(f"/api/company/{company_id}/employees", headers=headers["owner"]).json()) == 5
    assert len(client.get(f"/api/company/{company_id}/scenarios", headers=headers["owner"]).json()) == 2
    analytics = client.get(f"/api/company/{company_id}/analytics", headers=headers["owner"])
    assert analytics.status_code == 200
    assert analytics.json()["sample_size"] == 0
    employee = client.get(f"/api/company/context?company_id={company_id}", headers=headers["employee"])
    assert len(employee.json()["assignments"]) == 2
    assert all(item["attempts_used"] == 0 for item in employee.json()["assignments"])
    assert employee.json()["certificates"] == []
    assert client.get("/api/company/search?q=демонстрационная", headers=ordinary[1]).json() == []
    assert client.get("/api/social/people?q=business-demo-", headers=ordinary[1]).json() == []
    assert client.get(f"/api/company/context?company_id={company_id}", headers=ordinary[1]).status_code == 403
    async def no_results():
        async with factory() as db:
            return await db.scalar(select(func.count()).select_from(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id))
    assert asyncio.run(no_results()) == 0


def test_demo_learning_requests_and_profession_catalog_are_usable(business):
    client, _, factory = business
    demo, headers = start_demo(client)
    company_id = demo["company_id"]
    owner = headers["owner"]

    request = client.post(f"/api/company/{company_id}/product-requests", headers=owner, json={
        "request_type": "SCENARIO", "title": "Сложный клиент",
        "description": "Нужен сценарий для отработки претензии постоянного клиента.",
    })
    assert request.status_code == 201, request.text
    listed = client.get(f"/api/company/{company_id}/product-requests", headers=owner)
    assert listed.status_code == 200, listed.text
    assert [row["id"] for row in listed.json()] == [request.json()["id"]]
    reviewed = client.patch(f"/api/company/{company_id}/product-requests/{request.json()['id']}", headers=owner, json={
        "status": "IN_REVIEW", "admin_note": "Проверяем задачу",
    })
    assert reviewed.status_code == 200, reviewed.text

    profession = client.post(f"/api/company/{company_id}/catalog/professions", headers=owner, json={
        "code": "sales", "title": "Продажи", "description": "Работа с клиентами", "catalog_version": "v1",
    })
    competency = client.post(f"/api/company/{company_id}/catalog/competencies", headers=owner, json={
        "code": "discovery", "title": "Выявление потребностей", "description": "Работа с интересами", "catalog_version": "v1",
    })
    assert profession.status_code == 201, profession.text
    assert competency.status_code == 201, competency.text
    specialty = client.post(f"/api/company/{company_id}/catalog/specialties", headers=owner, json={
        "profession_id": profession.json()["id"], "code": "b2b", "title": "B2B-продажи",
    })
    assert specialty.status_code == 201, specialty.text
    linked = client.post(f"/api/company/{company_id}/catalog/professions/{profession.json()['id']}/competencies", headers=owner, json={
        "competency_id": competency.json()["id"], "target_level": 3,
    })
    assert linked.status_code == 200, linked.text
    track = client.post(f"/api/company/{company_id}/career-tracks", headers=owner, json={
        "profession_id": profession.json()["id"], "title": "Рост в B2B", "description": "Путь развития",
    })
    assert track.status_code == 201, track.text
    step = client.post(f"/api/company/{company_id}/career-tracks/{track.json()['id']}/steps", headers=owner, json={
        "title": "Базовый уровень", "level": 1,
        "required_competencies": [competency.json()["id"]], "recommended_program_ids": [],
    })
    assert step.status_code == 201, step.text
    assert client.get(f"/api/company/{company_id}/catalog", headers=owner).status_code == 200
    assert client.get(f"/api/company/{company_id}/catalog/specialties", headers=owner).status_code == 200
    assert client.get(f"/api/company/{company_id}/career-tracks", headers=owner).status_code == 200

    async def purge_and_count():
        async with factory() as db:
            await purge_expired_business_demos(db, datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2))
            return (
                await db.scalar(select(func.count()).select_from(CompanyProductRequest).where(CompanyProductRequest.company_id == company_id)),
                await db.scalar(select(func.count()).select_from(CompanyProfession).where(CompanyProfession.company_id == company_id)),
                await db.scalar(select(func.count()).select_from(CompanyCareerTrack).where(CompanyCareerTrack.company_id == company_id)),
            )

    assert asyncio.run(purge_and_count()) == (0, 0, 0)


def test_demo_can_show_the_full_work_episode_loop(business):
    client, _, _ = business
    demo, headers = start_demo(client)
    company_id = demo["company_id"]
    owner = headers["owner"]
    employee = headers["employee"]
    employee_membership_id = next(row["membership_id"] for row in demo["roles"] if row["role"] == "employee")
    episode = client.post(f"/api/company/{company_id}/episodes", headers=owner, json={
        "title": "Согласовать следующий шаг с клиентом", "expected_result": "Подтверждённый план",
        "visibility": "PARTICIPANTS", "participant_ids": [employee_membership_id],
    })
    assert episode.status_code == 201, episode.text
    episode_id = episode.json()["id"]
    assert client.post(f"/api/company/{company_id}/episodes/{episode_id}/status", headers=owner, json={"status": "READY"}).status_code == 200
    meeting = client.post(f"/api/company/{company_id}/meetings", headers=owner, json={
        "title": "Разбор условий", "episode_id": episode_id, "consent_required": False,
    })
    assert meeting.status_code == 201, meeting.text
    meeting_id = meeting.json()["id"]
    assert client.post(f"/api/company/{company_id}/meetings/{meeting_id}/finish", headers=owner).status_code == 200
    draft = client.post(f"/api/company/{company_id}/meetings/{meeting_id}/analyze", headers=owner)
    assert draft.status_code == 200, draft.text
    action = client.post(f"/api/company/{company_id}/meetings/{meeting_id}/protocol/items", headers=owner, json={
        "title": "Отправить согласованный план", "assignee_membership_id": demo["roles"][0]["membership_id"],
        "acceptance_criteria": "Клиент подтвердил получение",
    })
    assert action.status_code == 201, action.text
    version = action.json()["version"]
    assert client.post(f"/api/company/{company_id}/meetings/{meeting_id}/protocol/approve", headers=owner, json={"version": version, "status": "APPROVED"}).status_code == 200
    assert client.post(f"/api/company/{company_id}/meetings/{meeting_id}/protocol/publish", headers=owner).status_code == 200
    detail = client.get(f"/api/company/{company_id}/episodes/{episode_id}", headers=owner).json()
    commitment = detail["commitments"][0]
    assert client.patch(f"/api/company/{company_id}/episodes/{episode_id}/commitments/{commitment['id']}", headers=owner, json={"status": "ACCEPTED"}).status_code == 200
    assert client.patch(f"/api/company/{company_id}/episodes/{episode_id}/commitments/{commitment['id']}", headers=owner, json={"status": "COMPLETED"}).status_code == 200
    assert client.patch(f"/api/company/{company_id}/episodes/{episode_id}/commitments/{commitment['id']}", headers=owner, json={"status": "VERIFIED"}).status_code == 200
    assert client.put(f"/api/company/{company_id}/episodes/{episode_id}", headers=owner, json={"retrospective": {"outcome": "План отправлен"}}).status_code == 200
    assert client.post(f"/api/company/{company_id}/episodes/{episode_id}/status", headers=owner, json={"status": "COMPLETED"}).status_code == 200

def test_expired_demo_content_is_purged_without_deleting_shared_users(business):
    client, ordinary, factory = business
    demo, _ = start_demo(client)
    async def purge_and_check():
        async with factory() as db:
            count = await purge_expired_business_demos(db, datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2))
            company = await db.get(Company, demo["company_id"])
            scenarios = await db.scalar(select(func.count()).select_from(CompanyScenario).where(CompanyScenario.company_id == company.id))
            members = (await db.scalars(select(CompanyMembership).where(CompanyMembership.company_id == company.id))).all()
            users = [await db.get(User, member.user_id) for member in members]
            return count, company.status, scenarios, [member.status for member in members], users
    count, status, scenarios, member_statuses, users = asyncio.run(purge_and_check())
    assert count == 1 and status == "EXPIRED" and scenarios == 0
    assert set(member_statuses) == {"LEFT"}
    assert all(users)


def test_demo_api_boundary_blocks_private_external_and_other_company_actions(business):
    client, ordinary, factory = business
    demo, headers = start_demo(client)
    owner = headers["owner"]
    company_id = demo["company_id"]
    assert client.get("/api/auth/me", headers=owner).status_code == 200
    for path in ("/api/company/context?company_id=1","/api/company/1/employees","/api/company/search", "/api/social/people", "/api/profile", "/api/history", "/api/sessions", "/api/social/dialogs", "/api/admin/settings",f"/api/company/{company_id}/benchmark"):
        assert client.get(path, headers=owner).status_code == 403, path
    forbidden = [("/api/company", {"name":"Escape company"}),
        (f"/api/company/{company_id}/invitation-links",{}),
        (f"/api/company/{company_id}/employees/invite",{"username":"business-1"}),
        (f"/api/company/{company_id}/online-1x1",{}),
        ("/api/sessions",{"mode":"online"}),
        ("/api/auth/password",{"current":"x","new":"new-password"})]
    for path, body in forbidden:
        assert client.post(path, headers=owner, json=body).status_code == 403, path
    assert client.put(f"/api/company/{company_id}/integrations/webhook", headers=owner, json={"enabled":True,"settings":{"url":"https://example.com"}}).status_code == 403
    assert client.post(f"/api/company/{company_id}/materials/upload", headers=owner, files={"file":("test.txt",b"test","text/plain")}, data={"title":"test"}).status_code == 403
    assert client.get(f"/api/company/{company_id}/employees", headers=headers["employee"]).status_code == 403
    manager = client.get(f"/api/company/{company_id}/employees", headers=headers["manager"])
    assert manager.status_code == 200
    assert {row["membership_id"] for row in manager.json()} == {row["membership_id"] for row in demo["roles"] if row["role"] in {"manager","employee"}}
    async def ai_assignment():
        async with factory() as db:
            row = CompanyAssignment(company_id=company_id, title="Forbidden external AI", content_type="AI_PRACTICE", created_by=demo["roles"][0]["user_id"])
            db.add(row)
            await db.commit()
            return row.id
    ai_id = asyncio.run(ai_assignment())
    assert client.post(f"/api/company/{company_id}/assignments/{ai_id}/start", headers=owner).status_code == 403
    # A signed but unrestricted token for a sandbox user is rejected too.
    demo_user = demo["roles"][0]
    unrestricted = {"Authorization":f"Bearer {create_token(demo_user['user_id'],demo_user['username'])}"}
    assert client.get("/api/auth/me", headers=unrestricted).status_code == 403
    assert client.get("/api/company/context?company_id=1", headers=ordinary[1]).status_code == 200


def test_demo_employee_can_finish_offline_case_and_manager_sees_actual_result(business):
    client, ordinary, factory = business
    demo, headers = start_demo(client)
    company_id = demo["company_id"]
    employee = headers["employee"]
    context = client.get(f"/api/company/context?company_id={company_id}", headers=employee).json()
    assignment = next(item for item in context["assignments"] if "клиентом" in item["title"])
    started = client.post(f"/api/company/{company_id}/assignments/{assignment['id']}/start", headers=employee)
    assert started.status_code == 200, started.json()
    sid = started.json()["session_id"]
    assert client.get(f"/api/sessions/{sid}", headers=headers["employee2"]).status_code == 403
    assert client.post(f"/api/sessions/{sid}/message", headers=employee, json={"text":"External model"}).status_code == 403
    assert client.post(f"/api/sessions/{sid}/coach", headers=employee, json={}).status_code == 403
    session = client.get(f"/api/sessions/{sid}", headers=employee).json()
    for _ in range(6):
        if session.get("status") != "active":
            break
        options = session["step"]["options"]
        assert options
        chosen = client.post(f"/api/sessions/{sid}/choice", headers=employee, json={"option_id":options[0]["id"]})
        assert chosen.status_code == 200, chosen.json()
        session = client.get(f"/api/sessions/{sid}", headers=employee).json()
    report = client.get(f"/api/sessions/{sid}/report", headers=employee)
    assert report.status_code == 200, report.json()
    assert client.get(f"/api/sessions/{sid}/ideal-dialogue", headers=employee).status_code == 200
    assert client.get(f"/api/company/{company_id}/attempts", headers=employee).status_code == 200
    result = client.get(f"/api/company/{company_id}/analytics", headers=headers["manager"])
    assert result.status_code == 200
    assert result.json()["sample_size"] == 1
    assert result.json()["average_score"] is not None
    assert client.get(f"/api/company/{company_id}/certificates", headers=employee).status_code == 200


def test_demo_expiry_and_creation_limit(business):
    client, ordinary, factory = business
    demo, headers = start_demo(client)
    async def expire():
        async with factory() as db:
            company = await db.get(Company, demo["company_id"])
            config = json.loads(company.settings)
            config["_demo"]["expires_at"] = (datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat()
            company.settings = json.dumps(config)
            await db.commit()
    asyncio.run(expire())
    assert client.get("/api/auth/me", headers=headers["owner"]).status_code == 403
    assert client.post("/api/business/demo").status_code == 201
    assert client.post("/api/business/demo").status_code == 201
    limited = client.post("/api/business/demo")
    assert limited.status_code == 429
    assert "Retry-After" in limited.headers
