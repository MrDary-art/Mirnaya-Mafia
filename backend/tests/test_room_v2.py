from datetime import datetime, timedelta, timezone

from app.engine.room_v2 import build_state, can_start, challenge_key, parse_schedule, start_state, team_result, utcnow


def make_state():
    state = build_state(mode="duel", host_id=1, display_name="Первый", request_text="Собеседование",
                        goal="Получить оффер", duration_minutes=12, scheduled_at=utcnow() - timedelta(seconds=1),
                        timezone_name="Europe/Moscow", team_name="Команда", scenario_id="dismissal",
                        ranked=True, questions=["Q1", "Q2"])
    state["participants"]["2"] = {"display_name": "Второй", "ready": False, "transport_ready": False}
    return state


def test_room_starts_only_after_both_explicitly_ready():
    state = make_state()
    state["participants"]["1"].update(ready=True, transport_ready=True)
    assert not can_start(state, 1, 2)
    state["participants"]["2"].update(ready=True, transport_ready=True)
    assert can_start(state, 1, 2)
    start_state(state)
    assert state["phase"] == "active"
    assert state["deadline"]


def test_team_score_is_deterministic_and_requires_two_complete_reports():
    report = lambda goal, trust, control: {"metrics": {"values": {"goal": goal, "trust": trust, "control": control}},
                                            "turn_summary": [{"text": "answer"}]}
    result = team_result({"1": report(80, 70, 60), "2": report(60, 50, 40)}, [1, 2])
    assert result == {"scores": {"1": 73, "2": 53}, "score": 126, "complete": True,
                      "maximum": 200, "formula": "score_A + score_B"}
    incomplete = team_result({"1": report(80, 70, 60)}, [1, 2])
    assert incomplete["complete"] is False
    assert incomplete["score"] is None


def test_challenge_key_changes_when_contract_changes():
    state = make_state()
    first = challenge_key(state)
    state["duration_minutes"] += 1
    assert challenge_key(state) != first


def test_moscow_schedule_works_without_system_timezone_database():
    future = utcnow() + timedelta(days=1)
    local = future.astimezone(timezone(timedelta(hours=3))).replace(tzinfo=None)
    parsed = parse_schedule(local.isoformat(), "Europe/Moscow")
    assert parsed.tzinfo == timezone.utc
    assert abs((parsed - future).total_seconds()) < 0.001
