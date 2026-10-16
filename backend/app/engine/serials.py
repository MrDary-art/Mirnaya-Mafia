"""Validated, deterministic authored narrative graphs. No network or AI calls."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.engine.serial_learning import SKILLS

METRICS = ("trust", "goal", "control", "eq")
CONTENT_DIR = Path(__file__).resolve().parents[1] / "data" / "serials"
IDENTIFIER = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")


def matches(flags: dict, requirements: dict | None) -> bool:
    return all(key in flags and type(flags[key]) is type(value) and flags[key] == value
               for key, value in (requirements or {}).items())


def metric_effects(metrics: dict, effects: dict | None) -> dict:
    return {key: max(0, min(100, metrics[key] + (effects or {}).get(key, 0))) for key in METRICS}


def target(node: dict, flags: dict) -> str | None:
    for branch in node.get("branches", []):
        if matches(flags, branch["when"]):
            return branch["next"]
    return node.get("next")


def validate_story(story: dict[str, Any]) -> None:
    """Reject broken graphs, unreachable scenes, score drift and unsafe prices at load."""
    def require(condition: bool, message: str) -> None:
        if not condition:
            raise ValueError(f"Serial {story.get('id', '?')}: {message}")

    def valid_id(value: Any) -> bool:
        return isinstance(value, str) and bool(IDENTIFIER.fullmatch(value))

    def validate_flags(flags: Any) -> None:
        require(isinstance(flags, dict), "flags/requirements must be objects")
        require(all(valid_id(k) and (type(v) is bool or isinstance(v, str)) for k, v in flags.items()),
                "flags support boolean or string values only")

    require(valid_id(story.get("id")), "invalid story id")
    require(bool(story.get("title")), "title is required")
    validate_flags(story.get("initial_flags", {}))
    characters = story.get("characters", [])
    character_ids = {character.get("id") for character in characters}
    require(len(character_ids) == len(characters) and all(valid_id(identifier) for identifier in character_ids),
            "invalid or duplicate character ids")
    speakers = character_ids | {"you", "narrator"}
    episodes = story.get("episodes", [])
    require(bool(episodes), "episodes are required")
    require(len({e.get("id") for e in episodes}) == len(episodes), "duplicate episode ids")
    require(any(not e.get("bonus") for e in episodes), "main story is required")
    if "learning" in story:
        learning = story["learning"]
        require(isinstance(learning, dict) and isinstance(learning.get("purpose"), str)
                and bool(learning["purpose"].strip()), "invalid story learning purpose")
        require(isinstance(learning.get("skills"), list) and all(skill in SKILLS for skill in learning["skills"]),
                "invalid story learning skills")
    for episode in episodes:
        require(valid_id(episode.get("id")), "invalid episode id")
        require(episode.get("cost", 0) in (0, 5), "episode cost must be 0 or 5")
        require(episode.get("bonus") or episode.get("cost", 0) == 0, "main episodes must be free")
        if "learning" in episode:
            learning = episode["learning"]
            require(isinstance(learning, dict), "episode learning must be an object")
            require(all(isinstance(learning.get(field), str) and bool(learning[field].strip()) for field in ("objective", "role")),
                    "episode learning needs objective and role")
            brief = learning.get("brief", {})
            require(isinstance(brief, dict) and all(isinstance(brief.get(field), str) and bool(brief[field].strip())
                    for field in ("goal", "fallback")), "invalid episode briefing")
            require(all(isinstance(brief.get(field), list) and all(isinstance(text, str) and bool(text.strip()) for text in brief[field])
                        for field in ("facts", "constraints", "unknowns")), "invalid briefing facts")
            require(isinstance(learning.get("success_criteria"), list) and all(isinstance(text, str) and bool(text.strip())
                    for text in learning["success_criteria"]), "invalid practice criteria")
            require(isinstance(learning.get("skills"), list) and all(skill in SKILLS for skill in learning["skills"]),
                    "invalid episode learning skills")
            transfer = learning.get("transfer", {})
            require(isinstance(transfer, dict) and all(isinstance(transfer.get(field), str) and bool(transfer[field].strip())
                    for field in ("task", "prompt")), "invalid transfer exercise")
        nodes = episode.get("nodes", [])
        require(bool(nodes), "episode scenes are required")
        index = {node.get("id"): node for node in nodes}
        require(len(index) == len(nodes), "duplicate scene ids")
        require(episode.get("start") in index, "unknown start scene")
        adjacency: dict[str, set[str]] = {}
        free_adjacency: dict[str, set[str]] = {}
        terminals = set()
        ending_ids = set()
        for node in nodes:
            node_id = node.get("id")
            require(valid_id(node_id), "invalid scene id")
            dialogue = node.get("dialogue", [])
            require(isinstance(dialogue, list) and all(isinstance(line, dict) and isinstance(line.get("text"), str)
                    and bool(line["text"].strip()) and line.get("speaker") in speakers for line in dialogue),
                    f"invalid dialogue: {node_id}")
            if "learning" in node:
                learning = node["learning"]
                require(isinstance(learning, dict) and set(learning) == {"skill", "principle", "signal", "reflection"}
                        and learning.get("skill") in SKILLS, f"invalid scene learning: {node_id}")
                require(all(isinstance(learning.get(field), str) and bool(learning[field].strip())
                            for field in ("principle", "signal", "reflection")), f"incomplete scene learning: {node_id}")
            choices = node.get("choices", [])
            require(len({c.get("id") for c in choices}) == len(choices), f"duplicate choices: {node_id}")
            require(not (choices and (node.get("next") or node.get("branches"))), f"ambiguous scene: {node_id}")
            require(not (node.get("ending") and (choices or node.get("next") or node.get("branches"))),
                    f"ending has transitions: {node_id}")
            if node.get("ending"):
                ending = node["ending"]
                require(valid_id(ending.get("id")) and bool(ending.get("title")) and bool(ending.get("text")),
                        f"invalid ending: {node_id}")
                require(ending["id"] not in ending_ids, f"duplicate ending id: {ending['id']}")
                ending_ids.add(ending["id"])
                terminals.add(node_id)
            else:
                require(bool(choices or node.get("next")), f"scene has no continuation: {node_id}")
            edges = set()
            free_edges = set()
            for choice in choices:
                require(valid_id(choice.get("id")) and bool(choice.get("text")), f"invalid choice: {node_id}")
                require(choice.get("cost", 0) in (0, 3), f"choice price must be 0 or 3: {node_id}")
                effects = choice.get("effects", {})
                require(isinstance(effects, dict) and all(k in METRICS and type(v) is int and -100 <= v <= 100 for k, v in effects.items()),
                        f"invalid metric effects: {node_id}")
                validate_flags(choice.get("flags", {}))
                validate_flags(choice.get("requires", {}))
                edges.add(choice.get("next"))
                if not choice.get("cost"):
                    free_edges.add(choice.get("next"))
            if choices:
                require(any(not c.get("cost") and not c.get("requires") for c in choices),
                        f"scene must have an unconditional free choice: {node_id}")
            if node.get("next"):
                edges.add(node["next"])
                free_edges.add(node["next"])
            for branch in node.get("branches", []):
                validate_flags(branch.get("when", {}))
                edges.add(branch.get("next"))
                free_edges.add(branch.get("next"))
            require(edges <= set(index), f"unknown transition: {node_id}: {edges - set(index)}")
            adjacency[node_id], free_adjacency[node_id] = edges, free_edges
        require(bool(terminals), "episode has no ending")
        reachable = set()
        pending = [episode["start"]]
        while pending:
            key = pending.pop()
            if key not in reachable:
                reachable.add(key)
                pending.extend(adjacency[key])
        require(reachable == set(index), f"unreachable scenes: {set(index) - reachable}")
        # Every scene has a finite free path to an ending. Paid content can never trap a player.
        can_finish = set(terminals)
        while True:
            expanded = can_finish | {key for key, edges in free_adjacency.items() if edges & can_finish}
            if expanded == can_finish:
                break
            can_finish = expanded
        require(can_finish == set(index), f"scene cannot finish for free: {set(index) - can_finish}")
        # Cycles permit repeating metric changes; authored episodes are acyclic by contract.
        visiting, visited = set(), set()
        def visit(key: str) -> None:
            require(key not in visiting, f"cycle in episode: {key}")
            if key in visited:
                return
            visiting.add(key)
            for following in adjacency[key]:
                visit(following)
            visiting.remove(key)
            visited.add(key)
        visit(episode["start"])


@lru_cache(maxsize=1)
def stories() -> dict[str, dict]:
    result = {}
    for path in sorted(CONTENT_DIR.glob("*.json")):
        story = json.loads(path.read_text(encoding="utf-8-sig"))
        validate_story(story)
        if story["id"] in result:
            raise ValueError(f"Duplicate serial story: {story['id']}")
        result[story["id"]] = story
    return result


def get_story(story_id: str) -> dict:
    return stories()[story_id]


def get_episode(story: dict, episode_id: str) -> dict:
    return next(episode for episode in story["episodes"] if episode["id"] == episode_id)


def get_node(episode: dict, node_id: str) -> dict:
    return next(node for node in episode["nodes"] if node["id"] == node_id)


def episode_summary(episode: dict) -> dict:
    return {key: value for key, value in episode.items() if key not in ("nodes", "start")}


def story_summary(story: dict) -> dict:
    return {**{key: value for key, value in story.items() if key != "episodes"},
            "episodes": [episode_summary(episode) for episode in story["episodes"]]}
