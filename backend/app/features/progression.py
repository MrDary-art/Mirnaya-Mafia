from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.training_tree import NODES
from app.engine.scenario import SCENARIOS
from app.models import Achievement, Session, StarTransaction, TrainingProgress, User, UserActivity, UserInventory


RANKS = {
    1: "Новичок",
    2: "Практик",
    3: "Переговорщик",
    4: "Стратег",
    5: "Мастер переговоров",
    6: "Эксперт переговоров",
}

SUCCESS_ENDINGS = {"win_win", "win", "process_ok", "goal_achieved", "partial_success", "exit"}
USEFUL_TECHNIQUES = {"активное слушание", "эмпатия", "объективные критерии", "batna", "вопросы", "структура", "spin"}
CATEGORY_NAMES = {"avatar": "Аватары", "frame": "Рамки", "theme": "Темы", "coach": "Подсказки", "scenario": "Сценарии", "challenge": "Испытания"}
FREE_AVATARS = {"avatar_analyst", "avatar_diplomat", "avatar_manager", "avatar_researcher", "avatar_mediator", "avatar_beginner"}
XP_MILESTONES = {
    250: ("Первые знания", 2, None),
    500: ("Уверенный ученик", 0, "avatar_researcher"),
    750: ("Закреплённые навыки", 3, None),
    1000: ("Знаток переговоров", 0, "frame_violet"),
    1500: ("Исследователь переговоров", 5, "avatar_analyst"),
    3000: ("Мастерство обучения", 0, "theme_research"),
}


def catalog_item(name: str, category: str, cost: int = 0, **requirements: Any) -> dict[str, Any]:
    return {"name": name, "category": category, "category_name": CATEGORY_NAMES[category], "cost": cost, "requirements": requirements}


# Codes are stable persistence keys; every player-facing name is Russian.
CATALOG = {
    "avatar_analyst": catalog_item("Аватар «Аналитик»", "avatar"),
    "avatar_diplomat": catalog_item("Аватар «Дипломат»", "avatar"),
    "avatar_manager": catalog_item("Аватар «Менеджер»", "avatar"),
    "avatar_researcher": catalog_item("Аватар «Исследователь»", "avatar"),
    "avatar_mediator": catalog_item("Аватар «Медиатор»", "avatar"),
    "avatar_beginner": catalog_item("Аватар «Стратег-новичок»", "avatar"),
    "avatar_hr": catalog_item("Аватар «Эксперт по людям»", "avatar", 8),
    "avatar_sales": catalog_item("Аватар «Мастер продаж»", "avatar", 8),
    "avatar_negotiator": catalog_item("Аватар «Переговорщик»", "avatar", 8),
    "avatar_deal": catalog_item("Аватар «Создатель сделок»", "avatar", 8),
    "avatar_speaker": catalog_item("Аватар «Спикер»", "avatar", 8),
    "avatar_consultant": catalog_item("Аватар «Консультант»", "avatar", 8),
    "avatar_observer": catalog_item("Аватар «Наблюдатель»", "avatar", 8),
    "avatar_partner": catalog_item("Аватар «Партнёр»", "avatar", 8),
    "avatar_practitioner": catalog_item("Аватар «Практик диалога»", "avatar", 8),
    "avatar_argument": catalog_item("Аватар «Аргументатор»", "avatar", 8),
    "avatar_market": catalog_item("Аватар «Знаток рынка»", "avatar", 15, min_xp=500),
    "avatar_alternative": catalog_item("Аватар «Архитектор альтернатив»", "avatar", 15, skill="batna"),
    "avatar_trust": catalog_item("Аватар «Хранитель доверия»", "avatar", 15, trust_75=5),
    "avatar_sales_leader": catalog_item("Аватар «Лидер продаж»", "avatar", 15, sales_wins=5),
    "avatar_master": catalog_item("Аватар «Мастер переговоров»", "avatar", 30, min_xp=1500, min_rank=5),
    "avatar_calm": catalog_item("Аватар «Спокойная сила»", "avatar", 20, hard_eq_90=3),
    "avatar_trust_master": catalog_item("Аватар «Мастер доверия»", "avatar", 20, trust_85=5),
    "avatar_goal_master": catalog_item("Аватар «Мастер целей»", "avatar", 20, goal_85=True, skill="batna"),
    "frame_classic": catalog_item("Рамка «Классика»", "frame"),
    "frame_minimal": catalog_item("Рамка «Минимализм»", "frame"),
    "frame_violet": catalog_item("Рамка «Фиолетовое стекло»", "frame", 5),
    "frame_cyber": catalog_item("Рамка «Кибер»", "frame", 7),
    "frame_emerald": catalog_item("Рамка «Изумруд»", "frame", 7),
    "frame_electric": catalog_item("Рамка «Электричество»", "frame", 8),
    "frame_executive": catalog_item("Рамка «Руководитель»", "frame", 10),
    "frame_neon": catalog_item("Рамка «Неон»", "frame", 12),
    "frame_ice": catalog_item("Рамка «Ледяное спокойствие»", "frame", 0, achievement="cool_head"),
    "frame_gold": catalog_item("Рамка «Золотая сделка»", "frame", 0, achievement="goal_achieved_90"),
    "frame_diplomat": catalog_item("Рамка «Дипломат»", "frame", 0, achievement="trust_guard"),
    "frame_grandmaster": catalog_item("Рамка «Грандмастер»", "frame", 0, min_rank=6),
    "theme_arena": catalog_item("Тема «Арена»", "theme"),
    "theme_slate": catalog_item("Тема «Графит»", "theme", 8),
    "theme_midnight": catalog_item("Тема «Полночь»", "theme", 10),
    "theme_aurora": catalog_item("Тема «Аврора»", "theme", 10),
    "theme_emerald": catalog_item("Тема «Изумруд»", "theme", 12),
    "theme_sunrise": catalog_item("Тема «Рассвет»", "theme", 15),
    "theme_mastery": catalog_item("Тема «Мастерство»", "theme", 20, min_rank=5),
    "theme_research": catalog_item("Тема «Исследователь переговоров»", "theme", 0, min_xp=3000),
    "coach_extra_hint": catalog_item("Дополнительная подсказка тренера", "coach", 1),
}


def loads(raw: str | None, default: Any) -> Any:
    return json.loads(raw) if raw else default


def is_success(report: dict[str, Any]) -> bool:
    return report.get("ending_id") in SUCCESS_ENDINGS


async def record_star_transaction(
    db: AsyncSession, user: User, *, amount: int, transaction_type: str, source: str, source_id: str, description: str
) -> bool:
    """Apply an idempotent currency operation and retain the resulting balance."""
    existing = await db.scalar(
        select(StarTransaction).where(
            StarTransaction.user_id == user.id,
            StarTransaction.type == transaction_type,
            StarTransaction.source == source,
            StarTransaction.source_id == source_id,
        )
    )
    if existing:
        return False
    if amount < 0 and user.stars + amount < 0:
        raise ValueError("Недостаточно звёзд")
    user.stars += amount
    db.add(
        StarTransaction(
            user_id=user.id,
            amount=amount,
            type=transaction_type,
            source=source,
            source_id=source_id,
            description=description,
            balance_after=user.stars,
        )
    )
    return True


async def unlock_achievement(db: AsyncSession, user: User, *, code: str, name: str, stars: int) -> bool:
    if await db.scalar(select(Achievement).where(Achievement.user_id == user.id, Achievement.code == code)):
        return False
    db.add(Achievement(user_id=user.id, code=code))
    await record_star_transaction(
        db, user, amount=stars, transaction_type="ACHIEVEMENT", source="achievement", source_id=code, description=f"Достижение: {name}"
    )
    return True


async def award_xp(db: AsyncSession, user: User, *, amount: int, source: str) -> list[int]:
    """Add educational experience once per caller and issue one-time milestone rewards."""
    user.xp += amount
    unlocked: list[int] = []
    for threshold, (name, stars, cosmetic) in XP_MILESTONES.items():
        if user.xp < threshold:
            continue
        if await unlock_achievement(db, user, code=f"xp_{threshold}", name=name, stars=stars):
            unlocked.append(threshold)
            if cosmetic and not await db.scalar(select(UserInventory).where(UserInventory.user_id == user.id, UserInventory.item_code == cosmetic)):
                db.add(UserInventory(user_id=user.id, item_code=cosmetic, category=CATALOG[cosmetic]["category"]))
    return unlocked


async def record_activity(db: AsyncSession, user: User, activity_type: str) -> dict[str, Any]:
    """Count one meaningful activity per day and grant each streak milestone once."""
    today = date.today()
    today_key = today.isoformat()
    row = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == today_key))
    if row:
        kinds = set(loads(row.activity_types, []))
        kinds.add(activity_type)
        row.activity_types = json.dumps(sorted(kinds), ensure_ascii=False)
        return {"streak": row.streak, "new_day": False, "milestones": []}

    week_start = today - timedelta(days=today.weekday())
    freeze_used_this_week = await db.scalar(
        select(UserActivity.id).where(
            UserActivity.user_id == user.id,
            UserActivity.date >= week_start.isoformat(),
            UserActivity.date <= today_key,
            UserActivity.freeze_used == 1,
        )
    )
    # One freeze is available during every calendar week. The stored field keeps
    # the current value visible to older clients as well.
    if not freeze_used_this_week:
        user.streak_freezes = 1
    yesterday = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == (today - timedelta(days=1)).isoformat()))
    two_days_ago = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == (today - timedelta(days=2)).isoformat()))
    freeze_used = 0
    if yesterday:
        streak = yesterday.streak + 1
    elif two_days_ago and not freeze_used_this_week:
        user.streak_freezes -= 1
        streak = two_days_ago.streak + 1
        freeze_used = 1
    else:
        streak = 1
    row = UserActivity(user_id=user.id, date=today_key, activity_types=json.dumps([activity_type], ensure_ascii=False), streak=streak, freeze_used=freeze_used)
    db.add(row)
    milestones: list[int] = []
    for days, reward in ((3, 1), (7, 3), (14, 5), (30, 10)):
        if streak == days:
            awarded = await record_star_transaction(
                db, user, amount=reward, transaction_type="STREAK", source="streak", source_id=f"{today_key}:{days}", description=f"Серия активности: {days} дней"
            )
            if awarded:
                milestones.append(days)
    if streak == 30:
        cosmetic = "frame_prism"
        if not await db.scalar(select(UserInventory).where(UserInventory.user_id == user.id, UserInventory.item_code == cosmetic)):
            db.add(UserInventory(user_id=user.id, item_code=cosmetic, category="frame"))
    row.milestones = json.dumps(milestones)
    return {"streak": streak, "new_day": True, "milestones": milestones, "freeze_used": bool(freeze_used)}


async def session_statistics(db: AsyncSession, user: User) -> dict[str, Any]:
    sessions = (await db.scalars(select(Session).where(Session.user_id == user.id, Session.status == "finished"))).all()
    reports = [loads(session.report, {}) for session in sessions]
    histories = [loads(session.state, {}).get("history", []) for session in sessions]
    values = [(report.get("metrics") or {}).get("values", loads(session.metrics, {})) for report, session in zip(reports, sessions)]
    all_ge = lambda threshold: sum(1 for item in values if item and all(item.get(key, 0) >= threshold for key in ("trust", "goal", "control", "eq")))
    techniques = [tech.lower() for history in histories for item in history for tech in item.get("techniques", [])]
    session_techniques = [{tech.lower() for item in history for tech in item.get("techniques", [])} for history in histories]
    technique_sessions = lambda name: sum(1 for item in session_techniques if name in item)
    settings = [loads(session.settings, {}) for session in sessions]
    scenarios = {session.scenario_id for session in sessions if session.scenario_id}
    roles = {session.role for session in sessions if session.role}
    conflicts = {SCENARIOS.get(session.scenario_id or "", {}).get("problem") for session in sessions if session.scenario_id}
    completed_nodes = 0
    training = await db.scalar(select(TrainingProgress).where(TrainingProgress.user_id == user.id))
    if training:
        completed_nodes = len(loads(training.completed, {}))
    base_nodes = [node for node in NODES.values() if node["type"] in {"training", "final"}]
    return {
        "sessions": len(sessions),
        "xp": user.xp,
        "wins": sum(1 for report in reports if is_success(report)),
        "trust_50": sum(1 for item in values if item.get("trust", 0) >= 50),
        "trust_75": sum(1 for item in values if item.get("trust", 0) >= 75),
        "trust_85": sum(1 for item in values if item.get("trust", 0) >= 85),
        "goal_85": any(item.get("goal", 0) >= 85 for item in values),
        "hard_eq_90": sum(1 for item, setting in zip(values, settings) if item.get("eq", 0) >= 90 and (setting.get("difficulty") or "").lower() in {"hard", "сложный", "brutal", "жёсткий"}),
        "sales_wins": sum(1 for session, report in zip(sessions, reports) if session.scenario_id == "sales_discount_01" and is_success(report)),
        "all_60": all_ge(60),
        "all_70": all_ge(70),
        "all_80": all_ge(80),
        "roles": len(roles),
        "scenarios": len(scenarios),
        "conflicts": len(conflicts),
        "harvard": any(item in {"batna", "объективные критерии", "эмпатия", "сотрудничество"} for item in techniques),
        "high_difficulty": any((item.get("difficulty") or "").lower() in {"hard", "brutal", "сложный", "жёсткий"} for item in settings),
        "training_modules": completed_nodes,
        "training_percent": round(100 * completed_nodes / len(base_nodes)) if base_nodes else 0,
        "techniques": techniques,
        "active_listening_sessions": technique_sessions("активное слушание"),
        "batna_sessions": technique_sessions("batna"),
        "interests_sessions": sum(1 for item in session_techniques if {"вопросы", "сотрудничество", "эмпатия"} & item),
        "criteria_sessions": technique_sessions("объективные критерии"),
        "sessions_rows": sessions,
        "reports": reports,
        "values": values,
    }


def requirement(label: str, value: int | bool, target: int | None, cta: str) -> dict[str, Any]:
    done = bool(value) if target is None else int(value) >= target
    return {"label": label, "value": value if target is None else f"{value} / {target}", "done": done, "cta": cta}


def rank_requirements(stats: dict[str, Any], rank: int) -> list[dict[str, Any]]:
    if rank == 2:
        return [requirement("Завершённые переговоры", stats["sessions"], 5, "Пройти сценарий"), requirement("Достигнутый опыт обучения", stats["xp"], 150, "Перейти к обучению"), requirement("Доверие ≥ 50", stats["trust_50"], 3, "Укрепить доверие"), requirement("Учебные модули", stats["training_modules"], 1, "Перейти к обучению")]
    if rank == 3:
        return [requirement("Завершённые переговоры", stats["sessions"], 15, "Пройти сценарий"), requirement("Достигнутый опыт обучения", stats["xp"], 350, "Перейти к обучению"), requirement("Успешные исходы", stats["wins"], 3, "Выбрать сценарий"), requirement("Разные роли", stats["roles"], 2, "Попробовать новую роль"), requirement("Все метрики ≥ 60", stats["all_60"] > 0, None, "Повторить тренировку")]
    if rank == 4:
        return [requirement("Завершённые переговоры", stats["sessions"], 25, "Пройти сценарий"), requirement("Достигнутый опыт обучения", stats["xp"], 600, "Перейти к обучению"), requirement("Успешные исходы", stats["wins"], 7, "Выбрать сценарий"), requirement("Разные сценарии", stats["scenarios"], 5, "Открыть новый сценарий"), requirement("Разные роли", stats["roles"], 3, "Попробовать новую роль"), requirement("Навык Гарвардского метода", stats["harvard"], None, "Изучить альтернативы"), requirement("Все метрики ≥ 70", stats["all_70"] > 0, None, "Пройти сложный сценарий")]
    if rank == 5:
        return [requirement("Завершённые переговоры", stats["sessions"], 40, "Пройти сценарий"), requirement("Достигнутый опыт обучения", stats["xp"], 900, "Перейти к обучению"), requirement("Успешные исходы", stats["wins"], 12, "Выбрать сценарий"), requirement("Разные роли", stats["roles"], 5, "Попробовать новую роль"), requirement("Разные сценарии", stats["scenarios"], 8, "Открыть новый сценарий"), requirement("Сессии со всеми метриками ≥ 70", stats["all_70"], 3, "Повторить тренировку"), requirement("Высокая сложность", stats["high_difficulty"], None, "Выбрать сложного оппонента"), requirement("Базовое дерево обучения", stats["training_percent"], 70, "Перейти к обучению")]
    if rank == 6:
        return [requirement("Завершённые переговоры", stats["sessions"], 60, "Пройти сценарий"), requirement("Достигнутый опыт обучения", stats["xp"], 1400, "Перейти к обучению"), requirement("Успешные исходы", stats["wins"], 20, "Выбрать сценарий"), requirement("Разные роли", stats["roles"], 6, "Попробовать новую роль"), requirement("Разные сценарии", stats["scenarios"], 10, "Открыть новый сценарий"), requirement("Типы конфликтов", stats["conflicts"], 3, "Выбрать новый тип конфликта"), requirement("Все метрики ≥ 80", stats["all_80"] > 0, None, "Пройти сложный сценарий"), requirement("Базовый курс", stats["training_percent"], 100, "Завершить обучение")]
    return []


async def refresh_rank(db: AsyncSession, user: User) -> dict[str, Any]:
    stats = await session_statistics(db, user)
    highest = 1
    for candidate in range(2, 7):
        if all(item["done"] for item in rank_requirements(stats, candidate)):
            highest = candidate
    user.level = max(user.level, highest)
    next_rank = min(user.level + 1, 6)
    requirements = rank_requirements(stats, next_rank) if user.level < 6 else []
    completed = sum(1 for item in requirements if item["done"])
    return {"rank": user.level, "rank_name": RANKS[user.level], "next_rank": next_rank if requirements else None, "next_rank_name": RANKS.get(next_rank), "requirements": requirements, "progress": round(100 * completed / len(requirements)) if requirements else 100, "stats": stats}


async def award_session(db: AsyncSession, user: User, session: Session, report: dict[str, Any], state: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    values = report["metrics"]["values"]
    history = state.get("history", [])
    success = is_success(report)
    critical = any(min((item.get("delta") or {}).values(), default=0) <= -4 for item in history)
    useful = any(tech.lower() in USEFUL_TECHNIQUES for item in history for tech in item.get("techniques", []))
    is_daily = bool(settings.get("daily_challenge_date"))
    prior = (await db.scalars(select(Session).where(Session.user_id == user.id, Session.status == "finished", Session.id != session.id))).all()
    same_scenario_today = sum(
        1 for item in prior
        if item.scenario_id == session.scenario_id and item.created_at and item.created_at.date() == date.today()
    )
    # Repeating the same case during one day remains useful for practice, but
    # currency falls from the normal reward to one star and then to zero.
    repeat_cap = 0 if (is_daily and settings.get("daily_repeat")) else 2 if is_daily else 1 if same_scenario_today == 1 else 0 if same_scenario_today > 1 else 4
    score = 0 if is_daily or report.get("ending_id") == "online_failed" else min(1, repeat_cap)
    if success and not settings.get("daily_repeat"):
        score = min(2, repeat_cap)
        if all(value >= 75 for value in values.values()) and not critical:
            score = min(3, repeat_cap)
        if all(value >= 80 for value in values.values()) and not critical and useful and min((item.get("metrics_after") or {}).get("trust", 100) for item in history) >= 45:
            score = min(4, repeat_cap)
    if score:
        await record_star_transaction(db, user, amount=score, transaction_type="SESSION_REWARD", source="session", source_id=str(session.id), description="Награда за завершённые переговоры")
    awarded = score
    difficulty = (settings.get("difficulty") or "medium").lower()
    bonus = 2 if difficulty in {"brutal", "жёсткий"} else 1 if difficulty in {"hard", "сложный"} else 0
    if success and bonus and not is_daily:
        await record_star_transaction(db, user, amount=bonus, transaction_type="DIFFICULTY_BONUS", source="session", source_id=str(session.id), description="Бонус за сложность")
        awarded += bonus
    if success and not is_daily and not any(item.scenario_id == session.scenario_id for item in prior):
        await record_star_transaction(db, user, amount=1, transaction_type="NEW_EXPERIENCE", source="scenario", source_id=session.scenario_id or str(session.id), description="Первый успешный сценарий")
        awarded += 1
    if success and not is_daily and not any(item.role == session.role for item in prior):
        await record_star_transaction(db, user, amount=2, transaction_type="NEW_EXPERIENCE", source="role", source_id=session.role, description="Первая успешная сессия в новой роли")
        awarded += 2
    activity = await record_activity(db, user, "daily_challenge" if is_daily else "session")
    if is_daily and success:
        today = settings["daily_challenge_date"]
        row = await db.scalar(select(UserActivity).where(UserActivity.user_id == user.id, UserActivity.date == today))
        if row:
            row.daily_challenge_completed = 1
    return {"session_stars": score, "bonus_stars": awarded - score, "total_stars": awarded, "activity": activity}


async def purchase(db: AsyncSession, user: User, item_code: str) -> dict[str, Any]:
    item = CATALOG.get(item_code)
    if not item:
        raise KeyError(item_code)
    if await db.scalar(select(UserInventory).where(UserInventory.user_id == user.id, UserInventory.item_code == item_code)):
        raise ValueError("Предмет уже получен")
    requirements = item.get("requirements", {})
    stats = await session_statistics(db, user)
    if requirements.get("min_xp", 0) > user.xp or requirements.get("min_rank", 0) > user.level:
        raise ValueError("Пока не выполнены требования для этого предмета")
    if requirements.get("skill") and requirements["skill"] not in stats["techniques"]:
        raise ValueError("Сначала подтвердите этот навык в практике")
    for key in ("trust_75", "trust_85", "sales_wins", "hard_eq_90"):
        if stats.get(key, 0) < requirements.get(key, 0):
            raise ValueError("Пока не выполнены требования для этого предмета")
    if requirements.get("goal_85") and not stats["goal_85"]:
        raise ValueError("Сначала достигните цели в успешной сессии")
    if requirements.get("achievement") and not await db.scalar(select(Achievement).where(Achievement.user_id == user.id, Achievement.code == requirements["achievement"])):
        raise ValueError("Сначала получите нужное достижение")
    if item_code in FREE_AVATARS or item["cost"] == 0:
        db.add(UserInventory(user_id=user.id, item_code=item_code, category=item["category"]))
        return item | {"code": item_code}
    await record_star_transaction(db, user, amount=-item["cost"], transaction_type="PURCHASE", source="shop", source_id=item_code, description=f"Покупка: {item['name']}")
    db.add(UserInventory(user_id=user.id, item_code=item_code, category=item["category"]))
    return item | {"code": item_code}


SESSION_ACHIEVEMENTS = {
    "first_step": ("Первый шаг", 1), "trust_guard": ("Без потери доверия", 3), "cool_head": ("Холодная голова", 3),
    "conversation_owner": ("Держу разговор", 3), "goal_achieved_90": ("Цель достигнута", 3), "role_switch": ("Смена ролей", 3),
    "chameleon": ("Хамелеон", 5), "seen_it_all": ("Видел всякое", 5), "under_pressure": ("Под давлением", 3),
    "steel_composure": ("Стальная выдержка", 5), "chaos_control": ("Контроль хаоса", 4),
    "active_listener": ("Активный слушатель", 3), "batna_master": ("Мастер BATNA", 5),
    "interest_explorer": ("Исследователь интересов", 3), "objective_case": ("Аргумент по критериям", 3),
    "learning_start": ("Учусь договариваться", 3),
}


async def evaluate_session_achievements(db: AsyncSession, user: User, session: Session, report: dict[str, Any], settings: dict[str, Any]) -> None:
    stats = await session_statistics(db, user)
    values = report["metrics"]["values"]
    success = is_success(report)
    checks = {
        "first_step": stats["sessions"] >= 1,
        "trust_guard": success and values["trust"] >= 80,
        "cool_head": values["eq"] >= 90,
        "conversation_owner": values["control"] >= 90,
        "goal_achieved_90": values["goal"] >= 90,
        "role_switch": stats["roles"] >= 3,
        "chameleon": stats["roles"] >= 5,
        "seen_it_all": stats["conflicts"] >= 5,
        "under_pressure": success and (settings.get("difficulty") or "").lower() in {"hard", "сложный"},
        "steel_composure": success and (settings.get("difficulty") or "").lower() in {"brutal", "жёсткий"} and values["eq"] >= 70,
        "chaos_control": success and bool(settings.get("chaos")),
        "active_listener": stats["active_listening_sessions"] >= 5,
        "batna_master": stats["batna_sessions"] >= 3,
        "interest_explorer": stats["interests_sessions"] >= 5,
        "objective_case": stats["criteria_sessions"] >= 5,
        "learning_start": stats["training_modules"] >= 1,
    }
    for code, ok in checks.items():
        if ok:
            name, stars = SESSION_ACHIEVEMENTS[code]
            await unlock_achievement(db, user, code=code, name=name, stars=stars)
