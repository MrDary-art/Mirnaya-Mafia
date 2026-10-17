"""Safe first-pass extraction for meeting protocols.

The implementation is intentionally deterministic.  It creates reviewable
suggestions with source evidence; an optional language model can later enrich
this service but can never publish or assign an obligation by itself.
"""
from __future__ import annotations

import re


ACTION_MARKERS = ("сделаю", "сделаем", "подготов", "отправ", "провер", "соберу", "назнач", "создам")
DECISION_MARKERS = ("решили", "договорились", "согласовали", "утвердили", "принимаем решение")
QUESTION_MARKERS = ("нужно уточнить", "открытый вопрос", "вернёмся", "вернемся", "не решили")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())[:500]


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
