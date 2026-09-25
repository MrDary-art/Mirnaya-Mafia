import asyncio
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import Company, CompanyDepartment, CompanyInboxMessage, CompanyIntegration, CompanyMaterial, CompanyMembership
from app.db import Base, get_db
from app.main import app
from app.models import User
from app.routers.company import dispatch_company_reminders
from app.routers.company_content import material_file_path


def test_company_data_is_scoped_by_membership_and_role():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            owner = User(id=1001, username="company-owner", password_hash="unused", display_name="Владелец")
            employee = User(id=1002, username="company-employee", password_hash="unused", display_name="Сотрудник")
            outsider = User(id=1003, username="company-outsider", password_hash="unused", display_name="Посторонний")
            db.add_all([owner, employee, outsider]); await db.flush()
            company = Company(id=1001, name="Тестовая компания", slug="test-company", created_by=owner.id)
            db.add(company); await db.flush()
            department = CompanyDepartment(id=1001, company_id=company.id, name="Продажи")
            db.add(department); await db.flush()
            db.add_all([
                CompanyMembership(id=1001, company_id=company.id, user_id=owner.id, department_id=department.id,
                                  job_title="Владелец", corporate_role="COMPANY_OWNER", status="ACTIVE", is_primary=1,
                                  joined_at=datetime.now(), verified_at=datetime.now()),
                CompanyMembership(id=1002, company_id=company.id, user_id=employee.id, department_id=department.id,
                                  job_title="Менеджер", corporate_role="EMPLOYEE", status="ACTIVE", is_primary=1,
                                  joined_at=datetime.now(), verified_at=datetime.now()),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    owner_headers = {"Authorization": f"Bearer {create_token(1001, 'company-owner')}"}
    employee_headers = {"Authorization": f"Bearer {create_token(1002, 'company-employee')}"}
    outsider_headers = {"Authorization": f"Bearer {create_token(1003, 'company-outsider')}"}
    try:
        client = TestClient(app)
        assert client.get("/api/company/context", headers=owner_headers).json()["permissions"]["manage_company"] is True
        assert client.get("/api/company/1001/employees", headers=owner_headers).status_code == 200
        assert client.get("/api/company/1001/employees", headers=employee_headers).status_code == 403
        directory = client.get("/api/company/1001/directory", headers=employee_headers)
        assert directory.status_code == 200
        assert {row["username"] for row in directory.json()} == {"company-owner", "company-employee"}
        assert client.get("/api/company/1001/employees/1002/overview", headers=owner_headers).status_code == 200
        assert client.get("/api/company/1001/employees/1001/overview", headers=employee_headers).status_code == 403
        owner_rating = client.get("/api/company/1001/ratings", headers=owner_headers)
        assert owner_rating.status_code == 200
        assert owner_rating.json()["ratings"] == []
        employee_rating = client.get("/api/company/1001/ratings", headers=employee_headers)
        assert employee_rating.status_code == 200
        assert employee_rating.json()["enabled"] is False
        assert client.get("/api/company/1001/integrations", headers=employee_headers).status_code == 403
        integration = client.put("/api/company/1001/integrations/teams", headers=owner_headers, json={
            "enabled": True, "settings": {"access_token": "super-secret-token", "channel": "hr-alerts"},
        })
        assert integration.status_code == 200
        assert integration.json() == {"provider": "teams", "enabled": True, "configured": True, "updated_at": integration.json()["updated_at"]}

        async def encrypted_in_storage():
            async with factory() as db:
                row = await db.scalar(select(CompanyIntegration).where(CompanyIntegration.company_id == 1001))
                return row.encrypted_config

        assert "super-secret-token" not in asyncio.run(encrypted_in_storage())
        assert client.get("/api/company/context", headers=outsider_headers).json()["has_company"] is False

        application = client.post("/api/company/1001/applications", headers=outsider_headers, json={
            "desired_job_title": "Аналитик", "specialization": "Продажи", "message": "Хочу присоединиться",
        })
        assert application.status_code == 200
        applications = client.get("/api/company/1001/applications", headers=owner_headers).json()
        application_id = next(item["id"] for item in applications if item["username"] == "company-outsider")
        reviewed = client.post(f"/api/company/1001/applications/{application_id}/review", headers=owner_headers, json={
            "action": "accept", "job_title": "Старший аналитик", "corporate_role": "TEAM_LEAD", "department_id": 1001,
        })
        assert reviewed.status_code == 200
        outsider_context = client.get("/api/company/context", headers=outsider_headers).json()
        assert outsider_context["has_company"] is True
        assert outsider_context["membership"]["job_title"] == "Старший аналитик"
        assert outsider_context["membership"]["department"] == "Продажи"

        booking = client.post("/api/company/1001/online-1x1", headers=owner_headers, json={
            "host_membership_id": 1001, "guest_membership_id": 1002, "title": "Практика с клиентом",
            "situation": "Клиент просит скидку и хочет быстрый ответ", "goal": "Согласовать взаимовыгодные условия",
            "scheduled_at": (datetime.now() + timedelta(days=2)).isoformat(), "duration_minutes": 15,
        })
        assert booking.status_code == 200, booking.json()
        conflict = client.post("/api/company/1001/online-1x1", headers=owner_headers, json={
            "host_membership_id": 1001, "guest_membership_id": 1002, "title": "Overlap",
            "situation": "Practice the same conversation", "goal": "Keep the agreed terms",
            "scheduled_at": (datetime.now() + timedelta(days=2)).isoformat(), "duration_minutes": 15,
        })
        assert conflict.status_code == 409
        employee_rooms = client.get("/api/company/1001/online-1x1", headers=employee_headers).json()
        assert any(row["room_id"] == booking.json()["room_id"] and row["can_open"] for row in employee_rooms)

        tournament = client.post("/api/company/1001/competitions", headers=owner_headers, json={
            "title": "Командный турнир", "kind": "TOURNAMENT", "membership_ids": [1001, 1002],
        })
        assert tournament.status_code == 200
        bracket = client.get(f"/api/company/1001/competitions/{tournament.json()['id']}/bracket", headers=owner_headers)
        assert bracket.status_code == 200
        match_id = bracket.json()["matches"][0]["id"]
        match_result = client.post(f"/api/company/1001/competitions/{tournament.json()['id']}/matches/{match_id}/result", headers=owner_headers, json={"winner_membership_id": 1001})
        assert match_result.status_code == 200
        goal = client.post("/api/company/1001/team-goals", headers=owner_headers, json={
            "title": "Общий результат", "target_score": 500,
        })
        assert goal.status_code == 200
        assert any(row["id"] == tournament.json()["id"] for row in client.get("/api/company/1001/competitions", headers=employee_headers).json())
        assert any(row["id"] == goal.json()["id"] for row in client.get("/api/company/1001/team-goals", headers=employee_headers).json())

        created = client.post("/api/company/1001/assignments", headers=owner_headers, json={
            "title": "Переговоры о скидке", "scenario_id": "sales_discount", "all_company": True,
            "deadline": (datetime.now() + timedelta(days=3)).isoformat(), "arena_weight": 50, "company_weight": 50,
        })
        assert created.status_code == 200
        employee_context = client.get("/api/company/context", headers=employee_headers).json()
        assert len(employee_context["assignments"]) == 1
        assert employee_context["assignments"][0]["title"] == "Переговоры о скидке"
        async def reminder_is_idempotent():
            async with factory() as db:
                await dispatch_company_reminders(db)
                await dispatch_company_reminders(db)
                return list((await db.scalars(select(CompanyInboxMessage).where(
                    CompanyInboxMessage.membership_id == 1002,
                    CompanyInboxMessage.type == "REMINDER_3D",
                ))).all())
        assert len(asyncio.run(reminder_is_idempotent())) == 1
        template = client.post("/api/company/1001/assignments", headers=owner_headers, json={
            "title": "Шаблон для программы", "scenario_id": "sales_discount", "template_only": True,
            "arena_weight": 50, "company_weight": 50,
        })
        assert template.status_code == 200, template.json()
        assert template.json()["recipients"] == 0
        program = client.post("/api/company/1001/programs", headers=owner_headers, json={
            "title": "Путь переговорщика", "description": "Проверка этапов",
        })
        assert program.status_code == 200, program.json()
        program_id = program.json()["id"]
        steps = client.put(f"/api/company/1001/programs/{program_id}/steps", headers=owner_headers, json={
            "steps": [{"title": "Первый этап", "assignment_id": template.json()["id"], "unlock_rule": "PREVIOUS"}],
        })
        assert steps.status_code == 200, steps.json()
        assert client.post(f"/api/company/1001/programs/{program_id}/status", headers=owner_headers,
                           json={"status": "PUBLISHED"}).status_code == 200
        enrolled = client.post(f"/api/company/1001/programs/{program_id}/enroll", headers=owner_headers,
                               json={"membership_ids": [1002]})
        assert enrolled.status_code == 200, enrolled.json()
        employee_assignments = client.get("/api/company/1001/assignments", headers=employee_headers).json()
        assert any(item["id"] == template.json()["id"] for item in employee_assignments)
        survey = client.post("/api/company/1001/surveys", headers=owner_headers, json={
            "title": "Обратная связь о программе", "questions": ["Что улучшить?"], "anonymous": True,
        })
        assert survey.status_code == 200, survey.json()
        answered = client.post(f"/api/company/1001/surveys/{survey.json()['id']}/responses", headers=employee_headers,
                               json={"answers": {"Что улучшить?": "Добавить практики"}})
        assert answered.status_code == 200
        aggregate = client.get(f"/api/company/1001/surveys/{survey.json()['id']}/results", headers=owner_headers)
        assert aggregate.status_code == 200
        assert aggregate.json()["responses"] == 1
        assert aggregate.json()["answers"]["Что улучшить?"]["Добавить практики"] == 1
        assert "membership_id" not in aggregate.json()
        draft = client.post("/api/company/1001/scenarios/draft", headers=owner_headers, json={
            "situation": "Клиент просит скидку и ссылается на более дешёвое предложение конкурента. Контакт: client@example.com, +7 999 123-45-67.",
            "industry": "Продажи", "employee_role": "Менеджер по продажам", "opponent_role": "Клиент",
        })
        assert draft.status_code == 200, draft.json()
        assert draft.json()["source"] == "offline_draft"
        assert draft.json()["draft"]["context"].startswith("Клиент просит скидку")
        assert "client@example.com" not in draft.json()["draft"]["context"]
        assert "+7 999" not in draft.json()["draft"]["context"]
        assert client.get("/api/company/1001/scenarios", headers=owner_headers).json() == []
        corporate_scenario = client.post("/api/company/1001/scenarios", headers=owner_headers, json={
            "title": "Корпоративная скидка", "employee_role": "Менеджер", "opponent_role": "Клиент",
            "context": "Клиент требует изменить условия долгосрочного контракта.",
            "employee_goal": "Согласовать следующий шаг без нарушения условий.",
        })
        assert corporate_scenario.status_code == 200
        scenario_id = corporate_scenario.json()["id"]
        unpublished_assignment = client.post("/api/company/1001/assignments", headers=owner_headers, json={
            "title": "Нельзя назначить", "company_scenario_id": scenario_id, "template_only": True,
            "arena_weight": 50, "company_weight": 50,
        })
        assert unpublished_assignment.status_code == 409
        assert client.post(f"/api/company/1001/scenarios/{scenario_id}/status", headers=owner_headers,
                           json={"status": "PUBLISHED"}).status_code == 200
        assigned_corporate = client.post("/api/company/1001/assignments", headers=owner_headers, json={
            "title": "????????????? ????????", "company_scenario_id": scenario_id, "membership_ids": [1002],
            "arena_weight": 50, "company_weight": 50,
        })
        assert assigned_corporate.status_code == 200, assigned_corporate.json()
        launched = client.post(f"/api/company/1001/assignments/{assigned_corporate.json()['id']}/start",
                               headers=employee_headers)
        assert launched.status_code == 200, launched.json()
        corporate_session = client.get(f"/api/sessions/{launched.json()['session_id']}", headers=employee_headers)
        assert corporate_session.status_code == 200, corporate_session.json()
        assert corporate_session.json()["settings"]["corporate_scenario"]["id"] == scenario_id
        assert corporate_session.json()["step"]["options"][0]["id"] == "clarify"
        revised = client.put(f"/api/company/1001/scenarios/{scenario_id}", headers=owner_headers, json={
            "title": "Корпоративная скидка v2", "employee_role": "Менеджер", "opponent_role": "Клиент",
            "context": "Клиент требует изменить условия долгосрочного контракта.",
            "employee_goal": "Согласовать следующий шаг без нарушения условий.",
        })
        assert revised.status_code == 200, revised.json()
        assert revised.json()["created_revision"] is True
        assert revised.json()["revision"] == 2
        assert client.post(f"/api/company/1001/scenarios/{scenario_id}/status", headers=owner_headers,
                           json={"status": "ARCHIVED"}).status_code == 200
        assert client.post(f"/api/company/1001/scenarios/{scenario_id}/status", headers=owner_headers,
                           json={"status": "PUBLISHED"}).status_code == 409
        material = client.post("/api/company/1001/materials", headers=owner_headers, json={
            "title": "Инструкция для отдела", "description": "Только для участников программы",
            "content_type": "MD", "content": "# Правила", "scope_type": "PROGRAM", "program_id": program_id,
            "ai_allowed": False,
        })
        assert material.status_code == 200, material.json()
        employee_materials = client.get("/api/company/1001/materials", headers=employee_headers).json()
        assert any(item["id"] == material.json()["id"] and item["ai_allowed"] is False for item in employee_materials)
        uploaded_material = client.post("/api/company/1001/materials/upload", headers=owner_headers, data={
            "title": "Playbook", "description": "Short reference", "ai_allowed": "false",
        }, files={"file": ("playbook.txt", b"company reference", "text/plain")})
        assert uploaded_material.status_code == 200, uploaded_material.json()
        downloaded = client.get(f"/api/company/1001/materials/{uploaded_material.json()['id']}/file", headers=employee_headers)
        assert downloaded.status_code == 200
        assert downloaded.content == b"company reference"

        async def remove_uploaded_material():
            async with factory() as db:
                row = await db.get(CompanyMaterial, uploaded_material.json()["id"])
                material_file_path(row).unlink(missing_ok=True)

        asyncio.run(remove_uploaded_material())
        private_material = client.post("/api/company/1001/materials", headers=owner_headers, json={
            "title": "Закрытый регламент", "content_type": "TXT", "content": "Служебный текст", "confidential": True,
        })
        assert private_material.status_code == 200
        employee_materials = client.get("/api/company/1001/materials", headers=employee_headers).json()
        assert all(item["id"] != private_material.json()["id"] for item in employee_materials)
        preview = client.post("/api/company/1001/employees/import-csv/preview", headers=owner_headers, files={
            "file": ("employees.csv", b"username,department,job_title\ncompany-employee,Unknown department,Sales\n", "text/csv"),
        })
        assert preview.status_code == 200
        assert preview.json()["errors"] == 1
        updated_department = client.put("/api/company/1001/departments/1001", headers=owner_headers, json={
            "manager_membership_id": 1001, "description": "Client team",
        })
        assert updated_department.status_code == 200
        achievement = client.post("/api/company/1001/achievements", headers=owner_headers, json={
            "title": "Measured progress", "description": "Score based", "min_score": 80, "min_trust": 70,
        })
        assert achievement.status_code == 200
        employee_achievements = client.get("/api/company/1001/achievements", headers=employee_headers)
        assert employee_achievements.status_code == 200
        assert employee_achievements.json()[0]["earned"] is False
        cohort = client.post("/api/company/1001/cohorts", headers=owner_headers, json={
            "title": "New managers", "description": "September intake", "membership_ids": [1002],
        })
        assert cohort.status_code == 200
        employee_cohorts = client.get("/api/company/1001/cohorts", headers=employee_headers)
        assert employee_cohorts.status_code == 200
        assert employee_cohorts.json()[0]["title"] == "New managers"
        preferences = client.put("/api/company/1001/notification-settings", headers=employee_headers, json={
            "settings": {"assignment": True, "deadline": False, "email": True},
        })
        assert preferences.status_code == 200
        assert preferences.json()["settings"]["email"] is True
        calendar = client.get("/api/company/1001/calendar", headers=employee_headers)
        assert calendar.status_code == 200
        assert {item["type"] for item in calendar.json()} >= {"ASSIGNMENT", "ONLINE_1X1"}
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())
