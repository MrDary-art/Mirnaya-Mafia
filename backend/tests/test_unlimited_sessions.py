import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.models import Session, User
from app.routers.game import list_sessions
from app.routers.meta import admin_sessions
from app.services import create_session


@pytest.mark.asyncio
async def test_new_sessions_do_not_stop_older_sessions_or_disappear_from_lists():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            user = User(username="unlimited-sessions", password_hash="not-used")
            db.add(user)
            await db.commit()
            for _ in range(12):
                await create_session(db, user, {"mode": "scenario", "scenario_id": "hr_firing_01"})
            active = await db.scalar(select(func.count()).select_from(Session).where(Session.user_id == user.id, Session.status == "active"))
            assert active == 12

            db.add_all(Session(
                user_id=user.id, mode="scenario", role="HR", opponent_role="Сотрудник",
                scenario_id="hr_firing_01", settings="{}", status="active", metrics="{}", state="{}",
            ) for _ in range(90))
            await db.commit()
            assert len(await list_sessions(db, user)) == 102
            assert len(await admin_sessions(db, user)) == 102
    finally:
        await engine.dispose()
