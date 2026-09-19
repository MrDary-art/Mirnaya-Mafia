"""Regression checks for completed interviews whose final AI review is unavailable."""

import json
from unittest.mock import AsyncMock

import pytest

from app.engine import online_report
from app.engine.metrics import START_METRICS


def interview_state(progress: int, values: dict) -> dict:
    history = [
        {"text": "Relevant teaching example", "goal_signal": "progress" if index < progress else "none"}
        for index in range(12)
    ]
    return {
        "metrics": dict(values), "history": history, "ai_provider": "gigachat",
        "outcome_signal": "interview_complete",
    }


def base_report(values: dict) -> dict:
    return {"metrics_chart": [{"turn": 0, **START_METRICS}, {"turn": 12, **values}], "harvard": {}}


@pytest.mark.asyncio
async def test_strong_interview_passes_when_final_assessment_times_out(monkeypatch):
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(side_effect=TimeoutError))
    values = {"trust": 67, "goal": 94, "control": 50, "eq": 50}
    state = interview_state(10, values)
    result = await online_report.enrich_online_report(base_report(values), state, {"practice_kind": "job_interview"})
    assert result["ending_id"] == "online_success"
    assert result["goal_status"] == "achieved"
    assert result["assessment_source"] == "server_metrics"
    assert state["metrics"]["goal"] == 94
    assert "goal_assessment_delta" not in result
    assert len(result["metrics_chart"]) == 2


@pytest.mark.asyncio
async def test_strong_interview_overrides_conflicting_ai_failure(monkeypatch):
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps({
        "goal_status": "failed", "evidence": "Relevant teaching example", "summary": "Failed despite answers.",
    }), "gigachat")))
    values = {"trust": 67, "goal": 94, "control": 50, "eq": 50}
    state = interview_state(10, values)
    result = await online_report.enrich_online_report(base_report(values), state, {"practice_kind": "job_interview"})
    assert result["ending_id"] == "online_success"
    assert result["assessment_source"] == "server_metrics"
    assert "goal_evidence" not in result
    assert state["metrics"]["goal"] == 94


@pytest.mark.asyncio
async def test_interview_with_little_progress_still_fails(monkeypatch):
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(side_effect=TimeoutError))
    values = {"trust": 50, "goal": 40, "control": 50, "eq": 50}
    state = interview_state(0, values)
    result = await online_report.enrich_online_report(base_report(values), state, {"practice_kind": "job_interview"})
    assert result["ending_id"] == "online_failed"
    assert result["goal_status"] == "failed"
    assert state["metrics"]["goal"] == 35
    assert result["goal_assessment_delta"] == -5
