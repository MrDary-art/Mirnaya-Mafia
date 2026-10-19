"""Preparation plans must reuse normal corporate assignments without an LLM."""
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_episode_models import CompanyWorkEpisode
from app.company_meeting_models import CompanyMeeting, CompanyMeetingParticipant
from app.company_models import Company, CompanyAssignment, CompanyAssignmentTarget, CompanyMembership
from app.db import Base, get_db
from app.main import app
from app.models import User


def test_ai_recommendation_only_refines_safe_preparation_copy(monkeypatch):
    import app.company_preparation as preparation

    async def recommend(*_args, **_kwargs):
        return ('{"scenario_title":"Проверить условия клиента",'
                '"practice_description":"Отрепетируйте аргументы о сроках и марже.",'
                '"meeting_title":"Репетиция позиции команды"}', "test-ai")

    monkeypatch.setattr(preparation, "_ai_available", lambda: True)
    monkeypatch.setattr(preparation, "call_with_fallback_detailed", recommend)
    plan = asyncio.run(preparation.recommend_preparation_plan(
        title="Защита условий", brief="Клиент просит скидку.", expected_result="Сохранить маржу.",
        situation_type="NEGOTIATION", scheduled_at=None, test_call_enabled=True,
        test_call_at=None, test_call_duration=30,
    ))
    assert plan["generated_by"] == "ai_recommendation"
    assert plan["provider"] == "test-ai"
    assert plan["items"][0]["title"] == "Проверить условия клиента"
    assert plan["items"][0]["scenario_id"] == "sales_discount_01"
    assert plan["items"][1]["description"] == "Отрепетируйте аргументы о сроках и марже."
    assert plan["meeting"]["title"] == "Репетиция позиции команды"


@pytest.fixture
def preparation_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([
                User(id=601, username="plan-owner", password_hash="unused", display_name="Руководитель"),
                User(id=602, username="plan-member", password_hash="unused", display_name="Сотрудник"),
                User(id=603, username="plan-late-member", password_hash="unused", display_name="Новый сотрудник"),
            ])
            db.add(Company(id=601, name="Компания подготовки", slug="preparation-plan", created_by=601, industry="IT"))
            db.add_all([
                CompanyMembership(id=601, company_id=601, user_id=601, corporate_role="COMPANY_OWNER", status="ACTIVE"),
                CompanyMembership(id=602, company_id=601, user_id=602, manager_membership_id=601,
                                  corporate_role="EMPLOYEE", status="ACTIVE"),
                CompanyMembership(id=603, company_id=601, user_id=603, manager_membership_id=601,
                                  corporate_role="EMPLOYEE", status="ACTIVE"),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    headers = {
        "owner": {"Authorization": f"Bearer {create_token(601, 'plan-owner')}"},
        "member": {"Authorization": f"Bearer {create_token(602, 'plan-member')}"},
        "late_member": {"Authorization": f"Bearer {create_token(603, 'plan-late-member')}"},
    }
    try:
        yield TestClient(app), headers, factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        asyncio.run(engine.dispose())


def test_preparation_plan_launches_assignments_and_auto_completes(preparation_client):
    client, headers, factory = preparation_client
    event_at = (datetime.now() + timedelta(days=4)).replace(microsecond=0)
    call_at = (datetime.now() + timedelta(days=2)).replace(microsecond=0)
    body = {
        "title": "Защита условий с клиентом",
        "brief": "Клиент просит скидку, но важно сохранить маржу и срок запуска.",
        "expected_result": "Согласовать приемлемые условия и следующий шаг.",
        "situation_type": "NEGOTIATION",
        "scheduled_at": event_at.isoformat(),
        "participant_ids": [602],
        "create_preparation_plan": True,
        "test_call_enabled": True,
        "test_call_at": call_at.isoformat(),
        "test_call_duration": 30,
    }

    preview = client.post("/api/company/601/episodes/plan-preview", headers=headers["owner"], json=body)
    assert preview.status_code == 200, preview.text
    assert preview.json()["participant_count"] == 2
    assert [item["kind"] for item in preview.json()["plan"]["items"]] == ["SCENARIO", "AI_PRACTICE"]
    assert preview.json()["plan"]["meeting"]["kind"] == "PREPARATION_CALL"

    created = client.post("/api/company/601/episodes", headers=headers["owner"], json=body)
    assert created.status_code == 201, created.text
    episode = created.json()
    assert episode["source_type"] == "PREPARATION_PLAN"
    assert episode["status"] == "ACTIVE"
    assert episode["brief"] == body["brief"]
    assert episode["progress"]["required"] == 4
    assert len(episode["plan"]["items"]) == 2

    employee_assignments = client.get("/api/company/601/assignments", headers=headers["member"])
    assert employee_assignments.status_code == 200, employee_assignments.text
    assert len(employee_assignments.json()) == 2
    assert all(item["episode_id"] == episode["id"] for item in employee_assignments.json())
    assert all(item["source_type"] == "PREPARATION_PLAN" for item in employee_assignments.json())
    # The assignment is actionable on its own: it retains both the planned
    # exercise copy and the business brief that it was generated for.
    assert all(body["brief"] in item["description"] for item in employee_assignments.json())
    assert len({item["description"] for item in employee_assignments.json()}) == 2
    calendar = client.get("/api/company/601/calendar", headers=headers["member"])
    assert calendar.status_code == 200, calendar.text
    assert {item["category"] for item in calendar.json()} >= {"PRACTICE", "MEETING"}

    # The compact "+" control in the situation view is not cosmetic: a
    # teammate added after launch receives the same two assignments and the
    # existing test call without creating a duplicate preparation plan.
    added = client.post(f"/api/company/601/episodes/{episode['id']}/participants", headers=headers["owner"], json={
        "membership_id": 603,
    })
    assert added.status_code == 201, added.text
    assert added.json()["participant_count"] == 3
    late_assignments = client.get("/api/company/601/assignments", headers=headers["late_member"])
    assert late_assignments.status_code == 200, late_assignments.text
    assert {item["episode_id"] for item in late_assignments.json()} == {episode["id"]}
    assert len(late_assignments.json()) == 2
    late_calendar = client.get("/api/company/601/calendar", headers=headers["late_member"])
    assert {item["category"] for item in late_calendar.json()} >= {"PRACTICE", "MEETING"}

    # A preparation call adds everyone automatically. It can produce a draft
    # report without asking participants to confirm anything first.
    meeting_id = episode["plan"]["meeting"]["meeting_id"]
    finished = client.post(f"/api/company/601/meetings/{meeting_id}/finish", headers=headers["owner"])
    assert finished.status_code == 200, finished.text
    segment = client.post(f"/api/company/601/meetings/{meeting_id}/transcript", headers=headers["owner"], json={
        "speaker_membership_id": 601,
        "text": "Команда согласовала рамку разговора с клиентом и ограничения по срокам.",
    })
    assert segment.status_code == 201, segment.text
    report = client.post(f"/api/company/601/meetings/{meeting_id}/analyze", headers=headers["owner"])
    assert report.status_code == 200, report.text
    assert report.json()["status"] == "REVIEW"
    assert report.json()["summary"]

    # The generated report is private until the working-situation creator
    # confirms it. Invited employees neither approve it nor see the draft.
    employee_detail = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["member"])
    assert employee_detail.status_code == 200, employee_detail.text
    assert employee_detail.json()["report_status"] == "AWAITING_REVIEW"
    assert "report" not in employee_detail.json()
    assert client.get(f"/api/company/601/meetings/{meeting_id}/transcript", headers=headers["member"]).status_code == 403
    assert client.post(f"/api/company/601/meetings/{meeting_id}/protocol/publish", headers=headers["member"]).status_code == 403

    delivered = client.post(f"/api/company/601/meetings/{meeting_id}/protocol/publish", headers=headers["owner"])
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["status"] == "PUBLISHED"
    employee_after_delivery = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["member"])
    assert employee_after_delivery.status_code == 200, employee_after_delivery.text
    assert employee_after_delivery.json()["report"]["status"] == "PUBLISHED"

    async def inspect_then_complete():
        async with factory() as db:
            assignments = (await db.scalars(select(CompanyAssignment).where(
                CompanyAssignment.episode_id == episode["id"]
            ))).all()
            assert len(assignments) == 2
            targets = (await db.scalars(select(CompanyAssignmentTarget).where(
                CompanyAssignmentTarget.assignment_id.in_([assignment.id for assignment in assignments])
            ))).all()
            assert len(targets) == 6
            meeting = await db.scalar(select(CompanyMeeting).where(CompanyMeeting.episode_id == episode["id"]))
            assert meeting is not None and meeting.kind == "PREPARATION_CALL"
            participants = (await db.scalars(select(CompanyMeetingParticipant).where(
                CompanyMeetingParticipant.meeting_id == meeting.id
            ))).all()
            assert {row.invite_status for row in participants} == {"ACCEPTED"}
            assert {row.consent_status for row in participants} == {"PENDING"}
            for target in targets:
                target.status = "PASSED"
            await db.commit()

    asyncio.run(inspect_then_complete())
    completed = client.get(f"/api/company/601/episodes/{episode['id']}", headers=headers["owner"])
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "COMPLETED"
    assert completed.json()["completion_reason"] == "ALL_PREPARATION_COMPLETE"
    assert completed.json()["progress"]["percent"] == 100


def test_direct_assignment_remains_independent_of_working_situations(preparation_client):
    client, headers, _ = preparation_client
    created = client.post("/api/company/601/assignments", headers=headers["owner"], json={
        "title": "Точечная практика",
        "description": "Отдельная репетиция для сотрудника.",
        "scenario_id": "sales_discount_01",
        "membership_ids": [602],
    })
    assert created.status_code == 200, created.text
    assignments = client.get("/api/company/601/assignments", headers=headers["member"])
    assert assignments.status_code == 200, assignments.text
    item = assignments.json()[0]
    assert item["episode_id"] is None
    assert item["source_type"] == "MANUAL"


def test_owner_removes_participant_from_work_situation(preparation_client):
    client, headers, factory = preparation_client
    created = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Подготовка к встрече",
        "brief": "Команде нужно согласовать позицию перед встречей с клиентом.",
        "expected_result": "Единый план разговора.",
        "participant_ids": [602],
        "create_preparation_plan": True,
        "test_call_enabled": True,
        "test_call_at": (datetime.now() + timedelta(days=1)).replace(microsecond=0).isoformat(),
    })
    assert created.status_code == 201, created.text
    episode = created.json()

    removed = client.delete(f"/api/company/601/episodes/{episode['id']}/participants/602", headers=headers["owner"])
    assert removed.status_code == 200, removed.text
    assert removed.json() == {"status": "removed"}

    detail = client.get(f"/api/company/601/episodes/{episode['id']}", headers=headers["owner"])
    assert detail.status_code == 200, detail.text
    assert {person["membership_id"] for person in detail.json()["participants"]} == {601}
    assert client.get("/api/company/601/assignments", headers=headers["member"]).json() == []

    async def inspect_removal():
        async with factory() as db:
            assignments = (await db.scalars(select(CompanyAssignment).where(
                CompanyAssignment.episode_id == episode["id"]
            ))).all()
            targets = (await db.scalars(select(CompanyAssignmentTarget).where(
                CompanyAssignmentTarget.assignment_id.in_([assignment.id for assignment in assignments])
            ))).all()
            assert {target.membership_id for target in targets} == {601}
            meeting = await db.scalar(select(CompanyMeeting).where(CompanyMeeting.episode_id == episode["id"]))
            participants = (await db.scalars(select(CompanyMeetingParticipant).where(
                CompanyMeetingParticipant.meeting_id == meeting.id
            ))).all()
            assert {participant.membership_id for participant in participants} == {601}

    asyncio.run(inspect_removal())


def test_manager_can_schedule_a_test_call_from_an_active_situation(preparation_client):
    client, headers, _ = preparation_client
    episode = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Подготовка к защите",
        "brief": "Команде нужно подготовиться к защите решения перед клиентом.",
        "participant_ids": [602],
        "create_preparation_plan": True,
    })
    assert episode.status_code == 201, episode.text
    meeting = client.post("/api/company/601/meetings", headers=headers["owner"], json={
        "kind": "PREPARATION_CALL",
        "title": "Тестовый созвон перед защитой",
        "episode_id": episode.json()["id"],
        "membership_ids": [602],
        "scheduled_at": (datetime.now() + timedelta(days=1)).replace(microsecond=0).isoformat(),
    })
    assert meeting.status_code == 201, meeting.text
    assert meeting.json()["kind"] == "PREPARATION_CALL"
    assert {row["invite_status"] for row in meeting.json()["participants"]} == {"ACCEPTED"}
