from unittest.mock import AsyncMock

import pytest

from app.engine import llm
from app.engine.knowledge import select_knowledge
from app.engine.opponent_policy import conduct_turn, direct_abuse


SETTINGS = {
    "mode": "online", "role": "Юрист", "opponent_role": "Руководитель",
    "problem": "Компания понесла убытки из-за моей ошибки, меня хотят уволить",
    "goal": "Остаться работать при прежней зарплате",
}


def test_dismissal_overrides_salary_keyword_and_interview_materials():
    knowledge = select_knowledge(SETTINGS)
    assert knowledge["sources"][0]["path"] == "scenarios/dismissal.md"
    assert not any(s["path"] == "scenarios/salary.md" for s in knowledge["sources"])
    assert "Что проверять на собеседовании" not in knowledge["brief"]


@pytest.mark.parametrize("text", ["Нет, я не согласен", "Дайте 20 тысяч долларов или я уйду", 'Он сказал «пошел нахуй», но я возражаю'])
def test_disagreement_money_and_quoted_abuse_do_not_trigger_boundary(text):
    assert not direct_abuse(text)
    assert conduct_turn(SETTINGS, {}, text) is None


@pytest.mark.asyncio
async def test_warning_then_termination_are_identical_for_streaming_and_text(monkeypatch):
    provider = AsyncMock(side_effect=AssertionError("Boundary must run before provider/audio"))
    monkeypatch.setattr(llm, "call_with_fallback_detailed", provider)
    first = await llm.get_online_turn(SETTINGS, {}, "ты такой тупой", {}, [])
    assert first["outcome_signal"] == "continue"
    assert "При повторении" in first["reply"]
    state = {"history": [{"text": "ты такой тупой", "reply": first["reply"]}]}
    second = await llm.get_online_turn(SETTINGS, state, "пошел нахуй", {}, [])
    events = [event async for event in llm.stream_online_turn(SETTINGS, state, "пошел нахуй", [])]
    assert events == [("reply", second["reply"]), ("turn", second)]
    assert second["outcome_signal"] == "opponent_left"
    assert second["analysis"]["goal_signal"] == "setback"
    assert second["analysis"]["eq_delta"] < 0
    provider.assert_not_called()


def test_conduct_policy_does_not_change_offline_or_other_roles():
    assert conduct_turn({"practice_kind": "job_interview"}, {}, "ты тупой") is None
    assert conduct_turn({**SETTINGS, "opponent_role": "Подчиненный"}, {}, "ты тупой") is None


@pytest.mark.asyncio
async def test_repeated_abuse_finishes_persisted_session_with_failed_report(monkeypatch):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.db import Base
    from app.models import User
    from app.services import create_session, apply_free_text
    from app.engine.llm import LlmError

    monkeypatch.setattr("app.services.build_goal_criteria", AsyncMock(return_value={"success": [], "failure": []}))
    monkeypatch.setattr("app.engine.online_report.call_with_fallback_detailed", AsyncMock(side_effect=LlmError("offline")))
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            user = User(username="conduct-test", password_hash="unused", stars=0, xp=0, level=1)
            db.add(user)
            await db.commit()
            session = await create_session(db, user, {**SETTINGS, "scenario_id": "hr_firing_01"})
            first = await apply_free_text(db, session, user, "ты тупой", False)
            assert not first["finished"]
            second = await apply_free_text(db, session, user, "пошел нахуй", False)
            assert second["finished"]
            assert session.status == "finished"
            assert second["report"]["goal_status"] == "failed"
            assert second["report"]["verdict"] == "ПРОВАЛЕНО"
            with pytest.raises(ValueError, match="уже завершена"):
                await apply_free_text(db, session, user, "продолжим", False)
    finally:
        await engine.dispose()
