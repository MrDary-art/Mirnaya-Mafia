from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.learning import PROGRAMS, error_summary, evaluate_exercise, mastery, program_summary, public_exercise
from app.models import LearningProgress, User
from app.features.progression import award_xp, record_activity, refresh_rank


def _loads(raw: str | None, default: Any) -> Any:
    return json.loads(raw) if raw else default


async def get_progress(db: AsyncSession, user: User, program_id: str) -> LearningProgress:
    row = await db.scalar(select(LearningProgress).where(LearningProgress.user_id == user.id, LearningProgress.program_id == program_id))
    if row:
        return row
    row = LearningProgress(user_id=user.id, program_id=program_id, completed="[]", errors="[]", mastery="{}", attempts="[]")
    db.add(row)
    await db.flush()
    return row


def serialize_program(program_id: str, progress: LearningProgress) -> dict[str, Any]:
    program = PROGRAMS[program_id]
    completed = _loads(progress.completed, [])
    return program_summary(program) | {"completed": completed, "mastery": _loads(progress.mastery, {}), "errors": _loads(progress.errors, []), "next_exercise": next((e["id"] for e in program["exercises"] if e["id"] not in completed), None)}


async def submit(db: AsyncSession, user: User, program_id: str, exercise_id: str, option_id: str | None, answer: str | None) -> dict[str, Any]:
    program = PROGRAMS.get(program_id)
    if not program:
        raise KeyError(program_id)
    exercise = next((e for e in program["exercises"] if e["id"] == exercise_id), None)
    if not exercise:
        raise KeyError(exercise_id)
    result = evaluate_exercise(exercise, option_id, answer)
    progress = await get_progress(db, user, program_id)
    attempts = _loads(progress.attempts, [])
    attempts.append({"exercise_id": exercise_id, "ok": result["ok"], "tags": result["tags"]})
    completed = _loads(progress.completed, [])
    if result["ok"] and exercise_id not in completed:
        completed.append(exercise_id)
        await award_xp(db, user, amount=20 if exercise["type"] in {"choice", "find_mistake"} else 40, source=f"{program_id}:{exercise_id}")
    progress.attempts = json.dumps(attempts, ensure_ascii=False)
    progress.completed = json.dumps(completed, ensure_ascii=False)
    progress.mastery = json.dumps(mastery(attempts, program["skills"]), ensure_ascii=False)
    progress.errors = json.dumps(error_summary(attempts), ensure_ascii=False)
    if result["ok"] and exercise_id in completed:
        await record_activity(db, user, "lesson")
        await refresh_rank(db, user)
    await db.commit()
    return result | {"progress": serialize_program(program_id, progress)}


async def error_training(db: AsyncSession, user: User, program_id: str) -> dict[str, Any]:
    progress = await get_progress(db, user, program_id)
    errors = _loads(progress.errors, [])
    exercises = PROGRAMS[program_id]["exercises"]
    tags = {e["tag"] for e in errors[:2]}
    selected = [e for e in exercises if any(tag.replace("missing_", "") in str(e) for tag in tags)] or exercises[:2]
    return {"errors": errors, "exercises": [public_exercise(e) for e in selected]}
