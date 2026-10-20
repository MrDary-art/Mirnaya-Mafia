"""Seed the permanent local demo accounts used to inspect every analytics threshold.

Run from the repository root:
    python backend/scripts/seed_permanent_demo_accounts.py

The script never changes the existing ``owner`` administrator account or
password.  It creates a separate company-owner account, its employees, and
their missing results.  It is idempotent.
Do not run it against a public installation without an explicit deployment
decision: the credentials below are intentionally shared for local demos.
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.auth import hash_password
from app import company_advanced_models as _company_advanced_models  # noqa: F401 - registers membership foreign keys
from app import company_episode_models as _company_episode_models  # noqa: F401 - registers assignment foreign keys
from app import social_models as _social_models  # noqa: F401 - registers support foreign keys
from app.company_models import (Company, CompanyAssignment, CompanyAssignmentAttempt,
                                CompanyAssignmentTarget, CompanyDepartment, CompanyMembership)
from app.council_models import CouncilModerator
from app.db import SessionLocal
from app.models import Session, User
from app.personal_insights import build_potential_twin, build_progress, eligible_personal_reports
from app.support_models import SupportTicket, SupportTicketMessage


ADMIN_USERNAME = "owner"
COMPANY_OWNER_USERNAME = "owner_staff"
COMPANY_OWNER_NAME = "Алексей Воронцов"
COMPANY_OWNER_PASSWORD = "Modus2026!"
EMPLOYEE_PASSWORD = "Demo2026!"
ANALYTICS_USERNAME = "analytics16"
MODERATOR_USERNAME = "moder_demo"
STAFF_PROFILES = [
    ("Анна Соколова", "Менеджер по работе с ключевыми клиентами"),
    ("Дмитрий Орлов", "Менеджер по продажам"),
    ("Мария Лебедева", "Менеджер клиентского сервиса"),
    ("Илья Кузнецов", "Руководитель проектов"),
    ("Екатерина Морозова", "HR-менеджер"),
    ("Сергей Волков", "Менеджер по закупкам"),
    ("Ольга Новикова", "Аккаунт-менеджер"),
    ("Артём Павлов", "Менеджер по развитию партнёрств"),
    ("Елена Белова", "Бизнес-аналитик"),
    ("Никита Фёдоров", "Координатор внедрения"),
]
EMPLOYEES = [(f"modus_staff_{number:02d}", name) for number, (name, _) in enumerate(STAFF_PROFILES, 1)]
ASSIGNMENTS = [
    ("Демо · разговор о цене", "sales_discount_01", "Согласовать ценность без необоснованной скидки"),
    ("Демо · согласование сроков", "project_deadline_01", "Согласовать реалистичный срок и следующий шаг"),
]
METRIC_ROWS = [
    {"trust": 52 + index * 2, "goal": 55 + index * 2, "control": 49 + index * 3, "eq": 58 + index}
    for index in range(16)
]


def dump(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def score(metrics: dict[str, int]) -> int:
    return round(sum(metrics.values()) / len(metrics))


async def user_for(db, username: str, name: str, password_hash: str, *, title: str) -> User:
    user = await db.scalar(select(User).where(User.username == username))
    if user:
        return user
    first, _, last = name.partition(" ")
    user = User(username=username, login=username, password_hash=password_hash, is_demo=1,
                display_name=name, first_name=first, last_name=last or None, title=title,
                specialization="Переговоры", city="Москва",
                arena_id=f"DEMO-{username.upper()}", level=4, stars=35, xp=1450)
    db.add(user)
    await db.flush()
    return user


async def membership_for(db, company: Company, user: User, owner: CompanyMembership, department: CompanyDepartment, number: int) -> CompanyMembership:
    membership = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id, CompanyMembership.user_id == user.id))
    if membership:
        return membership
    membership = CompanyMembership(company_id=company.id, user_id=user.id, department_id=department.id,
        job_title="Менеджер по работе с клиентами", employee_number=f"DEMO-{number:02d}",
        corporate_role="EMPLOYEE", manager_membership_id=owner.id, status="ACTIVE", is_primary=1,
        joined_at=datetime.now() - timedelta(days=60 - number), verified_at=datetime.now() - timedelta(days=59 - number),
        invited_by=owner.user_id, notification_settings=dump({"assignments": True, "results": True}))
    db.add(membership)
    await db.flush()
    return membership


async def migrate_legacy_staff_logins(db) -> None:
    """Keep this seed idempotent after the temporary demo1/owner prefixes."""
    for number in range(1, 11):
        username = f"modus_staff_{number:02d}"
        existing = await db.scalar(select(User).where(User.username == username))
        if existing is not None:
            continue
        for legacy_username in (f"demo1_staff_{number:02d}", f"owner_staff_{number:02d}"):
            legacy = await db.scalar(select(User).where(User.username == legacy_username))
            if legacy is not None:
                legacy.username = username
                if legacy.login in {None, legacy_username}:
                    legacy.login = username
                break


async def ensure_company_owner(db, company: Company) -> User:
    """Separate platform administration from ownership of the demo company."""
    company_owner = await user_for(
        db, COMPANY_OWNER_USERNAME, COMPANY_OWNER_NAME, hash_password(COMPANY_OWNER_PASSWORD),
        title="Генеральный директор",
    )
    if company_owner.is_admin:
        raise RuntimeError("Владелец демонстрационной компании должен быть отдельным от администратора")
    company_owner.organization = "Модус Технологии"
    membership = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id,
        CompanyMembership.user_id == company.created_by,
        CompanyMembership.status == "ACTIVE",
    ))
    if membership is None:
        membership = await db.scalar(select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.corporate_role == "COMPANY_OWNER",
            CompanyMembership.status == "ACTIVE",
        ))
    if membership is None:
        membership = CompanyMembership(
            company_id=company.id, user_id=company_owner.id, corporate_role="COMPANY_OWNER",
            status="ACTIVE", is_primary=1, joined_at=datetime.now(), verified_at=datetime.now(),
        )
        db.add(membership)
    else:
        membership.user_id = company_owner.id
        membership.corporate_role = "COMPANY_OWNER"
        membership.status = "ACTIVE"
        membership.is_primary = 1
    company.created_by = company_owner.id
    membership.job_title = "Генеральный директор"
    assignments = (await db.scalars(select(CompanyAssignment).where(
        CompanyAssignment.company_id == company.id))).all()
    for assignment in assignments:
        assignment.created_by = company_owner.id
    await db.flush()
    return company_owner


async def seed_company_results(db, company: Company, owner: User) -> tuple[int, int]:
    company.name = "Модус Технологии"
    company.short_name = "Модус"
    company.slug = "modus-technologies-demo"
    company.description = ("Российская продуктовая команда, которая развивает цифровые сервисы "
                           "для распределённых коммерческих и клиентских команд.")
    company.industry = "Информационные технологии"
    company.company_size = "51–200"
    company.country, company.city = "Россия", "Москва"
    company.website = "https://modus-technologies.example"
    company.academy_name = "Модус · Академия переговоров"
    company.corporate_color, company.secondary_color = "#1F4D3A", "#9FC3B2"
    owner_membership = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id, CompanyMembership.user_id == owner.id,
        CompanyMembership.status == "ACTIVE"))
    if owner_membership is None:
        raise RuntimeError("У owner нет активного членства в своей компании")
    department = await db.scalar(select(CompanyDepartment).where(
        CompanyDepartment.company_id == company.id, CompanyDepartment.name == "Демо-команда"))
    if department is None:
        department = CompanyDepartment(company_id=company.id, name="Демо-команда",
            description="Постоянные демонстрационные сотрудники для просмотра аналитики.")
        db.add(department)
        await db.flush()

    await migrate_legacy_staff_logins(db)
    password_hash = hash_password(EMPLOYEE_PASSWORD)
    members = []
    for number, (username, name) in enumerate(EMPLOYEES, start=1):
        job_title = STAFF_PROFILES[number - 1][1]
        user = await user_for(db, username, name, password_hash, title=job_title)
        user.display_name = name
        user.first_name, user.last_name = name.split(" ", 1)
        user.title = user.specialization = job_title
        user.organization = company.name
        member = await membership_for(db, company, user, owner_membership, department, number)
        member.job_title = job_title
        member.manager_membership_id = owner_membership.id
        member.invited_by = owner.id
        members.append(member)

    assignments = []
    for title, scenario_id, goal in ASSIGNMENTS:
        assignment = await db.scalar(select(CompanyAssignment).where(
            CompanyAssignment.company_id == company.id, CompanyAssignment.title == title))
        if assignment is None:
            assignment = CompanyAssignment(company_id=company.id, title=title,
                description="Постоянное демо-задание владельца для проверки корпоративной аналитики.",
                goal=goal, content_type="ARENA_SCENARIO", scenario_id=scenario_id,
                difficulty="средняя", employee_role="Менеджер", opponent="Клиент",
                attempts_allowed=3, attempt_policy="BEST", passing_score=60, hints_allowed=1,
                ghost_allowed=1, show_result_immediately=1, arena_weight=100, company_weight=0,
                kpi_snapshot="[]", assignment_snapshot=dump({"demo_seed": "permanent-v1"}),
                status="ACTIVE", created_by=owner.id, deadline=datetime.now() + timedelta(days=30))
            db.add(assignment)
            await db.flush()
        assignments.append(assignment)

    completed = 0
    for assignment_index, assignment in enumerate(assignments):
        for member_index, member in enumerate(members):
            target = await db.scalar(select(CompanyAssignmentTarget).where(
                CompanyAssignmentTarget.assignment_id == assignment.id,
                CompanyAssignmentTarget.membership_id == member.id))
            metrics = {"trust": 62 + (member_index + assignment_index) % 20,
                       "goal": 68 + (member_index * 2 + assignment_index) % 20,
                       "control": 60 + (member_index * 3 + assignment_index) % 18,
                       "eq": 65 + (member_index + assignment_index * 2) % 18}
            final = score(metrics)
            finished = datetime.now().replace(microsecond=0) - timedelta(days=20 - member_index - assignment_index * 3)
            if target is None:
                target = CompanyAssignmentTarget(company_id=company.id, assignment_id=assignment.id,
                    membership_id=member.id, status="PASSED", best_score=final, attempts_used=1,
                    opened_at=finished - timedelta(minutes=18), completed_at=finished)
                db.add(target)
                await db.flush()
            if target.status not in {"PASSED", "FAILED", "COMPLETED"}:
                target.status, target.best_score, target.attempts_used = "PASSED", final, max(1, target.attempts_used)
                target.opened_at, target.completed_at = finished - timedelta(minutes=18), finished
            attempt = await db.scalar(select(CompanyAssignmentAttempt).where(
                CompanyAssignmentAttempt.target_id == target.id,
                CompanyAssignmentAttempt.status == "COMPLETED"))
            if attempt is None:
                session = Session(user_id=member.user_id, mode="offline", role="Менеджер", opponent_role="Клиент",
                    scenario_id=assignment.scenario_id, status="finished", verdict="success", metrics=dump(metrics),
                    settings=dump({"corporate": {"company_id": company.id, "assignment_id": assignment.id}}),
                    report=dump({"scenario_title": assignment.title, "metrics": metrics, "summary": "Демо-результат корпоративного задания."}),
                    state=dump({"history": []}), created_at=finished - timedelta(minutes=20), finished_at=finished)
                db.add(session)
                await db.flush()
                db.add(CompanyAssignmentAttempt(company_id=company.id, assignment_id=assignment.id,
                    target_id=target.id, membership_id=member.id, session_id=session.id, arena_score=final,
                    company_score=None, final_score=final, metrics_snapshot=dump(metrics), kpi_results="[]",
                    status="COMPLETED", started_at=finished - timedelta(minutes=18), completed_at=finished))
                completed += 1
    return len(members), completed


async def seed_available_practice(db, company: Company, owner: User) -> None:
    """Leave an unplayed assignment available alongside the completed examples."""
    title = "Практика · согласование условий с клиентом"
    assignment = await db.scalar(select(CompanyAssignment).where(
        CompanyAssignment.company_id == company.id, CompanyAssignment.title == title))
    if assignment is None:
        assignment = CompanyAssignment(
            company_id=company.id, title=title, created_by=owner.id,
            description="Попробуйте переговоры самостоятельно. Готовые результаты команды останутся в аналитике.",
            goal="Обсудить ценность предложения и согласовать следующий шаг",
            scenario_id="sales_discount_01", content_type="ARENA_SCENARIO",
            employee_role="Менеджер", opponent="Клиент", attempts_allowed=20,
            repeat_allowed=1, passing_score=60, status="ACTIVE",
        )
        db.add(assignment)
        await db.flush()
    members = (await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id, CompanyMembership.status == "ACTIVE"))).all()
    for member in members:
        target = await db.scalar(select(CompanyAssignmentTarget).where(
            CompanyAssignmentTarget.assignment_id == assignment.id,
            CompanyAssignmentTarget.membership_id == member.id))
        if target is None:
            db.add(CompanyAssignmentTarget(company_id=company.id, assignment_id=assignment.id,
                membership_id=member.id, status="ASSIGNED", attempts_used=0))


async def seed_personal_analytics(db) -> int:
    user = await user_for(db, ANALYTICS_USERNAME, "Аналитика 16", hash_password(EMPLOYEE_PASSWORD), title="Демо аналитики")
    rows = (await db.scalars(select(Session).where(Session.user_id == user.id, Session.scenario_id.like("demo-analytics-%")))).all()
    by_scenario = {row.scenario_id: row for row in rows}
    for index, metrics in enumerate(METRIC_ROWS, start=1):
        scenario_id = f"demo-analytics-{index:02d}"
        if scenario_id in by_scenario:
            continue
        finished = datetime.now().replace(microsecond=0) - timedelta(days=32 - index * 2)
        db.add(Session(user_id=user.id, mode="offline", role="Переговорщик", opponent_role="Клиент",
            scenario_id=scenario_id, status="finished", verdict="success", metrics=dump(metrics), settings="{}",
            report=dump({"scenario_title": f"Демо-практика {index}", "metrics": metrics,
                         "summary": "Завершённая практика для проверки личной аналитики."}),
            state=dump({"history": []}), created_at=finished - timedelta(minutes=16), finished_at=finished))
    await db.flush()
    sessions = list((await db.scalars(select(Session).where(Session.user_id == user.id))).all())
    reports = eligible_personal_reports(sessions)
    if len(reports) < 16 or build_progress(reports)["locked"] or build_potential_twin(reports)["locked"]:
        raise RuntimeError("Не удалось открыть личную аналитику для analytics16")
    return len(reports)


async def seed_moderator(db, owner: User) -> None:
    moderator = await user_for(db, MODERATOR_USERNAME, "Модератор Демо", hash_password(EMPLOYEE_PASSWORD), title="Модератор")
    appointment = await db.get(CouncilModerator, moderator.id)
    if appointment is None:
        db.add(CouncilModerator(user_id=moderator.id, appointed_by=owner.id))
    else:
        appointment.appointed_by = owner.id
    for number, (username, text) in enumerate([
        (ANALYTICS_USERNAME, "Демонстрационное обращение: где скачать мой отчёт о прогрессе? Хочу обсудить результаты с наставником."),
        (EMPLOYEES[0][0], "Демонстрационное обращение: как посмотреть готовый результат задания компании и начать новую практику?"),
    ], 1):
        ticket_id = f"permanent-demo-support-{number}"
        if await db.get(SupportTicket, ticket_id):
            continue
        user = await db.scalar(select(User).where(User.username == username))
        db.add(SupportTicket(id=ticket_id, owner_id=user.id, kind="SUPPORT", status="OPEN"))
        await db.flush()
        db.add(SupportTicketMessage(id=f"permanent-demo-message-{number}", ticket_id=ticket_id,
            author_id=user.id, staff=0, text=text))


async def seed() -> dict:
    async with SessionLocal() as db:
        admin = await db.scalar(select(User).where(User.username == ADMIN_USERNAME))
        if admin is None:
            raise RuntimeError("Сначала создайте администратора owner")
        if not admin.is_admin:
            raise RuntimeError("owner должен быть администратором сайта")
        admin.display_name = admin.title = "Администратор сайта"
        admin.organization = None
        company = await db.scalar(select(Company).where(Company.slug == "modus-technologies-demo"))
        if company is None:
            company = await db.scalar(select(Company).where(Company.created_by == admin.id).order_by(Company.id))
        if company is None:
            company = Company(name="Модус Технологии", slug="modus-technologies-demo", created_by=admin.id)
            db.add(company)
            await db.flush()
        owner = await ensure_company_owner(db, company)
        employee_count, newly_completed = await seed_company_results(db, company, owner)
        await seed_available_practice(db, company, owner)
        analytics_reports = await seed_personal_analytics(db)
        await seed_moderator(db, admin)
        await db.commit()
        return {"company": {"id": company.id, "name": company.name, "owner": COMPANY_OWNER_USERNAME,
                             "employees": employee_count, "new_completed_attempts": newly_completed},
                "accounts": {"admin": ADMIN_USERNAME, "staff_prefix": "modus_staff_01 … modus_staff_10",
                             "company_owner_password": COMPANY_OWNER_PASSWORD, "analytics": ANALYTICS_USERNAME,
                             "moderator": MODERATOR_USERNAME, "shared_password": EMPLOYEE_PASSWORD},
                "analytics16_reports": analytics_reports}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(seed()), ensure_ascii=False, indent=2))
