import json
import pytest
from unittest.mock import AsyncMock
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.engine.llm import _opponent_prompt
from app.engine.goal_contract import validate_criteria
from app.engine.online_report import online_verdict
from app.engine.metrics import empty_state
from app.engine.scenario import get_scenario
from app.models import Message, User
from app.schemas import SessionSettings
from app.services import apply_free_text, create_session


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


def test_job_interview_uses_validated_role_focus_and_voice_uncertainty():
    settings = {"practice_kind": "job_interview", "target_position": "Python-разработчик", "target_company": "GitHub"}
    state = empty_state(get_scenario("hr_firing_01"))
    state["goal_criteria"] = validate_criteria({"success": ["Кандидат показал рабочий опыт"], "failure": ["Кандидат не знает базовые задачи"], "interview_focus": ["Разработка API на Python", "Тестирование сервисов"]}, settings)
    state["voice_transcript"] = True
    prompt = _opponent_prompt(settings, state, "Я писал на попкорне", [])
    assert "Разработка API на Python" in prompt
    assert "не переходи к другой профессии" in prompt
    assert "Не снижай оценку за вероятный сбой распознавания" in prompt


def test_full_goal_is_success_even_if_other_metrics_are_low():
    state = {"metrics": {"goal": 100, "trust": 35, "control": 40, "eq": 40}, "outcome_signal": "goal_reached"}
    assert online_verdict(state, "partial") == ("online_success", "ПРОЙДЕНО")


def test_completed_interview_has_binary_verdict():
    state = {"metrics": {"goal": 65, "trust": 60, "control": 50, "eq": 50}, "outcome_signal": "interview_complete"}
    assert online_verdict(state, "achieved") == ("online_success", "ПРОЙДЕНО")
    assert online_verdict(state, "partial") == ("online_failed", "ПРОВАЛЕНО")


@pytest.mark.asyncio
async def test_interview_finishes_after_last_planned_answer(monkeypatch):
    monkeypatch.setattr("app.services.build_goal_criteria", AsyncMock(return_value={"success": ["Опыт подтверждён"], "failure": ["Не подтверждён"], "source": "rules"}))
    monkeypatch.setattr("app.services.build_interview_plan", AsyncMock(return_value={"questions": ["Какой у вас опыт работы?", "Как вы проверяете результат?"], "source": "rules", "vacancies": []}))
    finish = AsyncMock(return_value={"verdict": "ПРОВАЛЕНО"})
    monkeypatch.setattr("app.services.finish_session", finish)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    turn = {"reply": "Спасибо. Как вы проверяете результат?", "analysis": {"goal_delta": 0}, "provider": "gigachat", "error": None, "outcome_signal": "continue"}
    try:
        async with factory() as db:
            user = User(username="planned-interview", password_hash="not-used")
            db.add(user)
            await db.commit()
            session = await create_session(db, user, SessionSettings(mode="online", practice_kind="job_interview", target_position="учитель", target_company="школа", goal="Получить работу").model_dump())
            first = await apply_free_text(db, session, user, "Работал год", False, prepared_turn=turn)
            assert first["finished"] is False
            second = await apply_free_text(db, session, user, "Проверяю работы", False, prepared_turn=turn)
            assert second["finished"] is True
            finish.assert_awaited_once()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_job_interview_starts_with_role_specific_question(monkeypatch):
    monkeypatch.setattr("app.services.build_goal_criteria", AsyncMock(return_value={"success": ["Кандидат подходит"], "failure": ["Не подходит"], "source": "rules"}))
    monkeypatch.setattr("app.services.build_interview_plan", AsyncMock(return_value={"questions": ["Расскажите о вашем опыте?", "Как вы проверяете результат?"], "source": "rules", "vacancies": []}))
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
            knowledge_paths = [source["path"] for source in json.loads(session.state)["knowledge"]["sources"]]
            assert "scenarios/interview.md" in knowledge_paths
            first = await db.scalar(select(Message.text).where(Message.session_id == session.id))
            assert "GitHub" in first
            assert "разработчик" in first
            assert "опыте" in first
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_interview_does_not_award_negotiation_style_points(monkeypatch):
    monkeypatch.setattr("app.services.build_goal_criteria", AsyncMock(return_value={"success": ["Опыт подтверждён"], "failure": ["Нет примеров"], "source": "rules"}))
    monkeypatch.setattr("app.services.build_interview_plan", AsyncMock(return_value={"questions": ["Расскажите об опыте?", "Приведите пример?"], "source": "rules", "vacancies": []}))
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    turn = {
        "reply": "Спасибо. Приведите пример?",
        "analysis": {
            "tki_style": "сотрудничество", "techniques": ["batna", "вопросы"],
            "goal_signal": "progress", "tone": "нейтральный",
            "trust_delta": 2, "goal_delta": 10, "control_delta": 3, "eq_delta": 0,
        },
        "provider": "gigachat", "error": None, "outcome_signal": "continue",
    }
    try:
        async with factory() as db:
            user = User(username="interview-scoring", password_hash="not-used")
            db.add(user)
            await db.commit()
            session = await create_session(db, user, SessionSettings(
                mode="online", practice_kind="job_interview", target_position="учитель",
                target_company="школа", goal="Получить работу",
            ).model_dump())
            result = await apply_free_text(db, session, user, "Работал год", False, prepared_turn=turn)
            assert result["finished"] is False
            assert result["metrics"] == {"trust": 49, "goal": 37, "control": 48, "eq": 48}
            player_message = await db.scalar(select(Message).where(Message.session_id == session.id, Message.sender == "player"))
            assert json.loads(player_message.analysis)["tki_style"] is None
    finally:
        await engine.dispose()
