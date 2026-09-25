"""Validated role choices. Private briefs stay in room state, not invitations."""
from typing import Any


def validate_options(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list) or not 2 <= len(value) <= 4:
        return []
    result, seen = [], set()
    limits = {"title": 120, "description": 260, "goal": 500, "brief": 700}
    for item in value:
        if not isinstance(item, dict):
            return []
        if any(not isinstance(item.get(key), str) or not item[key].strip() or len(item[key]) > limit
               for key, limit in limits.items()):
            return []
        title = item["title"].strip().casefold()
        if title in seen:
            return []
        seen.add(title)
        result.append({"id": f"role_{len(result) + 1}", **{key: item[key].strip() for key in limits}})
    return result


def available_roles(state: dict, mode: str) -> list[dict[str, str]]:
    if mode == "duel":
        return [{"id": "candidate", "title": "Кандидат", "description": "Та же задача и вопросы, что у первого участника. Отдельный разговор с ИИ.",
                 "goal": state.get("goal", "Пройти собеседование"), "brief": state.get("request_text", "")}]
    roles = state.get("roles") or {}
    options = validate_options(roles.get("guest_options"))
    if options:
        return options
    # Existing rooms remain joinable even if they predate selectable roles.
    return [{"id": "guest", "title": roles.get("guest_role") or "Вторая сторона",
             "description": "Роль собеседника в этой ситуации. Личное задание откроется после входа.",
             "goal": roles.get("guest_goal") or "Найти реалистичное соглашение, защищая свои интересы",
             "brief": roles.get("guest_brief") or state.get("request_text", "")}]


def public_roles(state: dict, mode: str) -> list[dict[str, str]]:
    return [{key: role[key] for key in ("id", "title", "description")} for role in available_roles(state, mode)]


def select_role(state: dict, mode: str, role_id: str | None) -> dict[str, str]:
    roles = available_roles(state, mode)
    if role_id is None and len(roles) == 1:
        return roles[0]
    for role in roles:
        if role["id"] == role_id:
            return role
    raise ValueError("Выберите одну из ролей, предложенных в приглашении")
