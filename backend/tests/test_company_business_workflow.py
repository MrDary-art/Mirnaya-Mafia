"""Business flows run on isolated SQLite and never need an external LLM."""
import asyncio
import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import (Company, CompanyDepartment, CompanyMembership, CompanyProgram,
    CompanyAssignment, CompanyAssignmentTarget, CompanyAssignmentAttempt, CompanySurvey,
    CompanyResultComment, CompanyCertificate, CompanyProgramEnrollment)
from app.company_scenario_engine import default_steps, normalize_steps
from app.company_workflows import evaluate_kpis
from app.db import Base, get_db
from app.main import app
from app.models import User, Session


@pytest.fixture
def business():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([User(id=i, username=f"business-{i}", password_hash="unused", display_name=f"Участник {i}") for i in range(1, 7)])
            await db.flush()
            db.add_all([Company(id=1, name="Учебная компания", slug="business-test", created_by=1, industry="IT"),
                Company(id=2, name="Другая компания", slug="business-other", created_by=6, industry="IT")])
            await db.flush()
            db.add_all([CompanyDepartment(id=1, company_id=1, name="Продажи"),
                CompanyDepartment(id=2, company_id=1, name="Поддержка"), CompanyDepartment(id=3, company_id=2, name="Чужой отдел")])
            await db.flush()
            db.add_all([CompanyMembership(id=1, company_id=1, user_id=1, corporate_role="COMPANY_OWNER", status="ACTIVE"),
                CompanyMembership(id=2, company_id=1, user_id=2, department_id=1, corporate_role="TEAM_LEAD", status="ACTIVE"),
                CompanyMembership(id=3, company_id=1, user_id=3, department_id=1, corporate_role="EMPLOYEE", status="ACTIVE"),
                CompanyMembership(id=4, company_id=1, user_id=4, department_id=2, corporate_role="EMPLOYEE", status="ACTIVE"),
                CompanyMembership(id=5, company_id=1, user_id=5, department_id=2, corporate_role="LND_MANAGER", status="ACTIVE"),
                CompanyMembership(id=6, company_id=2, user_id=6, department_id=3, corporate_role="COMPANY_OWNER", status="ACTIVE")])
            db.add(CompanyProgram(id=20, company_id=2, title="Чужая программа", owner_id=6))
            db.add(CompanyAssignment(id=20, company_id=2, title="Чужое задание", created_by=6, scenario_id="sales_discount_01"))
            await db.commit()
    async def provide_db():
        async with factory() as db:
            yield db
    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    headers = {i: {"Authorization": f"Bearer {create_token(i, f'business-{i}')}"} for i in range(1, 7)}
    try:
        yield TestClient(app), headers, factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        asyncio.run(engine.dispose())


def create_case(client, headers, reviewer_headers):
    response = client.post("/api/company/1/scenarios", headers=headers, json={"title": "Обсуждение условий",
        "employee_role": "Менеджер", "opponent_role": "Клиент", "context": "Клиент просит изменить условия общего проекта",
        "employee_goal": "Согласовать проверяемый следующий шаг"})
    assert response.status_code == 200, response.text
    case_id = response.json()["id"]
    assert client.post(f"/api/company/1/scenarios/{case_id}/status", headers=headers, json={"status": "REVIEW"}).status_code == 200
    assert client.post(f"/api/company/1/scenarios/{case_id}/status", headers=headers, json={"status": "PUBLISHED"}).status_code == 409
    assert client.post(f"/api/company/1/scenarios/{case_id}/status", headers=reviewer_headers, json={"status": "PUBLISHED"}).status_code == 200
    return case_id


def finish_offline(client, headers, assignment_id):
    response = client.post(f"/api/company/1/assignments/{assignment_id}/start", headers=headers)
    assert response.status_code == 200, response.text
    session_id = response.json()["session_id"]
    assert client.post(f"/api/sessions/{session_id}/choice", headers=headers, json={"option_id": "clarify"}).status_code == 200
    finish = client.post(f"/api/sessions/{session_id}/choice", headers=headers, json={"option_id": "criteria"})
    assert finish.status_code == 200 and finish.json()["finished"], finish.text
    return response.json(), finish.json()["report"]


def test_offline_assignment_report_program_unlock_and_certificate(business):
    client, headers, factory = business
    case_id = create_case(client, headers[1], headers[5])
    kpi = client.post("/api/company/1/kpis", headers=headers[1], json={"name": "Сохранить доверие", "rule": "TRUST_MIN", "threshold": 40, "required": True})
    assert kpi.status_code == 200, kpi.text
    ids = []
    for number in (1, 2):
        response = client.post("/api/company/1/assignments", headers=headers[1], json={
            "title": f"Тренировка {number}", "company_scenario_id": case_id, "template_only": True,
            "passing_score": 0, "issue_certificate": True, "kpi_ids": [kpi.json()["id"]]})
        assert response.status_code == 200, response.text
        ids.append(response.json()["id"])
    program = client.post("/api/company/1/programs", headers=headers[1], json={"title": "Первые переговоры"}).json()["id"]
    assert client.put(f"/api/company/1/programs/{program}/steps", headers=headers[1], json={"steps": [{"assignment_id": item, "title": f"Этап {index}"} for index, item in enumerate(ids, 1)]}).status_code == 200
    assert client.post(f"/api/company/1/programs/{program}/status", headers=headers[1], json={"status": "PUBLISHED"}).status_code == 200
    assert client.post(f"/api/company/1/programs/{program}/enroll", headers=headers[1], json={"membership_ids": [3]}).status_code == 200
    launched = client.post(f"/api/company/1/assignments/{ids[0]}/start", headers=headers[3]).json()
    resumed = client.post(f"/api/company/1/assignments/{ids[0]}/start", headers=headers[3]).json()
    assert resumed["resumed"] and resumed["session_id"] == launched["session_id"]
    assert resumed["attempt_id"] == launched["attempt_id"]
    launched_again, canonical = finish_offline(client, headers[3], ids[0])
    assert launched_again["session_id"] == launched["session_id"]
    # The manager sees completion without the employee opening /context.
    analytics = client.get("/api/company/1/analytics", headers=headers[2])
    assert analytics.status_code == 200 and analytics.json()["sample_size"] == 1, analytics.text
    report = client.get(f"/api/company/1/attempts/{launched['attempt_id']}/report", headers=headers[2])
    assert report.status_code == 200, report.text
    assert report.json()["metrics"] == canonical["metrics"]["values"]
    assert report.json()["company_score"] == 100
    assert report.json()["arena_score"] != report.json()["company_score"]
    assert report.json()["kpi_results"][0]["value"] == canonical["metrics"]["values"]["trust"]
    assert "transcript" not in report.json()["report"] and "narrative" not in report.json()["report"]
    assert client.get(f"/api/sessions/{launched['session_id']}/report", headers=headers[2]).status_code == 404
    assignments = client.get("/api/company/1/assignments", headers=headers[3]).json()
    assert {item["id"] for item in assignments} == set(ids)
    assert next(item for item in assignments if item["id"] == ids[0])["attempts_used"] == 1
    finish_offline(client, headers[3], ids[1])
    client.get("/api/company/1/analytics", headers=headers[1])
    enrollments = client.get("/api/company/1/programs/enrolments/me", headers=headers[3]).json()
    assert enrollments[0]["status"] == "COMPLETED"
    certificates = client.get("/api/company/1/certificates", headers=headers[3]).json()
    certificate = next(item for item in certificates if item["title"] == "Первые переговоры")
    assert client.get(f"/api/company/1/certificates/{certificate['id']}/pdf", headers=headers[3]).content.startswith(b"%PDF-")
    client.get("/api/company/1/analytics", headers=headers[1])
    assert len(client.get("/api/company/1/certificates", headers=headers[3]).json()) == 3


def test_foreign_tenant_links_and_unknown_content_are_rejected(business):
    client, headers, _ = business
    for payload in ({"program_id": 20}, {"company_scenario_id": 999}, {"department_ids": [3]}, {"membership_ids": [6]}, {"kpi_ids": [999]}, {"cohort_ids": [999]}, {"scenario_id": "missing"}, {"content_type": "UNIMPLEMENTED"}):
        response = client.post("/api/company/1/assignments", headers=headers[1], json={"title": "Проверка границ", "membership_ids": [3], **payload})
        assert response.status_code in {400, 403, 404}, (payload, response.text)
    for path, payload in (("surveys", {"title": "Вопросы", "questions": ["Как прошло?"], "assignment_id": 20}),
        ("competitions", {"title": "Соревнование", "membership_ids": [2, 3], "assignment_id": 20}),
        ("team-goals", {"title": "Цель отдела", "target_score": 100, "department_id": 3}),
        ("achievements", {"title": "Достижение", "assignment_id": 20})):
        assert client.post(f"/api/company/1/{path}", headers=headers[1], json=payload).status_code in {400, 403, 404}
    assert client.get("/api/company/2/analytics", headers=headers[1]).status_code == 403
    assert client.post("/api/company/1/assignments", headers=headers[2], json={"title": "Чужая команда", "membership_ids": [4]}).status_code == 403


def test_drafts_effects_comments_and_private_sessions_are_protected(business):
    client, headers, factory = business
    case_id = create_case(client, headers[1], headers[5])
    assert client.get("/api/company/1/scenarios", headers=headers[3]).json()[0]["steps"] == []
    draft = client.post("/api/company/1/scenarios", headers=headers[1], json={"title": "Скрытый черновик", "employee_role": "Менеджер", "opponent_role": "Клиент", "context": "Контекст ещё не опубликованной задачи", "employee_goal": "Достичь результата"}).json()["id"]
    assert draft not in {item["id"] for item in client.get("/api/company/1/scenarios", headers=headers[3]).json()}
    assignment = client.post("/api/company/1/assignments", headers=headers[1], json={"title": "Для другого отдела", "company_scenario_id": case_id, "membership_ids": [4], "passing_score": 0}).json()["id"]
    launched, _ = finish_offline(client, headers[4], assignment)
    client.get("/api/company/1/analytics", headers=headers[1])
    aid = launched["attempt_id"]
    assert client.get(f"/api/company/1/attempts/{aid}/comments", headers=headers[2]).status_code == 403
    assert client.post(f"/api/company/1/attempts/{aid}/comments", headers=headers[2], json={"text": "Чужой комментарий"}).status_code == 403
    assert client.get(f"/api/company/1/attempts/{aid}/report", headers=headers[2]).status_code == 403
    assert client.post(f"/api/company/1/attempts/{aid}/comments", headers=headers[1], json={"text": "Хороший следующий шаг"}).status_code == 200
    assert len(client.get(f"/api/company/1/attempts/{aid}/comments", headers=headers[4]).json()) == 1
    async def private():
        async with factory() as db:
            company = await db.get(Company, 1)
            company.settings = json.dumps({"privacy": {"records": "employee_only"}})
            await db.commit()
    asyncio.run(private())
    assert client.get(f"/api/company/1/attempts/{aid}/comments", headers=headers[1]).status_code == 403
    assert client.get(f"/api/company/1/attempts/{aid}/report", headers=headers[1]).status_code == 403
    assert client.get("/api/company/1/analytics/export.csv", headers=headers[1]).status_code == 403
    assert client.get("/api/company/1/ratings", headers=headers[1]).json()["enabled"] is False
    private_analytics = client.get("/api/company/1/analytics", headers=headers[1]).json()
    assert private_analytics["suppressed"] is True and private_analytics["average_score"] is None
    assert private_analytics["practice_groups"] == [] and private_analytics["trend"] == []
    assert client.get(f"/api/company/1/attempts/{aid}/report", headers=headers[4]).status_code == 200


def test_company_pilot_is_validated_persisted_and_limited_to_company_managers(business):
    client, headers, _ = business
    payload = {
        "objective": "CLIENT_NEGOTIATIONS", "target_type": "DEPARTMENT", "department_id": 1,
        "duration_days": 28, "success_metric": "CONFIRMED_COMMITMENTS",
    }
    forbidden = client.put("/api/company/1/pilot", headers=headers[3], json=payload)
    assert forbidden.status_code == 403
    invalid = client.put("/api/company/1/pilot", headers=headers[1], json={**payload, "department_id": 3})
    assert invalid.status_code == 400
    saved = client.put("/api/company/1/pilot", headers=headers[1], json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["objective_label"] == "Сложные переговоры с клиентом"
    assert saved.json()["success_metric_label"] == "Подтверждённые договорённости"
    context = client.get("/api/company/context?company_id=1", headers=headers[1])
    assert context.status_code == 200
    pilot = context.json()["company"]["settings"]["pilot"]
    assert pilot["department_id"] == 1 and pilot["duration_days"] == 28 and pilot["status"] == "ACTIVE"
    overview = client.get("/api/company/1/pilot/overview", headers=headers[1])
    assert overview.status_code == 200, overview.text
    assert overview.json()["scope"]["members"] == 2
    assert overview.json()["episodes"] == {"total": 0, "prepared": 0, "practice_linked": 0, "completed": 0}
    assert overview.json()["next_action"]["kind"] == "EPISODE"
    episode = client.post("/api/company/1/episodes", headers=headers[3], json={
        "title": "Обсудить продление", "preparation": {"facts": "Договор заканчивается в декабре"},
    })
    assert episode.status_code == 201, episode.text
    progressed = client.get("/api/company/1/pilot/overview", headers=headers[1]).json()
    assert progressed["episodes"]["total"] == 1 and progressed["episodes"]["prepared"] == 1
    assert progressed["next_action"]["kind"] == "PRACTICE"
    assert client.get("/api/company/1/pilot/overview", headers=headers[3]).status_code == 403


def test_work_episode_preserves_private_preparation_and_turns_published_actions_into_commitments(business):
    client, headers, _ = business
    practice = client.post("/api/company/1/assignments", headers=headers[1], json={
        "title": "Репетиция сложного разговора", "membership_ids": [3], "passing_score": 0,
    })
    assert practice.status_code == 200, practice.text
    target_id = client.get("/api/company/context?company_id=1", headers=headers[3]).json()["assignments"][0]["target_id"]
    private = client.post("/api/company/1/episodes", headers=headers[3], json={
        "title": "Разговор с клиентом", "expected_result": "Согласовать следующий шаг",
        "practice_target_id": target_id,
        "preparation": {"facts": "Клиент просил скидку", "red_lines": "Не снижать цену без объёма"},
    })
    assert private.status_code == 201, private.text
    private_id = private.json()["id"]
    assert private.json()["practice"]["target_id"] == target_id
    assert client.post(f"/api/company/1/episodes/{private_id}/status", headers=headers[3], json={"status": "COMPLETED"}).status_code == 409
    assert client.post("/api/company/1/episodes", headers=headers[2], json={
        "title": "Чужая практика", "practice_target_id": target_id,
    }).status_code == 422
    assert client.get(f"/api/company/1/episodes/{private_id}", headers=headers[2]).status_code == 403

    shared = client.post("/api/company/1/episodes", headers=headers[2], json={
        "title": "Согласование запуска", "visibility": "TEAM", "participant_ids": [3],
        "preparation": {"facts": "Черновик плана готов", "questions": "Кто подтверждает бюджет?"},
    })
    assert shared.status_code == 201, shared.text
    episode_id = shared.json()["id"]
    manager_view = client.get(f"/api/company/1/episodes/{episode_id}", headers=headers[1])
    assert manager_view.status_code == 200 and manager_view.json()["access"] == "summary"
    assert "preparation" not in manager_view.json()
    participant_view = client.get(f"/api/company/1/episodes/{episode_id}", headers=headers[3])
    assert participant_view.status_code == 200 and participant_view.json()["access"] == "participant"
    assert "preparation" not in participant_view.json()
    participant_arena = client.get("/api/company/1/my-arena", headers=headers[3]).json()
    shared_in_arena = next(item for item in participant_arena["episodes"] if item["id"] == episode_id)
    assert shared_in_arena["access"] == "participant" and "preparation" not in shared_in_arena
    assert client.post(f"/api/company/1/episodes/{episode_id}/status", headers=headers[2], json={"status": "READY"}).status_code == 200

    meeting = client.post("/api/company/1/meetings", headers=headers[2], json={
        "title": "Встреча по запуску", "membership_ids": [3], "episode_id": episode_id, "consent_required": False,
    })
    assert meeting.status_code == 201, meeting.text
    meeting_id = meeting.json()["id"]
    assert meeting.json()["episode_id"] == episode_id
    assert client.get(f"/api/company/1/episodes/{episode_id}", headers=headers[2]).json()["status"] == "IN_MEETING"
    assert client.post(f"/api/company/1/meetings/{meeting_id}/finish", headers=headers[2]).status_code == 200
    assert client.get(f"/api/company/1/episodes/{episode_id}", headers=headers[2]).json()["status"] == "PROTOCOL_REVIEW"
    draft = client.post(f"/api/company/1/meetings/{meeting_id}/analyze", headers=headers[2])
    assert draft.status_code == 200, draft.text
    added = client.post(f"/api/company/1/meetings/{meeting_id}/protocol/items", headers=headers[2], json={
        "title": "Подготовить финальный план", "assignee_membership_id": 3,
        "due_at": "2030-01-15T10:00:00", "acceptance_criteria": "План согласован командой",
    })
    assert added.status_code == 201, added.text
    version = added.json()["version"]
    assert client.post(f"/api/company/1/meetings/{meeting_id}/protocol/approve", headers=headers[2], json={"version": version, "status": "APPROVED"}).status_code == 200
    assert client.post(f"/api/company/1/meetings/{meeting_id}/protocol/approve", headers=headers[3], json={"version": version, "status": "APPROVED"}).status_code == 200
    assert client.post(f"/api/company/1/meetings/{meeting_id}/protocol/publish", headers=headers[2]).status_code == 200
    detail = client.get(f"/api/company/1/episodes/{episode_id}", headers=headers[3]).json()
    commitment = detail["commitments"][0]
    assert commitment["title"] == "Подготовить финальный план" and commitment["status"] == "PENDING"
    assert client.patch(f"/api/company/1/episodes/{episode_id}/commitments/{commitment['id']}", headers=headers[3], json={"status": "COMPLETED"}).status_code == 409
    assert client.patch(f"/api/company/1/episodes/{episode_id}/commitments/{commitment['id']}", headers=headers[3], json={"status": "ACCEPTED"}).status_code == 200
    assert client.patch(f"/api/company/1/episodes/{episode_id}/commitments/{commitment['id']}", headers=headers[3], json={"status": "COMPLETED"}).status_code == 200
    assert client.patch(f"/api/company/1/episodes/{episode_id}/commitments/{commitment['id']}", headers=headers[2], json={"status": "VERIFIED"}).status_code == 200
    assert client.put(f"/api/company/1/episodes/{episode_id}", headers=headers[2], json={
        "retrospective": {"outcome": "План согласован", "next_step": "Проверить статус через неделю"},
    }).status_code == 200
    finished = client.post(f"/api/company/1/episodes/{episode_id}/status", headers=headers[2], json={"status": "COMPLETED"})
    assert finished.status_code == 200, finished.text
    assert finished.json()["retrospective"]["outcome"] == "План согласован"


def test_meeting_requires_purpose_specific_consent_before_processing(business):
    client, headers, _ = business
    meeting = client.post("/api/company/1/meetings", headers=headers[2], json={
        "title": "Разобрать условия запуска", "membership_ids": [3],
        "consent_required": True,
        "consent_purposes": ["TRANSCRIPT_ANALYSIS", "PROTOCOL_SHARING"],
    })
    assert meeting.status_code == 201, meeting.text
    meeting_id = meeting.json()["id"]
    assert {item["id"] for item in meeting.json()["consent_purposes"]} == {"TRANSCRIPT_ANALYSIS", "PROTOCOL_SHARING"}
    assert client.post(f"/api/company/1/meetings/{meeting_id}/finish", headers=headers[2]).status_code == 409
    assert client.post(f"/api/company/1/meetings/{meeting_id}/consent", headers=headers[2], json={
        "accepted": True, "purposes": ["TRANSCRIPT_ANALYSIS"],
    }).json()["consent_status"] == "PENDING"
    assert client.post(f"/api/company/1/meetings/{meeting_id}/consent", headers=headers[2], json={
        "accepted": True, "purposes": ["PROTOCOL_SHARING"],
    }).json()["consent_status"] == "ACCEPTED"
    assert client.post(f"/api/company/1/meetings/{meeting_id}/consent", headers=headers[3], json={
        "accepted": True, "purposes": ["TRANSCRIPT_ANALYSIS"],
    }).json()["consent_status"] == "PENDING"
    assert client.post(f"/api/company/1/meetings/{meeting_id}/consent", headers=headers[3], json={
        "accepted": False, "purposes": ["PROTOCOL_SHARING"],
    }).json()["consent_status"] == "DECLINED"
    assert client.post(f"/api/company/1/meetings/{meeting_id}/finish", headers=headers[2]).status_code == 409
    assert client.post(f"/api/company/1/meetings/{meeting_id}/consent", headers=headers[3], json={
        "accepted": True, "purposes": ["PROTOCOL_SHARING"],
    }).json()["consent_status"] == "ACCEPTED"
    assert client.post(f"/api/company/1/meetings/{meeting_id}/finish", headers=headers[2]).status_code == 200
    assert client.post(f"/api/company/1/meetings/{meeting_id}/analyze", headers=headers[2]).status_code == 200


def test_kpis_are_explainable_and_unknown_rules_have_no_score():
    score, results, passed = evaluate_kpis([{"id": 1, "rule": "TRUST_MIN", "threshold": 70, "weight": 10, "required": True},
        {"id": 2, "rule": "MYSTERY", "threshold": 0, "weight": 10}], {"trust": 60}, 85)
    assert score == 0 and not passed
    assert results[0]["value"] == 60 and results[0]["passed"] is False
    assert results[1]["available"] is False and results[1]["score"] is None


def test_corporate_scenario_graph_must_finish_and_all_steps_are_reachable():
    steps = default_steps("Контекст разговора", "Согласовать условия")
    steps[1]["options"][0]["next"] = "opening"
    with pytest.raises(ValueError, match="цикл"):
        normalize_steps(steps, "", "")
    steps = default_steps("Контекст разговора", "Согласовать условия")
    for option in steps[0]["options"]:
        option["next"] = "end:eval"
    with pytest.raises(ValueError, match="недостижимые"):
        normalize_steps(steps, "", "")


def test_benchmark_requires_consent_and_sufficient_people(business):
    client, headers, _ = business
    result = client.get("/api/company/1/benchmark", headers=headers[1])
    assert result.status_code == 200 and result.json()["industry"]["available"] is False
    assert client.get("/api/company/1/benchmark/me", headers=headers[3]).json()["available"] is False


def test_business_leads_are_persisted_with_consent_and_rate_limits(business):
    from app.business_models import BusinessLead
    client, headers, factory = business
    payload = {"name": "Анна", "company": "Учебная компания", "email": "anna@example.com", "message": "Нужна демонстрация", "consent": True, "website": "", "interest": "demo"}
    assert client.post("/api/business/leads", json={**payload, "consent": False}).status_code == 422
    trap = client.post("/api/business/leads", json={**payload, "website": "https://spam.invalid"})
    assert trap.status_code == 201 and trap.json() == {"ok": True}
    first = client.post("/api/business/leads", json=payload)
    assert first.status_code == 201 and first.json()["ok"], first.text
    for _ in range(2):
        assert client.post("/api/business/leads", json=payload).status_code == 201
    limited = client.post("/api/business/leads", json=payload)
    assert limited.status_code == 429 and limited.headers["retry-after"] == "3600"
    assert client.get("/api/business/leads").status_code == 404
    async def stored():
        async with factory() as db:
            rows = (await db.scalars(select(BusinessLead))).all()
            return [(row.email, row.consent_version, len(row.source_hash), row.status) for row in rows]
    assert asyncio.run(stored()) == [("anna@example.com", "business-lead-v1", 64, "NEW")] * 3


@pytest.mark.parametrize("policy", ["BEST", "LAST", "AVERAGE", "FIRST"])
def test_attempt_policy_changes_effective_result_and_disabled_assignment_cannot_start(business, policy):
    client, headers, factory = business
    case_id = create_case(client, headers[1], headers[5])
    created = client.post("/api/company/1/assignments", headers=headers[1], json={"title": "Повторная практика", "company_scenario_id": case_id, "membership_ids": [3], "passing_score": 0, "attempt_policy": policy})
    assert created.status_code == 200, created.text
    assignment_id = created.json()["id"]
    _, high = finish_offline(client, headers[3], assignment_id)
    client.get("/api/company/1/analytics", headers=headers[1])
    first_score = round(sum(high["metrics"]["values"].values()) / 4)
    response = client.post(f"/api/company/1/assignments/{assignment_id}/start", headers=headers[3])
    if policy == "FIRST":
        assert response.status_code == 409
    else:
        assert response.status_code == 200
        session_id = response.json()["session_id"]
        assert client.post(f"/api/sessions/{session_id}/choice", headers=headers[3], json={"option_id": "yield"}).status_code == 200
        low = client.post(f"/api/sessions/{session_id}/choice", headers=headers[3], json={"option_id": "ultimatum"}).json()["report"]
        second_score = round(sum(low["metrics"]["values"].values()) / 4)
        assert second_score < first_score
        client.get("/api/company/1/analytics", headers=headers[1])
        target = client.get("/api/company/1/assignments", headers=headers[3]).json()[0]
        expected = first_score if policy == "BEST" else second_score if policy == "LAST" else round((first_score + second_score) / 2)
        assert target["best_score"] == expected
    async def archive():
        async with factory() as db:
            assignment = await db.get(CompanyAssignment, assignment_id)
            assignment.status = "ARCHIVED"
            await db.commit()
    asyncio.run(archive())
    assert client.post(f"/api/company/1/assignments/{assignment_id}/start", headers=headers[3]).status_code == 409


def test_private_session_cannot_be_attached_as_a_corporate_result(business):
    client, headers, factory = business
    async def attempt_with_personal_session():
        async with factory() as db:
            assignment = CompanyAssignment(company_id=1, title="Корпоративное задание", created_by=1)
            db.add(assignment)
            await db.flush()
            target = CompanyAssignmentTarget(company_id=1, assignment_id=assignment.id, membership_id=3)
            session = Session(user_id=3, mode="scenario", role="Сотрудник", opponent_role="Клиент", scenario_id="sales_discount_01", status="finished", settings="{}", state="{}", metrics=json.dumps(dict.fromkeys(("trust", "goal", "control", "eq"), 99)))
            db.add_all([target, session])
            await db.flush()
            db.add(CompanyAssignmentAttempt(company_id=1, assignment_id=assignment.id, target_id=target.id, membership_id=3, session_id=session.id))
            await db.commit()
    asyncio.run(attempt_with_personal_session())
    assert client.get("/api/company/1/analytics", headers=headers[1]).json()["sample_size"] == 0


def test_corporate_exam_hints_and_held_reports_cannot_be_bypassed(business):
    client, headers, _ = business
    case_id = create_case(client, headers[1], headers[5])
    created = client.post("/api/company/1/assignments", headers=headers[1], json={"title": "Контрольная практика", "company_scenario_id": case_id,
        "membership_ids": [3], "passing_score": 0, "hints_allowed": False, "ghost_allowed": True, "show_result_immediately": False})
    assignment_id = created.json()["id"]
    launched = client.post(f"/api/company/1/assignments/{assignment_id}/start", headers=headers[3]).json()
    sid, aid = launched["session_id"], launched["attempt_id"]
    current = client.get(f"/api/sessions/{sid}", headers=headers[3]).json()
    assert "corporate_scenario_snapshot" not in current["settings"]
    assert not any("hint" in option for option in current["step"]["options"])
    assert client.post(f"/api/sessions/{sid}/choice", headers=headers[3], json={"option_id": "clarify", "used_hint": True}).status_code == 400
    for method, path in (("post", "coach"), ("get", "mentor"), ("post", "mentor")):
        assert getattr(client, method)(f"/api/sessions/{sid}/{path}", headers=headers[3], **({"json": {}} if method == "post" else {})).status_code == 403
    assert client.post(f"/api/sessions/{sid}/choice", headers=headers[3], json={"option_id": "clarify"}).json()["coach"] is None
    finished = client.post(f"/api/sessions/{sid}/choice", headers=headers[3], json={"option_id": "criteria"}).json()
    assert finished["report"]["report_status"] == "awaiting_release" and finished["metrics"] == {}
    for method, path in (("get", "report"), ("post", "finish"), ("post", "report/retry")):
        result = getattr(client, method)(f"/api/sessions/{sid}/{path}", headers=headers[3]).json()
        assert result["report_status"] == "awaiting_release" and "metrics" not in result
    current = client.get(f"/api/sessions/{sid}", headers=headers[3]).json()
    assert current["metrics"] == {} and current["verdict"] is None
    assert any(row["sender"] == "player" and row["text"] for row in current["messages"])
    assert all(row["analysis"] is None for row in current["messages"])
    assert client.get(f"/api/sessions/{sid}/ideal-dialogue", headers=headers[3]).status_code == 403
    assert client.get("/api/profile", headers=headers[3]).json()["metrics_chart"] == []
    assert client.get("/api/analytics/overview", headers=headers[3]).json()["sessions_total"] == 0
    history = client.get("/api/history", headers=headers[3]).json()
    assert next(row for row in history if row.get("session_id") == sid)["verdict"] is None
    attempts = client.get("/api/company/1/attempts", headers=headers[3]).json()
    assert attempts[0]["score"] is None and attempts[0]["metrics"] == {}
    assert client.get(f"/api/company/1/attempts/{aid}/report", headers=headers[3]).json()["report_status"] == "awaiting_release"
    assert client.get(f"/api/company/1/attempts/{aid}/report", headers=headers[2]).json()["score"] is not None
    assert client.post(f"/api/company/1/assignments/{assignment_id}/release-results", headers=headers[3]).status_code == 403
    assert client.post(f"/api/company/1/assignments/{assignment_id}/release-results", headers=headers[2]).status_code == 200
    assert "metrics" in client.get(f"/api/sessions/{sid}/report", headers=headers[3]).json()
    assert client.get(f"/api/sessions/{sid}/ideal-dialogue", headers=headers[3]).status_code == 200


def test_corporate_ai_assignment_uses_existing_fallback_and_scoring(business, monkeypatch):
    from unittest.mock import AsyncMock
    from app.engine.llm import LlmError
    from app.services import finish_session
    client, headers, factory = business
    unavailable = AsyncMock(side_effect=LlmError("No external credentials in test"))
    monkeypatch.setattr("app.engine.llm.call_with_fallback_detailed", unavailable)
    monkeypatch.setattr("app.engine.practice_plan.call_with_fallback_detailed", unavailable)
    case_id = create_case(client, headers[1], headers[5])
    created = client.post("/api/company/1/assignments", headers=headers[1], json={"title": "Репетиция встречи с клиентом", "description": "Клиент просит ускорить работу по общему проекту", "goal": "Согласовать выполнимый срок следующего этапа", "content_type": "AI_PRACTICE", "company_scenario_id": case_id, "membership_ids": [3], "passing_score": 0})
    assert created.status_code == 200, created.text
    started = client.post(f"/api/company/1/assignments/{created.json()['id']}/start", headers=headers[3])
    assert started.status_code == 200, started.text
    sid = started.json()["session_id"]
    session = client.get(f"/api/sessions/{sid}", headers=headers[3]).json()
    assert session["mode"] == "online" and session["settings"]["corporate"]["company_id"] == 1
    assert client.post(f"/api/sessions/{sid}/choice", headers=headers[3], json={"option_id": "clarify"}).status_code == 400
    response = client.post(f"/api/sessions/{sid}/message", headers=headers[3], json={"text": "Давайте уточним, какой срок важнее и какие ограничения можно изменить"})
    assert response.status_code == 200, response.text
    assert response.json()["session"]["ai_provider"] == "offline"
    assert all(0 <= value <= 100 for value in response.json()["metrics"].values())
    # The report worker invokes the same existing finish_session implementation.
    async def complete_worker():
        async with factory() as db:
            saved = await db.get(Session, sid)
            user = await db.get(User, 3)
            await finish_session(db, saved, user, background_worker=True)
    asyncio.run(complete_worker())
    report = client.get(f"/api/company/1/attempts/{started.json()['attempt_id']}/report", headers=headers[2])
    assert report.status_code == 200 and report.json()["score"] is not None, report.text
    assert report.json()["arena_score"] == round(sum(report.json()["metrics"].values()) / 4)


def test_competition_results_and_team_progress_respect_scope(business):
    client, headers, _ = business
    competition = client.post("/api/company/1/competitions", headers=headers[1], json={"title": "Турнир поддержки", "membership_ids": [1, 4]})
    assert competition.status_code == 200
    cid = competition.json()["id"]
    assert client.get("/api/company/1/competitions", headers=headers[2]).json() == []
    assert client.get(f"/api/company/1/competitions/{cid}/bracket", headers=headers[2]).status_code == 403
    assert client.get(f"/api/company/1/competitions/{cid}/bracket", headers=headers[3]).status_code == 403
    assert client.get(f"/api/company/1/competitions/{cid}/bracket", headers=headers[4]).status_code == 200
    goal = client.post("/api/company/1/team-goals", headers=headers[1], json={"title": "Цель поддержки", "department_id": 2, "target_score": 100})
    assert goal.status_code == 200
    assert client.get("/api/company/1/team-goals", headers=headers[2]).json() == []
    progress = client.get("/api/company/1/team-goals", headers=headers[4]).json()[0]
    assert progress["suppressed"] is True and progress["current_score"] is None


def test_assigned_case_keeps_immutable_snapshot_after_original_is_archived(business):
    client, headers, _ = business
    case_id = create_case(client, headers[1], headers[5])
    created = client.post("/api/company/1/assignments", headers=headers[1], json={"title": "Сохранённая версия", "company_scenario_id": case_id, "membership_ids": [3], "passing_score": 0})
    assert created.status_code == 200
    aid = created.json()["id"]
    assert "scenario_snapshot" not in client.get(f"/api/company/1/assignments/{aid}", headers=headers[3]).json()["snapshot"]
    assert client.post(f"/api/company/1/scenarios/{case_id}/status", headers=headers[1], json={"status": "ARCHIVED"}).status_code == 200
    started, report = finish_offline(client, headers[3], aid)
    assert report["metrics"]["values"]["trust"] > 0
