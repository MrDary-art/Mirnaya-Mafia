"""Seed the permanent local demo accounts used to inspect every analytics threshold.

Run from the repository root:
    python backend/scripts/seed_permanent_demo_accounts.py

The script never changes the existing ``demo1`` owner or password.  It is
idempotent and creates only the named demo accounts and their missing results.
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
from app.company_models import (Company, CompanyAssignment, CompanyAssignmentAttempt,
                                CompanyAssignmentTarget, CompanyDepartment, CompanyMembership)
from app.council_models import CouncilModerator
from app.db import SessionLocal
from app.models import Session, User
from app.personal_insights import build_potential_twin, build_progress, eligible_personal_reports


OWNER_USERNAME = "demo1"
EMPLOYEE_PASSWORD = "Demo2026!"
ANALYTICS_USERNAME = "analytics16"
MODERATOR_USERNAME = "moder_demo"
EMPLOYEES = [(f"demo1_staff_{number:02d}", f"Сотрудник демо {number:02d}") for number in range(1, 11)]
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
                specialization="Переговоры", organization="Modik", city="Москва",
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
        raise RuntimeError("У demo1 нет активного членства в своей компании")
    department = await db.scalar(select(CompanyDepartment).where(
        CompanyDepartment.company_id == company.id, CompanyDepartment.name == "Демо-команда"))
    if department is None:
        department = CompanyDepartment(company_id=company.id, name="Демо-команда",
            description="Постоянные демонстрационные сотрудники для просмотра аналитики.")
        db.add(department)
        await db.flush()

    password_hash = hash_password(EMPLOYEE_PASSWORD)
    members = []
    for number, (username, name) in enumerate(EMPLOYEES, start=1):
        user = await user_for(db, username, name, password_hash, title="Менеджер по работе с клиентами")
        members.append(await membership_for(db, company, user, owner_membership, department, number))

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
    if not await db.get(CouncilModerator, moderator.id):
        db.add(CouncilModerator(user_id=moderator.id, appointed_by=owner.id))


async def seed() -> dict:
    async with SessionLocal() as db:
        owner = await db.scalar(select(User).where(User.username == OWNER_USERNAME))
        if owner is None:
            raise RuntimeError("Сначала создайте владельца demo1 и его компанию")
        company = await db.scalar(select(Company).where(Company.created_by == owner.id).order_by(Company.id))
        if company is None:
            raise RuntimeError("У demo1 нет компании для демо-сотрудников")
        employee_count, newly_completed = await seed_company_results(db, company, owner)
        analytics_reports = await seed_personal_analytics(db)
        await seed_moderator(db, owner)
        await db.commit()
        return {"company": {"id": company.id, "name": company.name, "owner": OWNER_USERNAME,
                             "employees": employee_count, "new_completed_attempts": newly_completed},
                "accounts": {"staff_prefix": "demo1_staff_01 … demo1_staff_10", "analytics": ANALYTICS_USERNAME,
                             "moderator": MODERATOR_USERNAME, "shared_password": EMPLOYEE_PASSWORD},
                "analytics16_reports": analytics_reports}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(seed()), ensure_ascii=False, indent=2))
