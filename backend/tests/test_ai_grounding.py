import json
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from app.engine import llm
from app.engine.grounding import (grounded_analysis, validated_agreement, assess_agreement,
                                  abusive_termination, confirmed_next_step_from_exchange, unproductive_response)
from app.engine.narrative_report import online_narrative, transcript_for_prompt
from app.engine.online_report import online_verdict
from app.engine.metrics import START_METRICS
from app.db import Base
from app.models import User
from app import services
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


HISTORY = [{"context": "Нужны отчёты перед запуском.",
            "text": "Предлагаю запуск в срок, отчёты через неделю.",
            "reply": "Согласен: запуск в срок, отчёты через неделю."}]
AGREEMENT = {"all_conditions_met": True, "reason": "Обе стороны подтвердили запуск в срок и перенос отчётов на неделю.",
             "proposal": {"turn": 1, "speaker": "player", "quote": HISTORY[0]["text"]},
             "confirmation": {"turn": 1, "speaker": "opponent", "position": "after", "quote": HISTORY[0]["reply"]}}


def test_agreement_requires_two_real_speakers_in_order():
    assert validated_agreement(AGREEMENT, HISTORY)
    for mutation in ("invented", "same_speaker", "reversed", "not_all"):
        bad = deepcopy(AGREEMENT)
        if mutation == "invented": bad["confirmation"]["quote"] = "Запускаем завтра за миллион"
        if mutation == "same_speaker": bad["confirmation"] = bad["proposal"]
        if mutation == "reversed": bad["proposal"], bad["confirmation"] = bad["confirmation"], bad["proposal"]
        if mutation == "not_all": bad["all_conditions_met"] = False
        assert validated_agreement(bad, HISTORY) is None
    assert online_verdict({"metrics": START_METRICS, "outcome_signal": "agreement", "history": HISTORY})[0] != "online_success"
    assert online_verdict({"metrics": START_METRICS, "outcome_signal": "agreement", "history": HISTORY, "agreement_evidence": AGREEMENT})[0] == "online_success"


@pytest.mark.parametrize("acceptance", ["Согласен.", "Да, так и сделаем.", "Согласен. Запускаем в срок, отчёты через неделю."])
def test_acceptance_of_opponent_solution_is_not_invention_or_free_points(acceptance):
    data = {"tki_style": "сотрудничество", "techniques": ["объективные критерии"],
            "evidence": [{"tag": "сотрудничество", "quote": "Согласен"}]}
    result = grounded_analysis(data, acceptance)
    assert all(result[key] == 0 for key in ("trust_delta", "goal_delta", "control_delta", "eq_delta"))
    state = {"history": [{"context": HISTORY[0]["reply"], "text": acceptance, "reply": "Договорились."}]}
    generated = {"sections": [{"turn": 1, "quote": acceptance, "kind": "strength", "title": "Предложили перенос", "body": "Вы самостоятельно предложили разделить поставку на этапы."}],
                 "headline": "Вы придумали решение", "takeaway": "Вы предложили перенос"}
    note = online_narrative({"ending_id": "online_partial"}, state, {"goal": "Запуск в срок"}, generated)
    assert note["sections"][0]["action"] == "accepted"
    assert "самостоятельно предложили" not in str(note)
    assert note["status"] == "Результат не подтверждён"


def test_misattributed_behavior_and_neutral_words_cannot_earn_points():
    result = grounded_analysis({"tki_style": "сотрудничество", "techniques": ["эмпатия"],
        "evidence": [{"tag": "эмпатия", "quote": "Понимаю ваши опасения"}]}, "Здравствуйте.")
    assert result["trust_delta"] == 0
    assert result["techniques"] == []
    assert grounded_analysis(None, "Здравствуйте.")["goal_delta"] == 0
    result = grounded_analysis({"tki_style": "", "techniques": ["открытые вопросы"],
        "evidence": [{"tag": "открытые вопросы", "quote": "Что для вас важно"}]}, "Что для вас важно в сроке запуска?")
    assert result["control_delta"] == 3


def test_concrete_closing_action_finishes_as_next_step_not_goal_success():
    history = [{
        "context": "Можем оформить три месяца работы в Санкт-Петербурге, затем рассмотреть перевод в Москву. Договор?",
        "text": "Да",
        "reply": "Договорились. Ждём вас на оформление, направим адрес и время.",
    }]
    decision = confirmed_next_step_from_exchange(history)
    assert decision and decision["kind"] == "next_step"
    assert decision["proposal"]["speaker"] == "opponent"
    assert not abusive_termination("Я не согласен: мне нужен другой город.")
    assert abusive_termination("Ты идиот, пошёл нах")


def test_unproductive_replies_have_small_traceable_penalties_but_abuse_uses_termination():
    assert unproductive_response("бу")[0] == {"goal": -1, "control": -1}
    repeat, reason = unproductive_response("Мне нужно решение", [{"text": "Мне нужно решение"}])
    assert repeat == {"goal": -2, "control": -1}
    assert "Повтор" in reason
    dismissed, _ = unproductive_response("Шёл нафиг")
    assert dismissed == {"trust": -3, "goal": -2, "control": -1, "eq": -2}
    assert unproductive_response("деньги гони")[0] == {"trust": -2, "goal": -1, "eq": -1}
    assert abusive_termination("Ну ты и гнида, кыш")
    assert unproductive_response("Ну ты и гнида, кыш")[0] == {}


@pytest.mark.asyncio
async def test_independent_judge_can_reject_opponent_claim(monkeypatch):
    mock = AsyncMock(return_value=(json.dumps({"all_conditions_met": False, "reason": "Не согласован срок"}), "gigachat"))
    monkeypatch.setattr(llm, "call_with_fallback_detailed", mock)
    assert await assess_agreement({"goal": "Запуск в срок, отчёты через неделю"}, HISTORY) is None
    assert "независимый" in mock.call_args.kwargs["system_prompt"]
    mock.return_value = (json.dumps(AGREEMENT, ensure_ascii=False), "gigachat")
    assert await assess_agreement({"goal": "Запуск в срок, отчёты через неделю"}, HISTORY)


@pytest.mark.asyncio
async def test_stream_and_text_preserve_same_evidence_contract(monkeypatch):
    payload = {"reply": HISTORY[0]["reply"], "tki_style": "", "techniques": [], "evidence": [],
               "outcome_signal": "agreement", "agreement_evidence": AGREEMENT}
    provider = AsyncMock(return_value=(json.dumps(payload, ensure_ascii=False), "gigachat"))
    monkeypatch.setattr(llm, "call_with_fallback_detailed", provider)
    state = {"metrics": START_METRICS, "history": []}
    result = await llm.get_online_turn({"problem": "Отчёты до запуска", "goal": "Запуск в срок"}, state, HISTORY[0]["text"], None, [])
    assert result["agreement_evidence"] == AGREEMENT
    assert "противоположную сторону" in provider.call_args.kwargs["system_prompt"]
    monkeypatch.setattr("app.ai_providers.runtime_config", lambda: {"provider": "gigachat", "credential": "test"})
    async def fragments(prompt):
        assert "agreement_evidence" in prompt
        value = payload["reply"] + '<analysis>' + json.dumps(payload, ensure_ascii=False) + '</analysis>'
        for i in range(0, len(value), 7): yield value[i:i+7]
    monkeypatch.setattr(llm, "_stream_gigachat", fragments)
    events = [event async for event in llm.stream_online_turn({"problem": "Отчёты", "goal": "Запуск"}, state, HISTORY[0]["text"], [])]
    assert ''.join(value for kind, value in events if kind == 'reply') == payload['reply']
    assert events[-1][1]["agreement_evidence"] == AGREEMENT


def test_long_transcript_keeps_conditions_at_end_and_both_sides():
    transcript = transcript_for_prompt([{"text": "Начало " + "текст " * 1000 + "Отчёты через неделю.", "context": "Требую отчёты.", "reply": "Принимаю срок."}])
    assert "Отчёты через неделю." in transcript
    assert "До вашей реплики" in transcript and "После вашей реплики" in transcript


@pytest.mark.asyncio
@pytest.mark.parametrize("judge_approves", [False, True])
async def test_persisted_session_needs_independent_approval(monkeypatch, judge_approves):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    monkeypatch.setattr("app.engine.practice_plan.prepare_practice", AsyncMock(return_value={"opening": HISTORY[0]["context"]}))
    judge = AsyncMock(return_value=validated_agreement(AGREEMENT, HISTORY) if judge_approves else None)
    monkeypatch.setattr(services, "assess_agreement", judge)
    finish = AsyncMock(return_value={"summary": "saved"})
    monkeypatch.setattr(services, "finish_session", finish)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            user = User(username="grounded-user", password_hash="unused", stars=0, xp=0, level=1)
            db.add(user)
            await db.commit()
            session = await services.create_session(db, user, {"mode": "online", "problem": "Заказчик хочет отчёты до запуска", "goal": "Запуск в срок, отчёты через неделю"})
            turn = {"reply": HISTORY[0]["reply"], "analysis": grounded_analysis({"evidence": []}, HISTORY[0]["text"]), "outcome_signal": "agreement", "agreement_evidence": AGREEMENT, "provider": "gigachat", "error": None}
            result = await services.apply_free_text(db, session, user, HISTORY[0]["text"], False, prepared_turn=turn)
            assert result["finished"] is judge_approves
            assert finish.await_count == int(judge_approves)
            saved = services.loads(session.state, {})
            assert (saved.get("outcome_signal") == "agreement") is judge_approves
            assert saved["history"][-1]["text"] == HISTORY[0]["text"]
            # A successful result is separate from behavioral points, not arbitrary +60.
            assert saved["metrics"] == START_METRICS
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_comparison_receives_questions_not_just_candidate_answers(monkeypatch):
    from app.engine import room_comparison
    provider = AsyncMock(return_value=('{}', 'gigachat'))
    monkeypatch.setattr(room_comparison, 'call_with_fallback_detailed', provider)
    transcript = [{"sender": "opponent", "text": "Как проверили результат проекта?"}, {"sender": "player", "text": "Проверил интеграционными тестами."}]
    await room_comparison.compare_interviews('Разработчик', {'A': transcript, 'B': transcript}, [1, 2])
    assert 'Как проверили результат проекта?' in provider.call_args.args[0]


@pytest.mark.parametrize("scenario,goal", [
    ("Заказчик требует отчёты до запуска", "Запуск в срок, отчёты через неделю"),
    ("Поставщик увеличивает цену", "Сохранить бюджет закупки"),
    ("Сотрудник просит повышение", "Согласовать измеримые условия пересмотра зарплаты"),
])
def test_opponent_has_separate_position_and_remembers_prior_conditions(scenario, goal):
    state = {"metrics": START_METRICS, "history": [{"text": "Наш предел — 100 тысяч.", "reply": "Обсудим условия."}]}
    prompt = llm._opponent_prompt({"problem": scenario, "goal": goal, "practice_plan": {"opponent_position": "Защитить исходное требование своей стороны"}}, state, 'Что для вас важно?', [])
    assert '100 тысяч' in prompt
    assert 'не помощника игрока' in prompt
    assert 'Защитить исходное требование своей стороны' in prompt
