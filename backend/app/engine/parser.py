from __future__ import annotations

import json
import re
from typing import Any

ZERO_ANALYSIS = {
    "tki_style": None,
    "techniques": [],
    "tone": "нейтральный",
    "goal_signal": "none",
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

TECHNIQUE_ALIASES = {"открытые вопросы": "вопросы", "batna": "batna", "spin": "spin"}
ALLOWED_TECHNIQUES = set(TECHNIQUE_KEYWORDS) | {"якорение", "уступка"}
ALLOWED_TONES = {"позитивный", "нейтральный", "негативный", "агрессивный"}


def score_behaviors(tki: str, techniques: list[str], goal_signal: str = "none", tone: str = "нейтральный") -> dict[str, int]:
    """Only validated tags, never LLM-supplied numbers, change online metrics."""
    trust = goal = control = eq = 0
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
    if "структура" in techniques:
        control += 2
    if "активное слушание" in techniques:
        eq += 2
    if tone == "позитивный":
        eq += 1
    elif tone == "негативный":
        eq -= 1
    elif tone == "агрессивный" and "грубость" not in techniques:
        eq -= 3
    if "грубость" in techniques:
        eq -= 5
        trust -= 3
    if goal_signal == "progress":
        goal += 6
    elif goal_signal == "setback":
        goal -= 6
    return {"trust_delta": trust, "goal_delta": goal, "control_delta": control, "eq_delta": eq}


def score_interview_answer(text: str, analysis: dict[str, Any]) -> tuple[dict[str, int], str | None]:
    """Score interview answers for substance and clarity, independently of negotiation TKI tags."""
    normalized = re.sub(r"[^\w\s-]", " ", str(text or "").casefold()).strip()
    words = normalized.split()
    placeholder = normalized in {"а", "по", "тп", "ок", "угу", "бубумап"} or len(words) < 3
    if placeholder:
        return {"trust_delta": -1, "goal_delta": -3, "control_delta": -2, "eq_delta": -2}, "Ответ слишком короткий или неясный. Уточните мысль и приведите конкретный пример."
    if len(words) < 8:
        return {"trust_delta": 0, "goal_delta": 0, "control_delta": -1, "eq_delta": -1}, "Ответ принят, но ему не хватает деталей: добавьте ситуацию, действие и результат."
    signal = analysis.get("goal_signal") or "none"
    delta = score_behaviors("", [t for t in analysis.get("techniques") or [] if t in {"грубость", "эмпатия", "активное слушание"}], signal, analysis.get("tone") or "нейтральный")
    delta["control_delta"] += 1
    delta["eq_delta"] += 1
    return delta, None


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
    tki = str(data.get("tki_style") or "").strip().lower()
    if tki not in TKI_KEYWORDS:
        return dict(ZERO_ANALYSIS)
    out = dict(ZERO_ANALYSIS)
    out["tki_style"] = tki
    techniques = data.get("techniques") or []
    if isinstance(techniques, list):
        normalized = [TECHNIQUE_ALIASES.get(str(t).strip().lower(), str(t).strip().lower()) for t in techniques]
        out["techniques"] = list(dict.fromkeys(t for t in normalized if t in ALLOWED_TECHNIQUES))[:8]
    tone = str(data.get("tone") or "").strip().lower()
    out["tone"] = tone if tone in ALLOWED_TONES else "нейтральный"
    goal_signal = str(data.get("goal_signal") or "none").strip().lower()
    out["goal_signal"] = goal_signal if goal_signal in {"progress", "setback", "none"} else "none"
    out.update(score_behaviors(tki, out["techniques"], out["goal_signal"], out["tone"]))
    comment = data.get("comment")
    out["comment"] = str(comment)[:500] if comment else out["comment"]
    return out


def rule_based_analysis(block: str) -> dict[str, Any]:
    text = (block or "").lower()
    if not text.strip():
        return dict(ZERO_ANALYSIS)

    tki_scores = {k: sum(1 for w in words if w in text) for k, words in TKI_KEYWORDS.items()}
    tki = max(tki_scores, key=lambda k: tki_scores[k])
    if tki_scores[tki] == 0:
        tki = None

    techniques = [name for name, words in TECHNIQUE_KEYWORDS.items() if any(w in text for w in words)]
    tone = "нейтральный"
    if any(w in text for w in ("спасибо", "рад", "ценю")):
        tone = "позитивный"
    if any(w in text for w in ("нет", "проблема", "к сожалению")):
        tone = "негативный"
    if any(w in text for w in ("угроз", "немедленно", "иначе")):
        tone = "агрессивный"

    return {
        "tki_style": tki,
        "techniques": techniques,
        "tone": tone,
        "goal_signal": "none",
        **score_behaviors(tki, techniques, tone=tone),
        "comment": "Rule-based разбор по ключевым словам.",
    }


def parse_llm_analysis(raw: str) -> dict[str, Any]:
    data = extract_json(raw)
    if not data:
        return dict(ZERO_ANALYSIS)
    return validate_analysis(data)
