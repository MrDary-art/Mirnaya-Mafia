import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.theory import LESSONS, MODULE, public_lesson
from app.models import TheoryProgress, User


async def progress_for(db: AsyncSession, user: User, lesson_id: str) -> TheoryProgress:
    progress = await db.scalar(select(TheoryProgress).where(TheoryProgress.user_id == user.id, TheoryProgress.lesson_id == lesson_id))
    if progress:
        return progress
    progress = TheoryProgress(user_id=user.id, lesson_id=lesson_id, answers="{}")
    db.add(progress)
    await db.flush()
    return progress


def serialize_progress(progress: TheoryProgress) -> dict:
    return {"status": progress.status, "current_step": progress.current_step, "theory_completed": bool(progress.theory_completed), "best_practice_score": progress.best_practice_score, "attempts": progress.attempts, "completed_at": progress.completed_at.isoformat() if progress.completed_at else None, "answered": list(json.loads(progress.answers or "{}"))}


async def catalog(db: AsyncSession, user: User) -> dict:
    lessons = []
    for lesson in LESSONS.values():
        progress = await progress_for(db, user, lesson["id"])
        lessons.append({key: lesson[key] for key in ("id", "order", "title", "subtitle", "duration_minutes")} | {"progress": serialize_progress(progress)})
    await db.commit()
    completed = sum(item["progress"]["status"] in {"completed", "mastered"} for item in lessons)
    return {"module": MODULE, "completed": completed, "total": len(lessons), "lessons": lessons}


async def lesson_detail(db: AsyncSession, user: User, lesson_id: str) -> dict:
    lesson = LESSONS[lesson_id]
    progress = await progress_for(db, user, lesson_id)
    answers = json.loads(progress.answers or "{}")
    answer_details = {}
    for exercise in lesson["practice"]:
        saved = answers.get(exercise["id"])
        if not saved:
            continue
        option = next((item for item in exercise["options"] if item["id"] == saved["option_id"]), None)
        if option:
            answer_details[exercise["id"]] = {"exercise_id": exercise["id"], "option_id": option["id"], "quality": option["quality"], "feedback": option["feedback"], "explanation": option["explanation"]}
    await db.commit()
    return public_lesson(lesson) | {"module": MODULE, "progress": serialize_progress(progress), "answered": answer_details}


async def start(db: AsyncSession, user: User, lesson_id: str) -> dict:
    progress = await progress_for(db, user, lesson_id)
    if progress.status == "completed":
        progress.answers = "{}"
        progress.current_step = 0
        progress.theory_completed = 0
    progress.status = "in_progress"
    progress.attempts += 1
    await db.commit()
    return serialize_progress(progress)


async def save_step(db: AsyncSession, user: User, lesson_id: str, current_step: int) -> dict:
    progress = await progress_for(db, user, lesson_id)
    progress.status = "in_progress" if progress.status == "not_started" else progress.status
    progress.current_step = current_step
    progress.theory_completed = int(current_step >= 4)
    await db.commit()
    return serialize_progress(progress)


async def submit_answer(db: AsyncSession, user: User, lesson_id: str, exercise_id: str, option_id: str | None) -> dict:
    lesson = LESSONS[lesson_id]
    exercise = next((item for item in lesson["practice"] if item["id"] == exercise_id), None)
    if not exercise or not option_id:
        raise ValueError("Выберите вариант ответа")
    option = next((item for item in exercise["options"] if item["id"] == option_id), None)
    if not option:
        raise ValueError("Вариант ответа не найден")
    progress = await progress_for(db, user, lesson_id)
    answers = json.loads(progress.answers or "{}")
    if exercise_id in answers:
        raise RuntimeError("Ответ уже сохранён")
    answers[exercise_id] = {"option_id": option_id, "score": option["quality"]}
    progress.answers = json.dumps(answers, ensure_ascii=False)
    progress.status = "in_progress"
    await db.commit()
    return {"exercise_id": exercise_id, "option_id": option_id, "quality": option["quality"], "feedback": option["feedback"], "explanation": option["explanation"], "progress": serialize_progress(progress)}


async def complete(db: AsyncSession, user: User, lesson_id: str) -> dict:
    progress = await progress_for(db, user, lesson_id)
    answers = json.loads(progress.answers or "{}")
    if len(answers) != len(LESSONS[lesson_id]["practice"]):
        raise ValueError("Сначала ответьте на все три задания")
    score = round(sum(item["score"] for item in answers.values()) / len(answers))
    progress.best_practice_score = max(progress.best_practice_score or 0, score)
    progress.status = "mastered" if score >= 85 else "completed"
    progress.current_step = len(LESSONS[lesson_id]["sections"]) + len(LESSONS[lesson_id]["practice"]) + 2
    progress.theory_completed = 1
    progress.completed_at = datetime.now(timezone.utc)
    await db.commit()
    label = "Уверенное понимание" if score >= 85 else "Метод понятен" if score >= 60 else "Стоит повторить"
    return {"score": score, "best_practice_score": progress.best_practice_score, "status_label": label, "progress": serialize_progress(progress)}
