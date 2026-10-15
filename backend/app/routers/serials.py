"""Authenticated visual novel API. Mutations are transactional and revision checked."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated, Literal, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app import serials
from app.auth import get_current_user
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/serials", tags=["serials"])
T = TypeVar("T")


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartRequest(StrictRequest):
    slot: int = Field(1, ge=1, le=3, strict=True)


class RevisionRequest(StrictRequest):
    revision: int = Field(ge=0, strict=True)


class ActRequest(RevisionRequest):
    node_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    choice_id: str | None = Field(None, min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")


class WorksheetRequest(RevisionRequest):
    episode_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    phase: Literal["prepare", "reflect"]
    values: dict[str, Annotated[str, Field(strict=True, max_length=1500)]]

    @model_validator(mode="after")
    def exact_fields(self):
        fields = {"goal", "question", "boundary"} if self.phase == "prepare" else {"takeaway", "next_action"}
        if set(self.values) != fields:
            raise ValueError("Заполните только поля выбранного раздела практикума")
        return self


async def mutate(db: AsyncSession, user: User, operation: Callable[[], Awaitable[T]]) -> T:
    async with serials.user_lock(user.id):
        try:
            result = await operation()
            await db.commit()
            return result
        except serials.SerialError as exc:
            await db.rollback()
            raise HTTPException(exc.status, exc.message) from exc
        except (IntegrityError, OperationalError) as exc:
            await db.rollback()
            raise HTTPException(409, "Сохранение обновляется. Обновите страницу и повторите действие") from exc


@router.get("")
async def catalog(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await serials.catalog(db, user)


@router.post("/welcome")
async def welcome(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: serials.claim_welcome(db, user))


@router.get("/runs/{run_id}")
async def play(run_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        run = await serials.get_run(db, user.id, run_id)
        return await serials.play_payload(db, user, run)
    except serials.SerialError as exc:
        raise HTTPException(exc.status, exc.message) from exc


@router.post("/runs/{run_id}/act")
async def act(run_id: str, body: ActRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: serials.act(db, user, run_id, body.revision, body.node_id, body.choice_id))


@router.post("/runs/{run_id}/episodes/{episode_id}/start")
async def start_episode(run_id: str, episode_id: str, body: RevisionRequest,
                        db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: serials.start_episode(db, user, run_id, body.revision, episode_id))


@router.post("/runs/{run_id}/restart")
async def restart(run_id: str, body: RevisionRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: serials.restart(db, user, run_id, body.revision))


@router.post("/runs/{run_id}/worksheet")
async def worksheet(run_id: str, body: WorksheetRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: serials.save_worksheet(db, user, run_id, body.revision,
                                                               body.episode_id, body.phase, body.values))


@router.get("/{story_id}")
async def detail(story_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return await serials.detail(db, user, story_id)
    except serials.SerialError as exc:
        raise HTTPException(exc.status, exc.message) from exc


@router.post("/{story_id}/runs")
async def start(story_id: str, body: StartRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mutate(db, user, lambda: serials.start_run(db, user, story_id, body.slot))
