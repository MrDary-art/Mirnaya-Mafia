"""Preparation plans must reuse normal corporate assignments without an LLM."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_episode_models import CompanyWorkEpisode
from app.company_meeting_models import CompanyMeeting, CompanyMeetingParticipant
from app.council_models import CouncilMeeting, CouncilMember, CouncilMessage, CouncilSignal
from app.company_models import Company, CompanyAssignment, CompanyAssignmentTarget, CompanyMembership
from app.db import Base, get_db
from app.main import app
from app.models import User


def test_ai_recommendation_selects_catalog_scenario_and_refines_safe_copy(monkeypatch):
    import app.company_preparation as preparation

    async def recommend(*_args, **_kwargs):
        return ('{"scenario_id":"vendor_terms_01","scenario_description":"Проверьте условия клиента.",'
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
    assert plan["items"][0]["title"] == f"Сценарий: {preparation.SCENARIOS['vendor_terms_01']['title']}"
    assert plan["items"][0]["description"] == "Проверьте условия клиента."
    assert plan["items"][0]["scenario_id"] == "vendor_terms_01"
    assert plan["items"][1]["scenario_id"] == "vendor_terms_01"
    assert plan["items"][0]["selected_by"] == "ai"
    assert plan["items"][1]["description"] == "Отрепетируйте аргументы о сроках и марже."
    assert plan["meeting"]["title"] == "Репетиция позиции команды"


def test_ai_recommendation_rejects_unknown_scenario_id(monkeypatch):
    import app.company_preparation as preparation

    async def recommend(*_args, **_kwargs):
        return ('{"scenario_id":"invented_unsafe_scenario"}', "test-ai")

    monkeypatch.setattr(preparation, "_ai_available", lambda: True)
    monkeypatch.setattr(preparation, "call_with_fallback_detailed", recommend)
    plan = asyncio.run(preparation.recommend_preparation_plan(
        title="Защита условий", brief="Клиент просит скидку.", expected_result="Сохранить маржу.",
        situation_type="NEGOTIATION", scheduled_at=None, test_call_enabled=False,
        test_call_at=None, test_call_duration=30,
    ))
    assert {item["scenario_id"] for item in plan["items"]} == {"sales_discount_01"}
    assert "selected_by" not in plan["items"][0]


def test_local_ollama_enables_plan_recommendation_without_external_key(monkeypatch):
    import app.company_preparation as preparation

    monkeypatch.setattr(preparation.settings, "ollama_enabled", True)
    monkeypatch.setattr(preparation, "runtime_config", lambda: {
        "provider": "gigachat", "credential": "", "model": "GigaChat",
    })
    assert preparation._ai_available()


def test_plan_call_time_is_normalized_to_utc():
    from app.company_preparation import _date_from_plan
    assert _date_from_plan("2026-10-19T15:30:00+03:00") == datetime(2026, 10, 19, 12, 30)


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
    meeting_id = episode["plan"]["meeting"]["meeting_id"]
    initial_meeting = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()
    council_id = initial_meeting["council_meeting_id"]
    assert council_id
    assert client.get(f"/api/council/{council_id}?company_id=601", headers=headers["member"]).status_code == 200
    call_runtime = client.get(f"/api/council-runtime/{council_id}", headers=headers["member"])
    assert call_runtime.status_code == 200
    assert isinstance(call_runtime.json()["iceServers"], list)
    assert client.get(f"/api/council/{council_id}?company_id=601", headers=headers["late_member"]).status_code == 404

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
    roster = client.get(f"/api/council/{council_id}?company_id=601", headers=headers["late_member"])
    assert roster.status_code == 200, roster.text
    assert roster.json()["capacity"] == 3
    assert roster.json()["preparation_call"] is True
    assert body["brief"] in roster.json()["scenario"]["description"]

    # The call uses the Council room. Public evidence becomes a private draft;
    # private messages must never be copied into the company transcript.
    assert client.post(f"/api/company/601/meetings/{meeting_id}/finish", headers=headers["owner"]).status_code == 409
    async def activate_council():
        async with factory() as db:
            council = await db.get(CouncilMeeting, council_id)
            council.status = "active"
            for member in (await db.scalars(select(CouncilMember).where(CouncilMember.meeting_id == council_id))).all():
                member.role_read = 1
            await db.commit()
    asyncio.run(activate_council())
    public_text = "Команда согласовала рамку разговора с клиентом и ограничения по срокам."
    assert client.post(f"/api/council/{council_id}/messages", headers=headers["member"], json={"text": public_text}).status_code == 200
    assert client.post(f"/api/council/{council_id}/messages", headers=headers["owner"], json={
        "text": "Личная заметка только для участника", "recipient_id": 602,
    }).status_code == 200
    finished = client.post(f"/api/council/{council_id}/finish", headers=headers["owner"])
    assert finished.status_code == 200, finished.text
    report = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"])
    assert report.status_code == 200, report.text
    assert report.json()["report"]["status"] == "REVIEW"
    assert public_text in report.json()["report"]["summary"]
    transcript = client.get(f"/api/company/601/meetings/{meeting_id}/transcript", headers=headers["owner"]).json()
    assert [line["text"] for line in transcript] == [public_text]

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


def test_ai_rehearsal_provider_failure_is_actionable_and_does_not_spend_attempt(preparation_client, monkeypatch):
    from unittest.mock import AsyncMock

    from app.engine.llm import AI_PRACTICE_UNAVAILABLE_MESSAGE

    monkeypatch.setattr("app.company_preparation._ai_available", lambda: False)
    client, headers, _ = preparation_client
    created = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Продажа проекта",
        "brief": "Клиент обсуждает покупку проекта на выставке.",
        "expected_result": "Согласовать условия продажи проекта.",
        "participant_ids": [602],
        "create_preparation_plan": True,
    })
    assert created.status_code == 201, created.text
    assignment_id = next(item["assignment_id"] for item in created.json()["plan"]["items"] if item["kind"] == "AI_PRACTICE")

    monkeypatch.setattr("app.routers.company_assignments.create_session",
                        AsyncMock(side_effect=ValueError(AI_PRACTICE_UNAVAILABLE_MESSAGE)))
    failed = client.post(f"/api/company/601/assignments/{assignment_id}/start", headers=headers["member"])
    assert failed.status_code == 503, failed.text
    assert failed.json()["detail"] == AI_PRACTICE_UNAVAILABLE_MESSAGE
    target = next(item for item in client.get("/api/company/601/assignments", headers=headers["member"]).json()
                  if item["id"] == assignment_id)
    assert target["attempts_used"] == 0
    assert target["status"] == "ASSIGNED"


def test_ai_rehearsal_opens_from_saved_context_without_planner(preparation_client, monkeypatch):
    from unittest.mock import AsyncMock

    from app.engine.llm import LlmError

    monkeypatch.setattr("app.company_preparation._ai_available", lambda: False)
    monkeypatch.setattr("app.engine.llm.ensure_online_ai_available", AsyncMock(return_value="ollama"))
    planner = AsyncMock(side_effect=LlmError("temporary planning failure"))
    monkeypatch.setattr("app.engine.practice_plan.call_with_fallback_detailed", planner)
    client, headers, _ = preparation_client
    created = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Продажа проекта",
        "brief": "Клиент обсуждает покупку проекта на выставке.",
        "expected_result": "Согласовать условия продажи проекта.",
        "participant_ids": [602],
        "create_preparation_plan": True,
    })
    assert created.status_code == 201, created.text
    assignment_id = next(item["assignment_id"] for item in created.json()["plan"]["items"] if item["kind"] == "AI_PRACTICE")

    started = client.post(f"/api/company/601/assignments/{assignment_id}/start", headers=headers["member"])
    assert started.status_code == 200, started.text
    session = client.get(f"/api/sessions/{started.json()['session_id']}", headers=headers["member"])
    assert session.status_code == 200, session.text
    assert session.json()["mode"] == "online"
    assert session.json()["settings"]["practice_plan"]["source"] == "template"
    assert "Клиент обсуждает покупку проекта" in session.json()["context"]
    planner.assert_not_awaited()


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
    meeting_id = episode["plan"]["meeting"]["meeting_id"]
    council_id = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()["council_meeting_id"]
    assert client.get(f"/api/council/{council_id}", headers=headers["member"]).status_code == 404
    assert client.get(f"/api/council/{council_id}", headers=headers["owner"]).json()["capacity"] == 1

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
    client, headers, factory = preparation_client
    local_time = datetime(2030, 10, 20, 9, 0, tzinfo=timezone(timedelta(hours=3)))
    episode = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Подготовка к защите",
        "brief": "Команде нужно подготовиться к защите решения перед клиентом.",
        "participant_ids": [602],
        "create_preparation_plan": True,
        "scheduled_at": local_time.isoformat(),
    })
    assert episode.status_code == 201, episode.text
    meeting = client.post("/api/company/601/meetings", headers=headers["owner"], json={
        "kind": "PREPARATION_CALL",
        "title": "Тестовый созвон перед защитой",
        "episode_id": episode.json()["id"],
        "membership_ids": [602],
        "scheduled_at": local_time.isoformat(),
    })
    assert meeting.status_code == 201, meeting.text
    assert meeting.json()["kind"] == "PREPARATION_CALL"
    assert meeting.json()["scheduled_at"] == "2030-10-20T06:00:00Z"
    linked_episode = client.get(f"/api/company/601/episodes/{episode.json()['id']}", headers=headers["owner"]).json()
    assert linked_episode["scheduled_at"] == "2030-10-20T06:00:00Z"
    assert linked_episode["meetings"][0]["scheduled_at"] == "2030-10-20T06:00:00Z"
    assert meeting.json()["council_meeting_id"]
    assert {row["invite_status"] for row in meeting.json()["participants"]} == {"ACCEPTED"}
    linked = client.get(f"/api/council/{meeting.json()['council_meeting_id']}?company_id=601", headers=headers["member"])
    assert linked.status_code == 200, linked.text
    assert linked.json()["capacity"] == 2
    without_recording = client.post("/api/company/601/meetings", headers=headers["owner"], json={
        "kind": "PREPARATION_CALL", "title": "Созвон без обработки речи",
        "episode_id": episode.json()["id"], "membership_ids": [602],
        "scheduled_at": (datetime.now() + timedelta(days=2)).replace(microsecond=0).isoformat(),
        "consent_required": False,
    })
    assert without_recording.status_code == 201, without_recording.text
    no_recording_id = without_recording.json()["council_meeting_id"]
    assert client.get(f"/api/council-runtime/{no_recording_id}", headers=headers["member"]).json()["recordingAllowed"] is False

    runtime_url = f"/api/council-runtime/{meeting.json()['council_meeting_id']}"
    waiting = client.get(runtime_url, headers=headers["member"]).json()
    assert waiting["canJoin"] is False
    assert waiting["joinOpensAt"] == waiting["started"] - 15 * 60 * 1000
    early = client.post(f"{runtime_url}/call", headers=headers["member"], json={"active": True, "audio": True})
    assert early.status_code == 409
    assert "15 минут" in early.json()["detail"]

    async def move_into_join_window():
        async with factory() as db:
            council = await db.get(CouncilMeeting, meeting.json()["council_meeting_id"])
            council.scheduled_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=5)
            await db.commit()

    asyncio.run(move_into_join_window())
    opened = client.get(runtime_url, headers=headers["member"]).json()
    assert opened["canJoin"] is True
    joined = client.post(f"{runtime_url}/call", headers=headers["member"], json={"active": True, "audio": False, "video": True})
    assert joined.status_code == 200, joined.text
    own = next(person for person in joined.json()["members"] if person["id"] == joined.json()["me"]["id"])
    assert own["inCall"] is True and own["videoOn"] is True
    left = client.post(f"{runtime_url}/call", headers=headers["member"], json={"active": False})
    assert left.status_code == 200, left.text
    assert not next(person for person in left.json()["members"] if person["id"] == left.json()["me"]["id"])["inCall"]

    async def expire_call():
        async with factory() as db:
            council = await db.get(CouncilMeeting, meeting.json()["council_meeting_id"])
            council.scheduled_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
            await db.commit()

    asyncio.run(expire_call())
    closed = client.get(runtime_url, headers=headers["member"]).json()
    assert closed["reservationEnded"] is True and closed["canJoin"] is False
    late = client.post(f"{runtime_url}/call", headers=headers["member"], json={"active": True})
    assert late.status_code == 409
    assert "Время звонка завершилось" in late.json()["detail"]


def test_preparation_call_audio_analysis_updates_private_report(preparation_client, monkeypatch):
    import json
    from app.routers import council_runtime
    from app.engine import meeting_protocol

    client, headers, factory = preparation_client
    created = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Обсуждение условий", "brief": "Клиент просит ускорить запуск.",
        "expected_result": "Согласовать реалистичный следующий шаг.",
        "participant_ids": [602], "create_preparation_plan": True,
        "test_call_enabled": True,
        "test_call_at": (datetime.now() + timedelta(days=1)).replace(microsecond=0).isoformat(),
    })
    assert created.status_code == 201, created.text
    meeting_id = created.json()["plan"]["meeting"]["meeting_id"]
    council_id = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()["council_meeting_id"]
    assert client.post(f"/api/council/{council_id}/finish", headers=headers["owner"]).status_code == 200

    async def add_uploaded_recording():
        async with factory() as db:
            council = await db.get(CouncilMeeting, council_id)
            configuration = json.loads(council.configuration)
            configuration["audio_required"] = True
            council.configuration = json.dumps(configuration)
            db.add(CouncilSignal(meeting_id=council_id, author_id=602, recipient_id=602,
                                 kind="recording", payload=json.dumps({
                                     "id": "recording-1", "member": "602", "name": "Сотрудник", "status": "uploaded",
                                 })))
            await db.commit()
    asyncio.run(add_uploaded_recording())
    waiting = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()
    assert waiting["council_audio_status"] == "waiting"
    assert client.post(f"/api/company/601/meetings/{meeting_id}/protocol/publish", headers=headers["owner"]).status_code == 409

    async def transcribe(_recording, _meeting_id):
        return "Договорились проверить сроки запуска и отправить клиенту новый график."

    async def refine(_draft, _evidence):
        return "По записи команда договорилась проверить сроки запуска и отправить клиенту новый график."

    monkeypatch.setattr(council_runtime, "SessionLocal", factory)
    monkeypatch.setattr(council_runtime, "transcribe_record", transcribe)
    monkeypatch.setattr(meeting_protocol, "refine_summary_with_ai", refine)
    asyncio.run(council_runtime.analyze(council_id))

    detail = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"])
    assert detail.status_code == 200, detail.text
    assert detail.json()["report"]["summary"] == "По записи команда договорилась проверить сроки запуска и отправить клиенту новый график."
    assert client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["member"]).json().get("report") is None
    transcript = client.get(f"/api/company/601/meetings/{meeting_id}/transcript", headers=headers["owner"]).json()
    assert len(transcript) == 1 and "новый график" in transcript[0]["text"]
    council = client.get(f"/api/council/{council_id}", headers=headers["owner"]).json()
    assert council["audio_analysis"]["status"] == "complete"
    published = client.post(f"/api/company/601/meetings/{meeting_id}/protocol/publish", headers=headers["owner"])
    assert published.status_code == 200, published.text
    member_report = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["member"]).json()["report"]
    assert member_report["status"] == "PUBLISHED"


def test_preparation_call_records_only_after_personal_consent(preparation_client):
    client, headers, factory = preparation_client
    created = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Тест разговора", "brief": "Команда обсуждает сроки запуска.",
        "participant_ids": [602], "create_preparation_plan": True, "test_call_enabled": True,
        "test_call_at": (datetime.now() + timedelta(days=1)).replace(microsecond=0).isoformat(),
    })
    assert created.status_code == 201, created.text
    meeting_id = created.json()["plan"]["meeting"]["meeting_id"]
    council_id = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()["council_meeting_id"]

    async def activate():
        async with factory() as db:
            council = await db.get(CouncilMeeting, council_id)
            council.status = "active"
            await db.commit()
    asyncio.run(activate())

    record_url = f"/api/council-runtime/{council_id}/recordstart"
    assert client.post(record_url, headers=headers["member"], json={"mime": "audio/webm"}).status_code == 403
    no_recording = client.post(f"/api/company/601/meetings/{meeting_id}/consent", headers=headers["member"], json={
        "accepted": False, "purposes": ["TRANSCRIPT_ANALYSIS"],
    })
    assert no_recording.status_code == 200, no_recording.text
    assert client.get(f"/api/council-runtime/{council_id}", headers=headers["member"]).json()["recordingAllowed"] is False
    accepted = client.post(f"/api/company/601/meetings/{meeting_id}/consent", headers=headers["member"], json={
        "accepted": True, "purposes": ["TRANSCRIPT_ANALYSIS"],
    })
    assert accepted.status_code == 200, accepted.text
    assert client.get(f"/api/council-runtime/{council_id}", headers=headers["member"]).json()["recordingAllowed"] is True
    assert client.post(record_url, headers=headers["member"], json={"mime": "audio/webm"}).status_code == 200
    assert client.post(record_url, headers=headers["owner"], json={"mime": "audio/webm"}).status_code == 403


def test_late_council_evidence_does_not_erase_reviewed_draft(preparation_client):
    from app.company_council import sync_council_report_to_company_meeting

    client, headers, factory = preparation_client
    created = client.post("/api/company/601/episodes", headers=headers["owner"], json={
        "title": "Репетиция команды", "brief": "Обсудить условия запуска.",
        "participant_ids": [602], "create_preparation_plan": True, "test_call_enabled": True,
        "test_call_at": (datetime.now() + timedelta(days=1)).replace(microsecond=0).isoformat(),
    })
    assert created.status_code == 201, created.text
    meeting_id = created.json()["plan"]["meeting"]["meeting_id"]
    council_id = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()["council_meeting_id"]
    assert client.post(f"/api/council/{council_id}/finish", headers=headers["owner"]).status_code == 200
    first = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()["report"]
    edited = client.put(f"/api/company/601/meetings/{meeting_id}/protocol", headers=headers["owner"], json={
        "version": first["version"], "summary": "Руководитель проверил итог и уточнил следующий шаг.",
    })
    assert edited.status_code == 200, edited.text

    async def sync_late_material():
        async with factory() as db:
            council = await db.get(CouncilMeeting, council_id)
            db.add(CouncilMessage(meeting_id=council_id, author_id=602, recipient_id=None,
                                  kind="transcript", text="Позже получена расшифровка с новыми фактами."))
            await db.flush()
            await sync_council_report_to_company_meeting(db, council)
            await db.commit()
    asyncio.run(sync_late_material())

    after = client.get(f"/api/company/601/meetings/{meeting_id}", headers=headers["owner"]).json()["report"]
    assert after["summary"] == edited.json()["summary"]
    assert after["version"] == edited.json()["version"]
    transcript = client.get(f"/api/company/601/meetings/{meeting_id}/transcript", headers=headers["owner"]).json()
    assert any("Позже получена" in row["text"] for row in transcript)
