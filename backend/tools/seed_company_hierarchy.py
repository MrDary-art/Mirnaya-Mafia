"""Create an idempotent 30-person company with a usable business workload.

Run from backend:
python -m tools.seed_company_hierarchy --db ../data/arena-main.db
Login: hierarchy_owner / company-demo
"""

import argparse
import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import hash_password
from app.company_advanced_models import (
    CompanyCareerStep, CompanyCareerTrack, CompanyCompetency, CompanyMembershipProfession,
    CompanyProfession, CompanyProfessionCompetency,
)
from app.company_models import Company, CompanyAssignment, CompanyCohort, CompanyCohortMember, CompanyDepartment, CompanyMembership
from app.company_episode_models import CompanyWorkEpisode
from app.features.progression import RANKS
from app.models import User
from app.routers.company import AssignmentIn, default_company_settings
from app.routers.company_assignments import create_assignment
from app.routers.company_episodes import EpisodeCreateIn, create_episode


PEOPLE = [
    ("Елена Соколова", "Генеральный директор", "COMPANY_OWNER", "Управление", "Руководство", None),
    ("Максим Волков", "Операционный директор", "COMPANY_ADMIN", "Операционное управление", "Руководство", 0),
    ("Анна Коваль", "Директор по развитию людей", "LND_MANAGER", "Обучение и развитие", "Люди и культура", 0),
    ("Илья Морозов", "Директор по продажам", "DEPARTMENT_MANAGER", "Продажи", "Продажи", 1),
    ("Дарья Белова", "Директор продукта", "DEPARTMENT_MANAGER", "Продукт", "Продукт", 1),
    ("Сергей Лебедев", "Директор клиентского сервиса", "DEPARTMENT_MANAGER", "Клиентский сервис", "Клиентский сервис", 1),
    ("Олег Власов", "Руководитель B2B", "TEAM_LEAD", "Продажи", "B2B-продажи", 3),
    ("Мария Орлова", "Руководитель B2C", "TEAM_LEAD", "Продажи", "B2C-продажи", 3),
    ("Алексей Егоров", "Руководитель аналитики", "TEAM_LEAD", "Продуктовая аналитика", "Аналитика", 4),
    ("Виктория Романова", "Руководитель обучения", "TEAM_LEAD", "Обучение и развитие", "Обучение", 2),
    ("Павел Никитин", "Корпоративный наставник", "MENTOR", "Обучение и развитие", "Обучение", 9),
    ("Инна Фролова", "Внутренний аудитор", "AUDITOR", "Аудит", "Руководство", 0),
    ("Артём Захаров", "Старший менеджер B2B", "EMPLOYEE", "Продажи", "B2B-продажи", 6),
    ("Ксения Павлова", "Менеджер B2B", "EMPLOYEE", "Продажи", "B2B-продажи", 6),
    ("Денис Комаров", "Менеджер B2B", "EMPLOYEE", "Продажи", "B2B-продажи", 6),
    ("София Титова", "Старший менеджер B2C", "EMPLOYEE", "Продажи", "B2C-продажи", 7),
    ("Никита Крылов", "Менеджер B2C", "EMPLOYEE", "Продажи", "B2C-продажи", 7),
    ("Полина Громова", "Менеджер B2C", "EMPLOYEE", "Продажи", "B2C-продажи", 7),
    ("Роман Кузнецов", "Продуктовый аналитик", "EMPLOYEE", "Продуктовая аналитика", "Аналитика", 8),
    ("Алина Исаева", "Продуктовый аналитик", "EMPLOYEE", "Продуктовая аналитика", "Аналитика", 8),
    ("Михаил Баранов", "Продуктовый менеджер", "EMPLOYEE", "Продукт", "Продукт", 4),
    ("Екатерина Жукова", "UX-исследователь", "EMPLOYEE", "Исследования", "Продукт", 4),
    ("Вадим Соловьёв", "Сервис-дизайнер", "EMPLOYEE", "Исследования", "Продукт", 4),
    ("Ольга Демина", "Руководитель поддержки", "TEAM_LEAD", "Клиентский сервис", "Клиентский сервис", 5),
    ("Юрий Фомин", "Менеджер поддержки", "EMPLOYEE", "Клиентский сервис", "Клиентский сервис", 23),
    ("Лидия Соболева", "Менеджер поддержки", "EMPLOYEE", "Клиентский сервис", "Клиентский сервис", 23),
    ("Глеб Андреев", "Менеджер по удержанию", "EMPLOYEE", "Клиентский сервис", "Клиентский сервис", 5),
    ("Татьяна Федотова", "HR-бизнес-партнёр", "EMPLOYEE", "Управление персоналом", "Люди и культура", 2),
    ("Борис Мельников", "Рекрутер", "EMPLOYEE", "Управление персоналом", "Люди и культура", 27),
    ("Надежда Куликова", "Методист", "EMPLOYEE", "Обучение и развитие", "Обучение", 9),
]

DEPARTMENTS = [
    ("Руководство", None), ("Продажи", None), ("B2B-продажи", "Продажи"), ("B2C-продажи", "Продажи"),
    ("Продукт", None), ("Аналитика", "Продукт"), ("Клиентский сервис", None),
    ("Люди и культура", None), ("Обучение", "Люди и культура"),
]


COMPETENCIES = [
    ("active-listening", "Активное слушание"),
    ("argumentation", "Аргументация"),
    ("empathy", "Эмпатия"),
    ("objections", "Работа с возражениями"),
    ("conflict-resolution", "Разрешение конфликтов"),
    ("needs-discovery", "Выявление потребностей"),
    ("feedback", "Навыки обратной связи"),
    ("leadership-communication", "Лидерская коммуникация"),
]


WORKLOAD = [
    ("Согласовать условия без потери маржи", "sales_discount_01", range(3, 18), 7),
    ("Подготовить разговор о новой роли", "salary_talk_01", range(1, 30), 10),
    ("Уточнить интересы клиента", "sales_discount_01", [3, 5, 6, 7, *range(12, 18), *range(23, 27)], 12),
    ("Обсудить ожидания и ограничения", "salary_talk_01", range(0, 30), 15),
    ("Зафиксировать следующий шаг переговоров", "sales_discount_01", range(0, 30), 18),
    ("Провести сложную обратную связь", "salary_talk_01", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 23, 27, 28, 29], 21),
]

WORK_SITUATIONS = [
    ("Клиент просит пересмотреть условия", "NEGOTIATION", "Согласовать вариант, который сохранит маржу и дату поставки.", [3, 6]),
    ("Команды спорят о приоритетах квартала", "ALIGNMENT", "Выбрать два общих приоритета и ответственных за них.", [1, 4]),
    ("Обратная связь после запуска продукта", "FEEDBACK", "Согласовать конкретные улучшения без взаимных обвинений.", [4, 8]),
    ("Эскалация по срокам поддержки", "ESCALATION", "Определить следующий шаг для клиента и владельца решения.", [5, 23]),
    ("Согласование клиентского обещания", "NEGOTIATION", "Проверить возможности продаж и сервиса до ответа клиенту.", [3, 5]),
    ("Клиент просит новый срок поставки", "NEGOTIATION", "Сверить ограничения и отправить клиенту подтверждённый план.", [12, 13]),
    ("Повторное обращение клиента", "ESCALATION", "Назначить ответственного и срок решения обращения.", [24, 25]),
]


async def ensure_workload(db, company: Company) -> dict[str, int]:
    """Use the same validated operations as the UI; never fabricate completed results."""
    members = list((await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id,
        CompanyMembership.status == "ACTIVE",
        CompanyMembership.employee_number.like("NS-%"),
    ).order_by(CompanyMembership.employee_number))).all())
    if len(members) != len(PEOPLE):
        raise RuntimeError(f"Expected {len(PEOPLE)} active Northstar employees, found {len(members)}; workload untouched")
    owner = await db.get(User, company.created_by)
    if owner is None or members[0].user_id != owner.id:
        raise RuntimeError("Northstar owner differs from the seeded owner; workload untouched")
    created_assignments = 0
    for title, scenario_id, indexes, due_days in WORKLOAD:
        existing = await db.scalar(select(CompanyAssignment.id).where(
            CompanyAssignment.company_id == company.id, CompanyAssignment.title == title))
        if existing is not None:
            continue
        await create_assignment(company.id, AssignmentIn(
            title=title, scenario_id=scenario_id, membership_ids=[members[index].id for index in indexes],
            description="Практика по реальному рабочему разговору. После попытки разберите отчёт и договоритесь о следующем шаге.",
            goal="Выяснить интересы сторон и зафиксировать проверяемое решение.",
            deadline=datetime.now() + timedelta(days=due_days),
            attempts_allowed=3, passing_score=70, arena_weight=100, company_weight=0,
        ), db, owner)
        created_assignments += 1
    created_situations = 0
    for index, (title, kind, result, participant_indexes) in enumerate(WORK_SITUATIONS):
        existing = await db.scalar(select(CompanyWorkEpisode.id).where(
            CompanyWorkEpisode.company_id == company.id, CompanyWorkEpisode.title == title))
        if existing is not None:
            continue
        await create_episode(company.id, EpisodeCreateIn(
            title=title, situation_type=kind, expected_result=result,
            scheduled_at=datetime.now() + timedelta(days=3 + index), visibility="PARTICIPANTS",
            participant_ids=[members[member_index].id for member_index in participant_indexes],
        ), db, owner)
        created_situations += 1
    return {"assignments_added": created_assignments, "situations_added": created_situations}


async def ensure_growth_catalog(db, company: Company) -> dict[str, int]:
    professions = list((await db.scalars(select(CompanyProfession).where(
        CompanyProfession.company_id == company.id,
        CompanyProfession.status == "ACTIVE",
    ).order_by(CompanyProfession.id))).all())
    members = list((await db.scalars(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id,
        CompanyMembership.status == "ACTIVE",
    ).order_by(CompanyMembership.id))).all())
    competencies = {}
    for code, title in COMPETENCIES:
        row = await db.scalar(select(CompanyCompetency).where(
            CompanyCompetency.company_id == company.id,
            CompanyCompetency.code == code,
            CompanyCompetency.catalog_version == "v1",
        ))
        if row is None:
            row = CompanyCompetency(
                company_id=company.id, code=code, title=title,
                description=f"Наблюдаемый навык в корпоративных учебных заданиях: {title.lower()}.",
                catalog_version="v1", status="ACTIVE", created_by=company.created_by,
            )
            db.add(row)
            await db.flush()
        competencies[code] = row

    competency_rows = list(competencies.values())
    for profession_index, profession in enumerate(professions):
        selected = [
            competency_rows[profession_index % len(competency_rows)],
            competency_rows[(profession_index + 2) % len(competency_rows)],
            competency_rows[(profession_index + 5) % len(competency_rows)],
        ]
        for offset, competency in enumerate(selected):
            link = await db.scalar(select(CompanyProfessionCompetency).where(
                CompanyProfessionCompetency.profession_id == profession.id,
                CompanyProfessionCompetency.competency_id == competency.id,
            ))
            if link is None:
                db.add(CompanyProfessionCompetency(
                    profession_id=profession.id,
                    competency_id=competency.id,
                    target_level=3 + (offset % 2),
                ))
        track = await db.scalar(select(CompanyCareerTrack).where(
            CompanyCareerTrack.company_id == company.id,
            CompanyCareerTrack.profession_id == profession.id,
        ))
        if track is None:
            track = CompanyCareerTrack(
                company_id=company.id, profession_id=profession.id,
                title=f"Рост в направлении «{profession.title}»",
                description="Три подтверждаемых уровня: уверенная практика, самостоятельность и передача опыта.",
                status="ACTIVE", created_by=company.created_by,
            )
            db.add(track)
            await db.flush()
            for level, title in enumerate(("Уверенная практика", "Самостоятельное ведение сложных задач", "Наставничество и передача опыта"), 1):
                db.add(CompanyCareerStep(
                    track_id=track.id, title=title, level=level,
                    required_competencies=json.dumps([item.id for item in selected], ensure_ascii=False),
                    recommended_program_ids="[]",
                ))
    for index, member in enumerate(members):
        if not member.profession_id:
            continue
        link = await db.scalar(select(CompanyMembershipProfession).where(
            CompanyMembershipProfession.membership_id == member.id,
            CompanyMembershipProfession.profession_id == member.profession_id,
        ))
        if link is None:
            db.add(CompanyMembershipProfession(
                company_id=company.id, membership_id=member.id,
                profession_id=member.profession_id, level=1 + index % 3,
                verified_at=datetime.now(),
            ))
    await db.commit()
    return {"professions": len(professions), "competencies": len(competencies), "members": len(members)}


async def grant_local_owners(db, company: Company, usernames: list[str]) -> int:
    if not usernames:
        return 0
    root = await db.scalar(select(CompanyMembership).where(
        CompanyMembership.company_id == company.id,
        CompanyMembership.corporate_role == "COMPANY_OWNER",
        CompanyMembership.status == "ACTIVE",
    ).order_by(CompanyMembership.id))
    granted = 0
    for username in usernames:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            print(f"Skipped unknown local account: {username}")
            continue
        membership = await db.scalar(select(CompanyMembership).where(
            CompanyMembership.company_id == company.id, CompanyMembership.user_id == user.id))
        if membership is None:
            membership = CompanyMembership(company_id=company.id, user_id=user.id,
                                           department_id=root.department_id if root else None,
                                           profession_id=root.profession_id if root else None,
                                           job_title="Совладелец компании", corporate_role="COMPANY_OWNER",
                                           manager_membership_id=root.id if root and root.user_id != user.id else None,
                                           status="ACTIVE", is_primary=0, joined_at=datetime.now(), verified_at=datetime.now())
            db.add(membership); granted += 1
        else:
            membership.status = "ACTIVE"; membership.corporate_role = "COMPANY_OWNER"
    await db.commit()
    return granted


async def seed(db_path: Path, owner_usernames: list[str]) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.resolve().as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            existing = await db.scalar(select(Company).where(Company.slug == "northstar-hierarchy-demo"))
            if existing:
                demo_users = (await db.scalars(
                    select(User).join(CompanyMembership, CompanyMembership.user_id == User.id).where(
                        CompanyMembership.company_id == existing.id,
                        User.username.in_(["hierarchy_owner", *(f"northstar_{index:02d}" for index in range(2, len(PEOPLE) + 1))]),
                    )
                )).all()
                for user in demo_users:
                    if user.level not in RANKS:
                        user.level = min(max(user.level, min(RANKS)), max(RANKS))
                growth = await ensure_growth_catalog(db, existing)
                granted = await grant_local_owners(db, existing, owner_usernames)
                workload = await ensure_workload(db, existing)
                count = len((await db.scalars(select(CompanyMembership).where(CompanyMembership.company_id == existing.id, CompanyMembership.status == "ACTIVE"))).all())
                print(f"Company already exists: id={existing.id}, active_members={count}, owners_granted={granted}, growth={growth}, workload={workload}")
                return

            password = hash_password("company-demo")
            users = []
            for index, (name, title, _role, specialty, _department, _manager) in enumerate(PEOPLE, 1):
                username = "hierarchy_owner" if index == 1 else f"northstar_{index:02d}"
                user = await db.scalar(select(User).where(User.username == username))
                if user is None:
                    first_name, *last = name.split(" ")
                    user = User(username=username, password_hash=password, display_name=name, first_name=first_name,
                                last_name=" ".join(last), title=title, specialization=specialty,
                                organization="Северная звезда", level=min(2 + index % 8, max(RANKS)), xp=index * 83)
                    db.add(user)
                else:
                    user.display_name = name; user.title = title; user.specialization = specialty
                users.append(user)
            await db.flush()

            company = Company(name="Северная звезда", slug="northstar-hierarchy-demo", created_by=users[0].id,
                              description="Большая демонстрационная компания для проверки структуры и распределения ответственности.",
                              industry="Технологии и сервис", company_size="201–1000", city="Москва",
                              corporate_color="#c1f46a", secondary_color="#e7c890",
                              settings=json.dumps(default_company_settings(), ensure_ascii=False))
            db.add(company); await db.flush()

            departments = {}
            for name, _parent in DEPARTMENTS:
                row = CompanyDepartment(company_id=company.id, name=name)
                db.add(row); departments[name] = row
            await db.flush()
            for name, parent in DEPARTMENTS:
                departments[name].parent_department_id = departments[parent].id if parent else None

            specialties = sorted({person[3] for person in PEOPLE})
            professions = {}
            for index, title in enumerate(specialties, 1):
                row = CompanyProfession(company_id=company.id, code=f"profession-{index:02d}", title=title,
                                        description=f"Профессиональная группа: {title}", catalog_version="v1",
                                        status="ACTIVE", created_by=users[0].id)
                db.add(row); professions[title] = row
            await db.flush()

            members = []
            now = datetime.now()
            for index, (name, title, role, specialty, department, _manager) in enumerate(PEOPLE):
                member = CompanyMembership(company_id=company.id, user_id=users[index].id,
                                           department_id=departments[department].id, profession_id=professions[specialty].id,
                                           job_title=title, employee_number=f"NS-{index + 1:03d}", corporate_role=role,
                                           status="ACTIVE", is_primary=1, joined_at=now, verified_at=now,
                                           personalization_enabled=1)
                db.add(member); members.append(member)
            await db.flush()
            for index, person in enumerate(PEOPLE):
                manager_index = person[5]
                members[index].manager_membership_id = members[manager_index].id if manager_index is not None else None
            members[10].mentor_membership_id = members[2].id
            for department_name, manager_index in {"Руководство": 0, "Продажи": 3, "B2B-продажи": 6,
                "B2C-продажи": 7, "Продукт": 4, "Аналитика": 8, "Клиентский сервис": 5,
                "Люди и культура": 2, "Обучение": 9}.items():
                departments[department_name].manager_membership_id = members[manager_index].id

            cohorts = [
                ("Школа руководителей", 2, [3, 4, 5, 6, 7, 8, 9, 23]),
                ("Сильные переговоры в продажах", 6, [12, 13, 14, 15, 16, 17]),
                ("Клиентский опыт", 5, [23, 24, 25, 26]),
            ]
            for title, leader_index, member_indexes in cohorts:
                cohort = CompanyCohort(company_id=company.id, title=title, description="Межфункциональная учебная команда",
                                       leader_membership_id=members[leader_index].id, status="ACTIVE", created_by=users[0].id,
                                       goal="Развить навыки сложных рабочих переговоров", focus_skills='["Аргументация", "Обратная связь"]')
                db.add(cohort); await db.flush()
                db.add_all(CompanyCohortMember(cohort_id=cohort.id, membership_id=members[index].id) for index in member_indexes)
            await db.commit()
            granted = await grant_local_owners(db, company, owner_usernames)
            growth = await ensure_growth_catalog(db, company)
            workload = await ensure_workload(db, company)
            print(f"Created company: id={company.id}, name={company.name}, active_members={len(members)}, growth={growth}, workload={workload}")
            print(f"Additional local owners granted: {granted}")
            print("Login: hierarchy_owner / company-demo")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--owner-username", action="append", default=[], help="Existing local account that should also open the company as owner")
    arguments = parser.parse_args()
    asyncio.run(seed(arguments.db, arguments.owner_username))
