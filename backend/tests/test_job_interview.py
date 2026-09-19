import pytest
from unittest.mock import AsyncMock
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.engine.llm import _opponent_prompt
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
async def test_job_interview_starts_with_role_specific_question(monkeypatch):
    monkeypatch.setattr("app.services.build_goal_criteria", AsyncMock(return_value={"success": ["Кандидат подходит"], "failure": ["Не подходит"], "source": "rules"}))
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
            assert "GitHub" in first
            assert "разработчик" in first
            assert "опыте" in first
    finally:
        await engine.dispose()
