import json
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from app.engine import llm, online_report
from app.engine.report_methodology import candidate_findings, reviewed_findings, RULES, VERSION
from app.engine.narrative_report import online_narrative
from app.engine.report_detail import detailed_report


HISTORY = [{"text": "Что для вас важнее: снизить бюджет или успеть запустить проект?",
            "reply": "Нам важнее запустить проект к пятнице.", "context": "Нам нужна скидка."}]
FINDING = {"rule_id": "interests", "turn": 1, "quote": HISTORY[0]["text"], "kind": "strength",
    "title": "Вы уточнили приоритет клиента", "body": "Вместо немедленной скидки вы спросили о причине требования. Клиент назвал приоритет срока; это ещё не согласие на сделку.",
    "short": "Вы выяснили, что клиенту важнее срок запуска, чем снижение бюджета",
    "counterpart_quote": HISTORY[0]["reply"], "counterpart_position": "after"}


@pytest.mark.parametrize("mutation", ["invented_quote", "opponent_quote", "fake_rule", "wrong_reaction", "boolean_turn", "malformed_rule", "wrong_mode"])
def test_unfounded_findings_do_not_reach_semantic_review(mutation):
    item, settings = deepcopy(FINDING), {}
    if mutation == "invented_quote": item["quote"] = "Клиент подписал контракт на миллион"
    if mutation == "opponent_quote": item["quote"] = HISTORY[0]["reply"]
    if mutation == "fake_rule": item["rule_id"] = "seven_magic_words"
    if mutation == "wrong_reaction": item["counterpart_quote"] = "Согласен на любую цену"
    if mutation == "boolean_turn": item["turn"] = True
    if mutation == "malformed_rule": item["rule_id"] = {"interests": True}
    if mutation == "wrong_mode": settings = {"practice_kind": "job_interview"}
    assert candidate_findings([item], HISTORY, settings) == []


def test_sources_and_exercises_are_server_owned():
    item = deepcopy(FINDING)
    item.update(principle={"url": "https://invented.invalid", "explanation": "Любая скидка полезна"}, alternative="Согласитесь на любую цену")
    result = candidate_findings([item], HISTORY, {})[0]
    assert result["principle"]["explanation"] == RULES["interests"]["criterion"]
    assert "invented.invalid" not in str(result)
    assert result["alternative"] == ""
    item["kind"] = "improve"
    assert candidate_findings([item], HISTORY, {})[0]["alternative"] == RULES["interests"]["practice"]


@pytest.mark.asyncio
@pytest.mark.parametrize("reviews", [[], [{"id": 0, "supported": False, "reason": "Цитата есть, но вывод не следует из контекста."}],
    [{"id": 0, "supported": "true", "reason": "Внешне подходящая, но невалидная оценка."}],
    [{"id": 0, "supported": True, "reason": "Да"}],
    [{"id": 0, "supported": True, "reason": "Подтверждено цитатой и ответом клиента."}] * 2])
async def test_exact_quote_alone_is_not_enough(monkeypatch, reviews):
    monkeypatch.setattr(llm, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps({"reviews": reviews}), "gigachat")))
    assert await reviewed_findings([FINDING], HISTORY, {}) == []


@pytest.mark.asyncio
async def test_review_unavailable_keeps_a_record_not_invented_analysis(monkeypatch):
    monkeypatch.setattr(llm, "call_with_fallback_detailed", AsyncMock(side_effect=llm.LlmError("offline")))
    assert await reviewed_findings([FINDING], HISTORY, {}) == []


@pytest.mark.asyncio
async def test_summary_and_report_share_verified_theoretical_finding(monkeypatch):
    initial = {"narrative": {"sections": [FINDING]}, "recommendations": ["Согласитесь на любую цену"],
               "mistakes": [{"what": "Выдуманная ошибка"}]}
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps(initial), "gigachat")))
    review = AsyncMock(return_value=(json.dumps({"reviews": [{"id": 0, "supported": True,
        "reason": "Вопрос раскрывает интерес клиента, который прямо назвал приоритет срока."}]}), "gigachat"))
    monkeypatch.setattr(llm, "call_with_fallback_detailed", review)
    state = {"history": HISTORY, "metrics": {"trust": 50, "goal": 40, "control": 50, "eq": 50}}
    result = await online_report.enrich_online_report({"metrics_chart": [{"turn": 0}]}, state, {"goal": "Согласовать запуск"})
    assert result["methodology"]["version"] == VERSION
    assert result["methodology"]["verified_findings"] == 1
    assert FINDING["short"] in result["narrative"]["takeaway"]
    assert "Достижение цели пока не подтверждено" in result["narrative"]["takeaway"]
    assert result["mistakes"] == [] and result["recommendations"] == []
    assert "Выдуманная ошибка" not in str(result)
    assert result["narrative"]["sections"][0]["principle"]["sources"]
    assert "правило" in review.call_args.kwargs["system_prompt"]


def test_saved_observations_are_not_relabelled_as_theory_verified():
    saved = {"narrative": {"source": "ai", "sections": [{"kind": "strength", "title": "Старый вывод",
        "body": "Старое объяснение", "evidence": {"turn": 1, "quote": HISTORY[0]["text"]}}]},
        "extended_analysis_requested": True, "extended_analysis": [{"title": "Непроверенный старый текст"}]}
    result = detailed_report(saved, {"history": HISTORY}, {})
    assert result["methodology"]["verified_findings"] == 0
    assert "extended_analysis" not in result and not result["extended_analysis_requested"]
    assert "Непроверенный старый текст" not in str(result)
    assert saved["extended_analysis"]  # Reading must not mutate the archive.


def test_interview_rubric_is_not_negotiation_or_personality_assessment():
    item = {**FINDING, "rule_id": "interview_evidence"}
    assert candidate_findings([item], HISTORY, {}) == []
    result = candidate_findings([item], HISTORY, {"practice_kind": "job_interview"})[0]
    assert result["principle"]["sources"][0]["url"].startswith("https://www.opm.gov/")


@pytest.mark.asyncio
async def test_council_does_not_turn_regex_matches_or_empty_speech_into_analysis(monkeypatch):
    from app.engine.council_report import attach_theory_review
    monkeypatch.setattr(llm, "call_with_fallback_detailed", AsyncMock(return_value=('{}', 'gigachat')))
    personal = {"strengths": [{"title": "Раньше определено по вопросительному знаку"}],
        "next_steps": [], "chronology": [{"message_id": 8, "techniques": ["Вопрос"], "observation": "Старый вывод"}]}
    result = await attach_theory_review(personal, [{"id": 8, "text": "Почему?"}], {"goal": "Согласовать сроки"}, {})
    assert result["strengths"] == [] and result["next_steps"] == []
    assert result["methodology"]["verified_findings"] == 0
    assert result["chronology"][0]["analysis_source"] == "record"
    assert result["chronology"][0]["techniques"] == []
    empty = await attach_theory_review({"chronology": []}, [], {}, {})
    assert empty["analysis_coverage"]["total"] == 0 and not empty["strengths"]


@pytest.mark.asyncio
async def test_council_theoretical_findings_retain_own_message_and_source(monkeypatch):
    from app.engine.council_report import attach_theory_review
    # Council has no counterpart speech in its personal payload.
    own_finding = {**FINDING, "counterpart_quote": ""}
    provider = AsyncMock(side_effect=[(json.dumps({"narrative": {"sections": [own_finding]}}), "gigachat"),
        (json.dumps({"reviews": [{"id": 0, "supported": True, "reason": "В собственной реплике участник уточнил приоритет другой стороны."}]}), "gigachat")])
    monkeypatch.setattr(llm, "call_with_fallback_detailed", provider)
    personal = await attach_theory_review({"chronology": []}, [{"id": 17, "text": HISTORY[0]["text"]}], {"goal": "Согласовать сроки"}, {})
    assert personal["methodology"]["verified_findings"] == 1
    assert personal["ai_review"]["findings"][0]["message_id"] == 17
    assert personal["ai_review"]["findings"][0]["principle"]["sources"]
