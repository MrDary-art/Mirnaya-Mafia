"""Persistent installation-wide gate for creating new user accounts."""
from fastapi import HTTPException
from app.installation import read_config

SETTING = "registration_enabled"
CLOSED_MESSAGE = "Регистрация временно закрыта. Войдите в существующий аккаунт."


def registration_enabled(config):
    # Existing installations keep their previous behaviour until an admin opts out.
    return config.get(SETTING, True) is True


async def require_registration_open(db):
    _, config = await read_config(db)
    if not registration_enabled(config):
        raise HTTPException(403, CLOSED_MESSAGE)


async def registration_status(db):
    revision, config = await read_config(db)
    return {"enabled": registration_enabled(config), "revision": revision}
