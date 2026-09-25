import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, get_current_user
from app.db import get_db
from app.engine.scenario import SCENARIOS, list_scenarios
from app.engine.llm import gigachat_status
from app.engine.training_tree import NODES
from app.engine.learning import PROGRAMS
from app.engine.learning_path import level_or_none
from app.models import Achievement, AppSetting, DailyChallenge, LearningAttempt, LearningProgress, Session, StarTransaction, TrainingProgress, User, UserActivity, UserInventory
from app.schemas import AdminSettingsIn, EquipmentIn
from app.services import ACHIEVEMENTS, LEVELS, STAR_COSTS, create_session, loads, serialize_session
from app.features.progression import CATALOG, RANKS, purchase, rank_requirements, session_statistics

router = APIRouter(tags=["meta"])


@router.get("/admin/monthly-overview")
async def admin_monthly_overview(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    from app.engine.admin_overview import monthly_overview
    return await monthly_overview(db)


@router.get("/health")
async def health():
    return {"ok": True, "mode": "offline-ready", "gigachat": gigachat_status()}


@router.get("/history")
async def full_history(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sessions = (await db.scalars(select(Session).where(Session.user_id == user.id).order_by(Session.created_at.desc()))).all()
    courses = (await db.scalars(select(LearningProgress).where(LearningProgress.user_id == user.id).order_by(LearningProgress.updated_at.desc()))).all()
    attempts = (await db.scalars(select(LearningAttempt).where(LearningAttempt.user_id == user.id).order_by(LearningAttempt.created_at.desc()))).all()
    entries = []
    for session in sessions:
        scenario = SCENARIOS.get(session.scenario_id or "", {})
        is_finished = session.status == "finished"
        status = {"finished": "Завершены", "active": "В процессе", "stopped": "Остановлены"}.get(session.status, session.status)
        entries.append({
            "id": f"session:{session.id}", "kind": "negotiation", "session_id": session.id,
            "room_id": loads(session.settings, {}).get("room_id"),
            "title": scenario.get("title") or "Переговоры", "subtitle": f"{session.role} — {session.opponent_role}",
            "status": status, "finished": is_finished,
            "verdict": session.verdict, "date": (session.finished_at if is_finished else session.created_at).isoformat() if (session.finished_at if is_finished else session.created_at) else None,
        })
    for course in courses:
        program = PROGRAMS.get(course.program_id)
        if not program:
            continue
        completed = json.loads(course.completed or "[]")
        total = len(program["exercises"])
        entries.append({
            "id": f"course:{course.id}", "kind": "course", "program_id": course.program_id,
            "title": program["title"], "subtitle": f"Пройдено упражнений: {len(completed)} из {total}",
            "status": "Завершён" if len(completed) >= total else "Начат", "finished": len(completed) >= total,
            "date": course.updated_at.isoformat() if course.updated_at else None,
        })
    for attempt in attempts:
        level = level_or_none(attempt.level_id)
        if not level:
            continue
        answers = json.loads(attempt.answers or "[]")
        is_finished = attempt.status == "completed"
        status = {"completed": "Завершено", "active": "В процессе", "abandoned": "Прервано"}.get(attempt.status, attempt.status)
        entries.append({
            "id": f"training:{attempt.id}", "kind": "training", "attempt_id": attempt.id, "level_id": attempt.level_id,
            "title": level["title"], "subtitle": f"Глава {level['chapter_id'].replace('chapter-', '')} · Уровень {level['order']} · {len(answers)} из 4 заданий",
            "status": status, "finished": is_finished,
            "date": (attempt.completed_at or attempt.created_at).isoformat() if (attempt.completed_at or attempt.created_at) else None,
        })
    return sorted(entries, key=lambda item: item["date"] or "", reverse=True)


@router.get("/profile")
async def profile(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sessions = (await db.scalars(select(Session).where(Session.user_id == user.id, Session.status == "finished"))).all()
    ach = (await db.scalars(select(Achievement).where(Achievement.user_id == user.id))).all()
    
    today = date.today().isoformat()
    activity = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == today))
    latest_activity = activity or await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id).order_by(UserActivity.date.desc()))
    current_streak = latest_activity.streak if latest_activity else 0
    
    tki: dict[str, int] = {}
    chart = []
    for s in sessions:
        report = loads(s.report, {})
        values = (report.get("metrics") or {}).get("values") or loads(s.metrics, {})
        if values:
            chart.append({"id": s.id, "title": s.scenario_id, **values})
        for k, v in (report.get("tki_map") or {}).items():
            tki[k] = tki.get(k, 0) + int(v)
    dominant = max(tki, key=tki.get) if tki else None
    
    stats = await session_statistics(db, user)
    next_rank = min(user.level + 1, 6)
    requirements = rank_requirements(stats, next_rank) if user.level < 6 else []
    rank_progress = round(100 * sum(1 for item in requirements if item["done"]) / len(requirements)) if requirements else 100
    inventory = (await db.scalars(select(UserInventory).where(UserInventory.user_id == user.id))).all()
    training_progress = await db.scalar(select(TrainingProgress).where(TrainingProgress.user_id == user.id))
    completed_nodes = json.loads(training_progress.completed) if training_progress and training_progress.completed else {}
    mastery = [{"name": NODES[node_id]["title"], "level": data.get("stars", 0)} for node_id, data in completed_nodes.items() if node_id in NODES and NODES[node_id]["type"] in {"training", "final"}]
    transactions = (await db.scalars(select(StarTransaction).where(StarTransaction.user_id == user.id).order_by(StarTransaction.created_at.desc()).limit(12))).all()
    week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    freeze_used_this_week = await db.scalar(
        select(UserActivity.id).where(
            UserActivity.user_id == user.id,
            UserActivity.date >= week_start,
            UserActivity.date <= today,
            UserActivity.freeze_used == 1,
        )
    )
    
    return {
        "username": user.username,
        "personal": {
            "username": user.username, "first_name": user.first_name or "", "last_name": user.last_name or "", "middle_name": user.middle_name or "",
            "display_name": user.display_name or "", "title": user.title or "", "specialization": user.specialization or "",
            "about": user.about or "", "city": user.city or "",
            "profile_visibility": user.profile_visibility, "search_visibility": user.search_visibility, "messages_visibility": user.messages_visibility,
        },
        "member_since": user.created_at.date().isoformat() if user.created_at else None,
        "level": user.level,
        "level_name": RANKS.get(user.level, "Эксперт переговоров"),
        "rank": user.level,
        "rank_name": RANKS.get(user.level, "Эксперт переговоров"),
        "next_rank": next_rank if requirements else None,
        "next_rank_name": RANKS.get(next_rank) if requirements else None,
        "rank_requirements": requirements,
        "rank_progress": rank_progress,
        "stars": user.stars,
        "xp": user.xp,
        "sessions_total": len(sessions),
        "achievements": [a.code for a in ach],
        "achievement_details": [
            {"code": a.code, "name": ACHIEVEMENTS.get(a.code, {}).get("name", a.code), "unlocked_at": a.unlocked_at.isoformat()}
            for a in ach
        ],
        "metrics_chart": chart[-20:],
        "tki": tki,
        "profile": dominant,
        "current_streak": current_streak,
        "unique_roles": sorted({s.role for s in sessions if s.role}),
        "unique_scenarios": sorted({s.scenario_id for s in sessions if s.scenario_id}),
        "learning_percent": stats["training_percent"],
        "skill_mastery": mastery,
        "streak_freezes": 0 if freeze_used_this_week else 1,
        "daily_challenge": {"date": today, "completed": bool(activity and activity.daily_challenge_completed), "reward": 2, "minutes": 3},
        "cosmetics": {"avatar_code": user.avatar_code, "frame_code": user.frame_code, "profile_theme": user.profile_theme, "owned": [item.item_code for item in inventory], "catalog": [{"code": code, **item} for code, item in CATALOG.items()]},
        "star_transactions": [{"amount": item.amount, "type": item.type, "description": item.description, "balance_after": item.balance_after, "created_at": item.created_at.isoformat()} for item in transactions],
    }


@router.post("/profile/purchases/{item_code}")
async def buy_profile_item(item_code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        item = await purchase(db, user, item_code)
    except KeyError as exc:
        raise HTTPException(404, "Предмет не найден") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await db.commit()
    return {"item": item, "stars": user.stars}


@router.put("/profile/equipment")
async def equip_profile_item(body: EquipmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = CATALOG.get(body.item_code)
    if not item:
        raise HTTPException(404, "Предмет не найден")
    owned = await db.scalar(select(UserInventory).where(UserInventory.user_id == user.id, UserInventory.item_code == body.item_code))
    if not owned:
        raise HTTPException(400, "Сначала получите этот предмет")
    if item["category"] == "avatar":
        user.avatar_code = body.item_code
    elif item["category"] == "frame":
        user.frame_code = body.item_code
    elif item["category"] in {"theme", "card"}:
        user.profile_theme = body.item_code
    else:
        raise HTTPException(400, "Этот предмет нельзя экипировать")
    await db.commit()
    return {"ok": True}


def _daily_scenario_id() -> str:
    scenario_ids = sorted(SCENARIOS)
    return scenario_ids[date.today().toordinal() % len(scenario_ids)]


@router.get("/daily-challenge")
async def daily_challenge(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    today = date.today().isoformat()
    activity = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == today))
    scenario = SCENARIOS[_daily_scenario_id()]
    return {"date": today, "scenario_id": scenario["id"], "title": "Испытание дня", "brief": scenario["context"], "difficulty": "hard", "reward": 2, "minutes": 3, "completed": bool(activity and activity.daily_challenge_completed)}


@router.post("/daily-challenge/start")
async def start_daily_challenge(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    today = date.today().isoformat()
    activity = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == today))
    scenario_id = _daily_scenario_id()
    session = await create_session(db, user, {"mode": "scenario", "scenario_id": scenario_id, "preset": scenario_id, "difficulty": "hard", "daily_challenge_date": today, "daily_repeat": bool(activity and activity.daily_challenge_completed), "goal": "Испытание дня"})
    return serialize_session(session)


@router.get("/admin/settings")
async def get_admin_settings(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    row = await db.get(AppSetting, "admin")
    if not row:
        return {
            "context_overrides": {},
            "default_difficulty": "medium",
            "company_name": "Арена Переговоров",
            "briefing": "Демо-контекст для жюри: IT-компания, 180 человек.",
            "scenarios": list_scenarios(),
        }
    data = json.loads(row.value)
    data["scenarios"] = list_scenarios()
    return data


@router.put("/admin/settings")
async def put_admin_settings(body: AdminSettingsIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    row = await db.get(AppSetting, "admin")
    value = body.model_dump()
    if row:
        row.value = json.dumps(value, ensure_ascii=False)
    else:
        db.add(AppSetting(key="admin", value=json.dumps(value, ensure_ascii=False)))
    await db.commit()
    return value


@router.get("/admin/sessions")
async def admin_sessions(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin)):
    rows = (await db.scalars(select(Session).order_by(Session.created_at.desc()))).all()
    return [serialize_session(s, include_step=False) for s in rows]


@router.get("/admin/scenarios/{scenario_id}")
async def admin_scenario(scenario_id: str, _: User = Depends(get_admin)):
    return SCENARIOS[scenario_id]
