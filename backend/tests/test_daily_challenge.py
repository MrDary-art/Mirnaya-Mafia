from datetime import date, timedelta

from app.engine.scenario import SCENARIOS
from app.routers.meta import DAILY_CHALLENGE_SCENARIO_IDS, _daily_scenario_id


def test_daily_challenge_uses_five_authored_scenarios_in_a_repeatable_cycle():
    start = date(2026, 1, 1)
    cycle = [_daily_scenario_id(start + timedelta(days=offset)) for offset in range(5)]

    assert len(DAILY_CHALLENGE_SCENARIO_IDS) == 5
    assert set(DAILY_CHALLENGE_SCENARIO_IDS).issubset(SCENARIOS)
    assert set(cycle) == set(DAILY_CHALLENGE_SCENARIO_IDS)
    assert _daily_scenario_id(start + timedelta(days=5)) == _daily_scenario_id(start)
