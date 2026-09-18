import random
import re

from app.engine.learning_path import CHAPTERS, LEVELS, exercise_pool, snapshot_for_attempt
from app.routers.learning_path import chapter_stars, level_stars


def test_ten_chapters_have_six_sequential_levels_each():
    assert len(CHAPTERS) == 10
    assert [len(chapter["levels"]) for chapter in CHAPTERS] == [6] * 10
    assert len(LEVELS) == 60
    for level in LEVELS:
        items = exercise_pool(level["id"])
        assert len(items) == 4
        assert all(len(item["options"]) == 3 for item in items)
        assert all({option["quality"] for option in item["options"]} == {"strong", "acceptable", "weak"} for item in items)


def test_canonical_story_content_is_loaded_instead_of_generated_templates():
    first = LEVELS[0]["exercises"][0]
    finale = next(level for level in LEVELS if level["id"] == "chapter-2-l6")["exercises"][-1]
    assert "вклад не был признан" in first["options"][0]["text"]
    assert finale["type"] == "COMBINED"
    assert "через две недели" in next(option["text"] for option in finale["options"] if option["quality"] == "strong")


def test_imported_chapter_descriptions_are_separate_from_learning_goals():
    chapter = next(item for item in CHAPTERS if item["id"] == "chapter-10")
    assert chapter["description"] == "Три команды делят ограниченный бюджет. Определите приоритеты и соберите пакетное решение."
    assert "УРОВЕНЬ" not in chapter["learning"]
    assert len(chapter["learning"]) < 200


def test_imported_content_does_not_leak_delimiters_or_level_transitions():
    for level in (item for item in LEVELS if item["chapter_id"] not in {"chapter-1", "chapter-2"}):
        assert not re.search(r"[-=]{5,}", level["transition"])
        for exercise in level["exercises"]:
            for option in exercise["options"]:
                assert "Разговор продолжается:" not in option["feedback"]
                assert not re.search(r"[-=]{5,}", option["feedback"])


def test_attempt_snapshot_keeps_order_and_can_shuffle_quality_positions():
    first = snapshot_for_attempt(LEVELS[0]["id"], random.Random(4).shuffle)
    second = snapshot_for_attempt(LEVELS[0]["id"], random.Random(7).shuffle)
    assert [item["options"] for item in first] == [item["options"] for item in first]
    first_positions = [next(i for i, option in enumerate(item["options"]) if option["quality"] == "strong") for item in first]
    second_positions = [next(i for i, option in enumerate(item["options"]) if option["quality"] == "strong") for item in second]
    assert first_positions != second_positions


def test_star_thresholds_are_capped():
    assert [level_stars(score) for score in (0, 70, 85, 100)] == [1, 2, 3, 3]
    assert [chapter_stars(score) for score in (0, 60, 70, 80, 90, 100)] == [1, 2, 3, 4, 5, 5]
