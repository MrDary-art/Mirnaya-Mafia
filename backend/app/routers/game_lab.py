"""Authenticated API for deterministic Game Lab trainers."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app import game_lab
from app.auth import get_current_user
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/lab", tags=["game-lab"])
T = TypeVar("T")


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RevisionRequest(StrictRequest):
    revision: int = Field(ge=0, strict=True)


class ActRequest(RevisionRequest):
    node_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    choice_id: str | None = Field(None, min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")


async def mutate(db: AsyncSession, user: User, operation: Callable[[], Awaitable[T]]) -> T:
    async with game_lab.user_lock(user.id):
        try:
            result = await operation()
            await db.commit()
            return result
        except game_lab.LabError as exc:
            await db.rollback()
            raise HTTPException(exc.status, exc.message) from exc
        except (IntegrityError, OperationalError) as exc:
            await db.rollback()
            raise HTTPException(409, "Прохождение обновляется. Повторите действие") from exc


@router.get("")
async def catalog(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await game_lab.catalog(db, user)


@router.get("/{trainer_id}")
async def detail(trainer_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return await game_lab.detail(db, user, trainer_id)
    except game_lab.LabError as exc:
        raise HTTPException(exc.status, exc.message) from exc


@router.post("/{trainer_id}/cases/{case_id}/runs")
async def start(trainer_id: str, case_id: str, db: AsyncSession = Depends(get_db),
                user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: game_lab.start_run(db, user, trainer_id, case_id))


@router.get("/runs/{run_id}")
async def play(run_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        run = await game_lab.get_run(db, user.id, run_id)
        return await game_lab.play_payload(db, user, run)
    except game_lab.LabError as exc:
        raise HTTPException(exc.status, exc.message) from exc


@router.post("/runs/{run_id}/act")
async def act(run_id: str, body: ActRequest, db: AsyncSession = Depends(get_db),
              user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: game_lab.act(
        db, user, run_id, body.revision, body.node_id, body.choice_id))


@router.post("/runs/{run_id}/restart")
async def restart(run_id: str, body: RevisionRequest, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: game_lab.restart(db, user, run_id, body.revision))
