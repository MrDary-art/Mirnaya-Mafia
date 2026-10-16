"""Deterministic, owner-scoped analytics for personal negotiation reports."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from statistics import mean
from typing import Any

from app.company_session_policy import result_held

METRICS = ("trust", "goal", "control", "eq")
PROGRESS_VERSION = "progress-v1"
TWIN_VERSION = "personal-potential-v1"


def _loads(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


def _metrics(value: Any) -> dict[str, int] | None:
    if isinstance(value, str):
        value = _loads(value, {})
    values = value.get("values", value) if isinstance(value, dict) else {}
    if not isinstance(values, dict) or not all(isinstance(values.get(key), (int, float)) for key in METRICS):
        return None
    return {key: max(0, min(100, round(float(values[key])))) for key in METRICS}


def eligible_personal_reports(sessions: list[Any]) -> list[dict[str, Any]]:
    """Return completed, non-held session reports with the canonical metric schema.

    Room results which delegate to a session are intentionally represented once by that
    session. Raw room reports without canonical metrics stay out of longitudinal maths.
    """
    rows = []
    for session in sessions:
        if result_held(session) or not session.report or not (session.finished_at or session.status in {"finished", "completed"}):
            continue
        report = _loads(session.report, {})
        metrics = _metrics(session.metrics) or _metrics(report.get("metrics"))
        if not metrics:
            continue
        rows.append({
            "source_type": "session", "source_id": session.id,
            "title": report.get("scenario_title") or session.role or "Практика",
            "date": (session.finished_at or session.created_at or datetime.min).isoformat(),
            "metrics": metrics, "score": round(mean(metrics.values())), "report": report,
        })
    return sorted(rows, key=lambda item: (item["date"], item["source_id"]))


def source_hash(rows: list[dict[str, Any]], version: str) -> str:
    payload = [(row["source_type"], row["source_id"], row["date"], row["metrics"]) for row in rows]
    return hashlib.sha256(json.dumps([version, payload], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def status(rows: list[dict[str, Any]], required: int, version: str) -> dict[str, Any]:
    count = len(rows)
    return {"locked": count < required, "status": "locked" if count < required else "ready",
            "eligible_reports": count, "required_reports": required,
            "methodology_version": version, "source_count": count,
            "source_hash": source_hash(rows, version), "generated_at": datetime.now().isoformat(timespec="seconds")}


def _average(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {key: round(mean(row["metrics"][key] for row in rows)) for key in METRICS}


def _summary(metrics: dict[str, int]) -> int:
    return round(mean(metrics.values()))


def build_progress(rows: list[dict[str, Any]]) -> dict[str, Any]:
    response = status(rows, 10, PROGRESS_VERSION)
    if response["locked"]:
        return response
    window = min(5, len(rows) // 2)
    baseline_rows, current_rows = rows[:window], rows[-window:]
    baseline, current = _average(baseline_rows), _average(current_rows)
    changes = [{"id": key, "baseline": baseline[key], "current": current[key], "delta": current[key] - baseline[key]} for key in METRICS]
    changes.sort(key=lambda item: (-abs(item["delta"]), item["id"]))
    milestones = []
    for row in rows[window:]:
        delta = row["score"] - _summary(baseline)
        if delta > 0:
            milestones.append({"source_type": row["source_type"], "source_id": row["source_id"], "title": row["title"], "date": row["date"], "score": row["score"], "delta": delta})
    response["data"] = {"baseline": baseline, "current": current, "baseline_score": _summary(baseline), "current_score": _summary(current),
                        "changes": changes, "milestones": sorted(milestones, key=lambda item: (-item["delta"], item["date"]))[:4],
                        "sources": [{k: row[k] for k in ("source_type", "source_id", "title", "date", "score")} for row in rows]}
    return response


def build_potential_twin(rows: list[dict[str, Any]]) -> dict[str, Any]:
    response = status(rows, 15, TWIN_VERSION)
    if response["locked"]:
        return response
    current_rows = rows[-min(5, len(rows)):]
    current = _average(current_rows)
    top_window = min(3, len(rows))
    potential, evidence = {}, []
    for key in METRICS:
        ranked = sorted(rows, key=lambda row: (-row["metrics"][key], row["date"], row["source_id"]))[:top_window]
        potential[key] = round(mean(row["metrics"][key] for row in ranked))
        evidence.append({"metric": key, "label": key.title(), "source_ids": [row["source_id"] for row in ranked], "score": potential[key]})
    current_score, potential_score = _summary(current), _summary(potential)
    response["data"] = {"current": current, "potential": potential, "current_score": current_score,
                        "potential_score": potential_score, "gap": max(0, potential_score - current_score),
                        "gap_percent": max(0, round((potential_score - current_score) / max(potential_score, 1) * 100)),
                        "evidence": evidence,
                        "disclaimer": "Это не прогноз и не оценка личности. Профиль объединяет только лучшие навыки, уже показанные вами в завершённых практиках."}
    return response
