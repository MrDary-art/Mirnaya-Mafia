import asyncio
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import Company, CompanyMembership, CompanyAssignment, CompanyAssignmentTarget, CompanyAssignmentAttempt
from app.company_mode_policy import enforce_mode_policy
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
                     User(id=2102, username="advanced-employee", password_hash="unused", display_name="Employee", specialization="Продажи"),
                     User(id=2103, username="advanced-outsider", password_hash="unused", display_name="Outsider"),
                     User(id=2104, username="advanced-colleague", password_hash="unused", display_name="Colleague", specialization="Аналитика"),
                     User(id=2105, username="advanced-learning", password_hash="unused", display_name="Learning manager")]
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
                CompanyMembership(id=2104, company_id=2101, user_id=2104, corporate_role="EMPLOYEE", status="ACTIVE", is_primary=1, joined_at=datetime.now(), manager_membership_id=2101),
                CompanyMembership(id=2105, company_id=2101, user_id=2105, corporate_role="LND_MANAGER", status="ACTIVE", is_primary=1, joined_at=datetime.now()),
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
    learning_manager = {"Authorization": f"Bearer {create_token(2105, 'advanced-learning')}"}
    try:
        client = TestClient(app)
        preferences = "/api/company/2101/workspace-preferences"
        assert "company" in client.get(preferences, headers=owner).json()["available"]
        assert "company" not in client.get(preferences, headers=employee).json()["available"]
        assert client.put(preferences, headers=employee, json={"widgets": ["company"]}).status_code == 422
        assert client.put(preferences, headers=employee, json={"widgets": ["plan", "plan"]}).status_code == 422
        assert client.put(preferences, headers=employee, json={"widgets": ["calendar", "plan"]}).status_code == 200
        assert client.get(preferences, headers=employee).json()["widgets"] == ["calendar", "plan"]
        assert client.get(preferences, headers=owner).json()["widgets"] != ["calendar", "plan"]
        assert client.get(preferences, headers=outsider).status_code == 403
        assert client.put(preferences, headers=employee, json={"widgets": []}).status_code == 200
        assert client.get(preferences, headers=employee).json()["widgets"] == []
        assert client.post("/api/company/2101/me/profession-request", headers=employee).status_code == 201
        assert client.post("/api/company/2101/me/profession-request", headers=employee).status_code == 201
        assert client.post("/api/company/2101/me/profession-request", headers=outsider).status_code == 403
        owner_inbox = client.get("/api/company/context?company_id=2101", headers=owner).json()["inbox"]
        assert len([item for item in owner_inbox if item["type"] == "PROFESSION_REQUEST"]) == 1
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
        access_list = f"/api/company/2101/archive/{record_id}/grants"
        listed = client.get(access_list, headers=owner)
        assert listed.status_code == 200
        assert listed.json()[0]["name"] == "Employee"
        assert listed.json()[0]["status"] == "ACTIVE"
        assert listed.json()[0]["data_scope"] == "METRICS_ONLY"
        assert client.get(access_list, headers=employee).status_code == 403
        assert client.get(access_list, headers=outsider).status_code == 403
        visible = client.get(f"/api/company/2101/archive/{record_id}", headers=employee)
        assert visible.status_code == 200 and "transcript" not in visible.json()["data"]
        assert client.get(f"/api/company/2101/archive/{record_id}/consents", headers=employee).status_code == 403
        assert client.post(f"/api/company/2101/archive/{record_id}/grants/{grant.json()['id']}/revoke", headers=owner).status_code == 200
        assert client.get(access_list, headers=owner).json()[0]["status"] == "REVOKED"
        assert client.get(f"/api/company/2101/archive/{record_id}", headers=employee).status_code == 403

        chat = client.post("/api/company/2101/messenger/chats", headers=owner, json={"kind": "DIRECT", "membership_ids": [2102]})
        assert chat.status_code == 201
        chat_id = chat.json()["id"]
        directory = client.get("/api/company/2101/messenger/directory", headers=employee)
        assert directory.status_code == 200
        assert {item["membership_id"] for item in directory.json()} == {2101, 2104, 2105}
        assert client.get("/api/company/2101/messenger/directory", headers=outsider).status_code == 403
        listed = client.get("/api/company/2101/messenger/chats", headers=owner)
        assert listed.status_code == 200 and listed.json()[0]["title"] == "Employee"
        group = client.post("/api/company/2101/messenger/chats", headers=owner, json={"kind": "GROUP", "title": "Project", "membership_ids": [2102]})
        assert group.status_code == 201
        added = client.post(f"/api/company/2101/messenger/chats/{group.json()['id']}/members", headers=owner, json={"membership_ids": [2104]})
        assert added.status_code == 200 and added.json()["added_membership_ids"] == [2104]
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

        # Active employees can read the growth map, while track mutations stay
        # restricted to company administrators.
        career_tracks = client.get("/api/company/2101/career-tracks", headers=employee)
        assert career_tracks.status_code == 200
        assert career_tracks.json() == []
        assert client.post("/api/company/2101/career-tracks", headers=employee, json={
            "profession_id": 9999, "title": "Employee-created track",
        }).status_code == 403

        assert client.get("/api/company/2101/active-sessions", headers=learning_manager).status_code == 403
        assert client.get("/api/company/2101/billing/invoices", headers=learning_manager).status_code == 403
        assert client.get("/api/company/2101/integration-jobs", headers=learning_manager).status_code == 403
        assert client.put("/api/company/2101/mode-policies/AI", headers=learning_manager, json={"enabled": True}).status_code == 403

        policy = client.put("/api/company/2101/mode-policies/SCENARIOS", headers=owner, json={"enabled": True, "limit_per_member": 1})
        assert policy.status_code == 200
        assert client.put("/api/company/2101/mode-policies/AI", headers=owner, json={"enabled": True, "limit_per_member": 3}).status_code == 200

        async def assert_ai_policy_can_be_enforced():
            async with factory() as db:
                member = await db.get(CompanyMembership, 2102)
                row = await enforce_mode_policy(db, member, "AI")
                assert row is not None and row.limit_per_member == 3

        asyncio.run(assert_ai_policy_can_be_enforced())
        assert client.post("/api/company/2101/mode-usage/SCENARIOS", headers=owner).status_code == 201
        assert client.post("/api/company/2101/mode-usage/SCENARIOS", headers=owner).status_code == 403

        # A profile needs consent and must use recorded metrics, not neutral defaults or final scores.
        twin_url = "/api/company/2101/twin/me"
        assert client.put("/api/company/2101/personalization", headers=employee, json={"enabled": True}).status_code == 200
        assert client.put("/api/company/2101/me/professional-profile", headers=employee, json={"profession_id": None, "specialty_id": None, "professional_level": 1, "share_results": True}).status_code == 200
        assert client.post(f"{twin_url}/generate", headers=employee).status_code == 409
        async def seed_published_action():
            from app.company_meeting_models import CompanyMeeting, CompanyMeetingParticipant, CompanyMeetingProtocol, CompanyMeetingProtocolItem
            async with factory() as db:
                meeting = CompanyMeeting(company_id=2101, organizer_membership_id=2101, title="Published meeting", kind="MEETING", status="COMPLETED")
                db.add(meeting); await db.flush()
                for mid in (2101, 2102, 2104):
                    db.add(CompanyMeetingParticipant(meeting_id=meeting.id, membership_id=mid))
                protocol = CompanyMeetingProtocol(meeting_id=meeting.id, status="PUBLISHED", summary="Summary")
                db.add(protocol); await db.flush()
                action = CompanyMeetingProtocolItem(protocol_id=protocol.id, kind="ACTION", title="Action", assignee_membership_id=2102, status="OPEN")
                db.add(action); await db.commit()
                return meeting.id, action.id

        meeting_id, action_id = asyncio.run(seed_published_action())
        action_url = f"/api/company/2101/meetings/{meeting_id}/actions/{action_id}"
        colleague = {"Authorization": f"Bearer {create_token(2104, 'advanced-colleague')}"}
        assert client.put(action_url, headers=colleague, json={"done": True}).status_code == 403
        assert client.put(action_url, headers=outsider, json={"done": True}).status_code == 403
        assert client.put(action_url, headers=employee, json={"done": True}).json()["status"] == "DONE"
        assert client.put(action_url, headers=owner, json={"done": False}).json()["status"] == "OPEN"
        assert client.put(twin_url, headers=employee, json={"opt_in": True, "source_types": ["TRAINING_RESULTS"]}).status_code == 200
        empty_profile = client.post(f"{twin_url}/generate", headers=employee).json()["profile"]
        assert empty_profile["dimension_samples"] == {"trust": 0, "goal": 0, "control": 0, "eq": 0}

        async def seed_attempts():
            async with factory() as db:
                assignment = CompanyAssignment(company_id=2101, title="Metrics practice", created_by=2101)
                db.add(assignment); await db.flush()
                target = CompanyAssignmentTarget(company_id=2101, assignment_id=assignment.id, membership_id=2102)
                db.add(target); await db.flush()
                for membership, status, metrics in [
                    (2102, "COMPLETED", '{"trust": 80, "goal": 20, "eq": 0}'),
                    (2102, "COMPLETED", '{"trust": 60, "goal": 40, "eq": true, "control": 200}'),
                    (2102, "IN_PROGRESS", '{"trust": 100, "goal": 100}'),
                    (2101, "COMPLETED", '{"trust": 0, "goal": 0}'),
                ]:
                    db.add(CompanyAssignmentAttempt(company_id=2101, assignment_id=assignment.id, target_id=target.id,
                        membership_id=membership, status=status, final_score=99, metrics_snapshot=metrics))
                await db.commit()

        asyncio.run(seed_attempts())
        generated = client.post(f"{twin_url}/generate", headers=employee)
        assert generated.status_code == 200
        profile = generated.json()["profile"]
        own_attempt = next(item for item in client.get("/api/company/2101/attempts?membership_id=2102", headers=employee).json() if item["status"] == "COMPLETED")
        archive_url = f"/api/company/2101/attempts/{own_attempt['id']}/archive"
        assert client.post(archive_url, headers=owner).status_code == 403
        assert client.post(archive_url, headers=outsider).status_code == 403
        imported = client.post(archive_url, headers=employee)
        assert imported.status_code == 200 and imported.json()["created"] is True
        assert client.post(archive_url, headers=employee).json() == {"id": imported.json()["id"], "created": False}
        imported_id = imported.json()["id"]
        assert client.get(f"/api/company/2101/archive/{imported_id}", headers=owner).status_code == 403
        assert client.delete(f"/api/company/2101/archive/{imported_id}", headers=employee).status_code == 200
        assert client.post(archive_url, headers=employee).json()["created"] is True
        assert profile["dimensions"] == {"trust": 70, "goal": 30, "control": 50, "eq": 0}
        assert profile["dimension_samples"] == {"trust": 2, "goal": 2, "control": 0, "eq": 1}
        assert client.get(twin_url, headers=employee).json()["profile"] == profile
        assert client.get("/api/company/2102/twin/me", headers=employee).status_code == 403
        assert client.put(twin_url, headers=employee, json={"opt_in": False, "source_types": []}).status_code == 200
        assert client.get(twin_url, headers=employee).json()["profile"] == {}
        assert client.get("/api/company/2101/personalization/insights", headers=employee).json()["enabled"] is True
        assert client.get("/api/company/2101/me/professional-profile", headers=employee).json()["share_results"] is True
        assert client.post(f"{twin_url}/generate", headers=employee).status_code == 409
    finally:
        app.dependency_overrides.pop(get_db, None)
