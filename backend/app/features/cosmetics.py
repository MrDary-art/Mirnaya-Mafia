"""Canonical catalog, ownership and equipment rules for profile cosmetics."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.progression import CATALOG, SESSION_ACHIEVEMENTS, session_statistics
from app.models import Achievement, User, UserActivity, UserAvatarImage, UserInventory

COSMETIC_CATEGORIES = ("avatar", "frame", "theme", "badge", "status")
DEFAULTS = {"avatar": "avatar_analyst", "frame": "frame_classic", "theme": "theme_arena"}
EQUIPMENT_FIELDS = {"avatar": "avatar_code", "frame": "frame_code", "theme": "profile_theme", "badge": "badge_code", "status": "status_code"}


def equipment(user: User) -> dict:
    def active(code: str | None, category: str) -> str | None:
        if category == "avatar" and code == "avatar_custom":
            return code
        item = CATALOG.get(code or "")
        return code if item and item["category"] == category and item.get("is_active", True) else DEFAULTS.get(category)
    return {"avatar_code": active(user.avatar_code, "avatar"),
            "frame_code": active(user.frame_code, "frame"),
            "profile_theme": active(user.profile_theme, "theme"),
            "badge_code": active(user.badge_code, "badge"),
            "status_code": active(user.status_code, "status")}


def unlock_state(item: dict, user: User, stats: dict, achievements: set[str], streak: int) -> tuple[bool, str | None]:
    requirement = item.get("requirements") or {}
    if requirement.get("min_xp", 0) > user.xp:
        return False, f"Нужно {requirement['min_xp']} XP"
    if requirement.get("min_rank", 0) > user.level:
        return False, f"Нужен ранг {requirement['min_rank']}"
    if requirement.get("achievement") and requirement["achievement"] not in achievements:
        name = SESSION_ACHIEVEMENTS.get(requirement["achievement"], (requirement["achievement"],))[0]
        return False, f"Нужно достижение «{name}»"
    if requirement.get("streak_days", 0) > streak:
        return False, f"Нужна серия {requirement['streak_days']} дней"
    if requirement.get("skill") and requirement["skill"] not in stats["techniques"]:
        return False, f"Подтвердите навык «{requirement['skill']}» в практике"
    for key, label in (("trust_75", "сессий с доверием 75+"), ("trust_85", "сессий с доверием 85+"),
                       ("sales_wins", "успешных продаж"), ("hard_eq_90", "сложных сессий с EQ 90+")):
        if stats.get(key, 0) < requirement.get(key, 0):
            return False, f"Нужно {requirement[key]} {label}"
    if requirement.get("goal_85") and not stats.get("goal_85"):
        return False, "Достигните цели 85+ в успешной сессии"
    return True, None


def item_payload(code: str, item: dict, user: User, owned: dict[str, str | None], stats: dict,
                 achievements: set[str], streak: int) -> dict:
    available, lock_reason = unlock_state(item, user, stats, achievements, streak)
    is_owned = code in owned or code in equipment(user).values()
    equipped = code in equipment(user).values()
    cost = item["cost"]
    rarity = "особый" if item.get("requirements") and not cost else "эпический" if cost >= 10 else "редкий" if cost >= 6 else "обычный"
    if equipped:
        state = "EQUIPPED"
    elif is_owned:
        state = "OWNED"
    elif not available:
        state = "LOCKED_BY_ACHIEVEMENT" if item.get("requirements", {}).get("achievement") else "LOCKED_BY_PROGRESS"
    elif cost and user.stars < cost:
        state = "CANNOT_AFFORD"
    else:
        state = "NOT_OWNED"
    return {"code": code, **item, "rarity": rarity, "is_active": item.get("is_active", True), "unlock_type": "achievement" if item.get("requirements", {}).get("achievement") else "progression" if item.get("requirements") else "purchase" if cost else "free",
            "owned": is_owned, "equipped": equipped, "obtained_at": owned.get(code), "can_afford": user.stars >= cost,
            "unlock_status": "available" if available else "locked", "lock_reason": lock_reason,
            "state": state}


async def catalog_for_user(db: AsyncSession, user: User) -> list[dict]:
    inventory = (await db.scalars(select(UserInventory).where(UserInventory.user_id == user.id))).all()
    achievements = set((await db.scalars(select(Achievement.code).where(Achievement.user_id == user.id))).all())
    streak = await db.scalar(select(UserActivity.streak).where(UserActivity.user_id == user.id).order_by(UserActivity.streak.desc()).limit(1)) or 0
    stats = await session_statistics(db, user)
    owned = {row.item_code: row.acquired_at.isoformat() if row.acquired_at else None for row in inventory}
    return [item_payload(code, item, user, owned, stats, achievements, streak)
            for code, item in CATALOG.items() if item["category"] in COSMETIC_CATEGORIES and (item.get("is_active", True) or code in owned)]


async def equip_cosmetic(db: AsyncSession, user: User, item_code: str | None, category: str | None = None) -> dict:
    if item_code is None:
        if category not in ("badge", "status"):
            raise ValueError("Снять можно только значок или статус")
        setattr(user, EQUIPMENT_FIELDS[category], None)
        return equipment(user)
    if item_code == "avatar_custom":
        if category and category != "avatar":
            raise ValueError("Тип предмета не совпадает")
        if not await db.get(UserAvatarImage, user.id):
            raise ValueError("Сначала загрузите изображение")
        user.avatar_code = item_code
        return equipment(user)
    item = CATALOG.get(item_code)
    if not item or item["category"] not in COSMETIC_CATEGORIES or not item.get("is_active", True):
        raise KeyError(item_code)
    if category and item["category"] != category:
        raise ValueError("Тип предмета не совпадает")
    owned = await db.scalar(select(UserInventory.id).where(UserInventory.user_id == user.id, UserInventory.item_code == item_code))
    if not owned and item_code not in equipment(user).values():
        raise ValueError("Сначала получите этот предмет")
    setattr(user, EQUIPMENT_FIELDS[item["category"]], item_code)
    return equipment(user)
