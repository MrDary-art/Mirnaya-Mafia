import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.engine import online_report
from app.engine.metrics import START_METRICS
from app.models import User
from app.services import apply_free_text, create_session, finish_session, loads


@pytest.mark.asyncio
async def test_final_reply_is_saved_and_report_is_grounded_without_double_rewards(monkeypatch):
    monkeypatch.setattr("app.engine.practice_plan.prepare_practice", AsyncMock(return_value={"opening":"Почему вам интересна эта работа?"}))
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            user = User(username="test-outcome", password_hash="not-used", stars=0, xp=0, level=1)
            db.add(user)
            await db.commit()
            settings = {
                "mode": "online", "display_name": "Аня", "role": "Кандидат", "opponent_role": "Рекрутер",
                "problem": "Собеседование разработчика", "goal": "Получить работу", "scenario_id": "salary_talk_01",
            }
            session = await create_session(db, user, settings)
            assert loads(session.state, {})["metrics"] == START_METRICS
            monkeypatch.setattr("app.services.get_online_turn", AsyncMock(return_value={
                "reply": "После такого заявления собеседование окончено.",
                "analysis": {"tki_style": "конкуренция", "techniques": ["грубость"], "comment": "Угроза сорвала беседу.",
                             "trust_delta": -6, "goal_delta": 0, "control_delta": 1, "eq_delta": -5},
                "provider": "gigachat", "error": None, "outcome_signal": "opponent_left",
            }))
            monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(return_value=(json.dumps({
                "summary": "Угроза разрушила доверие.",
                "mistakes": [{"what": "Угроза", "chosen": "Хочу всё сломать", "alternative": "Хочу улучшить процессы"}],
                "recommendations": ["Назовите конструктивный вклад в команду."],
                "verdict": "ПРИНЯТ",
            }, ensure_ascii=False), "gigachat")))
            result = await apply_free_text(db, session, user, "Я пришла всё сломать", False)
            assert result["finished"] is True
            assert result["report"]["report_status"] == "queued"
            assert session.status == "processing"
            assert loads(session.state, {})["history"][-1]["text"] == "Я пришла всё сломать"
            report = await finish_session(db, session, user, background_worker=True)
            assert report["verdict"] == "РАЗГОВОР ЗАВЕРШЁН СОБЕСЕДНИКОМ"
            assert report["ending_id"] == "online_partial"
            assert report["summary"] == "Угроза разрушила доверие."
            assert report["recommendations"][0] == "Назовите конструктивный вклад в команду."
            assert report["metrics_chart"][0]["trust"] == START_METRICS["trust"]
            assert report["metrics"]["values"]["trust"] == 24
            assert report["mistakes"] == []  # Invented quotation is discarded.
            assert session.status == "finished"
            stars = user.stars
            assert await finish_session(db, session, user) == report
            assert user.stars == stars
    finally:
        await engine.dispose()
