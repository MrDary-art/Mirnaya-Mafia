from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.engine.theory import LESSONS
from app.models import User
from app.schemas import LearningSubmitIn, TheoryStepIn
from app import theory

router = APIRouter(prefix="/theory", tags=["theory"])


def ensure(lesson_id: str) -> None:
    if lesson_id not in LESSONS:
        raise HTTPException(404, "Урок не найден")


@router.get("")
async def get_catalog(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await theory.catalog(db, user)


@router.get("/{lesson_id}")
async def get_lesson(lesson_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ensure(lesson_id)
    return await theory.lesson_detail(db, user, lesson_id)


@router.post("/{lesson_id}/start")
async def start_lesson(lesson_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ensure(lesson_id)
    return await theory.start(db, user, lesson_id)


@router.put("/{lesson_id}/step")
async def set_step(lesson_id: str, body: TheoryStepIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ensure(lesson_id)
    return await theory.save_step(db, user, lesson_id, body.current_step)


@router.post("/{lesson_id}/practice/{exercise_id}")
async def answer(lesson_id: str, exercise_id: str, body: LearningSubmitIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ensure(lesson_id)
    try:
        return await theory.submit_answer(db, user, lesson_id, exercise_id, body.option_id)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{lesson_id}/complete")
async def complete(lesson_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ensure(lesson_id)
    try:
        return await theory.complete(db, user, lesson_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
