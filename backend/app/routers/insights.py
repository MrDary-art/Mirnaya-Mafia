from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean
from time import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.company_session_policy import result_held
from app.auth import get_admin, get_current_user
from app.db import get_db
from app.engine.scenario import list_scenarios
from app.engine.progress_note import build_progress_note
from app.personal_insights import eligible_personal_reports, build_progress, build_potential_twin
from app.report_pdf import render_insight_pdf
from app.models import AppSetting, LearningAttempt, Session, User
from app.schemas import CorporateAssignmentIn, WeeklyGoalIn

router = APIRouter(tags=["insights"])

DIMENSIONS = (
    ("opening", "Начало разговора", (("trust", 0.6), ("control", 0.4))),
    ("anchoring", "Работа с условиями", (("goal", 0.65), ("control", 0.35))),
    ("active_listening", "Активное слушание", (("eq", 0.7), ("trust", 0.3))),
    ("persuasion", "Аргументация", (("goal", 0.6), ("trust", 0.4))),
    ("counter_arguments", "Работа с возражениями", (("control", 0.55), ("goal", 0.45))),
    ("emotional_control", "Эмоциональный контроль", (("eq", 0.55), ("control", 0.45))),
    ("creative_solutions", "Поиск решений", (("goal", 0.4), ("eq", 0.3), ("trust", 0.3))),
    ("closing", "Завершение", (("goal", 0.7), ("control", 0.3))),
)


def _json(value: str | None, fallback):
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


def _metrics(session: Session) -> dict[str, float] | None:
    raw = _json(session.metrics, {})
    values = raw.get("values", raw) if isinstance(raw, dict) else {}
    if not isinstance(values, dict):
        return None
    metrics: dict[str, float] = {}
    for name in ("trust", "goal", "control", "eq"):
        value = values.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            return None
        metrics[name] = max(0.0, min(100.0, float(value)))
    return metrics


def _dimension_scores(session: Session) -> dict[str, int] | None:
    metrics = _metrics(session)
    if metrics is None:
        return None
    return {
        key: round(sum(metrics[metric] * weight for metric, weight in weights))
        for key, _label, weights in DIMENSIONS
    }


def _session_score(dimensions: dict[str, int]) -> int:
    values = dimensions.values()
    return round(mean(values)) if values else 0


def _iq_rank(iq: int) -> str:
    if iq >= 850:
        return "Мастер"
    if iq >= 700:
        return "Стратег"
    if iq >= 520:
        return "Переговорщик"
    if iq >= 320:
        return "Практик"
    return "Новичок"


def _scenario_category(session: Session, scenarios: dict[str, dict]) -> str:
    scenario = scenarios.get(session.scenario_id or "", {})
    if scenario.get("category"):
        return scenario["category"]
    settings = _json(session.settings, {})
    return "Трудоустройство" if settings.get("practice_kind") == "job_interview" else "Свободная практика"


def build_overview(sessions: list[Session], attempts: int = 0, weekly_goal: int = 3) -> dict:
    finished = [session for session in sessions if session.finished_at or session.status in {"finished", "completed"} or session.report]
    finished.sort(key=lambda item: item.finished_at or item.created_at or datetime.min)
    scored_sessions = [
        (session, dimensions)
        for session in finished
        if (dimensions := _dimension_scores(session)) is not None
    ]
    per_session = [dimensions for _session, dimensions in scored_sessions]
    dimensions = []
    for key, label, _weights in DIMENSIONS:
        values = [item[key] for item in per_session]
        recent = mean(values[-3:]) if values else 0
        previous = mean(values[-6:-3]) if len(values) > 3 else recent
        dimensions.append({"id": key, "label": label, "score": round(mean(values)) if values else 0, "change": round(recent - previous)})

    scores = [_session_score(dimensions) for dimensions in per_session]
    average = round(mean(scores)) if scores else 0
    iq = min(1000, average * 10)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    completed_this_week = sum(1 for item in finished if (item.finished_at or item.created_at).date() >= week_start)
    active_days = sorted({(item.finished_at or item.created_at).date() for item in finished}, reverse=True)
    streak = 0
    cursor = today
    active = set(active_days)
    if cursor not in active:
        cursor -= timedelta(days=1)
    while cursor in active:
        streak += 1
        cursor -= timedelta(days=1)

    scenarios = {item["id"]: item for item in list_scenarios()}
    categories: dict[str, list[int]] = defaultdict(list)
    for (session, _dimensions), score in zip(scored_sessions, scores):
        categories[_scenario_category(session, scenarios)].append(score)
    category_strengths = [
        {"category": name, "score": round(mean(values)), "sessions": len(values)}
        for name, values in categories.items()
    ]
    category_strengths.sort(key=lambda item: (-item["score"], item["category"]))

    return {
        "negotiation_iq": iq,
        "rank": _iq_rank(iq),
        "best_score": max(scores, default=0),
        "average_score": average,
        "sessions_total": len(finished),
        "drills_total": attempts,
        "day_streak": streak,
        "weekly_goal": {"target": weekly_goal, "completed": completed_this_week, "percent": min(100, round(completed_this_week / weekly_goal * 100))},
        "dimensions": dimensions,
        "category_strengths": category_strengths,
        "trend": [
            {"session_id": session.id, "date": (session.finished_at or session.created_at).date().isoformat(), "score": score, "title": scenarios.get(session.scenario_id or "", {}).get("title") or session.role}
            for (session, _dimensions), score in list(zip(scored_sessions, scores))[-10:]
        ],
        "method_note": "Учебный индекс строится по результатам игровых метрик и не является психометрической диагностикой.",
    }


async def _setting(db: AsyncSession, key: str, fallback):
    row = await db.get(AppSetting, key)
    return _json(row.value, fallback) if row else fallback


async def _save_setting(db: AsyncSession, key: str, value) -> None:
    row = await db.get(AppSetting, key)
    encoded = json.dumps(value, ensure_ascii=False)
    if row:
        row.value = encoded
    else:
        db.add(AppSetting(key=key, value=encoded))
    await db.commit()


@router.get("/analytics/overview")
async def analytics_overview(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sessions = (await db.scalars(select(Session).where(Session.user_id == user.id))).all()
    sessions = [session for session in sessions if not result_held(session)]
    attempts = len((await db.scalars(select(LearningAttempt).where(LearningAttempt.user_id == user.id, LearningAttempt.status == "completed"))).all())
    weekly_goal = int(await _setting(db, f"weekly_goal:{user.id}", 3))
    overview = build_overview(list(sessions), attempts, weekly_goal)
    overview["progress_note"] = build_progress_note(list(sessions))
    eligible = eligible_personal_reports(list(sessions))
    overview["progress_report"] = build_progress(eligible)
    overview["potential_twin"] = build_potential_twin(eligible)
    assignments = await _setting(db, "corporate_assignments", [])
    overview["assignments"] = []
    for item in assignments:
        if user.id not in item.get("user_ids", []):
            continue
        status = _assignment_status(item, {user.id: list(sessions)})
        status["completed"] = user.id in status["completed_user_ids"]
        overview["assignments"].append(status)
    return overview


async def _personal_rows(db: AsyncSession, user: User):
    sessions = list((await db.scalars(select(Session).where(Session.user_id == user.id))).all())
    return eligible_personal_reports([item for item in sessions if not result_held(item)])


@router.get("/analytics/progress-report")
async def progress_report(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return build_progress(await _personal_rows(db, user))


@router.get("/analytics/potential-twin")
async def potential_twin(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return build_potential_twin(await _personal_rows(db, user))


async def _insight_pdf(kind: str, db: AsyncSession, user: User):
    payload = build_progress(await _personal_rows(db, user)) if kind == "PROGRESS" else build_potential_twin(await _personal_rows(db, user))
    if payload["locked"]:
        raise HTTPException(409, f"Нужно минимум {payload['required_reports']} подходящих отчётов")
    content = render_insight_pdf(kind, payload, user.display_name or user.username)
    filename = "arena-progress-report.pdf" if kind == "PROGRESS" else "arena-potential-twin.pdf"
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/analytics/progress-report/pdf")
async def progress_report_pdf(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await _insight_pdf("PROGRESS", db, user)


@router.get("/analytics/potential-twin/pdf")
async def potential_twin_pdf(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await _insight_pdf("TWIN", db, user)


@router.put("/analytics/weekly-goal")
async def update_weekly_goal(body: WeeklyGoalIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await _save_setting(db, f"weekly_goal:{user.id}", body.sessions)
    return {"target": body.sessions}


@router.get("/admin/team-analytics")
async def team_analytics(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    users = (await db.scalars(select(User).order_by(User.display_name, User.username))).all()
    sessions = (await db.scalars(select(Session))).all()
    grouped: dict[int, list[Session]] = defaultdict(list)
    for session in sessions:
        grouped[session.user_id].append(session)
    rows = []
    for user in users:
        overview = build_overview(grouped[user.id])
        weakest = min(overview["dimensions"], key=lambda item: item["score"], default=None)
        rows.append({
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name or user.username,
            "organization": user.organization or "Без команды",
            "negotiation_iq": overview["negotiation_iq"],
            "rank": overview["rank"],
            "sessions": overview["sessions_total"],
            "average_score": overview["average_score"],
            "weakest_skill": weakest["label"] if weakest else "Недостаточно данных",
        })
    return {"members": rows, "team_average": round(mean([item["average_score"] for item in rows])) if rows else 0}


def _assignment_status(assignment: dict, sessions_by_user: dict[int, list[Session]]) -> dict:
    completed = []
    created = datetime.fromisoformat(assignment["created_at"])
    for user_id in assignment["user_ids"]:
        matched = any(session.scenario_id == assignment["scenario_id"] and (session.created_at or datetime.min) >= created and (session.report or session.finished_at) for session in sessions_by_user.get(user_id, []))
        if matched:
            completed.append(user_id)
    return {**assignment, "completed_user_ids": completed}


@router.get("/admin/assignments")
async def list_assignments(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    assignments = await _setting(db, "corporate_assignments", [])
    sessions = (await db.scalars(select(Session))).all()
    grouped: dict[int, list[Session]] = defaultdict(list)
    for session in sessions:
        grouped[session.user_id].append(session)
    return [_assignment_status(item, grouped) for item in assignments]


@router.post("/admin/assignments")
async def create_assignment(body: CorporateAssignmentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    scenarios = {item["id"]: item for item in list_scenarios()}
    if body.scenario_id not in scenarios:
        raise HTTPException(404, "Сценарий не найден")
    users = (await db.scalars(select(User).where(User.id.in_(body.user_ids)))).all()
    if len(users) != len(set(body.user_ids)):
        raise HTTPException(400, "Часть сотрудников не найдена")
    try:
        datetime.fromisoformat(body.deadline)
    except ValueError as exc:
        raise HTTPException(400, "Неверная дата дедлайна") from exc
    assignments = await _setting(db, "corporate_assignments", [])
    item = {
        "id": f"assignment-{int(time() * 1000)}",
        "scenario_id": body.scenario_id,
        "scenario_title": scenarios[body.scenario_id]["title"],
        "user_ids": sorted(set(body.user_ids)),
        "user_names": [user.display_name or user.username for user in users],
        "deadline": body.deadline,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    assignments.insert(0, item)
    await _save_setting(db, "corporate_assignments", assignments[:100])
    return item


@router.delete("/admin/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    assignments = await _setting(db, "corporate_assignments", [])
    filtered = [item for item in assignments if item.get("id") != assignment_id]
    if len(filtered) == len(assignments):
        raise HTTPException(404, "Назначение не найдено")
    await _save_setting(db, "corporate_assignments", filtered)
    return {"ok": True}
