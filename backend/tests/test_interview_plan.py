import json
from unittest.mock import AsyncMock

import pytest

from app.engine import interview_plan
from app.engine.llm import _job_reply
from app.engine.metrics import START_METRICS


@pytest.mark.asyncio
async def test_plan_uses_bounded_validated_questions(monkeypatch):
    questions = [f"Как вы решаете задачу номер {number} на уроке?" for number in range(1, 13)]
    provider = AsyncMock(return_value=(json.dumps({"questions": questions}, ensure_ascii=False), "gigachat"))
    monkeypatch.setattr(interview_plan, "research_role", AsyncMock(return_value=[{"title": "Учитель", "description": "Обучает детей", "url": "https://example.org"}]))
    monkeypatch.setattr(interview_plan, "call_with_fallback_detailed", provider)
    result = await interview_plan.build_interview_plan({"target_position": "учитель русского языка", "target_company": "школа"})
    assert result["questions"] == questions
    assert result["source"] == "gigachat"
    assert "Обучает детей" in provider.await_args.args[0]


def test_invalid_plan_falls_back_to_role_questions():
    result = interview_plan.validate_plan({"questions": ["Из чего построить дом?"] * 12}, "учитель русского языка")
    assert len(result) == 12
    assert all(question.endswith("?") for question in result)
    assert any("орфографии" in question for question in result)


def test_corporate_training_questions_are_rejected_for_school_teacher():
    wrong = [f"Как вы измеряете KPI онлайн-курса номер {number}?" for number in range(12)]
    result = interview_plan.validate_plan({"questions": wrong}, "учитель русского языка")
    assert result == interview_plan._fallback_questions("учитель русского языка")
    assert "орфографии" in result[1]


def test_construction_question_is_rejected_for_developer():
    wrong = [f"Как вы решали задачу в проекте номер {number}?" for number in range(12)]
    wrong[4] = "Как вы строите дом из кирпича?"
    result = interview_plan.validate_plan({"questions": wrong}, "Python-разработчик")
    assert result == interview_plan._fallback_questions("Python-разработчик")


def test_server_adds_only_next_planned_question_and_stops_after_last():
    questions = interview_plan._fallback_questions("учитель русского языка")
    settings = {"practice_kind": "job_interview"}
    state = {"metrics": dict(START_METRICS), "turns": 0, "delta_history": [], "interview_plan": {"questions": questions}}
    reply = _job_reply("Хорошо. А как построить дом из кирпича?", settings, state, {"goal_delta": 0}, "continue")
    assert questions[1] in reply
    assert "кирпича" not in reply
    state["turns"] = 11
    reply = _job_reply("Спасибо за ответ.", settings, state, {"goal_delta": 0}, "continue")
    assert "Собеседование завершено" in reply
    assert questions[1] not in reply
    state["turns"] = 4
    state["delta_history"] = [{"goal": 54}]
    reply = _job_reply("Ваш опыт подходит.", settings, state, {"goal_delta": 7}, "continue")
    assert "вы прошли учебное собеседование" in reply
    assert questions[5] not in reply


@pytest.mark.asyncio
async def test_stream_keeps_safe_reaction_and_replaces_model_question(monkeypatch):
    from app.engine import llm

    async def fake_stream(_prompt):
        yield "Спасибо за ответ. А как построить дом?"
        yield '<analysis>{"tki_style":"сотрудничество","techniques":[],"tone":"нейтральный","goal_signal":"none","comment":"Ответ принят","outcome_signal":"continue"}</analysis>'

    monkeypatch.setattr(llm.settings, "gigachat_credentials", "mocked")
    monkeypatch.setattr(llm, "_stream_gigachat", fake_stream)
    state = {"metrics": dict(START_METRICS), "turns": 0, "delta_history": [], "interview_plan": {"questions": interview_plan._fallback_questions("учитель русского языка")}}
    events = [event async for event in llm.stream_online_turn({"practice_kind": "job_interview", "target_position": "учитель русского языка"}, state, "Я работал год", [])]
    visible = "".join(value for kind, value in events if kind == "reply")
    assert visible.startswith("Спасибо за ответ.")
    assert state["interview_plan"]["questions"][0] not in visible
    assert state["interview_plan"]["questions"][1] in visible
    assert "построить дом" not in visible
    assert events[-1][1]["reply"] == visible
