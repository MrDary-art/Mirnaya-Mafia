"""Extract review candidates, never inferred promises or participant scores."""
import re


def review_from_segments(segments):
    groups = {"DECISION": [], "ACTION": [], "QUESTION": [], "RISK": []}
    for segment in segments:
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", segment.get("text", "")):
            text = re.sub(r"\s+", " ", sentence).strip()
            lower = text.casefold()
            if not text:
                continue
            # A question/negated agreement must not turn into an agreed task.
            if "?" in text or re.search(r"\bне\s+(?:буд\w*|сдела\w*|отправ\w*|подготов\w*|провер\w*)", lower) or any(word in lower for word in ("не решили", "не договорились", "нужно уточнить", "открытый вопрос", "не согласовали")):
                kind = "QUESTION"
            elif any(word in lower for word in ("решили", "договорились", "согласовали", "утвердили")):
                kind = "DECISION"
            elif any(word in lower for word in ("риск", "можем не успеть", "не хватит")):
                kind = "RISK"
            elif any(word in lower for word in ("сделаю", "сделаем", "подготовлю", "подготовим", "отправлю", "отправим", "проверю", "проверим", "соберу", "назначим", "создам")):
                kind = "ACTION"
            else:
                continue
            existing = next((item for item in groups[kind] if item["text"].casefold() == lower), None)
            if existing:
                if segment["id"] not in existing["source_segment_ids"]:
                    existing["source_segment_ids"].append(segment["id"])
            else:
                groups[kind].append({"kind": kind, "title": text[:240], "text": text,
                                     "source_segment_ids": [segment["id"]]})
    suggestions = [item for items in groups.values() for item in items][:40]
    if not segments:
        summary = "Встреча завершена. Записанных реплик нет; уточните решения и следующие шаги вручную."
    elif suggestions:
        summary = "По сохранённым репликам — проверьте формулировки:\n" + "\n".join(
            f"{label}: {groups[kind][0]['text']}" for kind, label in
            (("DECISION", "Решение"), ("ACTION", "Следующий шаг"), ("QUESTION", "Нужно уточнить"), ("RISK", "Риск"))
            if groups[kind])
    else:
        excerpts = " ".join(str(row.get("text", "")).strip() for row in segments[:3])[:1800]
        summary = "В сохранённых репликах:\n«" + excerpts + "»\nЯвные решения и обязательства не найдены. Проверьте материалы и уточните итог."
    return summary[:3000], suggestions
