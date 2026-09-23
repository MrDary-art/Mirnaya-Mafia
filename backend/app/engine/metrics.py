from __future__ import annotations

from copy import deepcopy
from typing import Any

START_METRICS = {"trust": 50, "goal": 40, "control": 50, "eq": 50}

CONFIDENCE_WEIGHTS = {"goal": 0.5, "trust": 0.3, "control": 0.2}

COMBO_COEFFS = (1.0, 0.7, 0.5)

TECHNIQUE_DELTAS: dict[str, dict[str, int]] = {
    "активное слушание": {"trust": 3},
    "эмпатия": {"trust": 2},
    "сотрудничество": {"trust": 2},
    "конкуренция": {"trust": -5},
    "агрессия": {"trust": -3, "control": -2},
    "перебивание": {"trust": -4},
    "объективные критерии": {"goal": 4},
    "batna": {"goal": 3},
    "spin": {"goal": 2},
    "уступка без выгоды": {"goal": -2},
    "позиционный торг": {"goal": -3},
    "вопросы": {"control": 3},
    "пауза": {"control": 2},
    "структура": {"control": 2},
    "оправдания": {"control": -3},
    "отражение эмоций": {"eq": 4},
    "спокойствие": {"eq": 2},
    "грубость": {"eq": -5},
    "игнорирование сигналов": {"eq": -3},
    "давление": {"trust": -3, "control": 1},
}

METRIC_BANDS = {
    "trust": [
        (30, "Закрыт"),
        (60, "Насторожен"),
        (85, "Открыт"),
        (100, "Полное доверие"),
    ],
    "goal": [
        (30, "Далеко"),
        (60, "На полпути"),
        (85, "Близко"),
        (100, "Достигнута"),
    ],
    "control": [
        (30, "Ведёт оппонент"),
        (60, "Равный диалог"),
        (85, "Ведёте вы"),
        (100, "Полный контроль"),
    ],
    "eq": [
        (30, "Эмоции управляют вами"),
        (60, "Замечаете"),
        (85, "Управляете"),
        (100, "Мастер эмоций"),
    ],
}


def clamp(value: float) -> int:
    return int(max(0, min(100, round(value))))


def band_label(metric: str, value: int) -> str:
    for limit, label in METRIC_BANDS[metric]:
        if value <= limit:
            return label
    return METRIC_BANDS[metric][-1][1]


def concession_penalty(context: str | None) -> int:
    text = (context or "").lower()
    if "зарплат" in text or "повышен" in text:
        return -3
    return -2


def technique_deltas(techniques: list[str], context: str | None = None) -> dict[str, float]:
    acc = {"trust": 0.0, "goal": 0.0, "control": 0.0, "eq": 0.0}
    for i, raw in enumerate(techniques[:3]):
        name = raw.strip().lower()
        coeff = COMBO_COEFFS[i]
        mapping = TECHNIQUE_DELTAS.get(name, {})
        if name == "уступка без выгоды":
            mapping = {"goal": concession_penalty(context)}
        for key, delta in mapping.items():
            acc[key] += delta * coeff
    return acc


def apply_decay(history: list[dict[str, float]]) -> dict[str, int]:
    """Recompute metrics: turns older than 5 apply with 0.5 coefficient."""
    current = {k: float(v) for k, v in START_METRICS.items()}
    n = len(history)
    for i, delta in enumerate(history):
        age_from_end = n - 1 - i
        coeff = 0.5 if age_from_end >= 5 else 1.0
        for key in current:
            current[key] += delta.get(key, 0) * coeff
    return {k: clamp(v) for k, v in current.items()}


def merge_option_delta(option: dict[str, Any], timeout: bool = False) -> dict[str, float]:
    """Return the canonical Scenario Mode delta from one option's effects.

    Techniques are descriptive metadata. They must not produce a second score
    for a pre-authored scenario choice.
    """
    effects = option.get("effects") or {}
    delta = {
        "trust": float(effects.get("trust", 0)),
        "goal": float(effects.get("goal", 0)),
        "control": float(effects.get("control", 0)),
        "eq": float(effects.get("eq", 0)),
    }
    if timeout:
        delta["control"] -= 2
        delta["eq"] -= 1
    return delta


def confidence(metrics: dict[str, int], used_batna: bool, used_criteria: bool, bare_concession: bool) -> int:
    w = CONFIDENCE_WEIGHTS
    raw = (w["goal"] * metrics["goal"] + w["trust"] * metrics["trust"] + w["control"] * metrics["control"]) / sum(
        w.values()
    )
    if used_batna:
        raw += 4
    if used_criteria:
        raw += 3
    if bare_concession:
        raw -= 5
    return clamp(raw)


def evaluate_condition(expr: str, metrics: dict[str, int]) -> bool:
    allowed = {
        "trust": metrics["trust"],
        "goal": metrics["goal"],
        "control": metrics["control"],
        "eq": metrics["eq"],
    }
    sanitized = (
        expr.replace("&&", " and ")
        .replace("||", " or ")
        .replace("true", "True")
        .replace("false", "False")
    )
    try:
        return bool(eval(sanitized, {"__builtins__": {}}, allowed))  # noqa: S307
    except Exception:
        return False


def pick_ending(
    endings: list[dict[str, Any]], metrics: dict[str, int], ending_hint: str | None = None
) -> dict[str, Any]:
    if ending_hint:
        hinted = next((ending for ending in endings if ending.get("id") == ending_hint), None)
        if hinted and evaluate_condition(hinted.get("condition") or "true", metrics):
            return hinted
    for ending in endings:
        cond = ending.get("condition") or "true"
        if evaluate_condition(cond, metrics):
            return ending
    return endings[-1] if endings else {"id": "draw", "verdict": "Сессия завершена"}


def snapshot(metrics: dict[str, int], history: list[dict[str, Any]]) -> dict[str, Any]:
    used_batna = any("batna" in [t.lower() for t in (h.get("techniques") or [])] for h in history)
    used_criteria = any(
        "объективные критерии" in [t.lower() for t in (h.get("techniques") or [])] for h in history
    )
    bare = any(
        "уступка без выгоды" in [t.lower() for t in (h.get("techniques") or [])] for h in history
    )
    return {
        "values": metrics,
        "bands": {k: band_label(k, v) for k, v in metrics.items()},
        "confidence": confidence(metrics, used_batna, used_criteria, bare),
    }


def empty_state(scenario: dict[str, Any]) -> dict[str, Any]:
    first = scenario["steps"][0]["id"]
    initial = scenario.get("initial_metrics") or START_METRICS
    return {
        "step_id": first,
        "history": [],
        "delta_history": [],
        "metrics": deepcopy(initial),
        "ghost_ignored": 0,
        "ghost_used": 0,
        "hints_used_in_window": 0,
        "turns": 0,
        "timeouts": 0,
        "interruptions": 0,
        "batna_uses": 0,
        "finished": False,
        "hidden_guess": None,
        "ending_hint": None,
        "chaos_events": [],
    }
