from app.engine.parser import ZERO_ANALYSIS, parse_llm_analysis, rule_based_analysis


def test_valid_json():
    raw = '{"tki_style": "сотрудничество", "techniques": ["эмпатия"], "tone": "позитивный", "trust_delta": 5, "goal_delta": 3, "control_delta": -2, "eq_delta": 4, "comment": "ok"}'
    data = parse_llm_analysis(raw)
    assert data["trust_delta"] == 5
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


def test_rule_based_keywords():
    data = rule_based_analysis("Давайте вместе найдём решение. Понимаю, это непросто. Какие цифры рынка вы используете?")
    assert data["tki_style"] == "сотрудничество"
    assert "эмпатия" in data["techniques"] or "объективные критерии" in data["techniques"]
