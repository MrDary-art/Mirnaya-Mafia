from statistics import median
import csv
from io import StringIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import Company, CompanyAssignmentAttempt, CompanyAssignmentTarget, CompanyAuditLog, CompanyMembership, CompanyRoomBooking
from app.db import get_db
from app.models import ArenaRoom, User, Session
from app.routers.company import MANAGE_TEAM, as_json, require_membership, require_role, visible_membership_ids

router = APIRouter(prefix="/company", tags=["company-analytics"])
@router.get("/{company_id}/analytics")
async def analytics(company_id: int, department_id: int | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    allowed_ids = set(await visible_membership_ids(db, membership))
    if department_id:
        department_members = set((await db.scalars(select(CompanyMembership.id).where(
            CompanyMembership.company_id == company_id, CompanyMembership.department_id == department_id))).all())
        allowed_ids &= department_members
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.membership_id.in_(allowed_ids),
        CompanyAssignmentAttempt.status == "COMPLETED"))).all()
    targets = (await db.scalars(select(CompanyAssignmentTarget).where(
        CompanyAssignmentTarget.company_id == company_id, CompanyAssignmentTarget.membership_id.in_(allowed_ids)))).all()
    scores = [row.final_score for row in attempts if row.final_score is not None]
    room_bookings = (await db.scalars(select(CompanyRoomBooking).where(
        CompanyRoomBooking.company_id == company_id,
        CompanyRoomBooking.host_membership_id.in_(allowed_ids),
        CompanyRoomBooking.guest_membership_id.in_(allowed_ids),
        CompanyRoomBooking.status == "COMPLETED",
    ))).all()
    online_scores = []
    for booking in room_bookings:
        room = await db.get(ArenaRoom, booking.room_id)
        state = as_json(room.state, {}) if room else {}
        result = state.get("team_result") or {}
        if result.get("complete") and isinstance(result.get("score"), (int, float)):
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
    return {"sample_size": len(attempts), "employees": len(allowed_ids), "assigned": len(targets),
            "practice_groups": [{"id":key,"title":g["title"],"attempts":g["attempts"],"employees":len(g["members"]),"support_used":g["support_used"],"average":round(sum(g["results"])/len(g["results"])) if g["results"] else None} for key,g in groups.items()],
            "online_1x1_completed": len(online_scores),
            "online_1x1_average_score": round(sum(online_scores) / len(online_scores)) if online_scores else None,
            "completed": sum(1 for row in targets if row.status in {"PASSED", "FAILED", "COMPLETED"}),
            "overdue": sum(1 for row in targets if row.status == "OVERDUE"),
            "average_score": round(sum(scores) / len(scores)) if scores else None,
            "median_score": round(median(scores)) if scores else None,
            "dimensions": {key: round(sum(values) / len(values)) if values else None for key, values in dimensions.items()},
            "enough_data": len(attempts) >= 5,
            "data_note": f"Основано на {len(attempts)} завершённых попытках {len(set(row.membership_id for row in attempts))} сотрудников." if attempts else "Пока недостаточно данных."}


@router.get("/{company_id}/benchmark")
async def company_benchmark(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, MANAGE_TEAM)
    company = await db.get(Company, company_id)
    own_attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id == company_id, CompanyAssignmentAttempt.status == "COMPLETED",
        CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    own_scores = [row.final_score for row in own_attempts if row.final_score is not None]
    company_result = {"sample_size": len(own_scores), "average_score": round(sum(own_scores) / len(own_scores)) if own_scores else None}
    if not company or not company.industry:
        return {"company": company_result, "industry": {"available": False, "reason": "\u0423 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430 \u043e\u0442\u0440\u0430\u0441\u043b\u044c."}}
    peers = (await db.scalars(select(Company.id).where(Company.industry == company.industry, Company.id != company_id,
        Company.status == "ACTIVE"))).all()
    if not peers:
        return {"company": company_result, "industry": {"available": False, "reason": "\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u043e \u043e\u0442\u0440\u0430\u0441\u043b\u0438."}}
    peer_attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(
        CompanyAssignmentAttempt.company_id.in_(peers), CompanyAssignmentAttempt.status == "COMPLETED",
        CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    scores = [row.final_score for row in peer_attempts if row.final_score is not None]
    if len(scores) < 5:
        return {"company": company_result, "industry": {"available": False, "reason": "\u0414\u043b\u044f \u043e\u0442\u0440\u0430\u0441\u043b\u0435\u0432\u043e\u0433\u043e \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u044f \u043d\u0443\u0436\u043d\u043e \u043d\u0435 \u043c\u0435\u043d\u0435\u0435 5 \u043e\u0431\u0435\u0437\u043b\u0438\u0447\u0435\u043d\u043d\u044b\u0445 \u043f\u043e\u043f\u044b\u0442\u043e\u043a."}}
    return {"company": company_result, "industry": {"available": True, "industry": company.industry,
            "sample_size": len(scores), "average_score": round(sum(scores) / len(scores)),
            "note": "\u041e\u0442\u0440\u0430\u0441\u043b\u0435\u0432\u043e\u0439 \u0441\u0440\u0435\u0437 \u043e\u0431\u0435\u0437\u043b\u0438\u0447\u0435\u043d \u0438 \u043d\u0435 \u0440\u0430\u0441\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0439."}}


@router.get("/{company_id}/audit")
async def audit_log(company_id: int, actor: str = "", action: str = "", entity_type: str = "",
                    limit: int = Query(default=100, ge=1, le=500), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id); require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
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
    membership = await require_membership(db, user, company_id); require_role(membership, MANAGE_TEAM)
    allowed = set(await visible_membership_ids(db, membership))
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id,
        CompanyAssignmentAttempt.membership_id.in_(allowed), CompanyAssignmentAttempt.status == "COMPLETED").order_by(CompanyAssignmentAttempt.completed_at.desc()))).all()
    output = StringIO(); writer = csv.writer(output)
    writer.writerow(["Сотрудник", "Ник", "Результат", "Доверие", "Цель", "Контроль", "Эмоциональный интеллект", "Дата"])
    for attempt in attempts:
        employee = await db.get(CompanyMembership, attempt.membership_id); person = await db.get(User, employee.user_id)
        metrics = as_json(attempt.metrics_snapshot, {})
        writer.writerow([person.display_name or person.username, person.username, attempt.final_score or "", metrics.get("trust", ""),
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
    is_manager = membership.corporate_role in MANAGE_TEAM
    enabled = bool(rating_settings.get("enabled", False))
    visibility = rating_settings.get("visibility", "MANAGERS_ONLY")
    if not enabled and not is_manager:
        return {"enabled": False, "reason": "Рейтинг отключён настройками компании"}
    if not is_manager and visibility != "COMPANY":
        return {"enabled": False, "reason": "Рейтинг доступен только руководителям"}
    allowed = set(await visible_membership_ids(db, membership)) if is_manager else None
    attempts = (await db.scalars(select(CompanyAssignmentAttempt).where(CompanyAssignmentAttempt.company_id == company_id,
        CompanyAssignmentAttempt.status == "COMPLETED", CompanyAssignmentAttempt.final_score.is_not(None)))).all()
    best = {}
    for row in attempts:
        if allowed is not None and row.membership_id not in allowed: continue
        best[row.membership_id] = max(best.get(row.membership_id, 0), row.final_score or 0)
    ranking = sorted(best.items(), key=lambda item: item[1], reverse=True)
    if not is_manager:
        place = next((index + 1 for index, (member_id, _) in enumerate(ranking) if member_id == membership.id), None)
        score = best.get(membership.id)
        percentile = round(100 * sum(1 for _, value in ranking if score is not None and value <= score) / len(ranking)) if score is not None and ranking and rating_settings.get("show_percentile", False) else None
        return {"enabled": True, "my_place": place, "my_score": score, "percentile": percentile, "participants": len(ranking),
                "note": "Позиция сформирована по лучшему завершённому корпоративному заданию. Имена коллег скрыты."}
    result=[]
    for position,(member_id,score) in enumerate(ranking,1):
        employee=await db.get(CompanyMembership,member_id); person=await db.get(User,employee.user_id)
        result.append({"position":position,"membership_id":member_id,"name":person.display_name or person.username,"score":score})
    return {"enabled": True, "participants": len(ranking), "ratings": result}
