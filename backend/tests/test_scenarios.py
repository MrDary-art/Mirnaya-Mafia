from app.engine.metrics import clamp, empty_state, merge_option_delta, pick_ending
from app.engine.scenario import SCENARIOS, get_scenario, step_by_id
from app.engine import walk_all_branches, assert_scenario_integrity


def test_all_scenarios_integrity():
    assert "hr_firing_01" in SCENARIOS
    for sc in SCENARIOS.values():
        assert_scenario_integrity(sc)
        paths = walk_all_branches(sc)
        assert paths
        for path in paths:
            assert path


def test_hr_win_path_reaches_good_ending():
    sc = get_scenario("hr_firing_01")
    # cooperative path
    picks = ["s1_a", "s2c_a", "s3_a", "s4_a", "s5_d", "s6_a"]
    state = empty_state(sc)
    step_id = sc["steps"][0]["id"]
    for opt_id in picks:
        step = step_by_id(sc, step_id)
        option = next(o for o in step["options"] if o["id"] == opt_id)
        delta = merge_option_delta(option, context=sc["title"])
        state["metrics"] = {k: clamp(state["metrics"][k] + delta[k]) for k in state["metrics"]}
        nxt = option["next"]
        if nxt.startswith("end:"):
            break
        step_id = nxt
    ending = pick_ending(sc["endings"], state["metrics"])
    assert ending["id"] in {"win_win", "process_ok"}
    assert state["metrics"]["goal"] >= 64


def test_hr_conflict_path():
    sc = get_scenario("hr_firing_01")
    picks = ["s1_b", "s2d_c", "s3_c", "s4_b", "s5_c", "s6_c"]
    state = empty_state(sc)
    step_id = sc["steps"][0]["id"]
    for opt_id in picks:
        step = step_by_id(sc, step_id)
        option = next(o for o in step["options"] if o["id"] == opt_id)
        delta = merge_option_delta(option, context=sc["title"])
        state["metrics"] = {k: clamp(state["metrics"][k] + delta[k]) for k in state["metrics"]}
        nxt = option["next"]
        if str(nxt).startswith("end:"):
            break
        step_id = nxt
    assert state["metrics"]["trust"] < 40
    ending = pick_ending(sc["endings"], state["metrics"])
    assert ending["id"] in {"conflict", "mixed", "soft_fail"}
