"""Canonical lifecycle, snapshots, and scoring rules for paired rooms."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.engine.metrics import clamp
from app.engine.scenario import SCENARIOS

ROOM_STATE_VERSION = 2
SCORING_VERSION = "room-v2.1"
ACTIVE_STATUSES = {"lobby", "active", "feedback", "processing"}
TERMINAL_STATUSES = {"finished", "cancelled", "expired", "error"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).isoformat() if value else None


def parse_schedule(value: str | None, timezone_name: str) -> datetime:
    if not value:
        return utcnow()
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Неизвестный часовой пояс") from exc
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Некорректная дата встречи") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=zone)
    result = parsed.astimezone(timezone.utc)
    if result < utcnow() - timedelta(minutes=2):
        raise ValueError("Нельзя назначить встречу в прошлом")
    if result > utcnow() + timedelta(days=90):
        raise ValueError("Встречу можно назначить не более чем на 90 дней вперёд")
    return result


def challenge_key(state: dict[str, Any]) -> str:
    material = {
        "scenario": state.get("scenario", {}).get("id"), "version": state.get("scenario", {}).get("version"),
        "duration": state.get("duration_minutes"), "rubric": state.get("scoring_version"),
        "questions": state.get("interview_questions"), "ranked": state.get("ranked", False),
    }
    return hashlib.sha256(json.dumps(material, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]


def _scenario_snapshot(scenario_id: str | None, request_text: str, goal: str) -> dict[str, Any]:
    scenario = SCENARIOS.get(scenario_id or "")
    if not scenario:
        return {"id": "custom", "version": 1, "title": "Своя ситуация", "context": request_text,
                "public_context": request_text, "source": "custom", "outcomes": ["agreement", "partial", "no_agreement"]}
    return {
        "id": scenario["id"], "version": 1, "title": scenario["title"],
        "context": scenario.get("context") or request_text, "public_context": scenario.get("description") or scenario.get("context"),
        "source": "scenario_catalog", "roles": scenario.get("roles") or {}, "goal": scenario.get("player_goal") or scenario.get("goal") or goal,
        "outcomes": [item.get("outcome") for item in scenario.get("endings", []) if item.get("outcome")],
    }


def build_state(*, mode: str, host_id: int, display_name: str, request_text: str, goal: str,
                duration_minutes: int, scheduled_at: datetime, timezone_name: str, team_name: str | None,
                scenario_id: str | None, ranked: bool, roles: dict[str, str] | None = None,
                questions: list[str] | None = None, from_chat: bool = False) -> dict[str, Any]:
    snapshot = _scenario_snapshot(scenario_id, request_text, goal)
    roles = roles or {}
    host_role = roles.get("host_role") or snapshot.get("roles", {}).get("player") or ("Кандидат" if mode == "duel" else "Инициатор")
    guest_role = roles.get("guest_role") or snapshot.get("roles", {}).get("opponent") or ("Кандидат" if mode == "duel" else "Вторая сторона")
    participants = {
        str(host_id): {"display_name": display_name, "role_id": "host", "role": host_role,
                       "public_role": host_role, "private_goal": goal,
                       "private_brief": roles.get("host_brief") or f"Добейтесь результата: {goal}",
                       "ready": False, "transport_ready": False, "present": True, "done": False,
                       "recording_consent": False, "joined_at": iso(utcnow())},
    }
    return {
        "version": ROOM_STATE_VERSION, "revision": 1, "phase": "lobby", "from_chat": from_chat,
        "request_text": request_text, "problem": request_text, "goal": goal, "team_name": (team_name or "").strip()[:80] or None,
        "timezone": timezone_name, "scheduled_at": iso(scheduled_at), "duration_minutes": duration_minutes,
        "scenario": snapshot, "scenario_ready": True, "scoring_version": SCORING_VERSION,
        "participants": participants, "sessions": {}, "done": [], "joined": [], "roles": roles,
        "interview_questions": questions or [], "ranked": bool(ranked and mode == "duel" and scenario_id),
        "started_at": None, "ended_at": None, "end_reason": None, "processing_status": "idle",
        "reports": {}, "team_result": None, "event_seq": 0,
    }


def normalize_legacy(state: dict[str, Any], host_id: int, guest_id: int | None, mode: str) -> dict[str, Any]:
    if state.get("version") == ROOM_STATE_VERSION:
        return state
    names = state.get("names") or {}
    roles = state.get("roles") or {}
    participants: dict[str, Any] = {}
    for uid, side in ((host_id, "host"), (guest_id, "guest")):
        if not uid:
            continue
        participants[str(uid)] = {
            "display_name": names.get(str(uid)) or f"Участник {uid}", "role_id": side,
            "role": roles.get(f"{side}_role") or ("Кандидат" if mode == "duel" else "Участник"),
            "public_role": roles.get(f"{side}_role") or ("Кандидат" if mode == "duel" else "Участник"),
            "private_goal": state.get("goal") or "Провести тренировку",
            "private_brief": roles.get(f"{side}_brief") or state.get("goal") or "Проведите тренировку",
            "ready": uid in state.get("joined", []), "transport_ready": uid in state.get("joined", []),
            "present": False, "done": uid in state.get("done", []), "recording_consent": False,
        }
    state.update({"version": ROOM_STATE_VERSION, "revision": 1, "phase": "active" if state.get("started_at") else "lobby",
                  "participants": participants, "duration_minutes": 15, "timezone": "Europe/Moscow",
                  "scheduled_at": iso(utcnow()), "scenario": _scenario_snapshot(None, state.get("problem", ""), state.get("goal", "")),
                  "scenario_ready": True, "scoring_version": SCORING_VERSION, "processing_status": "idle",
                  "event_seq": 0, "request_text": state.get("problem", ""), "ranked": False})
    return state


def public_participant(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item.get(key) for key in ("display_name", "role_id", "public_role", "ready", "transport_ready", "present", "done")}


def can_start(state: dict[str, Any], host_id: int, guest_id: int | None) -> bool:
    if not guest_id or state.get("phase") != "lobby" or not state.get("scenario_ready"):
        return False
    if datetime.fromisoformat(state["scheduled_at"]) > utcnow():
        return False
    return all(state["participants"].get(str(uid), {}).get("ready") and state["participants"].get(str(uid), {}).get("transport_ready") for uid in (host_id, guest_id))


def start_state(state: dict[str, Any]) -> None:
    if state.get("phase") != "lobby":
        return
    now = utcnow()
    state.update(phase="active", started_at=iso(now), ended_at=None, end_reason=None)
    state["deadline"] = iso(now + timedelta(minutes=int(state["duration_minutes"])))
    state["revision"] = int(state.get("revision", 0)) + 1


def end_state(state: dict[str, Any], reason: str) -> None:
    if state.get("phase") in {"feedback", "processing", "finished"}:
        return
    state.update(phase="feedback", ended_at=iso(utcnow()), end_reason=reason, processing_status="waiting_feedback")
    state["revision"] = int(state.get("revision", 0)) + 1


def deadline_passed(state: dict[str, Any]) -> bool:
    deadline = state.get("deadline")
    return bool(deadline and utcnow() >= datetime.fromisoformat(deadline))


def individual_score(report: dict[str, Any]) -> int | None:
    metrics = (report.get("metrics") or {}).get("values") or {}
    if not metrics or not report.get("turn_summary", report.get("metrics_chart", [None])):
        return None
    return clamp(0.5 * metrics.get("goal", 0) + 0.3 * metrics.get("trust", 0) + 0.2 * metrics.get("control", 0))


def team_result(reports: dict[str, Any], participant_ids: list[int]) -> dict[str, Any]:
    scores = {str(uid): individual_score(reports.get(str(uid)) or {}) for uid in participant_ids}
    complete = all(score is not None for score in scores.values())
    return {"scores": scores, "score": sum(score or 0 for score in scores.values()) if complete else None,
            "complete": complete, "maximum": 200, "formula": "score_A + score_B"}
