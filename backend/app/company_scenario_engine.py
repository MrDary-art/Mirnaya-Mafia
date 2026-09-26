"""Validation and immutable runtime snapshots for corporate scenario mode."""

from __future__ import annotations

import json
from typing import Any

METRICS = ("trust", "goal", "control", "eq")


def default_steps(context: str, goal: str) -> list[dict[str, Any]]:
    """A safe deterministic three-turn baseline when an author has not set steps yet."""
    return [
        {"id": "opening", "opponent_line": context, "options": [
            {"id": "clarify", "text": "\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u044c \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u044b \u0438 \u043a\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0432\u0442\u043e\u0440\u043e\u0439 \u0441\u0442\u043e\u0440\u043e\u043d\u044b", "tki": "\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u043e", "techniques": ["\u0432\u043e\u043f\u0440\u043e\u0441\u044b"], "effects": {"trust": 4, "goal": 3, "control": 2, "eq": 3}, "next": "proposal", "comment": "\u0412\u044b \u043d\u0430\u0447\u0430\u043b\u0438 \u0441 \u0443\u0442\u043e\u0447\u043d\u0435\u043d\u0438\u044f \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u043e\u0432."},
            {"id": "push", "text": "\u041d\u0430\u0441\u0442\u0430\u0438\u0432\u0430\u0442\u044c \u043d\u0430 \u0441\u0432\u043e\u0451\u043c \u0443\u0441\u043b\u043e\u0432\u0438\u0438", "tki": "\u043a\u043e\u043d\u043a\u0443\u0440\u0435\u043d\u0446\u0438\u044f", "techniques": ["\u0434\u0430\u0432\u043b\u0435\u043d\u0438\u0435"], "effects": {"trust": -4, "goal": 2, "control": 2, "eq": -2}, "next": "proposal", "comment": "\u0414\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0443\u0441\u0438\u043b\u0438\u043b\u043e \u0441\u043e\u043f\u0440\u043e\u0442\u0438\u0432\u043b\u0435\u043d\u0438\u0435."},
            {"id": "yield", "text": "\u0421\u0440\u0430\u0437\u0443 \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u0442\u044c\u0441\u044f \u0431\u0435\u0437 \u0432\u0441\u0442\u0440\u0435\u0447\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439", "tki": "\u043f\u0440\u0438\u0441\u043f\u043e\u0441\u043e\u0431\u043b\u0435\u043d\u0438\u0435", "techniques": ["\u0443\u0441\u0442\u0443\u043f\u043a\u0430"], "effects": {"trust": 1, "goal": -4, "control": -3, "eq": 0}, "next": "proposal", "comment": "\u0423\u0441\u0442\u0443\u043f\u043a\u0430 \u043d\u0435 \u0437\u0430\u0449\u0438\u0449\u0430\u0435\u0442 \u0446\u0435\u043b\u044c."},
        ]},
        {"id": "proposal", "opponent_line": "\u0421\u0444\u043e\u0440\u043c\u0443\u043b\u0438\u0440\u0443\u0439\u0442\u0435 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433.", "options": [
            {"id": "criteria", "text": "\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u0442\u044c \u0432\u0430\u0440\u0438\u0430\u043d\u0442 \u0441 \u044f\u0441\u043d\u044b\u043c\u0438 \u043a\u0440\u0438\u0442\u0435\u0440\u0438\u044f\u043c\u0438 \u0438 \u0441\u0440\u043e\u043a\u043e\u043c", "tki": "\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u043e", "techniques": ["\u043e\u0431\u044a\u0435\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043a\u0440\u0438\u0442\u0435\u0440\u0438\u0438"], "effects": {"trust": 4, "goal": 6, "control": 4, "eq": 2}, "next": "end:eval", "comment": "\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043c\u043e\u0436\u043d\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0438 \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c."},
            {"id": "trade", "text": "\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u0442\u044c \u043e\u0431\u043c\u0435\u043d \u0443\u0441\u0442\u0443\u043f\u043a\u0430\u043c\u0438", "tki": "\u043a\u043e\u043c\u043f\u0440\u043e\u043c\u0438\u0441\u0441", "techniques": ["\u043e\u0431\u043c\u0435\u043d"], "effects": {"trust": 2, "goal": 3, "control": 2, "eq": 2}, "next": "end:eval", "comment": "\u0412\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u043b\u0438 \u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e\u0441\u0442\u044c \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0438\u0442\u044c\u0441\u044f."},
            {"id": "ultimatum", "text": "\u0412\u044b\u0434\u0432\u0438\u043d\u0443\u0442\u044c \u0443\u043b\u044c\u0442\u0438\u043c\u0430\u0442\u0443\u043c", "tki": "\u043a\u043e\u043d\u043a\u0443\u0440\u0435\u043d\u0446\u0438\u044f", "techniques": ["\u0434\u0430\u0432\u043b\u0435\u043d\u0438\u0435"], "effects": {"trust": -5, "goal": 0, "control": 1, "eq": -3}, "next": "end:eval", "comment": "\u0423\u043b\u044c\u0442\u0438\u043c\u0430\u0442\u0443\u043c \u0441\u0443\u0436\u0430\u0435\u0442 \u043f\u043e\u043b\u0435 \u0434\u043b\u044f \u0441\u043e\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f."},
        ]},
    ]


def normalize_steps(steps: list[dict[str, Any]], context: str, goal: str) -> list[dict[str, Any]]:
    raw = steps or default_steps(context, goal)
    if not 1 <= len(raw) <= 6:
        raise ValueError("\u0421\u0446\u0435\u043d\u0430\u0440\u0438\u0439 \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u043e\u0442 1 \u0434\u043e 6 \u0448\u0430\u0433\u043e\u0432")
    result, ids = [], set()
    for index, row in enumerate(raw, 1):
        step_id = str(row.get("id") or f"step_{index}").strip()[:50]
        line = str(row.get("opponent_line") or "").strip()[:1200]
        options = row.get("options") or []
        if not re_identifier(step_id) or step_id in ids or len(line) < 5 or not 2 <= len(options) <= 5:
            raise ValueError("\u041a\u0430\u0436\u0434\u044b\u0439 \u0448\u0430\u0433 \u043d\u0443\u0436\u0434\u0430\u0435\u0442\u0441\u044f \u0432 \u0443\u043d\u0438\u043a\u0430\u043b\u044c\u043d\u043e\u043c \u043a\u043e\u0434\u0435, \u0440\u0435\u043f\u043b\u0438\u043a\u0435 \u0438 2-5 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u0430\u0445")
        ids.add(step_id); cleaned, option_ids = [], set()
        for option_index, option in enumerate(options, 1):
            option_id = str(option.get("id") or f"option_{option_index}").strip()[:50]
            text = str(option.get("text") or "").strip()[:800]
            effects = option.get("effects") or option.get("delta") or {}
            if not re_identifier(option_id) or option_id in option_ids or len(text) < 3:
                raise ValueError("\u0412\u0430\u0440\u0438\u0430\u043d\u0442 \u043e\u0442\u0432\u0435\u0442\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u043e")
            option_ids.add(option_id)
            clean_effects = {metric: int(effects.get(metric, 0)) for metric in METRICS}
            if any(not -10 <= value <= 10 for value in clean_effects.values()):
                raise ValueError("\u0414\u0435\u043b\u044c\u0442\u0430 \u043c\u0435\u0442\u0440\u0438\u043a\u0438 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u043e\u0442 -10 \u0434\u043e 10")
            cleaned.append({"id": option_id, "text": text, "tki": str(option.get("tki") or "\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u043e")[:80], "techniques": [str(item)[:80] for item in option.get("techniques", [])[:6]], "effects": clean_effects, "next": str(option.get("next") or "end:eval")[:60], "comment": str(option.get("comment") or "")[:500]})
        result.append({"id": step_id, "opponent_line": line, "options": cleaned})
    for row in result:
        for option in row["options"]:
            if option["next"] not in ids and option["next"] != "end:eval":
                raise ValueError("\u0412\u0430\u0440\u0438\u0430\u043d\u0442 \u0432\u0435\u0434\u0451\u0442 \u043d\u0430 \u043d\u0435\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433")
    return result


def re_identifier(value: str) -> bool:
    return bool(value) and all(char.isascii() and (char.isalnum() or char in "_-") for char in value)


def snapshot_from_company_scenario(row: Any) -> dict[str, Any]:
    try:
        stored_steps = json.loads(row.scenario_steps or "[]")
    except (TypeError, ValueError):
        stored_steps = []
    try:
        criteria = json.loads(row.success_criteria or "[]")
    except (TypeError, ValueError):
        criteria = []
    if not isinstance(criteria, list):
        criteria = []
    steps = normalize_steps(stored_steps, row.context, row.employee_goal)
    return {
        "id": f"company-{row.id}-r{row.revision}", "title": row.title, "description": row.description or row.context,
        "context": row.context, "problem": row.context, "goal": row.employee_goal, "player_goal": row.employee_goal,
        "success_criteria": [str(item)[:300] for item in criteria[:12] if isinstance(item, str) and item.strip()],
        "restrictions": str(row.restrictions or "")[:1200],
        "roles": {"player": row.employee_role, "opponent": row.opponent_role}, "difficulty": row.difficulty,
        "steps": steps,
        "endings": [
            {"id": "excellent", "condition": "goal >= 50 && trust >= 55 && eq >= 50", "verdict": "\u0426\u0435\u043b\u044c \u0434\u043e\u0441\u0442\u0438\u0433\u043d\u0443\u0442\u0430 \u0441 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435\u043c \u0440\u0430\u0431\u043e\u0447\u0435\u0433\u043e \u0432\u0437\u0430\u0438\u043c\u043e\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f.", "outcome": "excellent"},
            {"id": "partial", "condition": "goal >= 40", "verdict": "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0447\u0430\u0441\u0442\u0438\u0447\u043d\u044b\u0439: \u043d\u0443\u0436\u043d\u043e \u0437\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433.", "outcome": "partial"},
            {"id": "needs_work", "condition": "true", "verdict": "\u0426\u0435\u043b\u044c \u043f\u043e\u043a\u0430 \u043d\u0435 \u0434\u043e\u0441\u0442\u0438\u0433\u043d\u0443\u0442\u0430. \u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0439 \u0441 \u0443\u0442\u043e\u0447\u043d\u0435\u043d\u0438\u0435\u043c \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u043e\u0432 \u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u0439.", "outcome": "needs_work"},
        ],
    }
