from __future__ import annotations

from app.engine.metrics import START_METRICS
from app.engine.parser import parse_llm_analysis
from app.engine.scenario import SCENARIOS, step_by_id


def walk_all_branches(scenario: dict) -> list[list[str]]:
    steps = {s["id"]: s for s in scenario["steps"]}
    paths: list[list[str]] = []

    def rec(step_id: str, acc: list[str], depth: int) -> None:
        if depth > 20:
            paths.append(acc)
            return
        step = steps.get(step_id)
        if not step:
            paths.append(acc)
            return
        options = step.get("options") or []
        if not options:
            paths.append(acc)
            return
        for opt in options:
            nxt = opt.get("next")
            new_acc = acc + [opt["id"]]
            if not nxt or nxt.startswith("end:"):
                paths.append(new_acc)
            else:
                rec(nxt, new_acc, depth + 1)

    rec(scenario["steps"][0]["id"], [], 0)
    return paths


def assert_scenario_integrity(scenario: dict) -> None:
    ids = [s["id"] for s in scenario["steps"]]
    assert len(ids) == len(set(ids))
    known = set(ids)
    for step in scenario["steps"]:
        assert step.get("opponent_line")
        assert 3 <= len(step["options"]) <= 4
        for opt in step["options"]:
            assert opt.get("text")
            assert opt.get("tki")
            assert "effects" in opt
            for key in START_METRICS:
                assert key in opt["effects"]
                assert isinstance(opt["effects"][key], (int, float))
            nxt = opt.get("next")
            if nxt and not nxt.startswith("end:"):
                assert nxt in known, f"broken next {nxt} in {scenario['id']}/{step['id']}"
    assert scenario.get("endings")


def smoke_parse() -> None:
    parse_llm_analysis("{bad")
    parse_llm_analysis('{"tki_style": "сотрудничество", "trust_delta": 1}')
