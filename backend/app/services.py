from __future__ import annotations

import json
import random
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone, date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.llm import get_online_turn
from app.engine.online_report import enrich_online_report
from app.engine.metrics import START_METRICS, apply_decay, clamp, merge_option_delta
from app.engine.scenario import SCENARIOS, build_report, get_scenario, match_scenario, step_by_id, get_chaos_event, CHAOS_EVENTS
from app.models import Achievement, AppSetting, ArenaRoom, DailyChallenge, Message, Session, User
from app.features.progression import SESSION_ACHIEVEMENTS, award_session, award_xp, evaluate_session_achievements, refresh_rank, unlock_achievement

LEVELS = [
    (1, "Новичок"),
    (2, "Практик"),
    (3, "Переговорщик"),
    (4, "Мастер"),
    (5, "Гуру"),
]

LEVEL_REQUIREMENTS = {
    2: {"sessions": 5, "trust_threshold": 50, "trust_count": 3},
    3: {"sessions": 15, "wins": 3, "all_metrics_above": 60},
    4: {"sessions": 30, "all_metrics_above": 70, "scenarios_count": 5},
    5: {"sessions": 50, "wins": 10, "roles_count": 3},
}

ACHIEVEMENTS = {
    "no_interrupt": {"name": "Ни разу не перебил", "stars": 2},
    "aggressive_deal": {"name": "Сделка с агрессивным клиентом", "stars": 3},
    "used_batna": {"name": "Использовал BATNA", "stars": 2},
    "batna_master": {"name": "BATNA мастер (3 раза за сессию)", "stars": 5},
    "streak_7": {"name": "Стрик 7 дней", "stars": 10},
    "perfect_session": {"name": "Идеальная сессия (все метрики >80)", "stars": 5},
    "chaos_survivor": {"name": "Выжил в хаосе", "stars": 3},
    "first_blood": {"name": "Первая победа", "stars": 2},
}
ACHIEVEMENTS.update({code: {"name": name, "stars": stars} for code, (name, stars) in SESSION_ACHIEVEMENTS.items()})

STAR_COSTS = {
    "hint": 1,
    "unlock_scenario": 3,
    "avatar_basic": 5,
    "avatar_pro": 10,
    "theme_dark": 5,
    "theme_neon": 10,
}


def dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


def loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    return json.loads(raw)


async def apply_admin_overrides(db: AsyncSession, scenario: dict[str, Any]) -> dict[str, Any]:
    row = await db.get(AppSetting, "admin")
    if not row:
        return scenario
    cfg = json.loads(row.value)
    overrides = cfg.get("context_overrides") or {}
    if scenario["id"] in overrides:
        scenario = deepcopy(scenario)
        scenario["context"] = overrides[scenario["id"]]
    return scenario


def public_step(step: dict[str, Any], ghost: bool, skill: str) -> dict[str, Any]:
    options = []
    for opt in step["options"]:
        item = {"id": opt["id"], "text": opt["text"]}
        if ghost:
            item["hint"] = opt.get("comment")
        options.append(item)
    out = {
        "id": step["id"],
        "opponent_line": step["opponent_line"],
        "options": options,
    }
    if ghost and skill != "опытный":
        out["coach"] = step.get("hint")
    return out


def stars_for(report: dict[str, Any], history: list[dict[str, Any]]) -> int:
    ending = report.get("ending_id")
    values = report["metrics"]["values"]
    win = ending in {"win_win", "win", "process_ok"}
    if not win and ending in {"exit"} and values["goal"] >= 55:
        win = True
    neg = any(
        (h.get("delta") or {}).get("trust", 0) < 0 or (h.get("delta") or {}).get("goal", 0) < 0 for h in history
    )
    if win and not neg and min(values.values()) >= 70:
        return 4
    if win and min(values.values()) > 80:
        return 3
    if win:
        return 2
    return 1


async def unlock(db: AsyncSession, user: User, code: str) -> None:
    achievement = ACHIEVEMENTS.get(code)
    if achievement:
        await unlock_achievement(db, user, code=code, name=achievement["name"], stars=achievement["stars"])


async def check_and_update_level(db: AsyncSession, user: User) -> None:
    """Keep the legacy field as the persisted career rank."""
    await refresh_rank(db, user)


async def update_daily_challenge(db: AsyncSession, user: User, completed: bool) -> None:
    """Обновить ежедневный вызов и стрик."""
    today = date.today().isoformat()
    
    challenge = await db.scalar(select(DailyChallenge).where(DailyChallenge.user_id == user.id, DailyChallenge.date == today))
    
    if not challenge:
        # Новый день - проверить вчерашний стрик
        yesterday = (date.today().timezone.utc - timedelta(days=1)).date().isoformat() if hasattr(date.today(), 'timezone') else (date.today() - __import__('datetime').timedelta(days=1)).isoformat()
        from datetime import timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        
        prev_challenge = await db.scalar(select(DailyChallenge).where(DailyChallenge.user_id == user.id, DailyChallenge.date == yesterday))
        new_streak = (prev_challenge.streak if prev_challenge and prev_challenge.completed else 0) + (1 if completed else 0)
        
        # Если пропустили день - сброс стрика (если не использовали заморозку)
        if not prev_challenge or not prev_challenge.completed:
            new_streak = 1 if completed else 0
        
        challenge = DailyChallenge(user_id=user.id, date=today, scenario_id="daily_01", completed=1 if completed else 0, streak=new_streak)
        db.add(challenge)
        
        # Достижение за стрик 7 дней
        if new_streak >= 7:
            await unlock(db, user, "streak_7")
    elif completed and not challenge.completed:
        challenge.completed = 1
        challenge.streak += 1
        if challenge.streak >= 7:
            await unlock(db, user, "streak_7")


async def finish_session(db: AsyncSession, session: Session, user: User) -> dict[str, Any]:
    state = loads(session.state, {})
    sess_settings = loads(session.settings, {})
    scenario = await apply_admin_overrides(db, get_scenario(session.scenario_id or match_scenario(sess_settings)["id"]))
    report = build_report(scenario, state, sess_settings)
    if session.mode == "online":
        report = await enrich_online_report(report, state, sess_settings)
    reward = await award_session(db, user, session, report, state, sess_settings)
    report["stars_earned"] = reward["total_stars"]
    report["star_reward"] = reward
    training_node_id = sess_settings.get("training_node_id")
    if training_node_id:
        from app.training import complete_final
        training = await complete_final(db, user, training_node_id, report["metrics"]["confidence"])
        if training:
            report["training"] = training

    session.status = "finished"
    session.finished_at = datetime.now(timezone.utc)
    session.verdict = report["verdict"]
    session.metrics = dumps(report["metrics"]["values"])
    session.report = dumps(report)
    state["finished"] = True
    session.state = dumps(state)

    history = state.get("history") or []
    applied_techniques = {tech.lower() for item in history for tech in item.get("techniques") or []}
    educational_techniques = {"активное слушание", "вопросы", "эмпатия", "объективные критерии", "структура", "batna", "spin"}
    for technique in applied_techniques & educational_techniques:
        code = f"knowledge_applied_{technique.replace(' ', '_')}"
        if await unlock_achievement(db, user, code=code, name=f"Знание применено: {technique}", stars=0):
            await award_xp(db, user, amount=20, source=code)
    if all("перебивание" not in [t.lower() for t in (h.get("techniques") or [])] for h in history):
        await unlock(db, user, "no_interrupt")
    if (sess_settings.get("tone") or "").lower() == "агрессивный" and report.get("ending_id") in {
        "win_win",
        "win",
        "process_ok",
    }:
        await unlock(db, user, "aggressive_deal")
    batna_count = sum(1 for h in history if "batna" in [t.lower() for t in (h.get("techniques") or [])])
    if batna_count >= 1:
        await unlock(db, user, "used_batna")
    if batna_count >= 3:
        await unlock(db, user, "batna_master")
    
    # Проверка идеальной сессии
    values = report["metrics"]["values"]
    if all(v > 80 for v in values.values()):
        await unlock(db, user, "perfect_session")
    
    # Проверка выживания в хаосе
    if sess_settings.get("chaos") and state.get("chaos_history") and len(state["chaos_history"]) > 0:
        await unlock(db, user, "chaos_survivor")
    
    # Первая победа
    if report.get("ending_id") in {"win_win", "win", "process_ok"}:
        existing = (await db.scalars(select(Achievement).where(Achievement.user_id == user.id, Achievement.code == "first_blood"))).all()
        if not existing:
            await unlock(db, user, "first_blood")

    await evaluate_session_achievements(db, user, session, report, sess_settings)
    await check_and_update_level(db, user)
    
    await db.commit()
    return report


async def create_session(db: AsyncSession, user: User, raw_settings: dict[str, Any]) -> Session:
    scenario = match_scenario(raw_settings)
    scenario = await apply_admin_overrides(db, scenario)
    from app.engine.metrics import empty_state

    state = empty_state(scenario)
    if raw_settings.get("mode") == "online":
        state["metrics"] = dict(START_METRICS)
    session = Session(
        user_id=user.id,
        mode=raw_settings.get("mode") or "scenario",
        role=raw_settings.get("role") or scenario["roles"]["player"],
        opponent_role=raw_settings.get("opponent_role") or scenario["roles"]["opponent"],
        scenario_id=scenario["id"],
        settings=dumps(raw_settings),
        status="active",
        metrics=dumps(state["metrics"]),
        state=dumps(state),
    )
    db.add(session)
    await db.flush()
    first = scenario["steps"][0]
    if session.mode == "online":
        name = str(raw_settings.get("display_name") or "").strip()[:60]
        greeting = f"Здравствуйте, {name}!" if name else "Здравствуйте!"
        topic = str(raw_settings.get("problem") or "").strip()[:140]
        first_line = (
            f"{greeting} Начинаем собеседование на тему «{topic}». {raw_settings['interview_questions'][0]}"
            if raw_settings.get("interview_questions") else
            f"{greeting} Я готов обсудить тему «{topic}». С чего вы предлагаете начать?"
            if topic and raw_settings.get("goal") else
            f"{greeting} Расскажите, какую ситуацию и результат вы хотите отработать."
        )
    else:
        first_line = first["opponent_line"]
    db.add(Message(session_id=session.id, sender="opponent", text=first_line))
    await db.commit()
    await db.refresh(session)
    return session


def serialize_session(session: Session, include_step: bool = True) -> dict[str, Any]:
    state = loads(session.state, {})
    sess_settings = loads(session.settings, {})
    scenario = SCENARIOS.get(session.scenario_id or "", {})
    payload: dict[str, Any] = {
        "id": session.id,
        "mode": session.mode,
        "role": session.role,
        "opponent_role": session.opponent_role,
        "scenario_id": session.scenario_id,
        "title": "Онлайн-переговоры" if session.mode == "online" else scenario.get("title"),
        "context": (sess_settings.get("problem") or "Сначала расскажите, что хотите отработать.") if session.mode == "online" else scenario.get("context"),
        "goal": sess_settings.get("goal") or ("Уточнить цель тренировки" if session.mode == "online" else scenario.get("goal")),
        "status": session.status,
        "verdict": session.verdict,
        "metrics": loads(session.metrics, {}),
        "settings": sess_settings,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "finished_at": session.finished_at.isoformat() if session.finished_at else None,
        "hidden_options": (scenario.get("hidden_goal") or {}).get("options") if sess_settings.get("hidden_goal") else None,
        "ai_provider": state.get("ai_provider") if session.mode == "online" else None,
        "ai_error": state.get("ai_error") if session.mode == "online" else None,
    }
    if include_step and session.status == "active" and scenario:
        try:
            step = step_by_id(scenario, state.get("step_id") or scenario["steps"][0]["id"])
            payload["step"] = public_step(step, bool(sess_settings.get("ghost")), sess_settings.get("skill") or "практик")
            payload["state"] = {
                "turns": state.get("turns", 0),
                "metrics": state.get("metrics"),
                "ghost_general": state.get("hints_used_in_window", 0) >= 1
                and state.get("turns", 0) > 0
                and (state.get("turns", 0) % 3 == 0),
            }
        except KeyError:
            payload["step"] = None
    return payload


async def apply_choice(
    db: AsyncSession,
    session: Session,
    user: User,
    option_id: str,
    used_hint: bool,
    timeout: bool,
) -> dict[str, Any]:
    if session.status != "active":
        raise ValueError("Сессия уже завершена")
    sess_settings = loads(session.settings, {})
    state = loads(session.state, {})
    scenario = await apply_admin_overrides(db, get_scenario(session.scenario_id))
    step = step_by_id(scenario, state["step_id"])
    option = next((o for o in step["options"] if o["id"] == option_id), None)
    if not option:
        raise ValueError("Нет такого варианта")

    delta = merge_option_delta(option, timeout=timeout)
    state["delta_history"].append(delta)
    # Сценарный режим: дельты уже калиброваны авторами, decay не пересчитываем.
    metrics = dict(state["metrics"])
    for key, val in delta.items():
        metrics[key] = clamp(metrics[key] + val)
    state["metrics"] = metrics
    state["turns"] += 1
    if timeout:
        state["timeouts"] += 1
    if "перебивание" in [t.lower() for t in option.get("techniques") or []]:
        state["interruptions"] += 1
    if "batna" in [t.lower() for t in option.get("techniques") or []]:
        state["batna_uses"] += 1

    best = max(step["options"], key=lambda o: o["effects"]["trust"] + o["effects"]["goal"])
    state["history"].append(
        {
            "step_id": step["id"],
            "option_id": option_id,
            "text": option["text"],
            "tki": option.get("tki"),
            "techniques": option.get("techniques") or [],
            "comment": option.get("comment"),
            "alternative": option.get("alternative") or (best["text"] if best["id"] != option_id else None),
            "delta": delta,
            "metrics_after": dict(state["metrics"]),
            "timeout": timeout,
            "used_hint": used_hint,
        }
    )

    if used_hint:
        state["ghost_used"] += 1
        state["hints_used_in_window"] += 1
        state["ghost_ignored"] = 0
    elif sess_settings.get("ghost"):
        state["ghost_ignored"] += 1
        if state["ghost_ignored"] >= 5:
            sess_settings["ghost"] = False
            session.settings = dumps(sess_settings)

    db.add(Message(session_id=session.id, sender="player", text=option["text"], analysis=dumps({"tki": option.get("tki"), "delta": delta})))

    nxt = option.get("next") or "end:eval"
    finished = nxt.startswith("end:")
    if finished:
        state["ending_hint"] = nxt.split(":", 1)[1] or None
    coach = option.get("comment")
    
    # Проверка на событие хаоса (только если включен режим хаоса)
    chaos_event = None
    if sess_settings.get("chaos") and not finished:
        difficulty = sess_settings.get("difficulty", "средний")
        event = get_chaos_event(state["turns"], difficulty)
        if event:
            # Сохранить событие в историю
            if "chaos_history" not in state:
                state["chaos_history"] = []
            state["chaos_history"].append({
                "event_id": event["id"],
                "turn": state["turns"],
                "title": event["text"].split(":")[0],
                "description": event["text"],
                "response": None,
            })
            chaos_event = {
                "id": event["id"],
                "title": event["text"].split(":")[0].replace("⚡ ", ""),
                "description": event["text"],
                "options": [r["text"] for r in event["response_options"]],
            }
    
    if finished:
        session.state = dumps(state)
        session.metrics = dumps(state["metrics"])
        report = await finish_session(db, session, user)
        return {"finished": True, "report": report, "coach": coach, "metrics": state["metrics"]}

    state["step_id"] = nxt
    next_step = step_by_id(scenario, nxt)
    db.add(Message(session_id=session.id, sender="opponent", text=next_step["opponent_line"]))
    session.state = dumps(state)
    session.metrics = dumps(state["metrics"])
    await db.commit()
    await db.refresh(session)
    
    result = {
        "finished": False,
        "session": serialize_session(session),
        "coach": coach,
        "metrics": state["metrics"],
    }
    if chaos_event:
        result["chaos_event"] = chaos_event
    
    return result


async def prepare_online_turn(db: AsyncSession, session: Session, user: User, text: str) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, str]]]:
    if session.status != "active":
        raise ValueError("Сессия уже завершена")
    sess_settings = loads(session.settings, {})
    if sess_settings.get("room_id"):
        room = await db.get(ArenaRoom, sess_settings["room_id"])
        room_state = loads(room.state, {}) if room else {}
        deadline = room.started_at.replace(tzinfo=timezone.utc) if room and room.started_at else None
        if not room or room.status != "active" or user.id in room_state.get("done", []) or (deadline and datetime.now(timezone.utc) >= deadline + timedelta(minutes=15)):
            raise ValueError("Время парного собеседования истекло или участник завершил попытку")
    state = loads(session.state, {})
    recent = (await db.scalars(select(Message).where(Message.session_id == session.id).order_by(Message.id.desc()).limit(7))).all()
    history = [{"sender": item.sender, "text": item.text} for item in reversed(recent)]
    history.append({"sender": "player", "text": text})
    return sess_settings, state, history


async def apply_free_text(db: AsyncSession, session: Session, user: User, text: str, timeout: bool, *, prepared_turn: dict[str, Any] | None = None) -> dict[str, Any]:
    sess_settings, state, history = await prepare_online_turn(db, session, user, text)
    turn = prepared_turn if prepared_turn is not None else await get_online_turn(sess_settings, state, text, None, history)
    analysis, reply = turn["analysis"], turn["reply"]
    state["ai_provider"] = turn["provider"]
    state["ai_error"] = turn["error"]
    delta = {
        "trust": float(analysis.get("trust_delta") or 0),
        "goal": float(analysis.get("goal_delta") or 0),
        "control": float(analysis.get("control_delta") or 0),
        "eq": float(analysis.get("eq_delta") or 0),
    }
    if timeout:
        delta["control"] -= 2
        delta["eq"] -= 1
    outcome = turn.get("outcome_signal")
    if outcome == "opponent_left":
        delta["trust"] -= 20
        delta["goal"] -= 15
        state["outcome_signal"] = outcome
    elif outcome == "agreement":
        state["outcome_signal"] = outcome
    state["delta_history"].append(delta)
    state["metrics"] = apply_decay(state["delta_history"])
    state["turns"] += 1
    state["history"].append(
        {
            "step_id": state.get("step_id"),
            "text": text,
            "reply": reply,
            "tki": analysis.get("tki_style"),
            "techniques": analysis.get("techniques") or [],
            "comment": analysis.get("comment"),
            "delta": delta,
            "metrics_after": dict(state["metrics"]),
            "timeout": timeout,
        }
    )
    db.add(Message(session_id=session.id, sender="player", text=text, analysis=dumps(analysis)))
    db.add(Message(session_id=session.id, sender="opponent", text=reply))
    session.state = dumps(state)
    session.metrics = dumps(state["metrics"])
    if outcome in {"opponent_left", "agreement"}:
        report = await finish_session(db, session, user)
        return {"finished": True, "report": report, "reply": reply, "metrics": state["metrics"]}
    await db.commit()
    await db.refresh(session)
    payload = serialize_session(session)
    payload["free_reply"] = reply
    payload["analysis"] = analysis
    return {"finished": False, "session": payload, "coach": analysis.get("comment"), "metrics": state["metrics"]}
