from app.engine.metrics import (
    START_METRICS,
    apply_decay,
    clamp,
    concession_penalty,
    confidence,
    evaluate_condition,
    pick_ending,
    technique_deltas,
)


def test_clamp():
    assert clamp(-10) == 0
    assert clamp(140) == 100
    assert clamp(50) == 50


def test_combo_coefficients():
    d = technique_deltas(["активное слушание", "эмпатия", "сотрудничество"])
    # 3*1.0 + 2*0.7 + 2*0.5 = 3+1.4+1 = 5.4 trust
    assert round(d["trust"], 1) == 5.4


def test_salary_concession_stronger():
    assert concession_penalty("торг за скидку") == -2
    assert concession_penalty("переговоры о зарплате") == -3
    d = technique_deltas(["уступка без выгоды"], "Переговоры о зарплате")
    assert d["goal"] == -3


def test_decay_old_turns():
    history = [{"trust": 10, "goal": 0, "control": 0, "eq": 0} for _ in range(7)]
    m = apply_decay(history)
    # start 50 + two oldest *0.5*10 + five recent *10 = 50 + 10 + 50 = 110 -> 100
    assert m["trust"] == 100
    history_neg = [{"trust": -10, "goal": 0, "control": 0, "eq": 0} for _ in range(7)]
    m2 = apply_decay(history_neg)
    assert m2["trust"] == 0


def test_confidence_weights_and_batna():
    metrics = {"trust": 80, "goal": 80, "control": 80, "eq": 10}
    base = confidence(metrics, False, False, False)
    boosted = confidence(metrics, True, True, False)
    penalized = confidence(metrics, False, False, True)
    assert boosted > base > penalized
    expected = 0.5 * 80 + 0.3 * 80 + 0.2 * 80
    assert base == round(expected)


def test_endings():
    endings = [
        {"id": "win_win", "condition": "trust > 60 && goal > 70", "verdict": "ok"},
        {"id": "conflict", "condition": "trust < 30", "verdict": "bad"},
        {"id": "mixed", "condition": "true", "verdict": "mid"},
    ]
    assert pick_ending(endings, {**START_METRICS, "trust": 70, "goal": 80})["id"] == "win_win"
    assert pick_ending(endings, {**START_METRICS, "trust": 10, "goal": 90})["id"] == "conflict"
    assert evaluate_condition("trust > 60 && goal > 70", {"trust": 61, "goal": 71, "control": 0, "eq": 0})
