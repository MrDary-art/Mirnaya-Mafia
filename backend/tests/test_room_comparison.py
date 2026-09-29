import asyncio
import json
from copy import deepcopy
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from app.engine import room_comparison as comparison
from app.engine.room_v2 import attempt_blocked, start_attempt, utcnow


TRANSCRIPTS = {"A": [{"sender": "player", "text": "Я проверил решение тестами"}],
               "B": [{"sender": "player", "text": "Я пока не написал тесты"}]}


def answer():
    return {"winner": "B", "rubric": {key: {label: {"score": 3 if label == "A" else 2, "quote": rows[0]["text"]} for label, rows in TRANSCRIPTS.items()} for key in comparison.RUBRIC}, "candidates": {label: {"evidence": rows[0]["text"], "strength": "Сильная сторона " + label,
            "improvement": "Личная рекомендация " + label, "better_answer": "Пример ответа " + label} for label, rows in TRANSCRIPTS.items()}}


def test_winner_and_feedback_are_separate_and_grounded():
    public, private = comparison.validate_comparison(answer(), TRANSCRIPTS, [12, 34])
    assert public["winner_id"] == 12
    assert "Личная" not in str(public)
    assert private["12"]["improvement"].endswith("A")
    assert private["34"]["improvement"].endswith("B")
    invalid = answer()
    invalid["candidates"]["B"]["evidence"] = "Вымышленная ошибка кандидата"
    with pytest.raises(ValueError):
        comparison.validate_comparison(invalid, TRANSCRIPTS, [12, 34])
    invalid = answer()
    invalid["winner"] = "tie"
    for criterion in invalid["rubric"].values():
        criterion["B"]["score"] = criterion["A"]["score"]
    assert comparison.validate_comparison(invalid, TRANSCRIPTS, [12, 34])[0]["tie"]


def test_empty_attempt_is_not_a_loss_and_ai_failure_has_no_winner(monkeypatch):
    provider = AsyncMock(side_effect=RuntimeError("provider down"))
    monkeypatch.setattr(comparison, "call_with_fallback_detailed", provider)
    result, private = asyncio.run(comparison.compare_interviews("Задача", {**TRANSCRIPTS, "B": []}, [12, 34]))
    assert result["status"] == "incomplete" and not private
    provider.assert_not_called()
    result, private = asyncio.run(comparison.compare_interviews("Задача", TRANSCRIPTS, [12, 34]))
    assert result["status"] == "unavailable" and result["winner_id"] is None and not private


def test_comparison_limits_prompt_without_losing_source_evidence(monkeypatch):
    provider = AsyncMock(return_value=(json.dumps(answer(), ensure_ascii=False), "gigachat"))
    monkeypatch.setattr(comparison, "call_with_fallback_detailed", provider)
    long_rows = [{"sender": "player", "text": "Длинный ответ " + "пример " * 600} for _ in range(40)]
    transcripts = {label: rows + long_rows for label, rows in TRANSCRIPTS.items()}
    result, _ = asyncio.run(comparison.compare_interviews("Задача", transcripts, [12, 34]))
    assert result["status"] == "ready"
    assert len(provider.call_args.args[0]) < 20000


def test_attempt_clock_is_independent_and_capped_by_shared_hour():
    now = utcnow()
    state = {"phase": "active", "duel_window_minutes": 60, "duration_minutes": 15,
             "deadline": (now + timedelta(minutes=6)).isoformat(), "participants": {"1": {}, "2": {}}}
    assert attempt_blocked(state, 1)
    start_attempt(state, 1)
    assert state["participants"]["1"]["attempt_deadline"] == state["deadline"]
    snapshot = deepcopy(state)
    start_attempt(state, 1)
    assert state == snapshot
    assert not attempt_blocked(state, 1) and attempt_blocked(state, 2)
    state["participants"]["1"]["attempt_deadline"] = (now - timedelta(seconds=1)).isoformat()
    assert attempt_blocked(state, 1)
    start_attempt(state, 2)
    assert not attempt_blocked(state, 2)
