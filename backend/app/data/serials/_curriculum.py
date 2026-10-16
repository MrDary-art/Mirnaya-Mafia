"""Compile authored negotiation lessons into the existing offline story graph.

The adjacent original builders own narrative IDs, choices and endings. Curriculum
files supply case briefs, coaching guides and additional authored conversations.
This compiler preserves old IDs so previously saved scenes remain readable.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

CURRICULUM_DIR = Path(__file__).resolve().parent.parent / "serials_curriculum"
SKILL_IDS = {"interests", "questions", "listening", "boundaries", "options", "criteria",
             "commitment", "deescalation", "perspective"}
METRICS = {"trust", "goal", "control", "eq"}


def _guide(value: dict, label: str) -> None:
    if value.get("skill") not in SKILL_IDS or any(
        not isinstance(value.get(key), str) or not value[key].strip()
        for key in ("principle", "signal", "reflection")
    ):
        raise ValueError(f"Invalid decision guide: {label}")


def enrich_story(original: dict) -> dict:
    path = CURRICULUM_DIR / f"{original['id']}.json"
    if not path.exists():
        return original
    if original.get("learning", {}).get("version") == 1:
        return original
    curriculum = json.loads(path.read_text(encoding="utf-8-sig"))
    if curriculum["story_id"] != original["id"]:
        raise ValueError(f"Curriculum story mismatch: {path}")
    story = copy.deepcopy(original)
    lessons = {lesson["id"]: lesson for lesson in curriculum["episodes"]}
    if set(lessons) != {episode["id"] for episode in story["episodes"]}:
        raise ValueError(f"Curriculum must cover every episode: {story['id']}")
    story["learning"] = {"version": 1, **curriculum["overview"]}
    for episode in story["episodes"]:
        lesson = lessons[episode["id"]]
        label = f"{story['id']}/{episode['id']}"
        for key in ("objective", "role", "brief", "success_criteria", "skills", "transfer"):
            if not lesson.get(key):
                raise ValueError(f"Missing {key}: {label}")
        if not set(lesson["skills"]) <= SKILL_IDS:
            raise ValueError(f"Unknown skill: {label}")
        episode["learning"] = {key: copy.deepcopy(lesson[key]) for key in
                               ("objective", "role", "brief", "success_criteria", "skills", "transfer")}
        old_decisions = {node["id"] for node in episode["nodes"] if node.get("choices")}
        guides = lesson["decision_guides"]
        if set(guides) != old_decisions:
            raise ValueError(f"Incomplete decision guides {label}: missing={old_decisions - set(guides)}, extra={set(guides) - old_decisions}")
        for node in episode["nodes"]:
            if node["id"] in guides:
                _guide(guides[node["id"]], f"{label}/{node['id']}")
                node["learning"] = copy.deepcopy(guides[node["id"]])
        scenes = lesson["practice_scenes"]
        if len(scenes) != 3 or len({scene["id"] for scene in scenes}) != 3:
            raise ValueError(f"Three distinct practice scenes required: {label}")
        for scene in scenes:
            scene = copy.deepcopy(scene)
            identifier, anchor = scene["id"], scene["before"]
            _guide(scene["learning"], f"{label}/{identifier}")
            index = {node["id"]: node for node in episode["nodes"]}
            if anchor not in index or identifier in index or len(scene["choices"]) < 3:
                raise ValueError(f"Invalid practice placement: {label}/{identifier} before {anchor}")
            if len({choice["id"] for choice in scene["choices"]}) != len(scene["choices"]):
                raise ValueError(f"Duplicate practice choice: {label}/{identifier}")
            # Redirect only existing incoming edges, then append the inserted scene.
            if episode["start"] == anchor:
                episode["start"] = identifier
            for existing in episode["nodes"]:
                if existing.get("next") == anchor:
                    existing["next"] = identifier
                for edge in existing.get("choices", []) + existing.get("branches", []):
                    if edge.get("next") == anchor:
                        edge["next"] = identifier
            options, reactions = [], []
            for choice in scene["choices"]:
                if any(key in choice for key in ("flags", "requires", "cost")):
                    raise ValueError(f"Practice must be unconditional and free: {label}/{identifier}")
                effects = choice["effects"]
                if set(effects) != METRICS or any(type(value) is not int or abs(value) > 5 for value in effects.values()):
                    raise ValueError(f"Invalid practice metric effect: {label}/{identifier}")
                reaction_id = f"{identifier}_{choice['id']}_reaction"
                options.append({key: choice[key] for key in ("id", "text", "effects", "explanation")}
                               | {"next": reaction_id, "cost": 0, "flags": {}})
                reactions.append({"id": reaction_id, "background": scene["background"],
                                  "dialogue": choice["reaction"], "next": anchor})
            episode["nodes"].append({"id": identifier, "background": scene["background"],
                                     "dialogue": scene["dialogue"], "learning": scene["learning"],
                                     "choices": options})
            episode["nodes"].extend(reactions)
        episode["learning"]["decision_points"] = sum(
            bool(node.get("choices")) and node["id"] != "extra_invitation" for node in episode["nodes"]
        )
    story["learning"]["decision_points"] = sum(episode["learning"]["decision_points"] for episode in story["episodes"])
    return story
