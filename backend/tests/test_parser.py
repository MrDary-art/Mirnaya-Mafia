from app.engine.parser import ZERO_ANALYSIS, parse_llm_analysis, rule_based_analysis, score_interview_answer


def test_valid_json():
    raw = '{"tki_style": "сотрудничество", "techniques": ["эмпатия"], "tone": "позитивный", "trust_delta": 5, "goal_delta": 3, "control_delta": -2, "eq_delta": 4, "comment": "ok"}'
    data = parse_llm_analysis(raw)
    assert data["trust_delta"] == 4
    assert data["tki_style"] == "сотрудничество"


def test_markdown_fenced_json():
    raw = "```json\n{\"tki_style\": \"компромисс\", \"trust_delta\": 1, \"goal_delta\": 0, \"control_delta\": 0, \"eq_delta\": 0}\n```"
    data = parse_llm_analysis(raw)
    assert data["tki_style"] == "компромисс"


def test_invalid_json_returns_zero():
    data = parse_llm_analysis("не json совсем")
    assert data["trust_delta"] == 0
    assert data["comment"] == ZERO_ANALYSIS["comment"]


def test_empty_response():
    data = parse_llm_analysis("")
    assert data["goal_delta"] == 0
    assert data["tki_style"] is None


def test_rule_fallback_does_not_invent_collaboration_without_evidence():
    data = rule_based_analysis("Я работал над учебной программой один год.")
    assert data["tki_style"] is None
    assert data["trust_delta"] == 0


def test_interview_short_answer_is_flagged_and_changes_all_relevant_metrics():
    delta, comment = score_interview_answer("тп", {"goal_signal": "progress", "techniques": [], "tone": "нейтральный"})
    assert delta == {"trust_delta": -1, "goal_delta": -3, "control_delta": -2, "eq_delta": -2}
    assert comment


def test_interview_substantive_answer_updates_control_and_eq():
    delta, comment = score_interview_answer(
        "Я провожу мини тест, разбираю ошибки и даю ученику практическое задание с обратной связью.",
        {"goal_signal": "progress", "techniques": [], "tone": "нейтральный"},
    )
    assert comment is None
    assert delta["goal_delta"] == 6
    assert delta["control_delta"] == 1
    assert delta["eq_delta"] == 1


def test_rule_based_keywords():
    data = rule_based_analysis("Давайте вместе найдём решение. Понимаю, это непросто. Какие цифры рынка вы используете?")
    assert data["tki_style"] == "сотрудничество"
    assert "эмпатия" in data["techniques"] or "объективные критерии" in data["techniques"]


def test_llm_numbers_cannot_override_tag_scoring():
    raw = '{"tki_style":"сотрудничество","techniques":["эмпатия","неизвестная"],"tone":"нейтральный","trust_delta":100000,"goal_delta":-100000}'
    data = parse_llm_analysis(raw)
    assert data["trust_delta"] == 4
    assert data["goal_delta"] == 1
    assert data["techniques"] == ["эмпатия"]
