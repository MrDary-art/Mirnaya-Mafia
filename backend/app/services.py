from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.engine.llm import analyze_block, get_opponent_response
from app.engine.metrics import apply_decay, clamp, merge_option_delta
from app.engine.scenario import SCENARIOS, build_report, get_scenario, match_scenario, step_by_id
from app.models import Achievement, AppSetting, Message, Session, User

LEVELS = [
    (1, "Новичок"),
    (2, "Практик"),
    (3, "Переговорщик"),
    (4, "Мастер"),
    (5, "Гуру"),
]


def dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


def loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    return json.loads(raw)


async def count_active(db: AsyncSession, user_id: int) -> int:
    return int(
        await db.scalar(
            select(func.count()).select_from(Session).where(Session.user_id == user_id, Session.status == "active")
        )
        or 0
    )


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
    exists = await db.scalar(select(Achievement).where(Achievement.user_id == user.id, Achievement.code == code))
    if exists:
        return
    db.add(Achievement(user_id=user.id, code=code))


async def finish_session(db: AsyncSession, session: Session, user: User) -> dict[str, Any]:
    state = loads(session.state, {})
    sess_settings = loads(session.settings, {})
    scenario = await apply_admin_overrides(db, get_scenario(session.scenario_id or match_scenario(sess_settings)["id"]))
    report = build_report(scenario, state, sess_settings)
    gained = stars_for(report, state.get("history") or [])
    if sess_settings.get("hidden_goal") and report.get("hidden_goal") and report["hidden_goal"].get("ok"):
        gained += 10
    user.stars += gained
    report["stars_earned"] = gained

    history = state.get("history") or []
    if all("перебивание" not in [t.lower() for t in (h.get("techniques") or [])] for h in history):
        await unlock(db, user, "no_interrupt")
    if (sess_settings.get("tone") or "").lower() == "агрессивный" and report.get("ending_id") in {
        "win_win",
        "win",
        "process_ok",
    }:
        await unlock(db, user, "aggressive_deal")
    if sum(1 for h in history if "batna" in [t.lower() for t in (h.get("techniques") or [])]) >= 1:
        await unlock(db, user, "used_batna")

    session.status = "finished"
    session.finished_at = datetime.now(timezone.utc)
    session.verdict = report["verdict"]
    session.metrics = dumps(report["metrics"]["values"])
    session.report = dumps(report)
    state["finished"] = True
    session.state = dumps(state)
    await db.commit()
    return report


async def create_session(db: AsyncSession, user: User, raw_settings: dict[str, Any]) -> Session:
    if await count_active(db, user.id) >= settings.max_active_sessions:
        raise ValueError("Лимит: не более 10 активных сессий")
    scenario = match_scenario(raw_settings)
    scenario = await apply_admin_overrides(db, scenario)
    from app.engine.metrics import empty_state

    state = empty_state(scenario)
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
    db.add(Message(session_id=session.id, sender="opponent", text=first["opponent_line"]))
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
        "title": scenario.get("title"),
        "context": scenario.get("context"),
        "goal": sess_settings.get("goal") or scenario.get("goal"),
        "status": session.status,
        "verdict": session.verdict,
        "metrics": loads(session.metrics, {}),
        "settings": sess_settings,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "finished_at": session.finished_at.isoformat() if session.finished_at else None,
        "hidden_options": (scenario.get("hidden_goal") or {}).get("options") if sess_settings.get("hidden_goal") else None,
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

    context = (sess_settings.get("problem") or "") + " " + (scenario.get("title") or "")
    delta = merge_option_delta(option, context=context, timeout=timeout)
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

    best = max(step["options"], key=lambda o: o["metrics"]["trust"] + o["metrics"]["goal"])
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
    coach = option.get("comment")
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
    return {
        "finished": False,
        "session": serialize_session(session),
        "coach": coach,
        "metrics": state["metrics"],
    }


async def apply_free_text(db: AsyncSession, session: Session, user: User, text: str, timeout: bool) -> dict[str, Any]:
    if session.status != "active":
        raise ValueError("Сессия уже завершена")
    sess_settings = loads(session.settings, {})
    state = loads(session.state, {})
    analysis = await analyze_block(sess_settings, state, text)
    delta = {
        "trust": float(analysis.get("trust_delta") or 0),
        "goal": float(analysis.get("goal_delta") or 0),
        "control": float(analysis.get("control_delta") or 0),
        "eq": float(analysis.get("eq_delta") or 0),
    }
    if timeout:
        delta["control"] -= 2
        delta["eq"] -= 1
    state["delta_history"].append(delta)
    state["metrics"] = apply_decay(state["delta_history"])
    state["turns"] += 1
    state["history"].append(
        {
            "step_id": state.get("step_id"),
            "text": text,
            "tki": analysis.get("tki_style"),
            "techniques": analysis.get("techniques") or [],
            "comment": analysis.get("comment"),
            "delta": delta,
            "metrics_after": dict(state["metrics"]),
            "timeout": timeout,
        }
    )
    db.add(Message(session_id=session.id, sender="player", text=text, analysis=dumps(analysis)))
    reply = await get_opponent_response(sess_settings, state, text)
    db.add(Message(session_id=session.id, sender="opponent", text=reply))
    session.state = dumps(state)
    session.metrics = dumps(state["metrics"])
    await db.commit()
    await db.refresh(session)
    payload = serialize_session(session)
    payload["free_reply"] = reply
    payload["analysis"] = analysis
    return {"finished": False, "session": payload, "coach": analysis.get("comment"), "metrics": state["metrics"]}
