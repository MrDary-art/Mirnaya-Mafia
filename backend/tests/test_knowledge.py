from unittest.mock import AsyncMock

import pytest

from app.engine.goal_contract import build_goal_criteria
from app.engine.interview_plan import build_interview_plan
from app.engine.knowledge import select_knowledge
from app.engine.metrics import START_METRICS
from app.engine.online_report import enrich_online_report


def test_teacher_interview_retrieves_only_relevant_local_documents():
    result = select_knowledge({"practice_kind": "job_interview", "target_position": "учитель информатики"})
    paths = [source["path"] for source in result["sources"]]
    assert paths == [
        "professions/education/teacher.md",
        "scenarios/interview.md",
        "professions/general/candidate.md",
    ]
    assert result["cases"]
    assert result["focus"]
    assert len(result["brief"]) <= 6500
    assert "Правила генерации" not in result["brief"]


def test_specific_profession_wins_over_general_teacher():
    result = select_knowledge({"practice_kind": "job_interview", "target_position": "учитель математики"})
    assert result["sources"][0]["path"] == "professions/education/math_teacher.md"


def test_custom_salary_negotiation_selects_scenario_and_method():
    result = select_knowledge({"problem": "Переговоры о зарплате", "role": "IT"})
    paths = [source["path"] for source in result["sources"]]
    assert "scenarios/salary.md" in paths
    assert "negotiations/harvard.md" in paths


@pytest.mark.asyncio
async def test_local_profession_cases_shape_plan_when_ai_times_out(monkeypatch):
    from app.engine import interview_plan

    monkeypatch.setattr(interview_plan, "research_role", AsyncMock(return_value=[]))
    monkeypatch.setattr(interview_plan, "call_with_fallback_detailed", AsyncMock(side_effect=TimeoutError))
    settings = {"target_position": "учитель информатики", "practice_kind": "job_interview"}
    result = await build_interview_plan(settings, select_knowledge(settings))
    assert result["source"] == "local_knowledge"
    assert len(result["questions"]) == 12
    assert "Ученик систематически не выполняет задания" in result["questions"][4]
    assert all(question.endswith("?") and not question.endswith("??") for question in result["questions"])


@pytest.mark.asyncio
async def test_local_profession_criteria_survive_ai_timeout(monkeypatch):
    from app.engine import goal_contract

    monkeypatch.setattr(goal_contract, "call_with_fallback_detailed", AsyncMock(side_effect=TimeoutError))
    settings = {"target_position": "учитель информатики", "target_company": "школа", "practice_kind": "job_interview"}
    result = await build_goal_criteria(settings, select_knowledge(settings))
    assert result["source"] == "local_knowledge"
    assert "пример" in result["success"][1]
    assert any("мотивация" in item for item in result["interview_focus"])


@pytest.mark.asyncio
async def test_interview_report_shows_sources_and_real_turn_counts():
    settings = {"practice_kind": "job_interview", "target_position": "учитель информатики"}
    knowledge = select_knowledge(settings)
    state = {
        "knowledge": knowledge, "metrics": dict(START_METRICS), "ai_provider": "offline",
        "history": [
            {"text": "Проводил уроки", "goal_signal": "progress"},
            {"text": "Нужен пример", "goal_signal": "none"},
        ],
    }
    base_report = {
        "metrics_chart": [{"turn": 0, **START_METRICS}],
        "harvard": {"batna": False}, "tki_map": {"сотрудничество": 100},
    }
    report = await enrich_online_report(base_report, state, settings)
    assert report["turn_summary"] == {"progress": 1, "setback": 0, "neutral": 1}
    assert report["knowledge_sources"] == knowledge["sources"]
    assert report["tki_map"] == {}
    assert report["batna_assessment"] is None
