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
from app.engine.learning_path import LEVELS as PATH_LEVELS, level_or_none
from app.models import Achievement, AppSetting, ArenaTeamRecord, DailyChallenge, LearningAttempt, LearningProgress, Session, StarTransaction, TrainingProgress, User, UserActivity, UserInventory
from app.schemas import AdminSettingsIn, EquipmentIn
from app.services import ACHIEVEMENTS, LEVELS, STAR_COSTS, create_session, loads, serialize_session
from app.features.progression import CATALOG, RANKS, SESSION_ACHIEVEMENTS, XP_MILESTONES, purchase, rank_requirements, session_statistics

router = APIRouter(tags=["meta"])

PROFILE_STYLES = {
    "сотрудничество": ("Интегратор", "ищете взаимную выгоду и сохраняете контакт"),
    "конкуренция": ("Стратег результата", "быстро двигаете разговор к решению и держите границы"),
    "компромисс": ("Практик обмена", "видите реалистичные взаимные уступки"),
    "избегание": ("Взвешенный наблюдатель", "сначала снижаете напряжение и собираете контекст"),
    "приспособление": ("Хранитель отношений", "замечаете интересы другой стороны и поддерживаете доверие"),
}


def _profile_analysis(tki: dict[str, int], sessions: list[Session], friend_records: list[ArenaTeamRecord]) -> dict:
    ai_sessions = [session for session in sessions if session.mode == "online"]
    if len(ai_sessions) < 10:
        return {"ready": False, "ai_dialogues": len(ai_sessions), "needed": 10 - len(ai_sessions), "friend_sessions": len(friend_records), "scenario_sessions": len([s for s in sessions if s.mode == "scenario"]), "note": "ИИ-анализ появится после 10 завершённых ИИ-диалогов. До этого данные слишком малы для устойчивого вывода."}
    scores = {style: int(tki.get(style, 0)) for style in PROFILE_STYLES}
    dominant = max(scores, key=scores.get) if any(scores.values()) else "сотрудничество"
    title, trait = PROFILE_STYLES[dominant]
    metrics = {key: [] for key in ("trust", "goal", "control", "eq")}
    for session in sessions:
        values = loads(session.metrics, {})
        values = values.get("values", values) if isinstance(values, dict) else {}
        for key in metrics:
            if isinstance(values, dict) and key in values:
                metrics[key].append(float(values[key]))
    averages = {key: round(sum(values) / len(values)) for key, values in metrics.items() if values}
    weakest = min(averages, key=averages.get) if averages else None
    recommendations = {
        "trust": "В следующей тренировке начните с вопроса об интересах и кратко перефразируйте ответ оппонента.",
        "goal": "До предложения назовите измеримый результат и критерий, по которому вы оба поймёте, что договорились.",
        "control": "Заранее предложите повестку, следующий шаг и владельца действия — так разговор останется управляемым.",
        "eq": "В напряжённом моменте сделайте паузу, назовите факт без оценки и задайте уточняющий вопрос.",
    }
    return {"ready": True, "title": title, "style": dominant, "summary": f"ИИ-анализ: {title}. По всем доступным тренировкам вы обычно {trait}.", "recommendations": [recommendations[weakest]] if weakest else ["Продолжайте практику в разных сценариях, чтобы ИИ точнее выделил устойчивые паттерны."], "confidence": "устойчивый", "sessions_used": len(sessions), "ai_dialogues": len(ai_sessions), "friend_sessions": len(friend_records), "scenario_sessions": len([s for s in sessions if s.mode == "scenario"]), "note": "Вывод основан на завершённых ИИ-диалогах, сценариях и результатах практики с друзьями; это не психологический диагноз."}


def _achievement_catalog(stats: dict, unlocked: set[str]) -> list[dict]:
    entries = [
        ("first_step", "Первый шаг", "Завершите 1 переговоры", stats["sessions"], 1),
        ("role_switch", "Смена ролей", "Завершите переговоры в 3 разных ролях", stats["roles"], 3),
        ("seen_it_all", "Видел всякое", "Пройдите 5 разных сценариев", stats["scenarios"], 5),
        ("cool_head", "Холодная голова", "Достигните EQ 90 в сложном сценарии", stats["hard_eq_90"], 1),
        ("goal_achieved_90", "Цель достигнута", "Достигните цели на 90+", 1 if stats["goal_85"] else 0, 1),
        ("trust_guard", "Без потери доверия", "Завершите сессию с доверием 75+", stats["trust_75"], 1),
        ("used_batna", "Использовал BATNA", "Примените технику BATNA", stats["batna_sessions"], 1),
        ("no_interrupt", "Ни разу не перебил", "Завершите диалог без перебивания", stats["sessions"], 1),
    ]
    for threshold, (name, _stars, _cosmetic) in XP_MILESTONES.items():
        entries.append((f"xp_{threshold}", name, f"Наберите {threshold} XP", stats["xp"], threshold))
    for code, (name, _stars) in SESSION_ACHIEVEMENTS.items():
        if not any(item[0] == code for item in entries):
            entries.append((code, name, "Выполните условие в одной завершённой сессии", 1 if code in unlocked else 0, 1))
    techniques = {"активное_слушание": "активное слушание", "вопросы": "вопросы", "эмпатия": "эмпатия", "объективные_критерии": "объективные критерии", "структура": "структура", "batna": "BATNA", "spin": "SPIN"}
    for suffix, label in techniques.items():
        code = f"knowledge_applied_{suffix}"
        entries.append((code, f"Знание применено: {label}", f"Примените технику «{label}» в сценарии", 1 if code in unlocked else 0, 1))
    return [{"code": code, "name": name, "condition": condition, "current": min(current, target), "target": target, "unlocked": code in unlocked} for code, name, condition, current, target in entries]


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
    unlocked_codes = {item.code for item in ach}
    achievement_catalog = _achievement_catalog(stats, unlocked_codes)
    achievement_names = {item["code"]: item["name"] for item in achievement_catalog}
    next_rank = min(user.level + 1, 6)
    requirements = rank_requirements(stats, next_rank) if user.level < 6 else []
    rank_progress = round(100 * sum(1 for item in requirements if item["done"]) / len(requirements)) if requirements else 100
    inventory = (await db.scalars(select(UserInventory).where(UserInventory.user_id == user.id))).all()
    training_progress = await db.scalar(select(TrainingProgress).where(TrainingProgress.user_id == user.id))
    completed_nodes = json.loads(training_progress.completed) if training_progress and training_progress.completed else {}
    mastery = [{"name": NODES[node_id]["title"], "level": data.get("stars", 0)} for node_id, data in completed_nodes.items() if node_id in NODES and NODES[node_id]["type"] in {"training", "final"}]
    completed_attempts = (await db.scalars(select(LearningAttempt).where(LearningAttempt.user_id == user.id, LearningAttempt.status == "completed"))).all()
    completed_levels = {attempt.level_id for attempt in completed_attempts if attempt.level_id in {level["id"] for level in PATH_LEVELS}}
    learning_total = len(PATH_LEVELS)
    learning_completed = len(completed_levels)
    learning_percent = round(100 * learning_completed / learning_total) if learning_total else 0
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
    friend_records = (await db.scalars(select(ArenaTeamRecord).where((ArenaTeamRecord.user_a_id == user.id) | (ArenaTeamRecord.user_b_id == user.id)))).all()
    negotiation_profile = _profile_analysis(tki, sessions, friend_records)
    
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
            {"code": a.code, "name": ACHIEVEMENTS.get(a.code, {}).get("name", achievement_names.get(a.code, a.code)), "unlocked_at": a.unlocked_at.isoformat()}
            for a in ach
        ],
        "achievement_catalog": achievement_catalog,
        "metrics_chart": chart[-20:],
        "tki": tki,
        "profile": dominant,
        "negotiation_profile": negotiation_profile,
        "current_streak": current_streak,
        "unique_roles": sorted({s.role for s in sessions if s.role}),
        "unique_scenarios": sorted({s.scenario_id for s in sessions if s.scenario_id}),
        "learning_percent": learning_percent,
        "learning_completed": learning_completed,
        "learning_total": learning_total,
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
