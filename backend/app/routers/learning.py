from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.engine.learning import PROGRAMS, public_exercise, program_summary
from app.learning import error_training, get_progress, serialize_program, submit
from app.models import User
from app.schemas import LearningSubmitIn

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get("/programs")
async def programs(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return [serialize_program(pid, await get_progress(db, user, pid)) for pid in PROGRAMS]


@router.get("/programs/{program_id}")
async def program(program_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if program_id not in PROGRAMS:
        raise HTTPException(404, "Программа не найдена")
    return serialize_program(program_id, await get_progress(db, user, program_id)) | {"exercises": [public_exercise(e) for e in PROGRAMS[program_id]["exercises"]]}


@router.post("/programs/{program_id}/exercises/{exercise_id}")
async def answer(program_id: str, exercise_id: str, body: LearningSubmitIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return await submit(db, user, program_id, exercise_id, body.option_id, body.answer)
    except KeyError as exc:
        raise HTTPException(404, "Упражнение не найдено") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/programs/{program_id}/errors")
async def errors(program_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if program_id not in PROGRAMS:
        raise HTTPException(404, "Программа не найдена")
    return await error_training(db, user, program_id)
