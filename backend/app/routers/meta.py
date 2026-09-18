import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, get_current_user
from app.db import get_db
from app.engine.scenario import SCENARIOS, list_scenarios
from app.models import Achievement, AppSetting, DailyChallenge, Session, User
from app.schemas import AdminSettingsIn
from app.services import ACHIEVEMENTS, LEVELS, STAR_COSTS, loads, serialize_session

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health():
    return {"ok": True, "mode": "offline-ready"}


@router.get("/profile")
async def profile(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sessions = (
        await db.scalars(select(Session).where(Session.user_id == user.id, Session.status == "finished"))
    ).all()
    ach = (await db.scalars(select(Achievement).where(Achievement.user_id == user.id))).all()
    
    # Получить текущий стрик
    from datetime import date, timedelta
    today = date.today().isoformat()
    challenge = await db.scalar(select(DailyChallenge).where(DailyChallenge.user_id == user.id, DailyChallenge.date == today))
    current_streak = challenge.streak if challenge else 0
    
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
    
    # Посчитать уникальные роли и сценарии для UI
    unique_roles = list(set(s.role for s in sessions if s.role))
    unique_scenarios = list(set(s.scenario_id for s in sessions if s.scenario_id))
    
    return {
        "username": user.username,
        "level": user.level,
        "level_name": LEVELS[user.level - 1][1] if user.level <= len(LEVELS) else "Гуру",
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
        "active_limit": 10,
        "current_streak": current_streak,
        "unique_roles": unique_roles,
        "unique_scenarios": unique_scenarios,
        "star_costs": STAR_COSTS,
    }


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
    rows = (await db.scalars(select(Session).order_by(Session.created_at.desc()).limit(100))).all()
    return [serialize_session(s, include_step=False) for s in rows]


@router.get("/admin/scenarios/{scenario_id}")
async def admin_scenario(scenario_id: str, _: User = Depends(get_admin)):
    return SCENARIOS[scenario_id]
