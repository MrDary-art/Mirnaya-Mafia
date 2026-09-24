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
