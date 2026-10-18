import json
from datetime import datetime
from types import SimpleNamespace

from app.routers.insights import build_overview


def session(session_id, trust, goal, control, eq):
    return SimpleNamespace(
        id=session_id,
        metrics=json.dumps({"trust": trust, "goal": goal, "control": control, "eq": eq}),
        status="finished",
        report="{}",
        scenario_id=None,
        settings="{}",
        role="Переговорщик",
        created_at=datetime(2026, 9, 22 + session_id),
        finished_at=datetime(2026, 9, 22 + session_id),
    )


def test_overview_uses_finished_session_metrics_and_bounds_iq():
    result = build_overview([
        session(1, 60, 70, 65, 75),
        session(2, 80, 90, 85, 88),
    ], attempts=4, weekly_goal=5)

    assert 0 <= result["negotiation_iq"] <= 1000
    assert result["sessions_total"] == 2
    assert result["drills_total"] == 4
    assert result["weekly_goal"]["target"] == 5
    assert len(result["dimensions"]) == 8
    assert result["best_score"] >= result["average_score"]


def test_overview_preserves_real_zero_metrics():
    result = build_overview([session(1, 0, 0, 0, 0)])

    assert result["negotiation_iq"] == 0
    assert result["average_score"] == 0
    assert result["best_score"] == 0
    assert all(item["score"] == 0 for item in result["dimensions"])
    assert result["category_strengths"][0]["score"] == 0
    assert result["trend"][0]["score"] == 0


def test_overview_does_not_invent_metrics_for_incomplete_session():
    valid = session(1, 80, 70, 60, 50)
    incomplete = session(2, 0, 0, 0, 0)
    incomplete.metrics = json.dumps({"trust": 0, "goal": 0})

    result = build_overview([valid, incomplete])
    expected = build_overview([valid])

    assert result["sessions_total"] == 2
    assert result["negotiation_iq"] == expected["negotiation_iq"]
    assert result["average_score"] == expected["average_score"]
    assert result["best_score"] == expected["best_score"]
    assert result["dimensions"] == expected["dimensions"]
    assert result["category_strengths"] == expected["category_strengths"]
    assert result["trend"] == expected["trend"]
