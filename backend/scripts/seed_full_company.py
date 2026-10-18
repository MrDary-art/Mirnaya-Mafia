"""Create a rich 30-person company in the local Arena database.

Run from the repository root:
    python backend/scripts/seed_full_company.py

The seed is intentionally idempotent: if the company already exists, it prints
the current summary and does not duplicate records.
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.auth import hash_password
from app.db import SessionLocal
from app.models import DirectMessage, Friendship, Notification, User
from app.social_models import (SocialComment, SocialPost, SocialPostLike,
                               SocialStory)
from app.company_models import (
    Company, CompanyAchievement, CompanyAchievementGrant, CompanyApplication,
    CompanyAssignment, CompanyAssignmentAttempt, CompanyAssignmentSchedule,
    CompanyAssignmentTarget, CompanyAuditLog, CompanyCertificate, CompanyCohort,
    CompanyCohortMember, CompanyCompetition, CompanyCompetitionParticipant,
    CompanyDepartment, CompanyInboxMessage, CompanyKPI, CompanyMaterial,
    CompanyMembership, CompanyProgram, CompanyProgramEnrollment,
    CompanyProgramStep, CompanyScenario, CompanySubscription, CompanySurvey,
    CompanySurveyResponse, CompanyTeamGoal, CompanyTournamentMatch,
)
from app.company_advanced_models import (CompanyChat, CompanyChatMember,
                                         CompanyChatMessage, CompanyChatReaction,
                                         CompanyChatTask)
from app.company_meeting_models import (CompanyMeeting, CompanyMeetingApproval,
                                        CompanyMeetingParticipant,
                                        CompanyMeetingProtocol,
                                        CompanyMeetingProtocolItem,
                                        CompanyMeetingTranscriptSegment)
from app import council_models as _council_models  # noqa: F401; resolves meeting FK metadata


COMPANY_SLUG = "severny-vek-demo"
COMPANY_NAME = "Северный Вектор"
PASSWORD = "Demo2026!"
NOW = datetime.now().replace(microsecond=0)

# username, full name, title, corporate role, department, manager username
PEOPLE = [
    ("sv_owner", "Александр Волков", "Генеральный директор", "COMPANY_OWNER", "Управление", None),
    ("sv_admin", "Марина Орлова", "Операционный директор", "COMPANY_ADMIN", "Управление", "sv_owner"),
    ("sv_lnd", "Ирина Белова", "Руководитель обучения", "LND_MANAGER", "Люди и культура", "sv_owner"),
    ("sv_auditor", "Павел Егоров", "Внутренний аудитор", "AUDITOR", "Управление", "sv_owner"),
    ("sv_hr_head", "Ольга Смирнова", "HR директор", "DEPARTMENT_MANAGER", "Люди и культура", "sv_owner"),
    ("sv_sales_head", "Дмитрий Соколов", "Директор по продажам", "DEPARTMENT_MANAGER", "Продажи", "sv_owner"),
    ("sv_product_head", "Анна Лебедева", "Директор по продукту", "DEPARTMENT_MANAGER", "Продукт", "sv_owner"),
    ("sv_support_head", "Сергей Кузнецов", "Руководитель поддержки", "DEPARTMENT_MANAGER", "Поддержка", "sv_owner"),
    ("sv_sales_lead", "Елена Морозова", "Руководитель группы продаж", "TEAM_LEAD", "Продажи", "sv_sales_head"),
    ("sv_product_lead", "Михаил Новиков", "Руководитель продуктовой команды", "TEAM_LEAD", "Продукт", "sv_product_head"),
    ("sv_support_lead", "Наталья Попова", "Руководитель смены", "TEAM_LEAD", "Поддержка", "sv_support_head"),
    ("sv_mentor", "Артём Фёдоров", "Корпоративный наставник", "MENTOR", "Люди и культура", "sv_lnd"),
    ("sv_sales_01", "Алексей Иванов", "Менеджер по ключевым клиентам", "EMPLOYEE", "Продажи", "sv_sales_lead"),
    ("sv_sales_02", "Вероника Федотова", "Менеджер по продажам", "EMPLOYEE", "Продажи", "sv_sales_lead"),
    ("sv_sales_03", "Роман Макаров", "Менеджер по продажам", "EMPLOYEE", "Продажи", "sv_sales_lead"),
    ("sv_sales_04", "Ксения Захарова", "Специалист по развитию", "EMPLOYEE", "Продажи", "sv_sales_lead"),
    ("sv_sales_05", "Илья Павлов", "Аккаунт менеджер", "EMPLOYEE", "Продажи", "sv_sales_head"),
    ("sv_product_01", "София Виноградова", "Продуктовый аналитик", "EMPLOYEE", "Продукт", "sv_product_lead"),
    ("sv_product_02", "Максим Семёнов", "Продуктовый дизайнер", "EMPLOYEE", "Продукт", "sv_product_lead"),
    ("sv_product_03", "Дарья Голубева", "Бизнес аналитик", "EMPLOYEE", "Продукт", "sv_product_lead"),
    ("sv_product_04", "Никита Богданов", "Исследователь", "EMPLOYEE", "Продукт", "sv_product_lead"),
    ("sv_product_05", "Алина Воробьёва", "Продакт менеджер", "EMPLOYEE", "Продукт", "sv_product_head"),
    ("sv_support_01", "Виктор Комаров", "Специалист поддержки", "EMPLOYEE", "Поддержка", "sv_support_lead"),
    ("sv_support_02", "Татьяна Куликова", "Специалист поддержки", "EMPLOYEE", "Поддержка", "sv_support_lead"),
    ("sv_support_03", "Егор Андреев", "Специалист поддержки", "EMPLOYEE", "Поддержка", "sv_support_lead"),
    ("sv_support_04", "Полина Титова", "Менеджер качества", "EMPLOYEE", "Поддержка", "sv_support_head"),
    ("sv_hr_01", "Валерия Крылова", "HR бизнес партнёр", "EMPLOYEE", "Люди и культура", "sv_hr_head"),
    ("sv_hr_02", "Константин Гусев", "Рекрутер", "EMPLOYEE", "Люди и культура", "sv_hr_head"),
    ("sv_finance_01", "Людмила Савельева", "Финансовый аналитик", "EMPLOYEE", "Финансы", "sv_admin"),
    ("sv_finance_02", "Степан Медведев", "Экономист", "EMPLOYEE", "Финансы", "sv_admin"),
]


def j(value) -> str:
    return json.dumps(value, ensure_ascii=False)


async def scalar_count(db, model, *where) -> int:
    query = select(func.count()).select_from(model)
    if where:
        query = query.where(*where)
    return int((await db.execute(query)).scalar_one())


async def existing_summary(db, company: Company) -> dict:
    return {
        "created": False,
        "company_id": company.id,
        "company": company.name,
        "join_code": company.join_code,
        "employees": await scalar_count(db, CompanyMembership, CompanyMembership.company_id == company.id, CompanyMembership.status == "ACTIVE"),
        "assignments": await scalar_count(db, CompanyAssignment, CompanyAssignment.company_id == company.id),
        "attempts": await scalar_count(db, CompanyAssignmentAttempt, CompanyAssignmentAttempt.company_id == company.id),
        "chats": await scalar_count(db, CompanyChat, CompanyChat.company_id == company.id),
        "login": {"username": "sv_owner", "password": PASSWORD},
    }


async def seed() -> dict:
    async with SessionLocal() as db:
        company = (await db.execute(select(Company).where(Company.slug == COMPANY_SLUG))).scalar_one_or_none()
        if company:
            return await existing_summary(db, company)

        password_hash = hash_password(PASSWORD)
        users: dict[str, User] = {}
        for index, (username, full_name, title, _role, _dept, _manager) in enumerate(PEOPLE, start=1):
            first, *tail = full_name.split()
            last = tail[0] if tail else ""
            user = User(
                username=username, password_hash=password_hash,
                email=f"{username}@severny-vector.test", email_verified_at=NOW,
                display_name=full_name, first_name=first, last_name=last,
                title=title, specialization=title, organization=COMPANY_NAME,
                about=("Отвечаю за развитие компании и управленческие решения." if index <= 8
                       else "Развиваю навыки переговоров и помогаю команде достигать общих целей."),
                city="Москва" if index % 3 else "Санкт-Петербург",
                arena_id=f"SV-{index:03d}", level=2 + index % 8,
                xp=180 + index * 95, stars=3 + index % 24,
                avatar_code=["avatar_analyst", "avatar_diplomat", "avatar_strategist"][index % 3],
                is_demo=1,
            )
            db.add(user)
            users[username] = user
        await db.flush()

        owner = users["sv_owner"]
        company = Company(
            name=COMPANY_NAME, short_name="Северный Вектор", slug=COMPANY_SLUG,
            join_code="SVEC-2026", description="Технологическая компания, развивающая сервисы для командной работы.",
            industry="Информационные технологии", company_size="30 сотрудников",
            country="Россия", city="Москва", website="https://severny-vector.test",
            corporate_color="#4F735D", secondary_color="#DDE3D8",
            academy_name="Академия Северного Вектора", timezone="Europe/Moscow",
            settings=j({"employee_directory": True, "internal_feed": True, "demo_dataset": True}),
            created_by=owner.id,
        )
        db.add(company)
        await db.flush()
        db.add(CompanySubscription(company_id=company.id, plan_code="BUSINESS", status="ACTIVE",
                                   licensed_seats=50, billing_provider="MANUAL",
                                   period_started_at=NOW - timedelta(days=20), period_ends_at=NOW + timedelta(days=345)))

        departments: dict[str, CompanyDepartment] = {}
        for name, description in [
            ("Управление", "Стратегия, операции и аудит"),
            ("Люди и культура", "Найм, развитие и обучение"),
            ("Продажи", "Работа с клиентами и развитие бизнеса"),
            ("Продукт", "Исследование и развитие продукта"),
            ("Поддержка", "Клиентский сервис и качество"),
            ("Финансы", "Планирование и управленческий учёт"),
        ]:
            row = CompanyDepartment(company_id=company.id, name=name, description=description)
            db.add(row)
            departments[name] = row
        await db.flush()

        memberships: dict[str, CompanyMembership] = {}
        for index, (username, _name, title, role, dept, _manager) in enumerate(PEOPLE, start=1):
            member = CompanyMembership(
                company_id=company.id, user_id=users[username].id,
                department_id=departments[dept].id, job_title=title,
                employee_number=f"SV-{1000 + index}", corporate_role=role,
                status="ACTIVE", company_visibility="company", is_primary=1,
                joined_at=NOW - timedelta(days=420 - index * 7), verified_at=NOW - timedelta(days=400 - index * 7),
                invited_by=owner.id, personalization_enabled=1,
                notification_settings=j({"assignments": True, "messages": True, "digest": "weekly"}),
            )
            db.add(member)
            memberships[username] = member
        await db.flush()
        for username, _name, _title, _role, _dept, manager in PEOPLE:
            if manager:
                memberships[username].manager_membership_id = memberships[manager].id
            if username.startswith("sv_sales_") or username.startswith("sv_product_") or username.startswith("sv_support_"):
                memberships[username].mentor_membership_id = memberships["sv_mentor"].id
        for dept_name, manager_name in {
            "Управление": "sv_owner", "Люди и культура": "sv_hr_head", "Продажи": "sv_sales_head",
            "Продукт": "sv_product_head", "Поддержка": "sv_support_head", "Финансы": "sv_admin",
        }.items():
            departments[dept_name].manager_membership_id = memberships[manager_name].id

        # Three candidates show pending, approved and declined application states.
        for idx, (username, name, status) in enumerate([
            ("sv_candidate", "Мария Жукова", "PENDING"),
            ("sv_candidate_ok", "Денис Наумов", "APPROVED"),
            ("sv_candidate_no", "Екатерина Романова", "DECLINED"),
        ], start=1):
            candidate = User(username=username, password_hash=password_hash, email=f"{username}@mail.test",
                             email_verified_at=NOW, display_name=name, city="Москва", is_demo=1)
            db.add(candidate)
            await db.flush()
            db.add(CompanyApplication(company_id=company.id, user_id=candidate.id,
                                      desired_job_title=["Менеджер проектов", "Аналитик", "Менеджер по продажам"][idx - 1],
                                      specialization="Коммуникации", message="Хочу присоединиться к команде и развивать продукт.",
                                      status=status, reviewed_by=owner.id if status != "PENDING" else None,
                                      review_note="Решение принято после интервью" if status != "PENDING" else None,
                                      reviewed_at=NOW - timedelta(days=idx) if status != "PENDING" else None))

        kpis = []
        for name, unit, threshold, weight in [
            ("Аргументация", "баллы", 70, 25), ("Работа с возражениями", "баллы", 65, 25),
            ("Эмпатия", "баллы", 70, 20), ("Достижение цели", "баллы", 75, 30),
        ]:
            row = CompanyKPI(company_id=company.id, name=name, unit=unit, threshold=threshold,
                             weight=weight, required=1, max_score=100, status="ACTIVE")
            db.add(row); kpis.append(row)

        scenarios = []
        scenario_specs = [
            ("Переговоры о продлении контракта", "Аккаунт менеджер", "Директор клиента"),
            ("Сложный разговор о сроках", "Руководитель проекта", "Заказчик"),
            ("Обратная связь сотруднику", "Руководитель", "Сотрудник"),
            ("Эскалация в поддержке", "Специалист поддержки", "Недовольный клиент"),
            ("Защита продуктовой гипотезы", "Продакт менеджер", "Инвесткомитет"),
        ]
        for index, (title, employee_role, opponent_role) in enumerate(scenario_specs):
            row = CompanyScenario(
                company_id=company.id, title=title,
                description="Практический сценарий на основе типичной рабочей ситуации.",
                industry="IT", employee_role=employee_role, opponent_role=opponent_role,
                context="Участникам нужно согласовать решение при ограниченных сроках и ресурсах.",
                employee_goal="Сохранить рабочие отношения и добиться измеримого соглашения.",
                opponent_goal="Защитить свои интересы и получить ясные обязательства.",
                difficulty=["лёгкая", "средняя", "сложная"][index % 3], tone="деловой",
                success_criteria=j(["Выявлена потребность", "Предложены варианты", "Зафиксирован следующий шаг"]),
                scenario_steps="[]", status="PUBLISHED",
                author_id=users["sv_lnd"].id, owner_id=owner.id, last_editor_id=users["sv_lnd"].id,
            )
            db.add(row); scenarios.append(row)
        await db.flush()

        programs = []
        for title, desc, audience in [
            ("Сильные переговоры", "Базовая программа для клиентских и внутренних переговоров", "Все сотрудники"),
            ("Школа руководителя", "Обратная связь, делегирование и сложные разговоры", "Руководители"),
            ("Клиентский сервис", "Работа с возражениями и эскалациями", "Продажи и поддержка"),
        ]:
            row = CompanyProgram(company_id=company.id, title=title, description=desc, audience=audience,
                                 steps="[]", status="ACTIVE", owner_id=users["sv_lnd"].id)
            db.add(row); programs.append(row)
        await db.flush()

        assignments = []
        assignment_specs = [
            ("Диагностика переговорных навыков", 0, 0, 60),
            ("Возражение по цене", 0, 1, 70),
            ("Фиксация договорённостей", 0, 0, 75),
            ("Развивающая обратная связь", 1, 2, 70),
            ("Делегирование важной задачи", 1, 2, 70),
            ("Клиентская эскалация", 2, 3, 75),
            ("Продление годового контракта", 2, 0, 80),
            ("Защита новой функции", 0, 4, 70),
        ]
        for index, (title, program_idx, scenario_idx, passing) in enumerate(assignment_specs):
            row = CompanyAssignment(
                company_id=company.id, title=title, description="Практическое задание с персональным результатом.",
                goal="Отработать навык и получить обратную связь", content_type="COMPANY_SCENARIO",
                company_scenario_id=scenarios[scenario_idx].id, program_id=programs[program_idx].id,
                difficulty=["лёгкая", "средняя", "сложная"][index % 3],
                employee_role=scenarios[scenario_idx].employee_role, opponent=scenarios[scenario_idx].opponent_role,
                deadline=NOW + timedelta(days=5 + index * 4), attempts_allowed=3, passing_score=passing,
                issue_certificate=1 if index in {2, 4, 6} else 0,
                kpi_snapshot=j([{"id": n + 1, "name": k.name, "weight": k.weight} for n, k in enumerate(kpis)]),
                assignment_snapshot=j({"seed": "full-company", "version": 1}), status="ACTIVE",
                created_by=users["sv_lnd"].id,
            )
            db.add(row); assignments.append(row)
        await db.flush()

        for program_idx, program in enumerate(programs):
            linked = [a for a in assignments if a.program_id == program.id]
            program.steps = j([{"position": n, "assignment_id": a.id, "title": a.title} for n, a in enumerate(linked, 1)])
            for n, assignment in enumerate(linked, 1):
                db.add(CompanyProgramStep(company_id=company.id, program_id=program.id, position=n,
                                          title=assignment.title, assignment_id=assignment.id,
                                          content_type="ASSIGNMENT", unlock_rule="PREVIOUS", min_score=assignment.passing_score))

        employee_members = [memberships[p[0]] for p in PEOPLE if p[3] in {"EMPLOYEE", "TEAM_LEAD", "DEPARTMENT_MANAGER"}]
        targets = []
        attempts = []
        for ai, assignment in enumerate(assignments):
            recipients = employee_members[ai % 4::2] if ai >= 5 else employee_members
            for mi, member in enumerate(recipients):
                state = ["PASSED", "PASSED", "IN_PROGRESS", "ASSIGNED", "FAILED"][(mi + ai) % 5]
                score = None if state in {"ASSIGNED", "IN_PROGRESS"} else 52 + ((mi * 7 + ai * 9) % 45)
                target = CompanyAssignmentTarget(
                    company_id=company.id, assignment_id=assignment.id, membership_id=member.id,
                    status=state, best_score=score, attempts_used=0 if state == "ASSIGNED" else 1,
                    opened_at=None if state == "ASSIGNED" else NOW - timedelta(days=12 - ai),
                    completed_at=NOW - timedelta(days=(mi + ai) % 9) if state in {"PASSED", "FAILED"} else None,
                )
                db.add(target); targets.append(target)
                await db.flush()
                if state in {"PASSED", "FAILED"}:
                    attempt = CompanyAssignmentAttempt(
                        company_id=company.id, assignment_id=assignment.id, target_id=target.id,
                        membership_id=member.id, arena_score=score, company_score=max(40, score - 4),
                        final_score=score, metrics_snapshot=j({"clarity": score, "empathy": max(45, score - 5), "result": min(100, score + 3)}),
                        kpi_results=j([{"name": k.name, "score": max(35, score - n * 2)} for n, k in enumerate(kpis)]),
                        status="COMPLETED", started_at=NOW - timedelta(days=(mi + ai) % 9, minutes=25),
                        completed_at=NOW - timedelta(days=(mi + ai) % 9),
                    )
                    db.add(attempt); attempts.append(attempt)
        await db.flush()

        for pi, program in enumerate(programs):
            for mi, member in enumerate(employee_members):
                if (mi + pi) % 2 == 0:
                    completed = [1] if mi % 3 else [1, 2]
                    db.add(CompanyProgramEnrollment(company_id=company.id, program_id=program.id,
                                                    membership_id=member.id, status="ACTIVE",
                                                    unlocked_step=min(3, len(completed) + 1), completed_steps=j(completed)))

        cohorts = []
        for title, leader, members_slice in [
            ("Руководители 2026", "sv_lnd", employee_members[:8]),
            ("Клиентские команды", "sv_sales_head", employee_members[8:20]),
        ]:
            cohort = CompanyCohort(company_id=company.id, title=title, description="Учебная группа с общим треком.",
                                   leader_membership_id=memberships[leader].id, starts_at=NOW - timedelta(days=15),
                                   ends_at=NOW + timedelta(days=45), goal="Повысить качество рабочих диалогов",
                                   focus_skills=j(["переговоры", "обратная связь"]), created_by=users["sv_lnd"].id)
            db.add(cohort); cohorts.append(cohort); await db.flush()
            for member in members_slice:
                db.add(CompanyCohortMember(cohort_id=cohort.id, membership_id=member.id))

        achievements = []
        for title, icon, condition in [
            ("Первый результат", "★", {"completed": 1}),
            ("Сильный переговорщик", "◆", {"score": 85}),
            ("Серия обучения", "●", {"completed": 5}),
        ]:
            row = CompanyAchievement(company_id=company.id, title=title,
                                     description="Корпоративное достижение за прогресс в обучении.", icon=icon,
                                     conditions=j(condition), created_by=users["sv_lnd"].id)
            db.add(row); achievements.append(row)
        await db.flush()
        for index, member in enumerate(employee_members[:14]):
            db.add(CompanyAchievementGrant(company_id=company.id,
                                           achievement_id=achievements[index % len(achievements)].id,
                                           membership_id=member.id,
                                           assignment_attempt_id=attempts[index].id if index < len(attempts) else None))

        for index, member in enumerate(employee_members[:10]):
            db.add(CompanyCertificate(company_id=company.id, membership_id=member.id,
                                      program_id=programs[index % 3].id,
                                      title=f"Сертификат: {programs[index % 3].title}",
                                      certificate_id=f"SV-CERT-2026-{index + 1:03d}",
                                      verification_code=f"SVV-{company.id}-{index + 1:04d}"))

        surveys = []
        for title, anonymous in [("Качество программы переговоров", 1), ("Потребности в обучении", 0)]:
            survey = CompanySurvey(company_id=company.id, title=title,
                                   questions=j([{"id": "q1", "text": "Оцените полезность", "type": "scale"},
                                                {"id": "q2", "text": "Что улучшить?", "type": "text"}]),
                                   anonymous=anonymous, created_by=users["sv_lnd"].id)
            db.add(survey); surveys.append(survey)
        await db.flush()
        for survey in surveys:
            for idx, member in enumerate(employee_members[:16]):
                db.add(CompanySurveyResponse(company_id=company.id, survey_id=survey.id, membership_id=member.id,
                                             answers=j({"q1": 3 + idx % 3, "q2": "Больше разборов реальных ситуаций"})))

        for title, scope, dept in [
            ("Памятка по подготовке к переговорам", "COMPANY", None),
            ("Стандарт клиентской встречи", "DEPARTMENT", "Продажи"),
            ("Чек-лист сложной эскалации", "DEPARTMENT", "Поддержка"),
        ]:
            db.add(CompanyMaterial(company_id=company.id, title=title,
                                   description="Рабочий материал для подготовки и самостоятельной практики.",
                                   content_type="TEXT", content="1. Определите цель. 2. Подготовьте вопросы. 3. Зафиксируйте следующий шаг.",
                                   scope_type=scope, department_id=departments[dept].id if dept else None,
                                   created_by=users["sv_lnd"].id))

        competition = CompanyCompetition(company_id=company.id, title="Кубок переговорщиков — осень 2026",
                                         assignment_id=assignments[1].id, starts_at=NOW - timedelta(days=3),
                                         ends_at=NOW + timedelta(days=20), created_by=owner.id,
                                         rules=j({"rounds": 3, "score": "best"}))
        db.add(competition); await db.flush()
        competitors = employee_members[5:13]
        for idx, member in enumerate(competitors):
            db.add(CompanyCompetitionParticipant(competition_id=competition.id, membership_id=member.id,
                                                 team_name="Север" if idx < 4 else "Вектор"))
        for pos in range(4):
            db.add(CompanyTournamentMatch(competition_id=competition.id, round_number=1, position=pos + 1,
                                          first_membership_id=competitors[pos * 2].id,
                                          second_membership_id=competitors[pos * 2 + 1].id,
                                          winner_membership_id=competitors[pos * 2].id if pos < 2 else None,
                                          status="COMPLETED" if pos < 2 else "SCHEDULED"))
        for dept, target in [("Продажи", 82), ("Поддержка", 78), ("Продукт", 75)]:
            db.add(CompanyTeamGoal(company_id=company.id, title=f"Средний результат команды «{dept}»",
                                   target_score=target, department_id=departments[dept].id,
                                   deadline=NOW + timedelta(days=30), created_by=owner.id))
        db.add(CompanyAssignmentSchedule(company_id=company.id, template_assignment_id=assignments[1].id,
                                         cadence="MONTHLY", next_run_at=NOW + timedelta(days=20), deadline_offset_days=7,
                                         recipient_membership_ids=j([m.id for m in employee_members[:12]]),
                                         created_by=users["sv_lnd"].id))

        # Corporate chat channels, messages, reactions and one task from a message.
        chat_specs = [
            ("Общий чат", list(memberships.values())),
            ("Продажи", [m for u, m in memberships.items() if "sales" in u]),
            ("Продукт", [m for u, m in memberships.items() if "product" in u]),
            ("Руководители", [m for u, m in memberships.items() if PEOPLE[[p[0] for p in PEOPLE].index(u)][3] != "EMPLOYEE"]),
        ]
        chats = []
        first_chat_message = None
        for ci, (title, members) in enumerate(chat_specs):
            chat = CompanyChat(company_id=company.id, kind="GROUP", title=title,
                               created_by_membership_id=memberships["sv_admin"].id)
            db.add(chat); chats.append(chat); await db.flush()
            for member in members:
                db.add(CompanyChatMember(company_id=company.id, chat_id=chat.id, membership_id=member.id,
                                         role="OWNER" if member.id == memberships["sv_admin"].id else "MEMBER",
                                         last_read_at=NOW - timedelta(hours=ci)))
            authors = members[:min(5, len(members))]
            for mi, text in enumerate([
                f"Добро пожаловать в канал «{title}».",
                "Коллеги, план обучения на месяц опубликован.",
                "Поделитесь примерами сложных переговоров к пятнице.",
                "Напоминаю: результаты видит сотрудник и его руководитель по своей зоне доступа.",
            ]):
                message = CompanyChatMessage(company_id=company.id, chat_id=chat.id,
                                             author_membership_id=authors[mi % len(authors)].id,
                                             text=text, attachments="[]",
                                             created_at=NOW - timedelta(hours=12 - mi - ci))
                db.add(message); await db.flush()
                if first_chat_message is None:
                    first_chat_message = message
        db.add(CompanyChatReaction(company_id=company.id, message_id=first_chat_message.id,
                                   membership_id=memberships["sv_sales_head"].id, reaction="👍"))
        db.add(CompanyChatTask(company_id=company.id, message_id=first_chat_message.id,
                               assignee_membership_id=memberships["sv_lnd"].id,
                               title="Опубликовать календарь обучения", status="OPEN",
                               due_at=NOW + timedelta(days=2), created_by_membership_id=memberships["sv_admin"].id))

        # Meetings and a published protocol.
        meeting = CompanyMeeting(company_id=company.id, organizer_membership_id=memberships["sv_admin"].id,
                                 kind="MEETING", title="Еженедельная встреча руководителей",
                                 description="Статус команд, обучение и риски", agenda=j(["Результаты недели", "План обучения", "Риски"]),
                                 visibility="PARTICIPANTS", status="FINISHED", scheduled_at=NOW - timedelta(days=2),
                                 duration_minutes=45, finished_at=NOW - timedelta(days=2) + timedelta(minutes=45))
        db.add(meeting); await db.flush()
        leaders = [memberships[u] for u in ["sv_owner", "sv_admin", "sv_lnd", "sv_sales_head", "sv_product_head", "sv_support_head"]]
        for idx, member in enumerate(leaders):
            db.add(CompanyMeetingParticipant(meeting_id=meeting.id, membership_id=member.id,
                                             role="ORGANIZER" if idx == 1 else "PARTICIPANT",
                                             invite_status="ACCEPTED", consent_status="CONSENTED",
                                             consented_at=NOW - timedelta(days=3), joined_at=meeting.scheduled_at))
        for idx, text in enumerate(["Обсудили прогресс обучения.", "Продажи запросили тренинг по цене.", "Решили запустить практику до конца месяца."]):
            db.add(CompanyMeetingTranscriptSegment(meeting_id=meeting.id, speaker_membership_id=leaders[idx].id,
                                                   start_ms=idx * 60000, end_ms=(idx + 1) * 60000, text=text, confidence=96))
        protocol = CompanyMeetingProtocol(meeting_id=meeting.id, status="PUBLISHED", version=1,
                                          summary="Согласован план практики переговоров для клиентских команд.",
                                          published_at=NOW - timedelta(days=1), published_by_membership_id=memberships["sv_admin"].id)
        db.add(protocol); await db.flush()
        db.add(CompanyMeetingProtocolItem(protocol_id=protocol.id, kind="ACTION", status="APPROVED",
                                          title="Запустить практику по работе с ценой",
                                          detail="Назначить сценарий отделам продаж и поддержки.",
                                          assignee_membership_id=memberships["sv_lnd"].id,
                                          due_at=NOW + timedelta(days=5), acceptance_criteria="Назначение видно всем участникам", source_segment_ids="[2]"))
        for member in leaders[:3]:
            db.add(CompanyMeetingApproval(protocol_id=protocol.id, membership_id=member.id,
                                          version=1, status="APPROVED", comment="Согласовано"))

        # Social community content, personal messages, friendships and notifications.
        posts = []
        for idx, (author, body) in enumerate([
            ("sv_owner", "Команда, начинаем новый цикл развития переговорных навыков."),
            ("sv_lnd", "Опубликована программа «Сильные переговоры». Первое назначение уже доступно."),
            ("sv_sales_head", "Продажи поделились кейсом о продлении крупного контракта."),
            ("sv_support_head", "Собрали памятку по работе со сложной клиентской эскалацией."),
            ("sv_product_head", "Продуктовая команда приглашает на открытую защиту гипотез."),
        ]):
            post = SocialPost(author_user_id=users[author].id, as_company_id=company.id,
                              kind="TEXT", body=body, search_text=body.lower(), audience="COMPANY_INTERNAL",
                              status="PUBLISHED", published_at=NOW - timedelta(days=5 - idx),
                              pinned_at=NOW - timedelta(days=5) if idx == 0 else None)
            db.add(post); posts.append(post)
        await db.flush()
        for idx, post in enumerate(posts):
            for liker in list(users.values())[5 + idx:10 + idx]:
                db.add(SocialPostLike(post_id=post.id, user_id=liker.id))
            db.add(SocialComment(post_id=post.id, author_user_id=list(users.values())[12 + idx].id,
                                 text="Спасибо, беру в работу." if idx % 2 else "Полезно, обсудим на встрече."))
        for idx, owner_name in enumerate(["sv_lnd", "sv_sales_head", "sv_product_head"]):
            db.add(SocialStory(owner_user_id=users[owner_name].id, as_company_id=company.id,
                               text=["Сегодня разбор кейсов", "Команда готовится к турниру", "Защита гипотез в 16:00"][idx],
                               background=["forest", "sand", "graphite"][idx], audience="COMPANY_INTERNAL",
                               expires_at=NOW + timedelta(hours=18 + idx)))

        friendships = [("sv_owner", "sv_admin"), ("sv_sales_head", "sv_sales_lead"),
                       ("sv_product_head", "sv_product_lead"), ("sv_support_head", "sv_support_lead")]
        for a, b in friendships:
            db.add(Friendship(user_id=users[a].id, friend_id=users[b].id, status="ACCEPTED"))
            db.add(Friendship(user_id=users[b].id, friend_id=users[a].id, status="ACCEPTED"))
            db.add(DirectMessage(sender_id=users[a].id, receiver_id=users[b].id,
                                 text="Посмотри, пожалуйста, новые назначения команды.", is_read=1))
            db.add(DirectMessage(sender_id=users[b].id, receiver_id=users[a].id,
                                 text="Посмотрел, всё понятно. Вернусь с обратной связью.", is_read=0))
        for idx, member in enumerate(list(memberships.values())):
            db.add(CompanyInboxMessage(company_id=company.id, membership_id=member.id,
                                       type="ASSIGNMENT", title="Новое назначение",
                                       text="Вам доступно новое практическое задание.",
                                       payload=j({"assignment_id": assignments[idx % len(assignments)].id}), is_read=idx % 3 == 0))
            db.add(Notification(user_id=member.user_id, type="company_assignment",
                                payload=j({"company_id": company.id, "title": assignments[idx % len(assignments)].title}),
                                is_read=idx % 4 == 0))

        for idx, action in enumerate(["COMPANY_CREATED", "MEMBERS_IMPORTED", "PROGRAM_PUBLISHED", "ASSIGNMENTS_CREATED", "SURVEY_STARTED"]):
            db.add(CompanyAuditLog(company_id=company.id, actor_user_id=owner.id if idx < 2 else users["sv_lnd"].id,
                                   action=action, entity_type="COMPANY", entity_id=str(company.id),
                                   details=j({"seed": True, "step": idx + 1})))

        await db.commit()
        return {
            "created": True, "company_id": company.id, "company": company.name,
            "join_code": company.join_code, "employees": 30, "departments": len(departments),
            "applications": 3, "programs": len(programs), "assignments": len(assignments),
            "assignment_targets": len(targets), "completed_attempts": len(attempts),
            "chats": len(chats), "social_posts": len(posts), "meetings": 1,
            "login_examples": {
                "owner": "sv_owner", "admin": "sv_admin", "learning_manager": "sv_lnd",
                "auditor": "sv_auditor", "department_manager": "sv_sales_head",
                "team_lead": "sv_sales_lead", "mentor": "sv_mentor", "employee": "sv_sales_01",
                "password_for_all": PASSWORD,
            },
        }


def main() -> None:
    result = asyncio.run(seed())
    output = ROOT / "docs" / "FULL_COMPANY_DEMO.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
