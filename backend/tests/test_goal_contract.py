import json
from unittest.mock import AsyncMock

import pytest

from app.engine import goal_contract, online_report
from app.engine.metrics import START_METRICS, apply_decay
from app.engine.parser import parse_llm_analysis


@pytest.mark.asyncio
async def test_goal_criteria_come_from_validated_ai_response(monkeypatch):
    monkeypatch.setattr(goal_contract, "call_with_fallback_detailed", AsyncMock(return_value=(
        json.dumps({"success": ["Интервьюер считает опыт подходящим"], "failure": ["Кандидат не может объяснить ключевые решения"]}, ensure_ascii=False),
        "gigachat",
    )))
    result = await goal_contract.build_goal_criteria({"goal": "Получить работу", "practice_kind": "job_interview", "target_company": "GitHub"})
    assert result["source"] == "gigachat"
    assert "опыт" in result["success"][0]


@pytest.mark.asyncio
async def test_invalid_goal_criteria_fall_back_without_network_retry(monkeypatch):
    provider = AsyncMock(return_value=("не JSON", "gigachat"))
    monkeypatch.setattr(goal_contract, "call_with_fallback_detailed", provider)
    result = await goal_contract.build_goal_criteria({"goal": "Договориться о сроках"})
    assert result["source"] == "rules"
    assert "сроках" in result["success"][0]
    provider.assert_awaited_once()


@pytest.mark.asyncio
async def test_goal_criteria_fall_back_when_provider_times_out(monkeypatch):
    monkeypatch.setattr(goal_contract, "call_with_fallback_detailed", AsyncMock(side_effect=TimeoutError))
    result = await goal_contract.build_goal_criteria({"goal": "Согласовать цену"})
    assert result["source"] == "rules"


def test_goal_signal_changes_only_server_owned_score_and_clamps():
    progress = parse_llm_analysis('{"tki_style":"сотрудничество","techniques":[],"goal_signal":"progress","goal_delta":9999}')
    setback = parse_llm_analysis('{"tki_style":"сотрудничество","techniques":[],"goal_signal":"setback","goal_delta":-9999}')
    assert progress["goal_delta"] == 7
    assert setback["goal_delta"] == -5
    assert apply_decay([{"goal": progress["goal_delta"]}])["goal"] == START_METRICS["goal"] + 7
    assert apply_decay([{"goal": -1000}])["goal"] == 0
    assert apply_decay([{"goal": 1000}])["goal"] == 100


@pytest.mark.asyncio
async def test_online_report_accepts_evidenced_goal_success(monkeypatch):
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps({
        "goal_status": "achieved", "evidence": "Я разработал API", "summary": "Кандидат показал подходящий опыт.",
        "mistakes": [], "recommendations": ["Раскройте вклад в команду."],
    }, ensure_ascii=False), "gigachat")))
    state = {"metrics": {"trust": 70, "goal": 55, "control": 60, "eq": 65}, "history": [
        {"text": "Я разработал API и улучшил его скорость.", "reply": "Опыт подходит."},
    ], "ai_provider": "gigachat", "goal_criteria": {"success": ["Подходящий опыт"], "failure": ["Нет опыта"], "source": "gigachat"}}
    report = {"metrics_chart": [{"turn": 0, **START_METRICS}, {"turn": 1, **state["metrics"]}], "harvard": {}, "mistakes": [], "recommendations": []}
    result = await online_report.enrich_online_report(report, state, {"mode": "online", "goal": "Получить работу"})
    assert result["verdict"] == "ПРОЙДЕНО"
    assert result["goal_evidence"] == "Я разработал API"
    assert result["metrics_chart"][-1]["goal"] == 80
    assert result["metrics"]["values"]["goal"] == 80
    assert result["goal_assessment_delta"] == 25


@pytest.mark.asyncio
async def test_online_report_rejects_unsupported_ai_success(monkeypatch):
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps({
        "goal_status": "achieved", "evidence": "Предложение о работе подписано", "summary": "Цель достигнута.",
    }, ensure_ascii=False), "gigachat")))
    state = {"metrics": dict(START_METRICS), "history": [{"text": "Я хочу обсудить вакансию.", "reply": "Расскажите об опыте."}], "ai_provider": "gigachat"}
    report = {"metrics_chart": [{"turn": 0, **START_METRICS}], "harvard": {}}
    result = await online_report.enrich_online_report(report, state, {"goal": "Получить работу"})
    assert result["ending_id"] == "online_partial"
    assert result["assessment_source"] == "rules"
    assert result["summary"] != "Цель достигнута."


@pytest.mark.asyncio
async def test_evidenced_failure_lowers_goal_without_changing_other_metrics(monkeypatch):
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps({
        "goal_status": "failed", "evidence": "Я не готов обсуждать условия", "summary": "Переговоры сорвались.",
    }, ensure_ascii=False), "gigachat")))
    values = {"trust": 65, "goal": 90, "control": 70, "eq": 60}
    state = {"metrics": dict(values), "history": [{"text": "Я не готов обсуждать условия.", "reply": "Тогда завершим."}], "ai_provider": "gigachat"}
    report = {"metrics_chart": [{"turn": 0, **START_METRICS}, {"turn": 1, **values}], "harvard": {}}
    result = await online_report.enrich_online_report(report, state, {"goal": "Договориться об условиях"})
    assert result["verdict"] == "ПРОВАЛЕНО"
    assert result["metrics"]["values"] == {**values, "goal": 35}
    assert result["goal_assessment_delta"] == -55


def test_perfect_metrics_can_pass_but_opponent_departure_is_failure():
    perfect = {"metrics": {key: 100 for key in START_METRICS}}
    assert online_report.online_verdict(perfect) == ("online_success", "ПРОЙДЕНО")
    perfect["outcome_signal"] = "opponent_left"
    assert online_report.online_verdict(perfect, "achieved") == ("online_failed", "ПРОВАЛЕНО")
