import random

from app.engine.learning_path import CHAPTERS, LEVELS, exercise_pool, snapshot_for_attempt
from app.routers.learning_path import chapter_stars, level_stars


def test_two_chapters_have_six_sequential_levels_each():
    assert len(CHAPTERS) == 2
    assert [len(chapter["levels"]) for chapter in CHAPTERS] == [6, 6]
    assert len(LEVELS) == 12
    for level in LEVELS:
        items = exercise_pool(level["id"])
        assert len(items) == 4
        assert all(len(item["options"]) == 3 for item in items)
        assert all({option["quality"] for option in item["options"]} == {"strong", "acceptable", "weak"} for item in items)


def test_canonical_story_content_is_loaded_instead_of_generated_templates():
    first = LEVELS[0]["exercises"][0]
    finale = LEVELS[-1]["exercises"][-1]
    assert "вклад не был признан" in first["options"][0]["text"]
    assert finale["type"] == "COMBINED"
    assert "через две недели" in next(option["text"] for option in finale["options"] if option["quality"] == "strong")


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
