from app.engine.learning import PROGRAMS, evaluate_exercise, mastery


def test_choice_exercise_marks_correct_answer():
    exercise = PROGRAMS["hr_firing"]["exercises"][0]
    assert evaluate_exercise(exercise, "a", None)["ok"] is True
    assert evaluate_exercise(exercise, "b", None)["ok"] is False


def test_guided_response_requires_target_techniques():
    exercise = PROGRAMS["hr_firing"]["exercises"][4]
    result = evaluate_exercise(exercise, None, "Понимаю, что это непросто. Что для вас сейчас важнее всего?")
    assert result["ok"] is True


def test_mastery_uses_recent_relevant_attempts():
    attempts = [{"ok": True, "tags": ["эмпатия"]}, {"ok": False, "tags": ["эмпатия"]}]
    assert mastery(attempts, ["эмпатия"])["эмпатия"] == 50
