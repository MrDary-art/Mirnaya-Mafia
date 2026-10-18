import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.engine.llm import _opponent_prompt
from app.engine import practice_plan
from app.engine.llm import LlmError
from app.engine.metrics import empty_state
from app.engine.scenario import get_scenario
from app.models import Message, User
from app.schemas import SessionSettings
from app.services import create_session


def test_job_interview_prompt_uses_company_position_and_difficulty():
    settings = SessionSettings(
        mode="online", practice_kind="job_interview", display_name="Алексей",
        target_company="GitHub", target_position="разработчик", difficulty="hard",
        goal="Пройти собеседование",
    ).model_dump()
    state = empty_state(get_scenario("hr_firing_01"))
    prompt = _opponent_prompt(settings, state, "Я работал над API", [])
    assert "GitHub" in prompt
    assert "разработчик" in prompt
    assert "Сложность: сложная" in prompt
    assert "только один следующий вопрос" in prompt
    assert "Последняя реплика кандидата: Я работал над API" in prompt
    assert "учебные переговоры один на один" not in prompt


@pytest.mark.asyncio
async def test_job_interview_starts_with_introduction_even_if_provider_starts_with_technical_question(monkeypatch):
    questions = [f"Как вы решали задачу разработки номер {i} и проверяли результат?" for i in range(10)]
    planner = AsyncMock(return_value=(json.dumps({"opening":questions[0],"questions":questions},ensure_ascii=False),"gigachat"))
    monkeypatch.setattr("app.engine.practice_plan.call_with_fallback_detailed", planner)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            user = User(username="job-interview", password_hash="not-used")
            db.add(user)
            await db.commit()
            settings = SessionSettings(
                mode="online", practice_kind="job_interview", display_name="Алексей",
                target_company="GitHub", target_position="разработчик",
                problem="Собеседование на позицию разработчика в GitHub",
                goal="Получить работу",
            )
            session = await create_session(db, user, settings.model_dump())
            first = await db.scalar(select(Message.text).where(Message.session_id == session.id))
            saved_plan = json.loads(session.settings)["practice_plan"]
            assert first == "Здравствуйте! Расскажите, пожалуйста, немного о себе."
            assert saved_plan["questions"] == practice_plan.interview_introduction(settings.model_dump()) + questions[5:]
            assert len(saved_plan["questions"]) == 10
            assert saved_plan["source"] == "gigachat"
            assert "GitHub" in planner.call_args.args[0]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("response", [None, '{"opening":"Расскажите о себе","questions":["Один вопрос"]}'])
async def test_unavailable_or_invalid_provider_keeps_realistic_interview_order(monkeypatch, response):
    provider = AsyncMock(side_effect=LlmError("Unavailable")) if response is None else AsyncMock(return_value=(response, "gigachat"))
    monkeypatch.setattr(practice_plan, "call_with_fallback_detailed", provider)
    settings = {"practice_kind": "job_interview", "target_position": "учитель математики"}
    plan = await practice_plan.prepare_practice(settings)
    assert plan["questions"][:5] == practice_plan.interview_introduction(settings)
    assert len(plan["questions"]) == 10
    assert "учитель математики" in plan["questions"][5]
    assert plan["source"] == "template"


@pytest.mark.asyncio
async def test_shared_interview_plan_is_preserved_for_both_candidates(monkeypatch):
    provider = AsyncMock()
    monkeypatch.setattr(practice_plan, "call_with_fallback_detailed", provider)
    shared = practice_plan.interview_introduction({}) + [f"Профессиональный вопрос {i}?" for i in range(5)]
    plan = await practice_plan.prepare_practice({"interview_questions": shared})
    assert plan["questions"] == shared
    provider.assert_not_awaited()
    instruction = practice_plan.plan_instruction({"practice_plan": plan}, {"turns": 0})
    assert shared[1] in instruction
    assert "признак самоанализа, не повод для отказа" in instruction
    final = practice_plan.plan_instruction({"practice_plan": plan}, {"turns": 9})
    assert "Не задавай новых вопросов" in final


@pytest.mark.asyncio
async def test_negotiation_does_not_receive_candidate_evaluation_rules(monkeypatch):
    provider = AsyncMock(return_value=('{"opening":"Какую стоимость поставки вы предлагаете?","questions":[]}', "gigachat"))
    monkeypatch.setattr(practice_plan, "call_with_fallback_detailed", provider)
    result = await practice_plan.prepare_practice({"problem": "Договориться о поставке"})
    assert result["kind"] == "negotiation"
    assert result["opening"] == "Какую стоимость поставки вы предлагаете?"
    assert practice_plan.INTERVIEW_GUIDANCE not in provider.call_args.args[0]
