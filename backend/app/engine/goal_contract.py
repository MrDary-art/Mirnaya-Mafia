"""Session-specific success and failure criteria for online practice."""

import asyncio
import json
from typing import Any

from app.engine.llm import LlmError, call_with_fallback_detailed
from app.engine.parser import extract_json


def fallback_criteria(settings: dict[str, Any]) -> dict[str, Any]:
    goal = str(settings.get("goal") or "достичь заявленной цели").strip()[:300]
    if settings.get("practice_kind") == "job_interview":
        company = str(settings.get("target_company") or "компанию").strip()[:120]
        position = str(settings.get("target_position") or "должность").strip()[:120]
        success = [f"Ответы показывают пригодность для позиции «{position}» в «{company}», и интервьюер готов продолжить найм."]
        failure = ["Кандидат явно не подтверждает необходимые навыки или интервьюер обоснованно отказывает."]
    else:
        success = [f"В диалоге достигнут или обоснованно согласован результат: {goal}."]
        failure = ["Собеседник явно отказывает в цели или прекращает разговор из-за действий участника."]
    return {"success": success, "failure": failure, "source": "rules"}


def validate_criteria(data: dict[str, Any] | None, settings: dict[str, Any]) -> dict[str, Any]:
    fallback = fallback_criteria(settings)
    if not isinstance(data, dict):
        return fallback
    result = {}
    for key in ("success", "failure"):
        items = data.get(key)
        if not isinstance(items, list):
            return fallback
        cleaned = [item.strip()[:240] for item in items[:3] if isinstance(item, str) and len(item.strip()) >= 12]
        if not cleaned:
            return fallback
        result[key] = cleaned
    return {**result, "source": "gigachat"}


async def build_goal_criteria(settings: dict[str, Any]) -> dict[str, Any]:
    prompt = (
        "Ты создаёшь критерии учебной беседы до её начала. По описанию пользователя дай 1–3 конкретных "
        "признака достижения цели и 1–3 признака провала. Не требуй обязательного буквального согласия, "
        "если цель допускает оценку качества ответа. Для собеседования оценивай пригодность кандидата "
        "для роли, а не выдуманные внутренние правила компании. Верни только JSON: "
        '{"success":["..."],"failure":["..."]}. '
        f"Контекст: {json.dumps({k: settings.get(k) for k in ('role', 'opponent_role', 'problem', 'goal', 'practice_kind', 'target_company', 'target_position', 'difficulty')}, ensure_ascii=False)[:1600]}"
    )
    try:
        raw, provider = await asyncio.wait_for(call_with_fallback_detailed(prompt, max_tokens=350), timeout=10)
        criteria = validate_criteria(extract_json(raw), settings)
        criteria["source"] = provider if criteria["source"] != "rules" else "rules"
        return criteria
    except (LlmError, TimeoutError):
        return fallback_criteria(settings)
