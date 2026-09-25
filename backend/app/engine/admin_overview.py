"""Monthly summary of recorded training results; no inferred hiring decisions."""
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean

from sqlalchemy import select
from app.models import User, Session, ArenaRoom


def data(raw):
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def industry(text):
    text = text.lower()
    groups = {"IT и разработка": ("python", "backend", "frontend", "програм", "разработ", "devops", "данных"),
              "Образование": ("учител", "педагог", "школ", "образован", "преподав"),
              "Продажи и закупки": ("продаж", "закуп", "постав", "sales"),
              "HR и управление": ("hr", "руковод", "персонал", "управлен", "менедж", "pm"),
              "Финансы": ("финанс", "бухгалт", "аудит", "эконом")}
    return next((name for name, keywords in groups.items() if any(key in text for key in keywords)), "Другие направления")


async def monthly_overview(db, now=None):
    now = now or datetime.now(timezone.utc)
    since = (now-timedelta(days=30)).replace(tzinfo=None)
    users = (await db.scalars(select(User).order_by(User.username))).all()
    sessions = (await db.scalars(select(Session).where(Session.finished_at >= since, Session.status == "finished"))).all()
    rooms = (await db.scalars(select(ArenaRoom).where(ArenaRoom.created_at >= since))).all()
    by_user = {user.id: user for user in users}
    results = defaultdict(list)
    metrics_by_user = defaultdict(list)
    active_ids = set()
    excluded_samples = 0

    def add(uid, report, context, room_id=None, session_id=None):
        nonlocal excluded_samples
        active_ids.add(uid)
        user = by_user.get(uid)
        if not user:
            return
        if user.username in {"demo", "admin"} or user.is_admin:
            excluded_samples += 1
            return
        metrics = (report.get("metrics") or {}).get("values") or {}
        if not all(isinstance(metrics.get(key), (int, float)) and not isinstance(metrics[key], bool) and 0 <= metrics[key] <= 100 for key in ("trust", "goal", "control", "eq")):
            return
        # Reuse the existing room score formula; it is an aggregate, not a new game metric.
        score = round(.5*metrics["goal"]+.3*metrics["trust"]+.2*metrics["control"])
        text = " ".join(str(context.get(key) or "") for key in ("specialization", "role", "problem", "request_text"))
        direction = industry(text or user.specialization or "")
        results[(uid, direction)].append({"score": score, "metrics": metrics, "room_id": room_id, "session_id": session_id})
        metrics_by_user[uid].append(metrics)

    for session in sessions:
        context = data(session.settings)
        if context.get("room_id"):
            continue  # Paired reports are counted once below.
        report = data(session.report)
        if not report.get("metrics"):
            report["metrics"] = {"values": data(session.metrics)}
        add(session.user_id, report, context, session_id=session.id)
    # Include rooms finished this month even if booked before this month.
    finished_rooms = (await db.scalars(select(ArenaRoom).where(ArenaRoom.finished_at >= since, ArenaRoom.status == "finished"))).all()
    for room in finished_rooms:
        state = data(room.state)
        for uid, report in state.get("reports", {}).items():
            add(int(uid), report, state, room_id=room.id)
    candidates = []
    for (uid, direction), attempts in results.items():
        user = by_user[uid]
        averages = {key: round(mean(item["metrics"][key] for item in attempts), 1) for key in ("trust", "goal", "control", "eq")}
        candidates.append({"user_id": uid, "username": user.username, "name": user.display_name or user.username,
                           "industry": direction, "specialization": user.specialization,
                           "attempts": len(attempts), "average": round(mean(item["score"] for item in attempts), 1),
                           "best": max(item["score"] for item in attempts), "metrics": averages,
                           "weakest": min(averages, key=averages.get)})
    candidates.sort(key=lambda row: (-row["average"], -row["attempts"], row["username"]))
    all_metrics = [m for values in metrics_by_user.values() for m in values]
    return {"since": since.isoformat()+"Z", "until": now.isoformat(), "days": 30,
            "total_users": len(users), "new_users": sum(bool(u.created_at and u.created_at.replace(tzinfo=None) >= since) for u in users),
            "active_users": len(active_ids), "completed_attempts": len(sessions)+sum(len(data(r.state).get("reports", {})) for r in finished_rooms)-sum(bool(data(s.settings).get("room_id")) for s in sessions),
            "bookings": len(rooms), "cancelled": sum(r.status == "cancelled" for r in rooms),
            "averages": {key: round(mean(m[key] for m in all_metrics), 1) if all_metrics else None for key in ("trust", "goal", "control", "eq")},
            "candidates": candidates, "excluded_demo_attempts": excluded_samples,
            "users": [{"id": u.id, "username": u.username, "name": u.display_name or u.username,
                       "specialization": u.specialization, "attempts": len(metrics_by_user[u.id]),
                       "sample_account": u.username in {"demo", "admin"} or bool(u.is_admin)} for u in users]}
