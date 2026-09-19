import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.engine.scenario import CHAOS_EVENTS, get_chaos_event, get_scenario
from app.models import User
from app.routers.game import chaos_response_endpoint
from app.services import apply_choice, create_session, loads, serialize_session


def test_chaos_probability_uses_setup_difficulty(monkeypatch):
    monkeypatch.setattr("app.engine.scenario.random.random", lambda: 0.12)
    monkeypatch.setattr("app.engine.scenario.random.choice", lambda events: events[0])
    assert get_chaos_event(3, "easy") is None
    assert get_chaos_event(3, "medium") is None
    assert get_chaos_event(3, "hard")["id"] == CHAOS_EVENTS[0]["id"]
    assert get_chaos_event(2, "brutal") is None


@pytest.mark.asyncio
async def test_chaos_event_survives_reload_and_resolves_once(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            user = User(username="chaos-flow", password_hash="unused")
            db.add(user)
            await db.commit()
            session = await create_session(db, user, {"mode": "scenario", "scenario_id": "hr_firing_01", "chaos": True})
            event = CHAOS_EVENTS[0]
            monkeypatch.setattr("app.services.get_chaos_event", lambda turns, difficulty: event)
            option_id = get_scenario("hr_firing_01")["steps"][0]["options"][0]["id"]
            turn = await apply_choice(db, session, user, option_id, False, False)
            assert turn["chaos_event"]["id"] == event["id"]
            pending = serialize_session(session)
            assert pending["pending_chaos"]["id"] == event["id"]
            step_id = pending["step"]["id"]
            with pytest.raises(ValueError, match="Сначала ответьте"):
                await apply_choice(db, session, user, pending["step"]["options"][0]["id"], False, False)

            resolved = await chaos_response_endpoint(session.id, {"event_type": event["id"], "choice_index": 1}, db, user)
            assert resolved["session"]["step"]["id"] == step_id
            assert "pending_chaos" not in resolved["session"]
            with pytest.raises(HTTPException) as duplicate:
                await chaos_response_endpoint(session.id, {"event_type": event["id"], "choice_index": 1}, db, user)
            assert duplicate.value.status_code == 400
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_ghost_hint_counts_only_when_mode_is_enabled():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            user = User(username="ghost-flow", password_hash="unused")
            db.add(user)
            await db.commit()
            option_id = get_scenario("hr_firing_01")["steps"][0]["options"][0]["id"]
            enabled = await create_session(db, user, {"mode": "scenario", "scenario_id": "hr_firing_01", "ghost": True})
            await apply_choice(db, enabled, user, option_id, True, False)
            assert loads(enabled.state, {})["ghost_used"] == 1
            assert serialize_session(enabled)["settings"]["ghost"] is True
            second_id = serialize_session(enabled)["step"]["options"][0]["id"]
            await apply_choice(db, enabled, user, second_id, True, False)
            assert serialize_session(enabled)["state"]["ghost_general"] is True

            disabled = await create_session(db, user, {"mode": "scenario", "scenario_id": "hr_firing_01", "ghost": False})
            await apply_choice(db, disabled, user, option_id, True, False)
            assert loads(disabled.state, {})["ghost_used"] == 0
    finally:
        await engine.dispose()
