"""Validated deterministic content engine for offline Game Lab trainers."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

METRICS = ("trust", "goal", "control", "eq")
EMOTIONS = ("neutral", "receptive", "escalated")
CONTENT_DIR = Path(__file__).resolve().parents[1] / "data" / "game_lab"
IDENTIFIER = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")


def matches(flags: dict, requirements: dict | None) -> bool:
    return all(key in flags and type(flags[key]) is type(value) and flags[key] == value
               for key, value in (requirements or {}).items())


def apply_metrics(metrics: dict, effects: dict | None) -> dict:
    return {key: max(0, min(100, metrics[key] + (effects or {}).get(key, 0))) for key in METRICS}


def tension_stage(value: int, interrupted: bool = False) -> str:
    if interrupted:
        return "interrupted"
    if value >= 70:
        return "critical"
    if value >= 42:
        return "tense"
    return "calm"


def node_text(node: dict, flags: dict) -> str:
    for variant in node.get("variants", []):
        if matches(flags, variant.get("when")):
            return variant["text"]
    return node["text"]


def available_choices(node: dict, flags: dict) -> list[dict]:
    return [choice for choice in node.get("choices", []) if matches(flags, choice.get("requires"))]


def validate_trainer(trainer: dict[str, Any]) -> None:
    def require(condition: bool, message: str) -> None:
        if not condition:
            raise ValueError(f"Game Lab {trainer.get('id', '?')}: {message}")

    def valid_id(value: Any) -> bool:
        return isinstance(value, str) and bool(IDENTIFIER.fullmatch(value))

    def valid_flags(value: Any) -> bool:
        return isinstance(value, dict) and all(valid_id(key) and (type(item) is bool or isinstance(item, str))
                                               for key, item in value.items())

    require(valid_id(trainer.get("id")), "invalid trainer id")
    require(bool(trainer.get("title")), "title is required")
    cases = trainer.get("cases")
    require(isinstance(cases, list) and len(cases) >= 1, "at least one case is required")
    case_ids = {case.get("id") for case in cases}
    require(len(case_ids) == len(cases) and all(valid_id(value) for value in case_ids), "invalid or duplicate case id")
    if trainer.get("mode", "dialogue") == "echo":
        for case in cases:
            require(bool(case.get("title") and case.get("description") and case.get("aftermath")),
                    f"case {case.get('id')} lacks presentation data")
            require(isinstance(case.get("evidence"), list) and len(case["evidence"]) >= 3,
                    f"case {case['id']} needs at least three archive items")
            evidence_ids = {item.get("id") for item in case["evidence"]}
            require(len(evidence_ids) == len(case["evidence"]) and all(valid_id(item) for item in evidence_ids),
                    f"case {case['id']} has invalid archive ids")
            for item in case["evidence"]:
                require(bool(item.get("title") and item.get("kind") and item.get("excerpt")),
                        f"archive item {item.get('id')} is incomplete")
            require(isinstance(case.get("causes"), list) and len(case["causes"]) >= 3,
                    f"case {case['id']} needs at least three causal nodes")
            cause_ids = {item.get("id") for item in case["causes"]}
            require(len(cause_ids) == len(case["causes"]) and all(valid_id(item) for item in cause_ids),
                    f"case {case['id']} has invalid causal node ids")
            for item in case["causes"]:
                require(bool(item.get("title") and item.get("summary")),
                        f"causal node {item.get('id')} is incomplete")
                require(set(item.get("evidence", [])).issubset(evidence_ids),
                        f"causal node {item.get('id')} references unknown evidence")
            require(isinstance(case.get("interventions"), list) and 2 <= len(case["interventions"]) <= 4,
                    f"case {case['id']} needs two to four interventions")
            intervention_ids = {item.get("id") for item in case["interventions"]}
            require(len(intervention_ids) == len(case["interventions"]) and all(valid_id(item) for item in intervention_ids),
                    f"case {case['id']} has invalid intervention ids")
            for item in case["interventions"]:
                require(bool(item.get("title") and item.get("description") and item.get("future")),
                        f"intervention {item.get('id')} is incomplete")
                require(item.get("outcome") in {"steady", "boundary", "fragile", "rupture"},
                        f"intervention {item.get('id')} has an invalid outcome")
                effects = item.get("effects", {})
                require(set(effects).issubset(METRICS) and all(type(value) is int and -25 <= value <= 30 for value in effects.values()),
                        f"intervention {item.get('id')} has invalid metric effects")
            outcomes = case.get("outcomes", {})
            require(set(outcomes) == {"steady", "boundary", "fragile", "rupture"},
                    f"case {case['id']} needs four outcome types")
            require(all(valid_id(item.get("id")) and item.get("title") and item.get("description") for item in outcomes.values()),
                    f"case {case['id']} has an invalid outcome")
        return
    require(trainer.get("mode", "dialogue") == "dialogue", "unsupported trainer mode")
    for case in cases:
        require(bool(case.get("title") and case.get("description") and case.get("character", {}).get("name")),
                f"case {case.get('id')} lacks presentation data")
        require(valid_flags(case.get("initial_flags", {})), f"case {case['id']} has invalid initial flags")
        nodes = case.get("nodes", [])
        node_ids = {node.get("id") for node in nodes}
        require(len(node_ids) == len(nodes) and all(valid_id(value) for value in node_ids),
                f"case {case['id']} has invalid or duplicate node ids")
        require(case.get("start") in node_ids, f"case {case['id']} start is missing")
        require(len(nodes) >= 6, f"case {case['id']} needs at least six decisions")
        for node in nodes:
            require(bool(node.get("text")), f"node {node.get('id')} needs text")
            choices = node.get("choices", [])
            require(2 <= len(choices) <= 4, f"node {node['id']} needs two to four choices")
            choice_ids = {choice.get("id") for choice in choices}
            require(len(choice_ids) == len(choices) and all(valid_id(value) for value in choice_ids),
                    f"node {node['id']} has invalid or duplicate choices")
            for variant in node.get("variants", []):
                require(valid_flags(variant.get("when")) and bool(variant.get("text")),
                        f"node {node['id']} has invalid text variant")
            for choice in choices:
                require(bool(choice.get("text") and choice.get("reaction") and choice.get("technique")),
                        f"choice {choice.get('id')} is incomplete")
                require(choice.get("emotion") in EMOTIONS,
                        f"choice {choice['id']} has an invalid emotion")
                effects = choice.get("effects", {})
                require(set(effects).issubset(METRICS) and all(type(value) is int and -25 <= value <= 25 for value in effects.values()),
                        f"choice {choice['id']} has invalid metric effects")
                require(type(choice.get("tension", 0)) is int and -30 <= choice.get("tension", 0) <= 30,
                        f"choice {choice['id']} has invalid tension effect")
                require(valid_flags(choice.get("flags", {})) and valid_flags(choice.get("requires", {})),
                        f"choice {choice['id']} has invalid flags")
                if not choice.get("finish"):
                    require(choice.get("next") in node_ids, f"choice {choice['id']} points to a missing node")
        outcomes = case.get("outcomes", {})
        require(set(outcomes) == {"steady", "boundary", "fragile", "rupture"},
                f"case {case['id']} needs four outcome types")
        require(all(valid_id(item.get("id")) and item.get("title") and item.get("description") for item in outcomes.values()),
                f"case {case['id']} has an invalid outcome")


@lru_cache(maxsize=1)
def trainers() -> dict[str, dict]:
    result = {}
    for path in sorted(CONTENT_DIR.glob("*.json")):
        trainer = json.loads(path.read_text(encoding="utf-8"))
        validate_trainer(trainer)
        result[trainer["id"]] = trainer
    return result


def get_trainer(trainer_id: str) -> dict:
    return trainers()[trainer_id]


def get_case(trainer: dict, case_id: str) -> dict:
    return next(case for case in trainer["cases"] if case["id"] == case_id)


def get_node(case: dict, node_id: str) -> dict:
    return next(node for node in case["nodes"] if node["id"] == node_id)


def case_summary(case: dict) -> dict:
    keys = ("id", "title", "category", "description", "backstory", "duration", "setting", "background", "character")
    return {key: case[key] for key in keys if key in case}


def trainer_summary(trainer: dict) -> dict:
    return {key: trainer[key] for key in ("id", "title", "subtitle", "description", "duration", "reward") if key in trainer} | {"mode": trainer.get("mode", "dialogue")}
