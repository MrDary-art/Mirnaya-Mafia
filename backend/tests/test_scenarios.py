from app.engine.metrics import clamp, empty_state, merge_option_delta, pick_ending
from app.engine.scenario import SCENARIOS, build_report, get_scenario, step_by_id
from app.engine import walk_all_branches, assert_scenario_integrity


def test_all_scenarios_integrity():
    assert "hr_firing_01" in SCENARIOS
    for sc in SCENARIOS.values():
        assert_scenario_integrity(sc)
        paths = walk_all_branches(sc)
        assert paths
        for path in paths:
            assert path


def test_offline_library_has_fifteen_catalogued_branching_scenarios():
    assert len(SCENARIOS) >= 15
    for scenario in SCENARIOS.values():
        assert len(scenario["endings"]) >= 3
        if "category" not in scenario:
            continue
        first_targets = {option["next"] for option in scenario["steps"][0]["options"]}
        assert len(first_targets) >= 2
    library = get_scenario("team_conflict_01")
    assert library["category"] == "Команда"
    assert library["skills"]


def test_scenarios_use_the_offline_contract():
    required = {"id", "title", "context", "roles", "player_goal", "opponent_goal", "difficulty", "initial_metrics", "steps", "endings"}
    for scenario in SCENARIOS.values():
        assert required <= scenario.keys()
        assert set(scenario["initial_metrics"]) == {"trust", "goal", "control", "eq"}
        for step in scenario["steps"]:
            for option in step["options"]:
                assert "effects" in option
                assert "metrics" not in option


def test_offline_report_uses_history_and_outcome_hint():
    scenario = get_scenario("hr_firing_01")
    state = empty_state(scenario)
    state["ending_hint"] = "goal_achieved"
    state["metrics"] = {"trust": 80, "goal": 80, "control": 70, "eq": 70}
    state["history"] = [{"tki": "сотрудничество", "techniques": ["batna"], "metrics_after": state["metrics"]}]
    report = build_report(scenario, state, {})
    assert report["outcome"] == "goal_achieved"
    assert report["metrics_chart"][-1]["trust"] == 80


def test_hr_win_path_reaches_good_ending():
    sc = get_scenario("hr_firing_01")
    # cooperative path
    picks = ["s1_a", "s2c_a", "s3_a", "s4_a", "s5_d", "s6_a"]
    state = empty_state(sc)
    step_id = sc["steps"][0]["id"]
    for opt_id in picks:
        step = step_by_id(sc, step_id)
        option = next(o for o in step["options"] if o["id"] == opt_id)
        delta = merge_option_delta(option)
        state["metrics"] = {k: clamp(state["metrics"][k] + delta[k]) for k in state["metrics"]}
        nxt = option["next"]
        if nxt.startswith("end:"):
            break
        step_id = nxt
    ending = pick_ending(sc["endings"], state["metrics"])
    assert ending["id"] in {"goal_achieved", "partial_success"}
    assert state["metrics"]["goal"] >= 64


def test_hr_conflict_path():
    sc = get_scenario("hr_firing_01")
    picks = ["s1_b", "s2d_c", "s3_c", "s4_b", "s5_c", "s6_c"]
    state = empty_state(sc)
    step_id = sc["steps"][0]["id"]
    for opt_id in picks:
        step = step_by_id(sc, step_id)
        option = next(o for o in step["options"] if o["id"] == opt_id)
        delta = merge_option_delta(option)
        state["metrics"] = {k: clamp(state["metrics"][k] + delta[k]) for k in state["metrics"]}
        nxt = option["next"]
        if str(nxt).startswith("end:"):
            break
        step_id = nxt
    assert state["metrics"]["trust"] < 40
    ending = pick_ending(sc["endings"], state["metrics"])
    assert ending["id"] in {"conflict", "relationship_damaged", "failure"}
