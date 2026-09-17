from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings
from app.engine.parser import parse_llm_analysis, rule_based_analysis
from app.engine.scenario import match_scenario, step_by_id

logger = logging.getLogger(__name__)


class LlmError(Exception):
    pass


class RateLimitError(LlmError):
    pass


class TimeoutErrorLlm(LlmError):
    pass


class ServerError(LlmError):
    pass


ANALYZER_PROMPT = """Ты — анализатор переговорных техник. Проанализируй БЛОК реплик игрока (3-5 реплик), а не каждую отдельно.

Контекст:
- Роль игрока: {role}
- Роль оппонента: {opponent}
- Цель игрока: {goal}
- Предыдущие метрики: Доверие={trust}, Цель={goal_m}, Контроль={control}, EQ={eq}

Реплики:
{block}

Определи:
1. Доминирующий стиль TKI в блоке (конкуренция/сотрудничество/компромисс/избегание/приспособление)
2. Использованные техники (активное слушание, открытые вопросы, BATNA, SPIN, эмпатия, якорение, уступка)
3. Эмоциональный тон (позитивный/нейтральный/негативный/агрессивный)

Выдай СТРОГО JSON (без markdown):
{{
  "tki_style": "...",
  "techniques": ["...", "..."],
  "tone": "...",
  "trust_delta": 0,
  "goal_delta": 0,
  "control_delta": 0,
  "eq_delta": 0,
  "comment": "..."
}}

Если не можешь определить — верни все дельты 0.
"""

OPPONENT_PROMPT = """Ты — {opponent}. Твоя цель: {hidden}.
Тон: {tone}. Сложность: {difficulty}.

Текущие метрики:
- Доверие: {trust}/100
- Достижение цели: {goal}/100

Правила:
- Если Доверие > 70: ты открыт, готов к уступкам.
- Если Доверие < 30: ты закрыт, не доверяешь.
- Если игрок использует сотрудничество: смягчайся.
- Если игрок конкурирует: занимай жёсткую позицию.
- Если игрок использует манипуляции: распознай и ответь.

Контекст ситуации: {context}
Последняя реплика игрока: {message}

Отвечай КОРОТКО (1-3 предложения). Не раскрывай свою цель напрямую.
"""


async def _chat_openai_compatible(url: str, api_key: str, model: str, prompt: str, timeout: float) -> str:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{url.rstrip('/')}/chat/completions", json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        raise TimeoutErrorLlm(str(exc)) from exc
    if resp.status_code == 429:
        raise RateLimitError(resp.text)
    if resp.status_code >= 500:
        raise ServerError(resp.text)
    if resp.status_code >= 400:
        raise LlmError(resp.text)
    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def _chat_ollama(prompt: str, timeout: float) -> str:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{settings.ollama_url.rstrip('/')}/api/generate",
                json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
            )
    except httpx.TimeoutException as exc:
        raise TimeoutErrorLlm(str(exc)) from exc
    if resp.status_code >= 500:
        raise ServerError(resp.text)
    if resp.status_code >= 400:
        raise LlmError(resp.text)
    return resp.json().get("response") or ""


async def call_with_fallback(prompt: str) -> str:
    timeout = settings.llm_timeout
    last_error: Exception | None = None
    if settings.gpt2giga_api_key or settings.gigachat_credentials:
        try:
            return await _chat_openai_compatible(
                settings.gpt2giga_url,
                settings.gpt2giga_api_key or "dummy",
                settings.gigachat_model,
                prompt,
                timeout,
            )
        except (RateLimitError, TimeoutErrorLlm, ServerError, LlmError) as exc:
            logger.warning("GigaChat unavailable, switching to Ollama: %s", exc)
            last_error = exc
    try:
        return await _chat_ollama(prompt, max(timeout, 10))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ollama unavailable, switching to offline: %s", exc)
        last_error = exc
        raise LlmError(str(last_error)) from exc


def offline_opponent_line(session_state: dict[str, Any], settings_obj: dict[str, Any], message: str) -> str:
    scenario = match_scenario(settings_obj)
    try:
        step = step_by_id(scenario, session_state.get("step_id") or scenario["steps"][0]["id"])
        return step.get("opponent_line") or "Продолжим. Что вы предлагаете?"
    except KeyError:
        return "Давайте вернёмся к сути. Какое решение вы предлагаете?"


async def get_opponent_response(session_settings: dict[str, Any], state: dict[str, Any], message: str) -> str:
    scenario = match_scenario(session_settings)
    hidden = (scenario.get("hidden_goal") or {}).get("text") or "защитить свои интересы"
    prompt = OPPONENT_PROMPT.format(
        opponent=session_settings.get("opponent_role") or scenario["roles"]["opponent"],
        hidden=hidden,
        tone=session_settings.get("tone") or "нейтральный",
        difficulty=session_settings.get("difficulty") or "medium",
        trust=state["metrics"]["trust"],
        goal=state["metrics"]["goal"],
        context=scenario.get("context"),
        message=message,
    )
    try:
        return (await call_with_fallback(prompt)).strip()
    except LlmError:
        return offline_opponent_line(state, session_settings, message)


async def analyze_block(session_settings: dict[str, Any], state: dict[str, Any], block: str) -> dict[str, Any]:
    m = state["metrics"]
    prompt = ANALYZER_PROMPT.format(
        role=session_settings.get("role"),
        opponent=session_settings.get("opponent_role"),
        goal=session_settings.get("goal"),
        trust=m["trust"],
        goal_m=m["goal"],
        control=m["control"],
        eq=m["eq"],
        block=block,
    )
    try:
        raw = await call_with_fallback(prompt)
        parsed = parse_llm_analysis(raw)
        if parsed.get("comment") == "Анализ недоступен" and not any(
            parsed.get(k) for k in ("trust_delta", "goal_delta", "control_delta", "eq_delta")
        ):
            return rule_based_analysis(block)
        return parsed
    except LlmError:
        return rule_based_analysis(block)
