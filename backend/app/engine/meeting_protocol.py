"""Safe first-pass extraction for meeting protocols.

The implementation is intentionally deterministic.  It creates reviewable
suggestions with source evidence; an optional language model can later enrich
this service but can never publish or assign an obligation by itself.
"""
from __future__ import annotations

import json
import re

from app.ai_providers import BASE_URLS, runtime_config
from app.config import settings
from app.engine.llm import LlmError, call_with_fallback_detailed


ACTION_MARKERS = ("сделаю", "сделаем", "подготов", "отправ", "провер", "соберу", "назнач", "создам")
DECISION_MARKERS = ("решили", "договорились", "согласовали", "утвердили", "принимаем решение")
QUESTION_MARKERS = ("нужно уточнить", "открытый вопрос", "вернёмся", "вернемся", "не решили")

SUMMARY_RECOMMENDATION_PROMPT = """Ты готовишь черновик краткого итога рабочей встречи.
Используй только факты из расшифровки. Не придумывай решения, сроки, исполнителей или риски.
Не оценивай личности и не ставь диагнозов. Ответь только JSON-объектом:
{"summary":"2–4 коротких предложения: контекст, согласованное, следующий шаг или открытый вопрос"}.
Если в расшифровке недостаточно фактов, верни пустой JSON-объект."""


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())[:500]


def _ai_summary_available() -> bool:
    """Use the configured provider opportunistically; protocol review stays offline-safe."""
    config = runtime_config()
    return bool(
        (config.get("provider") in BASE_URLS and config.get("credential"))
        or (config.get("provider") == "gigachat" and config.get("credential"))
        or (config.get("provider") == "gigachat" and settings.gpt2giga_api_key)
        or (config.get("provider") == "ollama" and settings.ollama_enabled)
    )


def _summary_from_response(value: str) -> str:
    try:
        candidate = value.strip()
        if candidate.startswith("```"):
            candidate = candidate.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        start, end = candidate.find("{"), candidate.rfind("}")
        payload = json.loads(candidate[start:end + 1]) if start >= 0 and end > start else {}
    except (AttributeError, TypeError, ValueError):
        payload = {}
    summary = payload.get("summary") if isinstance(payload, dict) else ""
    return _clean(summary)[:900] if isinstance(summary, str) else ""


async def refine_summary_with_ai(summary: str, segments: list[dict]) -> str:
    """Improve only wording of an already evidence-backed, reviewable summary.

    Decisions and action items deliberately remain deterministic and retain
    source segment ids. A provider outage or malformed response changes
    nothing: the existing first-pass summary is returned as-is.
    """
    if not _ai_summary_available():
        return summary
    transcript = "\n".join(_clean(row.get("text", "")) for row in segments if _clean(row.get("text", "")))[:6000]
    if not transcript:
        return summary
    try:
        raw, _ = await call_with_fallback_detailed(
            json.dumps({"draft_summary": summary, "transcript": transcript}, ensure_ascii=False),
            max_tokens=360,
            system_prompt=SUMMARY_RECOMMENDATION_PROMPT,
            timeout_seconds=20,
        )
    except LlmError:
        return summary
    return _summary_from_response(raw) or summary


def draft_from_segments(segments: list[dict]) -> tuple[str, list[dict]]:
    """Return only evidence-backed suggestions; humans decide their status."""
    lines = [_clean(row.get("text", "")) for row in segments if _clean(row.get("text", ""))]
    summary = " ".join(lines[:3])[:900]
    if not summary:
        summary = "Расшифровка пока не содержит текста. Добавьте заметки или повторите обработку."
    suggestions: list[dict] = []
    for row in segments:
        text = _clean(row.get("text", ""))
        if not text:
            continue
        lowered = text.lower()
        kind = ""
        if any(marker in lowered for marker in DECISION_MARKERS):
            kind = "DECISION"
        elif any(marker in lowered for marker in ACTION_MARKERS):
            kind = "ACTION"
        elif any(marker in lowered for marker in QUESTION_MARKERS):
            kind = "QUESTION"
        if kind:
            suggestions.append({"kind": kind, "title": text, "source_segment_ids": [row["id"]], "confidence": 72})
    return summary, suggestions[:20]


def validate_items(items: list[dict]) -> list[dict]:
    issues: list[dict] = []
    for item in items:
        if item["kind"] == "ACTION":
            if not item.get("assignee_membership_id"):
                issues.append({"item_id": item["id"], "severity": "BLOCKER", "code": "MISSING_ASSIGNEE", "message": "У задачи нет исполнителя."})
            if not item.get("due_at"):
                issues.append({"item_id": item["id"], "severity": "WARNING", "code": "MISSING_DUE_DATE", "message": "У задачи не указан срок."})
            if not (item.get("acceptance_criteria") or "").strip():
                issues.append({"item_id": item["id"], "severity": "WARNING", "code": "MISSING_ACCEPTANCE_CRITERIA", "message": "У задачи нет критерия готовности."})
        if not item.get("source_segment_ids"):
            issues.append({"item_id": item["id"], "severity": "WARNING", "code": "MISSING_EVIDENCE", "message": "Пункт не связан с фрагментом разговора."})
    return issues
