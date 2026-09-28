"""Create an isolated, deterministic UI stress database.

Run from backend: python -m tools.seed_ui_stress --output ../.cache/ui-stress.db
The script refuses to overwrite any existing database and never uses app.db.engine.
"""

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import hash_password
from app.db import Base
from app import models  # noqa: F401 - register ORM metadata
from app import company_models  # noqa: F401 - register ORM metadata
from app import deployment_models  # noqa: F401 - register installation metadata
from app.features.progression import CATALOG
from app.models import DirectMessage, Friendship, Notification, Session, User, UserInventory
from app.company_models import Company, CompanyAssignment, CompanyAssignmentTarget, CompanyDepartment, CompanyMembership


async def seed(path: Path) -> None:
    if path.exists():
        raise SystemExit(f"Refusing to overwrite: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path.as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            password = hash_password("stress-demo")
            users = [User(
                username=f"stress_{number:03d}", password_hash=password,
                display_name=f"Участник {number:03d}", first_name="Участник",
                last_name=f"Номер {number:03d}", level=1 + number % 9,
                xp=number * 47, stars=number % 17,
            ) for number in range(1, 101)]
            # The final QA account can inspect administration without touching a real user.
            users[-1].is_admin = 1
            db.add_all(users)
            await db.flush()

            companies = [Company(
                name=f"Компания {number:02d}", slug=f"stress-company-{number:02d}",
                academy_name=f"Компания {number:02d} · Академия",
                created_by=users[number - 1].id,
                corporate_color="#c1f46a", secondary_color="#e7c890",
            ) for number in range(1, 21)]
            db.add_all(companies)
            await db.flush()

            departments = [CompanyDepartment(
                company_id=companies[0].id, name=f"Отдел {number:02d}",
            ) for number in range(1, 6)]
            db.add_all(departments)
            await db.flush()

            memberships = []
            for number, company in enumerate(companies):
                memberships.append(CompanyMembership(
                    company_id=company.id, user_id=users[number].id,
                    corporate_role="COMPANY_OWNER", status="ACTIVE", is_primary=1,
                    job_title="Руководитель",
                ))
            for number in range(20, 100):
                company = companies[0] if number < 60 else companies[1 + (number - 60) % 19]
                memberships.append(CompanyMembership(
                    company_id=company.id, user_id=users[number].id,
                    corporate_role="EMPLOYEE", status="ACTIVE", is_primary=1,
                    job_title=f"Специалист {number:02d}",
                    department_id=departments[number % len(departments)].id if company.id == companies[0].id else None,
                ))
            db.add_all(memberships)
            await db.flush()

            focal = users[0]
            db.add_all(Friendship(user_id=focal.id, friend_id=user.id, status="FRIENDS") for user in users[20:96])
            messages = []
            for index, friend in enumerate(users[20:76]):
                for turn in range(3):
                    messages.append(DirectMessage(
                        sender_id=focal.id if turn % 2 else friend.id,
                        receiver_id=friend.id if turn % 2 else focal.id,
                        text=f"Сообщение {turn + 1} в диалоге {index + 1}: обсудим условия встречи.",
                    ))
            long_thread_friend = users[20]
            for number in range(110):
                from_user, to_user = (focal, long_thread_friend) if number % 2 else (long_thread_friend, focal)
                messages.append(DirectMessage(
                    sender_id=from_user.id, receiver_id=to_user.id,
                    text=f"Длинная переписка, сообщение {number + 1:03d}. " + "Подробности переговоров и условий. " * 3,
                ))
            db.add_all(messages)
            db.add_all(Notification(
                user_id=focal.id, type="MESSAGE_RECEIVED",
                payload=f'{{"message":"Тестовое уведомление {number:02d}"}}',
            ) for number in range(1, 36))

            db.add_all(Session(
                user_id=focal.id, mode="scenario", role="Сотрудник",
                opponent_role="Руководитель", scenario_id="dismissal",
                status="finished", verdict=f"Тестовый итог {number + 1}",
                metrics='{"trust": 50, "goal": 50, "control": 50, "eq": 50}',
            ) for number in range(85))

            db.add_all(UserInventory(
                user_id=focal.id, item_code=code, category=item["category"],
            ) for code, item in list(CATALOG.items())[:50])

            assignments = [CompanyAssignment(
                company_id=companies[0].id, title=f"Задание {number:03d}",
                description="Тренировка переговоров с подробным описанием условий.",
                scenario_id="dismissal", content_type="ARENA_SCENARIO",
                created_by=focal.id, status="ACTIVE",
            ) for number in range(1, 61)]
            db.add_all(assignments)
            await db.flush()
            company_members = [member for member in memberships if member.company_id == companies[0].id]
            db.add_all(CompanyAssignmentTarget(
                company_id=companies[0].id, assignment_id=assignment.id,
                membership_id=member.id,
            ) for assignment in assignments for member in company_members[:25])
            await db.commit()
            counts = {}
            for name, model in [
                ("users", User), ("companies", Company), ("memberships", CompanyMembership),
                ("friends", Friendship), ("messages", DirectMessage), ("history", Session),
                ("notifications", Notification), ("departments", CompanyDepartment),
                ("inventory", UserInventory), ("assignments", CompanyAssignment),
                ("assignment_targets", CompanyAssignmentTarget),
            ]:
                counts[name] = await db.scalar(select(func.count()).select_from(model))
            print(f"Created isolated stress database: {path}")
            print(counts)
            print("Login: stress_001 / stress-demo (local QA only)")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(seed(args.output.resolve()))
