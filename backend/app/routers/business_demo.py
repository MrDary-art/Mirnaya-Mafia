"""An isolated corporate workspace with real offline tasks and no fabricated results."""
from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, hash_password
from app.company_models import (Company, CompanyDepartment, CompanyMembership, CompanyScenario,
    CompanyCohort, CompanyCohortMember, CompanyMaterial, CompanyProgram, CompanyProgramStep, CompanyInboxMessage)
from app import company_models as cm
from app.company_scenario_engine import normalize_steps
from app.company_advanced_models import CompanyCareerStep, CompanyCareerTrack, CompanyCompetency, CompanyProfession, CompanyProfessionCompetency
from app.company_completion_models import CompanyProductRequest, CompanySpecialty
from app.db import get_db
from app.deployment_security import rate_limit
from app.models import Message, Session, User
from app.routers.company import AssignmentIn, default_company_settings
from app.routers.company_assignments import create_assignment
from app.routers.company_engagement import enroll_program, EnrollIn
from app.services import dumps

router = APIRouter(prefix="/business", tags=["business-demo"])


async def purge_expired_business_demos(db: AsyncSession, now: datetime | None = None) -> int:
    """Remove company-scoped demo content and preserve an anonymized FK-safe shell."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    demos = (await db.scalars(select(Company).where(Company.status == "DEMO"))).all()
    purged = 0
    for company in demos:
        try:
            raw = (__import__("json").loads(company.settings or "{}").get("_demo") or {})["expires_at"]
            expires = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            expires = expires.astimezone(timezone.utc).replace(tzinfo=None) if expires.tzinfo else expires
        except (KeyError, TypeError, ValueError):
            expires = datetime.min
        if expires > now:
            continue
        company_id = company.id
        competition_ids = select(cm.CompanyCompetition.id).where(cm.CompanyCompetition.company_id == company_id)
        cohort_ids = select(cm.CompanyCohort.id).where(cm.CompanyCohort.company_id == company_id)
        profession_ids = select(CompanyProfession.id).where(CompanyProfession.company_id == company_id)
        track_ids = select(CompanyCareerTrack.id).where(CompanyCareerTrack.company_id == company_id)
        session_ids = set((await db.scalars(select(cm.CompanyAssignmentAttempt.session_id).where(
            cm.CompanyAssignmentAttempt.company_id == company_id, cm.CompanyAssignmentAttempt.session_id.is_not(None)))).all())
        await db.execute(delete(cm.CompanyTournamentMatch).where(cm.CompanyTournamentMatch.competition_id.in_(competition_ids)))
        await db.execute(delete(cm.CompanyCompetitionParticipant).where(cm.CompanyCompetitionParticipant.competition_id.in_(competition_ids)))
        await db.execute(delete(cm.CompanyCohortMember).where(cm.CompanyCohortMember.cohort_id.in_(cohort_ids)))
        await db.execute(delete(CompanyCareerStep).where(CompanyCareerStep.track_id.in_(track_ids)))
        await db.execute(delete(CompanyProfessionCompetency).where(CompanyProfessionCompetency.profession_id.in_(profession_ids)))
        await db.execute(delete(CompanySpecialty).where(CompanySpecialty.company_id == company_id))
        await db.execute(delete(CompanyCareerTrack).where(CompanyCareerTrack.company_id == company_id))
        await db.execute(delete(CompanyProductRequest).where(CompanyProductRequest.company_id == company_id))
        await db.execute(delete(CompanyCompetency).where(CompanyCompetency.company_id == company_id))
        await db.execute(delete(CompanyProfession).where(CompanyProfession.company_id == company_id))
        company_scoped = [cm.CompanyResultComment, cm.CompanyAchievementGrant, cm.CompanyAssignmentAttempt,
            cm.CompanyAssignmentTarget, cm.CompanyProgramEnrollment, cm.CompanyProgramStep, cm.CompanySurveyResponse,
            cm.CompanyCertificate, cm.CompanyInboxMessage, cm.CompanyAuditLog, cm.CompanyRoomBooking,
            cm.CompanyTeamGoal, cm.CompanyApplication, cm.CompanyIntegrationRun, cm.CompanyIntegration,
            cm.CompanyInvitation, cm.CompanyMaterial, cm.CompanyAchievement, cm.CompanySurvey,
            cm.CompanyCompetition, cm.CompanyCohort, cm.CompanyAssignmentSchedule, cm.CompanyAssignment,
            cm.CompanyProgram, cm.CompanyKPI, cm.CompanyScenario, cm.CompanyLeagueEntry, cm.CompanySubscription]
        for model in company_scoped:
            await db.execute(delete(model).where(model.company_id == company_id))
        if session_ids:
            await db.execute(delete(Message).where(Message.session_id.in_(session_ids)))
            await db.execute(delete(Session).where(Session.id.in_(session_ids)))
        members = (await db.scalars(select(CompanyMembership).where(CompanyMembership.company_id == company_id))).all()
        for member in members:
            member.status = "LEFT"; member.notification_settings = "{}"; member.personalization_enabled = 0
        company.name = "Истёкшая демонстрация"; company.description = None; company.logo = None
        company.status = "EXPIRED"; company.settings = dumps({"_demo": {"purged_at": now.isoformat() + "Z"}})
        purged += 1
    if purged:
        await db.commit()
    return purged


@router.post("/demo", status_code=201)
async def create_business_demo(request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("business-demo-create", request.client.host if request.client else "unknown", 3, 3600)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    count = await db.scalar(select(func.count()).select_from(Company).where(
        Company.status == "DEMO", Company.created_at >= now - timedelta(hours=1)))
    if count >= 30:
        raise HTTPException(429, "Демонстрация сейчас занята. Попробуйте позже", headers={"Retry-After":"3600"})
    expires = now + timedelta(minutes=45)
    identifier = secrets.token_hex(5)
    password_hash = hash_password(secrets.token_urlsafe(32))
    definitions = [
        ("owner", "Владелец", "COMPANY_OWNER", "Анна Соколова", "Продажи"),
        ("hr", "HR / Обучение", "LND_MANAGER", "Мария Орлова", "Поддержка"),
        ("manager", "Руководитель", "DEPARTMENT_MANAGER", "Алексей Волков", "Продажи"),
        ("employee", "Сотрудник продаж", "EMPLOYEE", "Иван Петров", "Продажи"),
        ("employee2", "Сотрудник поддержки", "EMPLOYEE", "Елена Морозова", "Поддержка"),
    ]
    users = {}
    for key, label, role, name, department in definitions:
        first, last = name.split(" ", 1)
        user = User(username=f"business-demo-{identifier}-{key}", password_hash=password_hash,
            display_name=name, first_name=first, last_name=last, is_demo=1, is_admin=0,
            profile_visibility="private", search_visibility="none", messages_visibility="none")
        db.add(user)
        users[key] = user
    await db.flush()
    config = default_company_settings()
    config["ratings"] = {"enabled":True,"visibility":"MANAGERS_ONLY","show_percentile":False}
    config["privacy"]["retention_days"] = 1
    config["_demo"] = {"expires_at":expires.isoformat()+"Z", "label":"Изолированная демонстрация; результаты появятся после прохождения"}
    company = Company(name="Демонстрационная компания", slug=f"demo-{identifier}", created_by=users["owner"].id,
        status="DEMO", industry="Учебная демонстрация", company_size="5 сотрудников", corporate_color="#B9F56A",
        secondary_color="#E4BD82", settings=dumps(config), description="Учебные данные. Два отдела и настоящие задания без готовых результатов.")
    db.add(company)
    await db.flush()
    departments = {name:CompanyDepartment(company_id=company.id, name=name) for name in ("Продажи","Поддержка")}
    db.add_all(departments.values())
    await db.flush()
    memberships = {}
    for key, label, role, name, department in definitions:
        user = users[key]
        user.username = f"business-demo-{company.id}-{identifier}-{key}"
        user.arena_id = f"ARENA-DEMO-{user.id}"
        member = CompanyMembership(company_id=company.id, user_id=user.id, department_id=departments[department].id,
            corporate_role=role, job_title=label, status="ACTIVE", joined_at=now, verified_at=now, is_primary=1)
        db.add(member)
        memberships[key] = member
    await db.flush()
    departments["Продажи"].manager_membership_id = memberships["manager"].id
    departments["Поддержка"].manager_membership_id = memberships["hr"].id
    memberships["employee"].manager_membership_id = memberships["manager"].id
    memberships["employee2"].manager_membership_id = memberships["hr"].id
    for name, key in (("Команда продаж","manager"),("Команда поддержки","hr")):
        keys = ("manager","employee") if key == "manager" else ("hr","employee2")
        cohort = CompanyCohort(company_id=company.id, title=name, leader_membership_id=memberships[key].id,
            goal="Отработать уточнение интересов и фиксацию договорённостей", focus_skills=dumps(["Уточнение интересов","Аргументация"]),
            starts_at=now, ends_at=now+timedelta(days=7), created_by=users["owner"].id)
        db.add(cohort)
        await db.flush()
        db.add_all([CompanyCohortMember(cohort_id=cohort.id, membership_id=memberships[item].id) for item in keys])
    scenario_rows = []
    for title, context, goal, employee_role, opponent_role in [
        ("Демо: скидка без потери условий", "Клиент просит скидку 15% и срочную поставку. Вы можете менять сроки и объём, но должны сохранить согласованную маржу.", "Выяснить приоритеты клиента и согласовать проверяемый следующий шаг.", "Менеджер продаж", "Клиент"),
        ("Демо: сложная обратная связь", "Коллега недоволен распределением задач. На следующей неделе нужно согласовать выполнимый план без взаимных обвинений.", "Прояснить ограничения и договориться об обязанностях и сроках.", "Руководитель", "Сотрудник"),
    ]:
        row = CompanyScenario(company_id=company.id, title=title, context=context, employee_goal=goal,
            employee_role=employee_role, opponent_role=opponent_role, status="PUBLISHED", revision=1,
            author_id=users["owner"].id, owner_id=users["owner"].id, last_editor_id=users["owner"].id,
            scenario_steps=dumps(normalize_steps([],context,goal)), success_criteria=dumps(["Уточнить интересы","Зафиксировать следующий шаг"]))
        db.add(row)
        scenario_rows.append(row)
    await db.flush()
    db.add(CompanyMaterial(company_id=company.id, title="Демо: памятка переговорщика", content_type="MD",
        content="Уточните интересы. Обсудите несколько вариантов. Зафиксируйте критерии и следующий шаг.",
        description="Демонстрационный учебный материал", scope_type="COMPANY", ai_allowed=0, created_by=users["owner"].id))
    await db.flush()
    assignment = await create_assignment(company.id, AssignmentIn(title="Демо: переговоры с клиентом", company_scenario_id=scenario_rows[0].id,
        goal=scenario_rows[0].employee_goal, membership_ids=[row.id for row in memberships.values()],
        passing_score=60, attempts_allowed=3, issue_certificate=True, arena_weight=100, company_weight=0,
        deadline=now+timedelta(days=2)), db, users["owner"])
    template = await create_assignment(company.id, AssignmentIn(title="Демо: обратная связь в команде", company_scenario_id=scenario_rows[1].id,
        goal=scenario_rows[1].employee_goal, template_only=True, passing_score=60, issue_certificate=True,
        arena_weight=100, company_weight=0), db, users["owner"])
    program = CompanyProgram(company_id=company.id, title="Демо: первый учебный цикл", owner_id=users["hr"].id, status="PUBLISHED",
        audience="Новые сотрудники", description="Одна практика и реальный отчёт после прохождения")
    db.add(program)
    await db.flush()
    step = {"title":"Отработать обратную связь","assignment_id":template["id"],"unlock_rule":"PREVIOUS"}
    program.steps = dumps([step])
    db.add(CompanyProgramStep(company_id=company.id, program_id=program.id, position=1, **step))
    await db.flush()
    await enroll_program(company.id, program.id, EnrollIn(membership_ids=[row.id for row in memberships.values()]), db, users["hr"])
    for key in ("employee","employee2"):
        member = memberships[key]
        db.add(CompanyInboxMessage(company_id=company.id, membership_id=member.id, type="DEMO_GUIDE",
            title="Начните с назначенного задания", text="Пройдите кейс. Затем переключитесь на руководителя, чтобы увидеть настоящий результат.",
            payload=dumps({"assignment_id":assignment["id"]})))
    await db.commit()
    roles = []
    for key, label, role, name, department in definitions:
        user = users[key]
        roles.append({"role":key,"label":label,"corporate_role":role,"membership_id":memberships[key].id,
            "user_id":user.id,"username":user.username,"access_token":create_token(user.id,user.username,user.password_hash,business_demo_company_id=company.id),
            "is_admin":False,"level":user.level,"stars":user.stars,"xp":user.xp})
    return {"company_id":company.id,"roles":roles,"expires_at":expires.isoformat()+"Z","is_demo":True}
