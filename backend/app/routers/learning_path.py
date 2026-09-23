import json
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.engine.learning_path import CHAPTERS, LEVELS, level_or_none, levels_for_chapter, snapshot_for_attempt
from app.models import LearningAttempt, User
from app.schemas import LearningPathAnswerIn

router = APIRouter(prefix="/learning-path", tags=["learning-path"])


def level_stars(score: int) -> int:
    return 3 if score >= 85 else 2 if score >= 70 else 1


def chapter_stars(score: int) -> int:
    return 5 if score >= 90 else 4 if score >= 80 else 3 if score >= 70 else 2 if score >= 60 else 1


def get_level(level_id: str) -> dict:
    level = level_or_none(level_id)
    if not level:
        raise HTTPException(404, "Уровень не найден")
    return level


def get_chapter(chapter_id: str) -> dict:
    chapter = next((item for item in CHAPTERS if item["id"] == chapter_id), None)
    if not chapter:
        raise HTTPException(404, "Глава не найдена")
    return chapter


async def best_attempts(db: AsyncSession, user_id: int) -> dict[str, LearningAttempt]:
    rows = (await db.scalars(select(LearningAttempt).where(LearningAttempt.user_id == user_id, LearningAttempt.status == "completed"))).all()
    best: dict[str, LearningAttempt] = {}
    valid = {level["id"] for level in LEVELS}
    for row in rows:
        if row.level_id in valid and (row.level_id not in best or (row.score or 0) > (best[row.level_id].score or 0)):
            best[row.level_id] = row
    return best


async def unlocked_chapter(db: AsyncSession, user_id: int, chapter_id: str) -> bool:
    chapter = get_chapter(chapter_id)
    if not chapter["prerequisite"]:
        return True
    best = await best_attempts(db, user_id)
    return all(level_id in best for level_id in get_chapter(chapter["prerequisite"])["levels"])


async def unlocked_level(db: AsyncSession, user_id: int, level_id: str) -> bool:
    level = get_level(level_id)
    if not await unlocked_chapter(db, user_id, level["chapter_id"]):
        return False
    best = await best_attempts(db, user_id)
    earlier = [item["id"] for item in levels_for_chapter(level["chapter_id"]) if item["order"] < level["order"]]
    return all(item in best for item in earlier)


def attempt_snapshot(row: LearningAttempt) -> list[dict]:
    return json.loads(row.exercise_snapshot or "[]")


def attempt_payload(row: LearningAttempt, include_exercises: bool = False) -> dict:
    payload = {"attempt_id": row.id, "level_id": row.level_id, "status": row.status, "answers": json.loads(row.answers or "[]"), "score": row.score, "stars": row.stars, "report": json.loads(row.report) if row.report else None, "completed_at": row.completed_at.isoformat() if row.completed_at else None}
    if include_exercises:
        payload["exercises"] = attempt_snapshot(row)
    return payload


def build_report(level: dict, snapshot: list[dict], answers: list[dict], score: int, stars: int) -> dict:
    strong = [answer for answer in answers if answer["quality"] == "strong"]
    improvement = [answer for answer in answers if answer["quality"] != "strong"]
    key = improvement[0] if improvement else answers[0]
    exercise = next(item for item in snapshot if item["id"] == key["exercise_id"])
    return {"score": score, "stars": stars, "skill": level["skill"], "what_worked": [answer["feedback"] for answer in strong[:3]] or ["Вы завершили уровень и сохранили структуру ответа."], "what_to_improve": [answer["feedback"] for answer in improvement[:3]], "key_moment": {"context": exercise["question"], "selected_answer": key["text"], "explanation": key["feedback"], "alternative": key["alternative"]}}


@router.get("")
async def hub(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    best = await best_attempts(db, user.id)
    result = []
    for chapter in CHAPTERS:
        ids = chapter["levels"]
        completed = sum(level_id in best for level_id in ids)
        average = round(sum((best[level_id].score or 0) for level_id in ids if level_id in best) / completed) if completed else None
        unlocked = await unlocked_chapter(db, user.id, chapter["id"])
        result.append(chapter | {"progress": completed, "total": len(ids), "score": average, "stars": chapter_stars(average) if completed == len(ids) and average is not None else 0, "status": "completed" if completed == len(ids) else "available" if unlocked else "locked"})
    return {"chapters": result, "xp": user.xp}


@router.get("/chapters/{chapter_id}")
async def chapter_path(chapter_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    chapter = get_chapter(chapter_id)
    if not await unlocked_chapter(db, user.id, chapter_id):
        raise HTTPException(403, "Глава откроется после завершения предыдущей")
    best = await best_attempts(db, user.id)
    levels = []
    for level in levels_for_chapter(chapter_id):
        best_row = best.get(level["id"])
        unlocked = await unlocked_level(db, user.id, level["id"])
        levels.append({key: value for key, value in level.items() if key != "questions"} | {"state": "mastered" if best_row and (best_row.stars or 0) == 3 else "completed" if best_row else "current" if unlocked else "locked", "best_score": best_row.score if best_row else None, "best_attempt_id": best_row.id if best_row else None, "stars": best_row.stars if best_row else 0})
    complete = all(level["id"] in best for level in levels_for_chapter(chapter_id))
    score = round(sum(best[level["id"]].score or 0 for level in levels_for_chapter(chapter_id)) / len(levels)) if complete else None
    return {"chapter": chapter, "levels": levels, "complete": complete, "score": score, "stars": chapter_stars(score) if score is not None else 0}


@router.get("/levels/{level_id}")
async def level_details(level_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    level = get_level(level_id)
    if not await unlocked_level(db, user.id, level_id):
        raise HTTPException(403, "Сначала завершите предыдущий уровень")
    best = (await best_attempts(db, user.id)).get(level_id)
    active = await db.scalar(select(LearningAttempt).where(LearningAttempt.user_id == user.id, LearningAttempt.level_id == level_id, LearningAttempt.status == "active").order_by(LearningAttempt.created_at.desc()))
    return {"level": {key: value for key, value in level.items() if key != "questions"}, "exercise_count": 4, "best_score": best.score if best else None, "best_attempt_id": best.id if best else None, "active_attempt_id": active.id if active else None, "active_answer_count": len(json.loads(active.answers or "[]")) if active else 0, "stars": best.stars if best else 0, "reward_xp": 50}


@router.post("/levels/{level_id}/attempts")
async def start(level_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    level = get_level(level_id)
    active = await db.scalar(select(LearningAttempt).where(LearningAttempt.user_id == user.id, LearningAttempt.level_id == level_id, LearningAttempt.status == "active").order_by(LearningAttempt.created_at.desc()))
    if active:
        return attempt_payload(active, include_exercises=True) | {"level": {key: value for key, value in level.items() if key != "questions"}}
    if not await unlocked_level(db, user.id, level_id):
        raise HTTPException(403, "Сначала завершите предыдущий уровень")
    snapshot = snapshot_for_attempt(level_id, random.SystemRandom().shuffle)
    row = LearningAttempt(user_id=user.id, level_id=level_id, status="active", answers="[]", exercise_snapshot=json.dumps(snapshot, ensure_ascii=False))
    db.add(row); await db.commit(); await db.refresh(row)
    return attempt_payload(row, include_exercises=True) | {"level": {key: value for key, value in level.items() if key != "questions"}}


@router.get("/attempts/{attempt_id}")
async def get_attempt(attempt_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(LearningAttempt, attempt_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Попытка не найдена")
    return attempt_payload(row, include_exercises=row.status == "active") | {"level": {key: value for key, value in get_level(row.level_id).items() if key != "questions"}}


@router.post("/attempts/{attempt_id}/answers")
async def submit_answer(attempt_id: int, payload: LearningPathAnswerIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(LearningAttempt, attempt_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Попытка не найдена")
    if row.status != "active":
        raise HTTPException(409, "Эта попытка уже завершена")
    answers, snapshot = json.loads(row.answers or "[]"), attempt_snapshot(row)
    if len(answers) >= len(snapshot):
        raise HTTPException(409, "Все ответы уже отправлены")
    exercise = snapshot[len(answers)]
    if payload.exercise_id != exercise["id"]:
        raise HTTPException(409, "Нарушен порядок упражнений")
    option = next((item for item in exercise["options"] if item["id"] == payload.option_id), None)
    if not option:
        raise HTTPException(422, "Вариант ответа не найден")
    answer = {"exercise_id": exercise["id"], "option_id": option["id"], "text": option["text"], "quality": option["quality"], "feedback": option["feedback"], "tags": option["tags"], "alternative": option["alternative"]}
    answers.append(answer); row.answers = json.dumps(answers, ensure_ascii=False)
    response = {"answer": answer, "next_index": len(answers), "finished": len(answers) == len(snapshot)}
    if response["finished"]:
        score = round(sum({"strong": 100, "acceptable": 65, "weak": 25}[answer["quality"]] for answer in answers) / len(answers))
        stars = level_stars(score); level = get_level(row.level_id); report = build_report(level, snapshot, answers, score, stars)
        prior = (await best_attempts(db, user.id)).get(row.level_id)
        row.status = "completed"; row.score = score; row.stars = stars; row.report = json.dumps(report, ensure_ascii=False); row.completed_at = datetime.now(timezone.utc)
        if not prior:
            user.xp += 50; user.stars += stars
        response |= {"report": report, "xp_earned": 0 if prior else 50}
    await db.commit()
    return response


@router.post("/attempts/{attempt_id}/exit")
async def exit_attempt(attempt_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(LearningAttempt, attempt_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Попытка не найдена")
    if row.status == "active":
        row.status = "abandoned"; await db.commit()
    return {"ok": True}


@router.get("/attempts/{attempt_id}/report")
async def report(attempt_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(LearningAttempt, attempt_id)
    if not row or row.user_id != user.id or row.status != "completed":
        raise HTTPException(404, "Отчёт не найден")
    return attempt_payload(row) | {"level": {key: value for key, value in get_level(row.level_id).items() if key != "questions"}}


@router.get("/attempts/{attempt_id}/review")
async def review(attempt_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(LearningAttempt, attempt_id)
    if not row or row.user_id != user.id or row.status != "completed":
        raise HTTPException(404, "Разбор не найден")
    answers = {answer["exercise_id"]: answer for answer in json.loads(row.answers or "[]")}
    return {"level": get_level(row.level_id), "items": [exercise | {"answer": answers.get(exercise["id"])} for exercise in attempt_snapshot(row)]}


@router.get("/chapters/{chapter_id}/summary")
async def chapter_summary(chapter_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    chapter = get_chapter(chapter_id); best = await best_attempts(db, user.id); levels = levels_for_chapter(chapter_id)
    if not all(level["id"] in best for level in levels):
        raise HTTPException(403, "Сначала завершите все уровни главы")
    score = round(sum(best[level["id"]].score or 0 for level in levels) / len(levels))
    weakest = sorted(levels, key=lambda level: best[level["id"]].score or 0)[:2]
    strongest = max(levels, key=lambda level: best[level["id"]].score or 0)
    return {"chapter": chapter, "score": score, "stars": chapter_stars(score), "levels": [{"level": {key: value for key, value in level.items() if key != "questions"}, "score": best[level["id"]].score, "stars": best[level["id"]].stars} for level in levels], "strongest_skill": strongest["skill"], "weakest_levels": [{"id": level["id"], "title": level["title"]} for level in weakest], "recommendation": "Повторите слабый уровень, затем закрепите навык в свободной практике."}
