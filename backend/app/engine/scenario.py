from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path
from typing import Any

from app.engine.metrics import START_METRICS, pick_ending, snapshot

SCENARIO_DIR = Path(__file__).resolve().parent.parent / "data" / "scenarios"

PROFILE_BY_TKI = {
    "сотрудничество": "Интегратор — ищете взаимную выгоду и держите контакт.",
    "конкуренция": "Напористый переговорщик — давите на результат, рискуя отношениями.",
    "компромисс": "Практик обмена — быстро закрываете сделку ценой части интересов.",
    "избегание": "Осторожный стратег — откладываете конфликт, теряя темп.",
    "приспособление": "Хранитель отношений — уступаете, чтобы сохранить мир.",
}

CHAOS_EVENTS = [
    {
        "id": "interruption",
        "text": "Оппонент перебивает вас: «Позвольте, я не закончил!»",
        "effect": {"trust": 0, "goal": -1, "control": -2, "eq": -1},
        "response_options": [
            {"text": "Извиниться и дать договорить", "delta": {"trust": +2, "control": -1, "eq": +2}},
            {"text": "Вежливо продолжить: «Я услышал, позвольте завершить мысль»", "delta": {"trust": +1, "control": +2, "eq": +1}},
            {"text": "Перебить в ответ", "delta": {"trust": -4, "control": -1, "eq": -3}},
        ],
    },
    {
        "id": "phone_call",
        "text": "Звонит телефон. Оппонент смотрит на вас.",
        "effect": {"trust": 0, "goal": 0, "control": -1, "eq": 0},
        "response_options": [
            {"text": "Извиниться и проигнорировать звонок", "delta": {"trust": +2, "control": +1, "eq": +1}},
            {"text": "Быстро ответить: «Коротко»", "delta": {"trust": -1, "control": -2, "eq": -1}},
            {"text": "Отклонить вызов", "delta": {"trust": +1, "control": +1, "eq": 0}},
        ],
    },
    {
        "id": "visitor",
        "text": "В комнату заходит коллега оппонента.",
        "effect": {"trust": 0, "goal": 0, "control": 0, "eq": 0},
        "response_options": [
            {"text": "Сделать паузу, подождать", "delta": {"trust": +1, "control": +1, "eq": +1}},
            {"text": "Продолжить говорить", "delta": {"trust": -1, "control": 0, "eq": -1}},
            {"text": "Предложить продолжить позже", "delta": {"trust": +1, "control": -1, "eq": 0}},
        ],
    },
    {
        "id": "connection_loss",
        "text": "Связь прерывается. Вы слышите: «...пропадает...»",
        "effect": {"trust": 0, "goal": -1, "control": -1, "eq": 0},
        "response_options": [
            {"text": "Говорить короче и чётче", "delta": {"trust": +1, "control": +2, "eq": +1}},
            {"text": "Повторять последнее предложение", "delta": {"trust": 0, "control": -1, "eq": 0}},
            {"text": "Предложить перезвонить", "delta": {"trust": +1, "control": 0, "eq": +1}},
        ],
    },
    {
        "id": "topic_change",
        "text": "Оппонент резко меняет тему: «Кстати, а что насчёт...»",
        "effect": {"trust": 0, "goal": -2, "control": -2, "eq": 0},
        "response_options": [
            {"text": "Вернуть к теме: «Давайте сначала закроем текущий вопрос»", "delta": {"trust": +1, "control": +3, "eq": +1}},
            {"text": "Поддержать новую тему", "delta": {"trust": +1, "control": -2, "goal": -2}},
            {"text": "Игнорировать и продолжить", "delta": {"trust": -2, "control": 0, "eq": -1}},
        ],
    },
]


def load_scenarios() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
            entries = data if isinstance(data, list) else [data]
            for entry in entries:
                scenario = _expand_library_scenario(entry)
                out[scenario["id"]] = scenario
    return out


def _expand_library_scenario(source: dict[str, Any]) -> dict[str, Any]:
    """Expand compact library entries into the existing scenario contract."""
    if source.get("template") != "three_turn_business":
        return source
    scenario = dict(source)
    scenario.pop("template", None)
    opening = scenario.pop("opening")
    constructive = scenario.pop("constructive")
    defensive = scenario.pop("defensive")
    close = scenario.pop("close")
    prefix = scenario["id"]

    def option(key, text, tki, techniques, effects, nxt, comment):
        return {"id": key, "text": text, "tki": tki, "techniques": techniques, "effects": effects, "next": nxt, "comment": comment}

    scenario["steps"] = [
        {"id": f"{prefix}_start", "opponent_line": opening, "options": [
            option("listen", source["listen"], "сотрудничество", ["эмпатия", "вопросы"], {"trust": 5, "goal": 3, "control": 2, "eq": 4}, f"{prefix}_constructive", "Вы признали позицию собеседника и открыли обсуждение интересов."),
            option("push", source["push"], "конкуренция", ["давление"], {"trust": -5, "goal": 2, "control": 2, "eq": -3}, f"{prefix}_defensive", "Давление ускорило разговор, но усилило сопротивление."),
            option("yield", source["yield"], "избегание", ["уступка без выгоды"], {"trust": 1, "goal": -5, "control": -4, "eq": 0}, f"{prefix}_defensive", "Уступка без обмена оставила вашу цель без защиты."),
        ]},
        {"id": f"{prefix}_constructive", "opponent_line": constructive, "options": [
            option("criteria", source["criteria"], "сотрудничество", ["объективные критерии", "структура"], {"trust": 4, "goal": 6, "control": 4, "eq": 2}, "end:eval", "Критерии сделали договорённость проверяемой."),
            option("trade", source["trade"], "компромисс", ["вопросы"], {"trust": 3, "goal": 3, "control": 2, "eq": 2}, "end:eval", "Вы нашли компромисс, сохранив пространство для соглашения."),
            option("ultimatum", source["ultimatum"], "конкуренция", ["давление"], {"trust": -4, "goal": 1, "control": 1, "eq": -3}, "end:eval", "Ультиматум разрушил часть накопленного доверия."),
        ]},
        {"id": f"{prefix}_defensive", "opponent_line": defensive, "options": [
            option("repair", source["repair"], "сотрудничество", ["отражение эмоций", "вопросы"], {"trust": 4, "goal": 3, "control": 2, "eq": 5}, "end:eval", "Вы снизили накал и вернули разговор к задаче."),
            option("boundary", source["boundary"], "компромисс", ["структура"], {"trust": 1, "goal": 3, "control": 4, "eq": 1}, "end:eval", "Граница была обозначена спокойно и ясно."),
            option("escalate", source["escalate"], "конкуренция", ["агрессия"], {"trust": -7, "goal": -4, "control": -2, "eq": -6}, "end:eval", "Эскалация закрыла путь к совместному решению."),
        ]},
    ]
    scenario["endings"] = [
        {"id": "excellent", "condition": "goal >= 49 && trust >= 57 && eq >= 55", "verdict": close + " Договорённость достигнута без потери рабочих отношений.", "outcome": "excellent"},
        {"id": "good", "condition": "goal >= 43 && trust >= 45", "verdict": close + " Основная цель достигнута через рабочий компромисс.", "outcome": "good"},
        {"id": "partial", "condition": "goal >= 35", "verdict": "Результат частичный: следующий шаг нужно закрепить письменно и вернуться к спорным условиям.", "outcome": "partial"},
        {"id": "failure", "condition": "true", "verdict": "Договорённость не достигнута: давление и неясные условия усилили сопротивление.", "outcome": "failure"},
    ]
    return scenario


SCENARIOS = load_scenarios()


def get_chaos_event(turns: int, difficulty: str) -> dict[str, Any] | None:
    """Вернуть событие хаоса если оно должно произойти на этом ходу."""
    # Частота зависит от сложности
    frequencies = {"лёгкий": 0.05, "средний": 0.1, "сложный": 0.15, "жёсткий": 0.2}
    freq = frequencies.get(difficulty, 0.1)
    
    # Не чаще чем раз в 3 хода
    if turns % 3 != 0:
        return None
    
    if random.random() > freq:
        return None
    
    return random.choice(CHAOS_EVENTS)


def get_scenario(scenario_id: str) -> dict[str, Any]:
    if scenario_id not in SCENARIOS:
        raise KeyError(scenario_id)
    return SCENARIOS[scenario_id]


def list_scenarios() -> list[dict[str, Any]]:
    items = []
    for sc in SCENARIOS.values():
        items.append(
            {
                "id": sc["id"],
                "title": sc["title"],
                "context": sc["context"],
                "roles": sc["roles"],
                "goal": sc.get("player_goal") or sc["goal"],
                "difficulty": sc.get("difficulty", "medium"),
                "problem": sc.get("problem"),
                "steps": len(sc.get("steps", [])),
                "category": sc.get("category", "Другое"),
                "skills": sc.get("skills", []),
                "minutes": sc.get("minutes", 7),
                "features": sc.get("features", []),
                "opponent": sc["roles"].get("opponent"),
                "description": sc.get("description") or sc["context"],
            }
        )
    return items


def match_scenario(settings: dict[str, Any]) -> dict[str, Any]:
    preset = settings.get("preset") or settings.get("scenario_id")
    if preset and preset in SCENARIOS:
        return SCENARIOS[preset]
    problem = (settings.get("problem") or "").lower()
    role = (settings.get("role") or "").lower()
    for sc in SCENARIOS.values():
        blob = " ".join(
            [
                sc["id"],
                sc["title"],
                sc.get("problem") or "",
                sc["roles"].get("player", ""),
                sc.get("player_goal") or sc["goal"],
            ]
        ).lower()
        if problem and problem in blob:
            return sc
        if "hr" in role and "hr" in blob:
            return sc
        if "продаж" in role and "скидк" in blob:
            return sc
    return next(iter(SCENARIOS.values()))


def step_by_id(scenario: dict[str, Any], step_id: str) -> dict[str, Any]:
    for step in scenario["steps"]:
        if step["id"] == step_id:
            return step
    raise KeyError(step_id)


def build_report(scenario: dict[str, Any], state: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    metrics = state["metrics"]
    ending = pick_ending(scenario.get("endings") or [], metrics, state.get("ending_hint"))
    history = state.get("history") or []
    tki_counts = Counter(h.get("tki") for h in history if h.get("tki"))
    total = sum(tki_counts.values()) or 1
    tki_map = {k: round(100 * v / total) for k, v in tki_counts.items()}
    dominant = tki_counts.most_common(1)[0][0] if tki_counts else "сотрудничество"

    mistakes = []
    for h in history:
        d = h.get("delta") or {}
        if d.get("trust", 0) < 0 or d.get("goal", 0) < 0 or d.get("eq", 0) < -1:
            alt = h.get("alternative") or "Сформулируйте интерес, а не позицию."
            mistakes.append(
                {
                    "step": h.get("step_id"),
                    "what": h.get("comment") or "Реплика ухудшила метрики.",
                    "alternative": alt,
                    "chosen": h.get("text"),
                }
            )
    mistakes = mistakes[:3]

    recs = []
    if metrics["trust"] < 60:
        recs.append("Вернитесь к эмпатии и отделению человека от проблемы — доверие ниже рабочего уровня.")
    if metrics["goal"] < 60:
        recs.append("Опирайтесь на BATNA и объективные критерии, а не на уступки без обмена.")
    if metrics["control"] < 50:
        recs.append("Задавайте открытые вопросы и держите структуру встречи.")
    if metrics["eq"] < 55:
        recs.append("Отражайте эмоции оппонента до перехода к условиям.")
    if not recs:
        recs.append("Зафиксируйте договорённости письменно и назначьте следующий шаг.")
        recs.append("Повторите сценарий на сложности выше, сохраняя тот же каркас.")
    recs = recs[:2]

    techniques = Counter()
    harvard = {"batna": False, "objective_criteria": False, "interests": False}
    for h in history:
        for t in h.get("techniques") or []:
            techniques[t] += 1
            low = t.lower()
            if low == "batna":
                harvard["batna"] = True
            if low == "объективные критерии":
                harvard["objective_criteria"] = True
            if low in {"эмпатия", "сотрудничество", "вопросы"}:
                harvard["interests"] = True

    batna_text = (
        "BATNA использована: вы озвучили альтернативу и усилили позицию."
        if harvard["batna"]
        else "BATNA не прозвучала. В этом сценарии запасной вариант — процедура, дата и пакет, а не спор о личности."
    )

    initial_metrics = scenario.get("initial_metrics") or START_METRICS
    chart = [{"turn": 0, **initial_metrics}]
    running = dict(initial_metrics)
    # chart from stored metrics_after if present
    for i, h in enumerate(history, start=1):
        after = h.get("metrics_after") or running
        chart.append({"turn": i, **after})

    hidden = scenario.get("hidden_goal") or {}
    guess = state.get("hidden_guess")
    hidden_result = None
    if settings.get("hidden_goal") and hidden:
        hidden_result = {
            "guessed": guess,
            "correct": hidden.get("correct"),
            "correct_text": (hidden.get("options") or [None])[hidden.get("correct", 0)]
            if hidden.get("options")
            else hidden.get("text"),
            "ok": guess == hidden.get("correct"),
        }

    return {
        "verdict": ending.get("verdict"),
        "ending_id": ending.get("id"),
        "outcome": ending.get("outcome") or ending.get("id"),
        "metrics": snapshot(metrics, history),
        "metrics_chart": chart,
        "tki_map": tki_map,
        "mistakes": mistakes,
        "recommendations": recs,
        "batna_assessment": batna_text,
        "harvard": harvard,
        "techniques": dict(techniques),
        "profile": PROFILE_BY_TKI.get(dominant, PROFILE_BY_TKI["сотрудничество"]),
        "dominant_tki": dominant,
        "hidden_goal": hidden_result,
        "goal": settings.get("goal") or scenario.get("player_goal") or scenario.get("goal"),
        "scenario_title": scenario.get("title"),
        "chaos_events": state.get("chaos_history") or [],
    }
