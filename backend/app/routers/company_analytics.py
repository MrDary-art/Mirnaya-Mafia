from statistics import median
from datetime import datetime, timezone
import csv
from io import StringIO

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import Company, CompanyAssignment, CompanyDepartment, CompanyScenario, CompanyCohort, CompanyCohortMember, CompanyProgram, CompanyAssignmentAttempt, CompanyAssignmentTarget, CompanyAuditLog, CompanyMembership, CompanyRoomBooking
from app.db import get_db
from app.company_workflows import owned, sync_visible_attempts
from app.models import ArenaRoom, User, Session
from app.routers.company import MANAGE_TEAM, as_json, require_membership, require_role, visible_membership_ids
from app.company_access import capabilities, require_capability

router = APIRouter(prefix="/company", tags=["company-analytics"])
@router.get("/{company_id}/analytics")
async def analytics(company_id: int, department_id: int | None = None, program_id: int | None = None,
                    cohort_id: int | None = None, scenario_id: str | None = None,
                    from_date: datetime | None = None, to_date: datetime | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_capability(membership, "view_analytics")
    allowed_ids = await sync_visible_attempts(db, membership)
    if department_id:
        await owned(db, CompanyDepartment, department_id, company_id, "Подразделение")
        department_members = set((await db.scalars(select(CompanyMembership.id).where(
            CompanyMembership.company_id == company_id, CompanyMembership.department_id == department_id))).all())
        allowed_ids &= department_members
    from_date = (from_date.astimezone(timezone.utc).replace(tzinfo=None) if from_date.tzinfo else from_date) if from_date else None
    to_date = (to_date.astimezone(timezone.utc).replace(tzinfo=None) if to_date.tzinfo else to_date) if to_date else None
    if from_date and to_date and from_date > to_date:
        raise HTTPException(400, "Начало периода должно предшествовать окончанию")
    if cohort_id:
        await owned(db, CompanyCohort, cohort_id, company_id, "Команда")
        cohort_members = set((await db.scalars(select(CompanyCohortMember.membership_id).where(
            CompanyCohortMember.cohort_id == cohort_id))).all())
        allowed_ids &= cohort_members
    if program_id:
        await owned(db, CompanyProgram, program_id, company_id, "Программа")
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.membership_id.in_(allowed_ids),
        CompanyAssignmentAttempt.status == "COMPLETED"))).all()
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(
        CompanyAssignmentTarget.company_id == company_id, CompanyAssignmentTarget.membership_id.in_(allowed_ids)))).all()
    if program_id or scenario_id:
        assignment_query = select(CompanyAssignment.id).where(CompanyAssignment.company_id == company_id)
        if program_id:
            from app.company_models import CompanyProgramStep
            step_ids = (await db.scalars(select(CompanyProgramStep.assignment_id).where(
                CompanyProgramStep.company_id == company_id, CompanyProgramStep.program_id == program_id))).all()
            assignment_query = assignment_query.where((CompanyAssignment.program_id == program_id) | CompanyAssignment.id.in_(step_ids))
        if scenario_id:
            if scenario_id.startswith("company:"):
                try:
                    corporate_id = int(scenario_id.split(":", 1)[1])
                except ValueError:
                    raise HTTPException(400, "Некорректный корпоративный сценарий")
                await owned(db, CompanyScenario, corporate_id, company_id, "Сценарий")
                assignment_query = assignment_query.where(CompanyAssignment.company_scenario_id == corporate_id)
            else:
                assignment_query = assignment_query.where(CompanyAssignment.scenario_id == scenario_id)
        assignment_ids = set((await db.scalars(assignment_query)).all())
        attempts = [row for row in attempts if row.assignment_id in assignment_ids]
        targets = [row for row in targets if row.assignment_id in assignment_ids]
    if from_date:
        attempts = [row for row in attempts if row.completed_at and row.completed_at >= from_date.replace(tzinfo=None)]
    if to_date:
        attempts = [row for row in attempts if row.completed_at and row.completed_at <= to_date.replace(tzinfo=None)]
    scores = [row.final_score for row in attempts if row.final_score is not None]
    room_bookings = (await db.scalars(select(CompanyRoomBooking).where(
        CompanyRoomBooking.company_id == company_id,
        CompanyRoomBooking.host_membership_id.in_(allowed_ids),
        CompanyRoomBooking.guest_membership_id.in_(allowed_ids),
    ))).all()
    online_scores = []
    for booking in room_bookings:
        if program_id or scenario_id:
            continue
        room = await db.get(ArenaRoom, booking.room_id)
        if room and ((from_date and (not room.finished_at or room.finished_at < from_date)) or (to_date and (not room.finished_at or room.finished_at > to_date))):
            continue
        state = as_json(room.state, {}) if room else {}
        result = state.get("team_result") or {}
        if room and room.status == "finished" and result.get("complete") and isinstance(result.get("score"), (int, float)):
            online_scores.append(round(result["score"]))
    dimensions = {key: [] for key in ("trust", "goal", "control", "eq")}
    groups = {}
    for row in attempts:
        session = await db.get(Session,row.session_id) if row.session_id else None
        saved = as_json(session.report,{}) if session else {}
        settings = as_json(session.settings,{}) if session else {}
        revision = (settings.get("corporate_scenario") or {}).get("revision")
        key = f"{row.assignment_id}:{revision}:{bool((saved.get('learning_support') or {}).get('used'))}"
        group = groups.setdefault(key,{"title":saved.get("scenario_title") or f"Задание №{row.assignment_id}","attempts":0,"members":set(),"results":[],"support_used":bool((saved.get("learning_support") or {}).get("used"))})
        group["attempts"] += 1
        group["members"].add(row.membership_id)
        if row.final_score is not None: group["results"].append(row.final_score)
        snapshot = as_json(row.metrics_snapshot, {})
        for key in dimensions:
            if key in snapshot: dimensions[key].append(int(snapshot[key]))
    company = await db.get(Company, company_id)
    private_records = as_json(company.settings, {}).get("privacy", {}).get("records") == "employee_only"
    suppressed = private_records and len({row.membership_id for row in attempts}) < 5
    if private_records:
        online_scores = []
    if suppressed:
        scores = []
        dimensions = {key: [] for key in dimensions}
        groups = {}
        online_scores = []
    elif private_records:
        groups = {key: group for key, group in groups.items() if len(group["members"]) >= 5}
    trend = {}
    for attempt in ([] if suppressed else attempts):
        date = attempt.completed_at.date().isoformat() if attempt.completed_at else None
        if date and attempt.final_score is not None:
            trend.setdefault(date, []).append(attempt.final_score)
    if private_records:
        safe_dates = {attempt.completed_at.date().isoformat() for attempt in attempts if attempt.completed_at
                      and len({row.membership_id for row in attempts if row.completed_at and row.completed_at.date() == attempt.completed_at.date()}) >= 5}
        trend = {date: values for date, values in trend.items() if date in safe_dates}
    return {"suppressed": suppressed,
            "trend": [{"date": date, "attempts": len(values), "average_score": round(sum(values) / len(values))}
                      for date, values in sorted(trend.items())],
            "heatmap": [{"metric": key, "score": round(sum(values) / len(values)) if values else None,
                         "sample_size": len(values)} for key, values in dimensions.items()],
            "methodology": "Метрики Arena по завершённым корпоративным попыткам; сравнивайте одинаковые кейсы, версии и условия помощи",
            "sample_size": len(attempts), "employees": len(allowed_ids), "assigned": len(targets),
            "practice_groups": [{"id":key,"title":g["title"],"attempts":g["attempts"],"employees":len(g["members"]),"support_used":g["support_used"],"average":round(sum(g["results"])/len(g["results"])) if g["results"] else None} for key,g in groups.items()],
            "online_1x1_suppressed": private_records,
            "online_1x1_completed": len(online_scores),
            "online_1x1_average_score": round(sum(online_scores) / len(online_scores)) if online_scores else None,
            "completed": sum(1 for row in targets if row.status in {"PASSED", "FAILED", "COMPLETED"}),
            "overdue": sum(1 for row in targets if row.status == "OVERDUE"),
            "average_score": round(sum(scores) / len(scores)) if scores else None,
            "median_score": round(median(scores)) if scores else None,
            "dimensions": {key: round(sum(values) / len(values)) if values else None for key, values in dimensions.items()},
            "enough_data": len({row.membership_id for row in attempts}) >= 5,
            "data_note": f"Основано на {len(attempts)} завершённых попытках {len(set(row.membership_id for row in attempts))} сотрудников." if attempts else "Пока недостаточно данных."}


@router.get("/{company_id}/benchmark")
async def company_benchmark(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_capability(membership, "view_analytics")
    company = await db.get(Company, company_id)
    allowed = await sync_visible_attempts(db, membership)
    own_attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.membership_id.in_(allowed),
        CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    own_scores = [row.final_score for row in own_attempts]
    company_result = {"sample_size": len(own_scores), "average_score": round(sum(own_scores) / len(own_scores)) if own_scores else None}
    if as_json(company.settings, {}).get("privacy", {}).get("records") == "employee_only" and len({row.membership_id for row in own_attempts}) < 5:
        company_result["average_score"] = None
    unavailable = lambda reason: {"company": company_result, "industry": {"available": False, "reason": reason}}
    if not as_json(company.settings, {}).get("privacy", {}).get("industry_benchmark_opt_in", False):
        return unavailable("Компания не разрешила участие в отраслевом сравнении")
    if not company.industry:
        return unavailable("У компании не указана отрасль")
    peers = (await db.scalars(select(Company).where(Company.industry == company.industry,
        Company.id != company_id, Company.status == "ACTIVE"))).all()
    peers = [peer.id for peer in peers if as_json(peer.settings, {}).get("privacy", {}).get("industry_benchmark_opt_in", False)]
    if len(peers) < 5:
        return unavailable("Для безопасного сравнения нужны не менее 5 других компаний с согласием")
    rows = (await db.execute(select(CompanyAssignmentAttempt, CompanyAssignment).join(
        CompanyAssignment, CompanyAssignment.id == CompanyAssignmentAttempt.assignment_id).where(
        CompanyAssignmentAttempt.company_id.in_([company_id, *peers]),
        CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.arena_score.is_not(None),
        CompanyAssignment.company_scenario_id.is_(None), CompanyAssignment.scenario_id.is_not(None)))).all()
    own_groups = {}
    for attempt, assignment in rows:
        if attempt.company_id == company_id and attempt.membership_id in allowed:
            own_groups[(assignment.scenario_id, assignment.difficulty)] = own_groups.get((assignment.scenario_id, assignment.difficulty), 0) + 1
    if not own_groups:
        return unavailable("Нет сопоставимых завершённых публичных сценариев")
    scenario_id, difficulty = max(own_groups, key=own_groups.get)
    per_company = {}
    for attempt, assignment in rows:
        if attempt.company_id not in peers or (assignment.scenario_id, assignment.difficulty) != (scenario_id, difficulty):
            continue
        per_company.setdefault(attempt.company_id, {})[attempt.membership_id] = attempt.arena_score
    safe_companies = [scores for scores in per_company.values() if len(scores) >= 5]
    if len(safe_companies) < 5:
        return unavailable("Недостаточно сопоставимых результатов: по 5 сотрудников в 5 компаниях")
    scores = [score for group in safe_companies for score in group.values()]
    return {"company": company_result, "industry": {"available": True, "industry": company.industry,
        "sample_size": len(scores), "average_score": round(sum(scores) / len(scores)),
        "scenario_id": scenario_id, "difficulty": difficulty,
        "note": "Arena-оценка одного публичного сценария при одинаковой сложности; один результат на сотрудника"}}


@router.get("/{company_id}/audit")
async def audit_log(company_id: int, actor: str = "", action: str = "", entity_type: str = "",
                    limit: int = Query(default=100, ge=1, le=500), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_capability(membership, "view_audit")
    query = select(CompanyAuditLog, User).join(User, User.id == CompanyAuditLog.actor_user_id).where(CompanyAuditLog.company_id == company_id)
    if actor.strip():
        query = query.where(User.display_name.ilike(f"%{actor.strip()}%") | User.username.ilike(f"%{actor.strip()}%"))
    if action.strip():
        query = query.where(CompanyAuditLog.action == action.strip().upper())
    if entity_type.strip():
        query = query.where(CompanyAuditLog.entity_type == entity_type.strip().lower())
    rows = (await db.execute(query.order_by(CompanyAuditLog.created_at.desc()).limit(limit))).all()
    return [{"id": row.id, "actor": actor.display_name or actor.username, "action": row.action,
             "entity_type": row.entity_type, "entity_id": row.entity_id, "details": as_json(row.details, {}),
             "created_at": row.created_at.isoformat()} for row, actor in rows]


@router.get("/{company_id}/analytics/export.csv")
async def analytics_export(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_capability(membership, "view_analytics")
    allowed = await sync_visible_attempts(db, membership)
    company = await db.get(Company, company_id)
    if as_json(company.settings, {}).get("privacy", {}).get("records") == "employee_only":
        raise HTTPException(403, "Индивидуальный экспорт запрещён политикой компании")
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id,
        CompanyAssignmentAttempt.membership_id.in_(allowed), CompanyAssignmentAttempt.status == "COMPLETED").order_by(CompanyAssignmentAttempt.completed_at.desc()))).all()
    output = StringIO(); writer = csv.writer(output)
    writer.writerow(["Сотрудник", "Ник", "Результат", "Доверие", "Цель", "Контроль", "Эмоциональный интеллект", "Дата"])
    for attempt in attempts:
        employee = await db.get(CompanyMembership, attempt.membership_id); person = await db.get(User, employee.user_id)
        metrics = as_json(attempt.metrics_snapshot, {})
        safe_cell = lambda value: "\'" + value if value.startswith(("=", "+", "-", "@")) else value
        writer.writerow([safe_cell(person.display_name or person.username), safe_cell(person.username), attempt.final_score if attempt.final_score is not None else "", metrics.get("trust", ""),
                         metrics.get("goal", ""), metrics.get("control", ""), metrics.get("eq", ""),
                         attempt.completed_at.isoformat() if attempt.completed_at else ""])
    return Response("\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=company-analytics.csv"})


@router.get("/{company_id}/ratings")
async def company_ratings(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    company = await db.get(Company, company_id)
    settings = as_json(company.settings, {})
    rating_settings = settings.get("ratings", {})
    if settings.get("privacy", {}).get("records") == "employee_only":
        return {"enabled": False, "reason": "Индивидуальные рейтинги запрещены политикой компании"}
    is_manager = capabilities(membership).get("view_analytics", False)
    enabled = bool(rating_settings.get("enabled", False))
    visibility = rating_settings.get("visibility", "MANAGERS_ONLY")
    if not enabled and not is_manager:
        return {"enabled": False, "reason": "Рейтинг отключён настройками компании"}
    if not is_manager and visibility != "COMPANY":
        return {"enabled": False, "reason": "Рейтинг доступен только руководителям"}
    allowed = await sync_visible_attempts(db, membership) if is_manager else None
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id,
        CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    best = {}
    for row in attempts:
        if allowed is not None and row.membership_id not in allowed: continue
        current = best.get(row.membership_id)
        if current is None or (row.final_score or 0) > (current.final_score or 0):
            best[row.membership_id] = row
    ranking = sorted(best.items(), key=lambda item: item[1].final_score or 0, reverse=True)
    if not is_manager:
        place = next((index + 1 for index, (member_id, _) in enumerate(ranking) if member_id == membership.id), None)
        score = best.get(membership.id).final_score if best.get(membership.id) else None
        percentile = round(100 * sum(1 for _, attempt in ranking if score is not None and (attempt.final_score or 0) <= score) / len(ranking)) if score is not None and len(ranking) >= 5 and rating_settings.get("show_percentile", False) else None
        return {"enabled": True, "my_place": place, "my_score": score, "percentile": percentile, "participants": len(ranking),
                "note": "Позиция сформирована по лучшему завершённому корпоративному заданию. Имена коллег скрыты."}
    assignment_titles = dict((await db.execute(select(CompanyAssignment.id, CompanyAssignment.title).where(
        CompanyAssignment.company_id == company_id))).all())
    result=[]
    for position,(member_id,attempt) in enumerate(ranking,1):
        employee=await db.get(CompanyMembership,member_id); person=await db.get(User,employee.user_id)
        snapshot = as_json(attempt.metrics_snapshot, {})
        metrics = {key: round(value) for key, value in snapshot.items()
                   if key in {"trust", "goal", "control", "eq"} and isinstance(value, (int, float))}
        result.append({"position":position,"membership_id":member_id,"name":person.display_name or person.username,
                       "score":attempt.final_score,"assignment_title":assignment_titles.get(attempt.assignment_id, "Корпоративная практика"),
                       "completed_at":attempt.completed_at.isoformat() if attempt.completed_at else None,"metrics":metrics})
    return {"enabled": True, "participants": len(ranking), "ratings": result,
            "methodology": "Место определяется по лучшему итоговому баллу за завершённую корпоративную практику."}
