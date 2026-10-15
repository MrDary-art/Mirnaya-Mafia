"""Enforce saved corporate exam policies on the shared session engine."""
from datetime import datetime, timezone
import json


def policy(session):
    return json.loads(session.settings or "{}").get("corporate_policy") or {}


def result_held(session):
    value = policy(session)
    if not value or value.get("show_result_immediately", True) or value.get("released"):
        return False
    deadline = value.get("release_at")
    if deadline:
        try:
            parsed = datetime.fromisoformat(deadline)
            now = datetime.now(timezone.utc) if parsed.tzinfo else datetime.now()
            return now < parsed
        except (TypeError, ValueError):
            pass
    return True


def held_result(session):
    return {"report_status": "awaiting_release", "release_at": policy(session).get("release_at"),
        "message": "Разговор сохранён. Результат откроется после срока задания или публикации руководителем."}


def hide_held_result(session, report):
    return held_result(session) if result_held(session) else report


def assistance_allowed(session):
    return policy(session).get("hints_allowed", True)


def assignment_result_held(assignment):
    if assignment.show_result_immediately or json.loads(assignment.assignment_snapshot or "{}").get("results_released_at"):
        return False
    return not assignment.deadline or datetime.now() < assignment.deadline.replace(tzinfo=None)
