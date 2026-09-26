"""Conservative progress notes from comparable, evidence-backed reports."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any


def _json(value: str | None) -> dict[str, Any]:
    try:
        data = json.loads(value) if value else {}
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError):
        return {}


def _key(session: Any) -> str | None:
    settings = _json(session.settings)
    if session.scenario_id and session.mode != "online":
        return "scenario:" + session.scenario_id
    problem = " ".join(str(settings.get("problem") or "").lower().split())
    goal = " ".join(str(settings.get("goal") or "").lower().split())
    if problem and goal:
        return f"online:{settings.get('practice_kind') or 'free'}:{problem[:180]}:{goal[:120]}"
    return None


def _moments(report: dict[str, Any], kind: str) -> dict[str, dict[str, Any]]:
    result = {}
    for section in report.get("narrative", {}).get("sections", []):
        if section.get("kind") != kind or not section.get("evidence", {}).get("quote"):
            continue
        principle = section.get("principle") or {}
        label = principle.get("label")
        if label:
            result[label] = section
    return result


def build_progress_note(sessions: list[Any]) -> dict[str, Any]:
    rows = []
    for session in sessions:
        report = _json(session.report)
        if not report:
            continue
        note = report.get("narrative") or {}
        rows.append((session, report, note))
    rows.sort(key=lambda row: row[0].finished_at or row[0].created_at or datetime.min)
    recent = [
        {"session_id": session.id,
         "title": report.get("scenario_title") or session.role or "Практика",
         "status": note.get("status") or "Отчёт сохранён",
         "date": (session.finished_at or session.created_at).date().isoformat()}
        for session, report, note in rows[-6:]
    ][::-1]
    if not rows:
        return {"summary": "После первой завершённой практики здесь появятся выводы по вашим репликам.",
                "basis": "Нет завершённых тренировок", "improvements": [], "repeating": [],
                "recent_reports": [], "next_practice": None}

    latest_session, latest_report, latest_note = rows[-1]
    latest_key = _key(latest_session)
    comparable = [row for row in rows if latest_key and _key(row[0]) == latest_key and row[2].get("sections")]
    next_text = latest_note.get("next_step") or "Откройте последний разбор и выберите один ход для повторной попытки."
    next_practice = {"text": next_text, "session_id": latest_session.id,
                     "scenario_id": latest_session.scenario_id}
    improvements, repeating = [], []
    if len(comparable) >= 2:
        first_session, _, first_note = comparable[0]
        last_session, _, last_note = comparable[-1]
        first_improve = _moments({"narrative": first_note}, "improve")
        last_strength = _moments({"narrative": last_note}, "strength")
        last_improve = _moments({"narrative": last_note}, "improve")
        for label in first_improve.keys() & last_strength.keys():
            improvements.append({"title": label,
                                 "detail": "В ранней попытке этот приём требовал доработки; в последней он отмечен как удачный ход.",
                                 "earlier_session_id": first_session.id, "later_session_id": last_session.id,
                                 "earlier_quote": first_improve[label]["evidence"]["quote"],
                                 "later_quote": last_strength[label]["evidence"]["quote"]})
        for label in first_improve.keys() & last_improve.keys():
            repeating.append({"title": label,
                              "detail": "Этот вопрос отмечен в двух сопоставимых попытках. Посмотрите обе реплики перед повторением.",
                              "earlier_session_id": first_session.id, "later_session_id": last_session.id,
                              "earlier_quote": first_improve[label]["evidence"]["quote"],
                              "later_quote": last_improve[label]["evidence"]["quote"]})
        summary = (
            f"Сопоставимых тренировок по одной задаче: {len(comparable)}. "
            + (f"Подтверждено улучшение: {improvements[0]['title']}." if improvements else
               "Пока недостаточно одинаково подтверждённых моментов, чтобы утверждать, что навык улучшился.")
        )
        basis = "Сравнены попытки по одинаковому сценарию или точно совпадающим задаче и цели"
    else:
        summary = (f"Последняя практика: {latest_note.get('headline') or latest_report.get('verdict') or 'разговор завершён'}. "
                   "Для сравнения прогресса повторите ту же задачу.")
        basis = "Для этой задачи пока нет двух сопоставимых разборов"
    return {"summary": summary, "basis": basis, "improvements": improvements[:3],
            "repeating": repeating[:3], "recent_reports": recent,
            "next_practice": next_practice}
