from __future__ import annotations

import json
import re
from typing import Any

ZERO_ANALYSIS = {
    "tki_style": "сотрудничество",
    "techniques": [],
    "tone": "нейтральный",
    "trust_delta": 0,
    "goal_delta": 0,
    "control_delta": 0,
    "eq_delta": 0,
    "comment": "Анализ недоступен",
}

TKI_KEYWORDS = {
    "конкуренция": ["должен", "требую", "иначе", "ультиматум", "немедленно"],
    "сотрудничество": ["вместе", "давайте найдём", "интересы", "как вам удобно", "общее решение"],
    "компромисс": ["навстречу", "скидка", "разделим", "середина", "оба"],
    "избегание": ["потом", "не сейчас", "вернёмся", "не готов", "отложим"],
    "приспособление": ["как скажете", "согласен на всё", "ладно", "уступаю"],
}

TECHNIQUE_KEYWORDS = {
    "активное слушание": ["правильно ли я", "если я верно", "вы имеете в виду"],
    "эмпатия": ["понимаю", "это непросто", "слышу вас"],
    "batna": ["альтернатив", "другой кандидат", "другой поставщик", "другой оффер"],
    "объективные критерии": ["рынок", "политика компании", "данные", "бенчмарк", "цифр"],
    "spin": ["что будет если", "как это влияет", "какой эффект"],
    "вопросы": ["почему", "как", "что для вас"],
    "пауза": ["пауза", "давайте остановимся"],
    "структура": ["по пунктам", "сначала", "затем", "итог"],
    "грубость": ["дурак", "бесполезн", "замолчи"],
    "перебивание": ["хватит", "подождите я скажу", "не перебивайте"],
    "агрессия": ["угроз", "пожалуюсь", "уничтож"],
}


def extract_json(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def validate_analysis(data: dict[str, Any] | None) -> dict[str, Any]:
    if not data:
        return dict(ZERO_ANALYSIS)
    out = dict(ZERO_ANALYSIS)
    out["tki_style"] = str(data.get("tki_style") or out["tki_style"])
    techniques = data.get("techniques") or []
    if isinstance(techniques, list):
        out["techniques"] = [str(t) for t in techniques]
    out["tone"] = str(data.get("tone") or out["tone"])
    for key in ("trust_delta", "goal_delta", "control_delta", "eq_delta"):
        try:
            out[key] = int(data.get(key, 0))
        except (TypeError, ValueError):
            out[key] = 0
    comment = data.get("comment")
    out["comment"] = str(comment) if comment else out["comment"]
    return out


def rule_based_analysis(block: str) -> dict[str, Any]:
    text = (block or "").lower()
    if not text.strip():
        return dict(ZERO_ANALYSIS)

    tki_scores = {k: sum(1 for w in words if w in text) for k, words in TKI_KEYWORDS.items()}
    tki = max(tki_scores, key=lambda k: tki_scores[k])
    if tki_scores[tki] == 0:
        tki = "сотрудничество"

    techniques = [name for name, words in TECHNIQUE_KEYWORDS.items() if any(w in text for w in words)]
    tone = "нейтральный"
    if any(w in text for w in ("спасибо", "рад", "ценю")):
        tone = "позитивный"
    if any(w in text for w in ("нет", "проблема", "к сожалению")):
        tone = "негативный"
    if any(w in text for w in ("угроз", "немедленно", "иначе")):
        tone = "агрессивный"

    trust = 0
    goal = 0
    control = 0
    eq = 0
    if tki == "сотрудничество":
        trust += 2
        goal += 1
    elif tki == "конкуренция":
        trust -= 3
        control += 1
    elif tki == "избегание":
        goal -= 2
        control -= 1
    elif tki == "приспособление":
        trust += 1
        goal -= 2
    if "batna" in techniques:
        goal += 3
    if "объективные критерии" in techniques:
        goal += 4
    if "эмпатия" in techniques:
        trust += 2
        eq += 2
    if "вопросы" in techniques:
        control += 3
    if "грубость" in techniques:
        eq -= 5
        trust -= 3

    return {
        "tki_style": tki,
        "techniques": techniques,
        "tone": tone,
        "trust_delta": trust,
        "goal_delta": goal,
        "control_delta": control,
        "eq_delta": eq,
        "comment": "Rule-based разбор по ключевым словам.",
    }


def parse_llm_analysis(raw: str) -> dict[str, Any]:
    data = extract_json(raw)
    if not data:
        return dict(ZERO_ANALYSIS)
    return validate_analysis(data)
