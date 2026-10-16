"""Server-owned visual novel state, rewards and cross-save permanent purchases."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from weakref import WeakValueDictionary

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.serials import METRICS, episode_summary, get_episode, get_node, get_story, matches, metric_effects, stories, story_summary, target
from app.engine.serial_learning import SKILLS, is_negotiation_decision, skill_catalog
from app.features.progression import record_star_transaction
from app.models import StarTransaction, User
from app.serial_models import SerialCompletion, SerialEnding, SerialRun, SerialUnlock

_locks: WeakValueDictionary[int, asyncio.Lock] = WeakValueDictionary()


class SerialError(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message
        super().__init__(message)


def user_lock(user_id: int) -> asyncio.Lock:
    lock = _locks.get(user_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[user_id] = lock
    return lock


def dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def story_or_error(story_id: str) -> dict:
    try:
        return get_story(story_id)
    except KeyError as exc:
        raise SerialError(404, "История не найдена") from exc


async def lock_user(db: AsyncSession, user: User) -> None:
    # A real UPDATE also serializes SQLite writers (FOR UPDATE is ignored by SQLite).
    # A failed writer gets a retryable 409 at the router; no partial purchase commits.
    await db.execute(update(User).where(User.id == user.id).values(stars=User.stars))
    await db.refresh(user)


async def owned_keys(db: AsyncSession, user_id: int, story_id: str) -> set[str]:
    return set((await db.scalars(select(SerialUnlock.content_key).where(
        SerialUnlock.user_id == user_id, SerialUnlock.story_id == story_id))).all())


def new_state(story: dict) -> dict:
    episode = next(e for e in story["episodes"] if not e.get("bonus"))
    return {"episode_id": episode["id"], "node_id": episode["start"],
            "metrics": {metric: 50 for metric in METRICS}, "flags": dict(story.get("initial_flags", {})),
            "completed_episodes": [], "history": [], "worksheet": {}, "ending": None, "main_ending": None}


def run_summary(run: SerialRun, state: dict | None = None) -> dict:
    state = state if state is not None else json.loads(run.state)
    return {"id": run.id, "slot": run.slot, "revision": run.revision, "status": run.status,
            "episode_id": state["episode_id"], "node_id": state["node_id"],
            "metrics": state["metrics"], "completed_episodes": state["completed_episodes"],
            "ending": state.get("ending"), "main_ending": state.get("main_ending"),
            "updated_at": utc_iso(run.updated_at)}


async def slots(db: AsyncSession, user_id: int, story_id: str) -> list[dict]:
    rows = (await db.scalars(select(SerialRun).where(SerialRun.user_id == user_id,
                                                    SerialRun.story_id == story_id).order_by(SerialRun.slot))).all()
    return [run_summary(row) for row in rows]


async def welcome_claimed(db: AsyncSession, user_id: int) -> bool:
    return bool(await db.scalar(select(StarTransaction.id).where(
        StarTransaction.user_id == user_id, StarTransaction.type == "SERIAL_WELCOME",
        StarTransaction.source == "serial", StarTransaction.source_id == "welcome")))


async def claim_welcome(db: AsyncSession, user: User) -> dict:
    await lock_user(db, user)
    granted = await record_star_transaction(db, user, amount=5, transaction_type="SERIAL_WELCOME",
                                           source="serial", source_id="welcome", description="Добро пожаловать в Арену Сериал")
    await db.flush()
    return {"stars": user.stars, "granted": 5 if granted else 0, "welcome_claimed": True}


async def collection(db: AsyncSession, user_id: int) -> dict:
    completions = (await db.scalars(select(SerialCompletion).where(SerialCompletion.user_id == user_id))).all()
    completed = {(row.story_id, row.episode_id) for row in completions}
    complete_stories = sum(all((story["id"], episode["id"]) in completed
                               for episode in story["episodes"] if not episode.get("bonus")) for story in stories().values())
    rows = (await db.scalars(select(SerialEnding).where(SerialEnding.user_id == user_id).order_by(SerialEnding.created_at.desc(), SerialEnding.id.desc()))).all()
    endings = []
    for row in rows:
        story = stories().get(row.story_id)
        if not story:
            continue
        episode = next((e for e in story["episodes"] if e["id"] == row.episode_id), None)
        ending = next((node["ending"] for node in episode["nodes"] if node.get("ending", {}).get("id") == row.ending_id), None) if episode else None
        if ending:
            endings.append({**ending, "ending_id": row.ending_id, "story_id": row.story_id,
                            "episode_id": row.episode_id, "story_title": story["title"],
                            "episode_title": episode["title"], "cover": story.get("cover"),
                            "unlocked_at": utc_iso(row.created_at)})
    unlocks = (await db.scalars(select(SerialUnlock).where(SerialUnlock.user_id == user_id))).all()
    return {"stories_completed": complete_stories, "episodes_completed": len(completions), "endings": endings,
            "unlocks": [{"story_id": row.story_id, "content_key": row.content_key, "cost": row.cost} for row in unlocks]}


async def catalog(db: AsyncSession, user: User) -> dict:
    return {"stars": user.stars, "welcome_claimed": await welcome_claimed(db, user.id),
            "stories": [{**story_summary(story), "slots": await slots(db, user.id, story["id"])} for story in stories().values()],
            "collection": await collection(db, user.id)}


async def detail(db: AsyncSession, user: User, story_id: str) -> dict:
    story = story_or_error(story_id)
    return {"stars": user.stars, "story": story_summary(story), "slots": await slots(db, user.id, story_id),
            "collection": await collection(db, user.id)}


async def get_run(db: AsyncSession, user_id: int, run_id: str) -> SerialRun:
    run = await db.scalar(select(SerialRun).where(SerialRun.id == run_id, SerialRun.user_id == user_id))
    if run is None:
        raise SerialError(404, "Сохранение не найдено")
    return run


def episode_availability(story: dict, state: dict, episode: dict) -> tuple[bool, str | None]:
    completed = state["completed_episodes"]
    if episode["id"] in completed:
        return False, "Серия уже пройдена в этом сохранении. Начните новую историю в другом слоте"
    if episode["id"] == state["episode_id"]:
        return False, "Текущая серия"
    main = [e for e in story["episodes"] if not e.get("bonus")]
    if episode.get("bonus"):
        ready = all(e["id"] in completed for e in main)
        return ready, None if ready else "Откроется после основной истории"
    index = main.index(episode)
    ready = all(e["id"] in completed for e in main[:index]) and state["episode_id"] in completed
    return ready, None if ready else "Сначала завершите предыдущую серию"


def metric_delta(before: dict, after: dict) -> dict:
    return {key: after[key] - before[key] for key in METRICS}


def decision_feedback(episode: dict, node: dict, choice: dict, flags: dict, metrics_before: dict) -> dict | None:
    """Snapshot the chosen action and free comparisons before applying its effects."""
    learning = node.get("learning")
    if not learning or not is_negotiation_decision(node["id"]):
        return None
    alternatives = []
    for alternative in node.get("choices", []):
        if alternative["id"] == choice["id"] or alternative.get("cost") or not matches(flags, alternative.get("requires")):
            continue
        reaction = get_node(episode, alternative["next"])
        alternatives.append({"choice_id": alternative["id"], "text": alternative["text"],
                             "explanation": alternative.get("explanation", ""), "effects": alternative.get("effects", {}),
                             "projected_effects": metric_delta(metrics_before, metric_effects(metrics_before, alternative.get("effects"))),
                             "reaction": [{"speaker": line["speaker"], "text": line["text"]} for line in reaction.get("dialogue", [])]})
    return {**learning, "skill_title": SKILLS[learning["skill"]]["title"],
            "explanation": choice.get("explanation", ""), "action": choice["text"], "effects": choice.get("effects", {}),
            "node_id": node["id"], "choice_id": choice["id"], "alternatives": alternatives}


def historical_feedback(episode: dict, entry: dict) -> dict | None:
    if not is_negotiation_decision(entry.get("node_id")):
        return None
    if entry.get("feedback"):
        return entry["feedback"]
    # Older saves have no flag snapshot. Enrich only the saved action, never invent comparisons.
    node = next((candidate for candidate in episode["nodes"] if candidate["id"] == entry.get("node_id")), None)
    learning = node.get("learning") if node else None
    if not learning:
        return None
    return {**learning, "skill_title": SKILLS[learning["skill"]]["title"], "node_id": entry.get("node_id"),
            "choice_id": entry.get("choice_id"), "action": entry.get("choice", ""),
            "explanation": entry.get("explanation", ""), "effects": entry.get("effects", {}), "alternatives": []}


def practice_report(episode: dict, history: list[dict]) -> dict:
    learning = episode.get("learning", {})
    decisions = [entry for entry in history if entry.get("episode_id") == episode["id"] and entry.get("choice")
                 and is_negotiation_decision(entry.get("node_id"))]
    skill_ids = list(dict.fromkeys(learning.get("skills", [])))
    evidence: dict[str, list] = {identifier: [] for identifier in skill_ids}
    for entry in decisions:
        feedback = historical_feedback(episode, entry)
        if not feedback or feedback.get("skill") not in SKILLS:
            continue
        identifier = feedback["skill"]
        if identifier not in evidence:
            skill_ids.append(identifier)
            evidence[identifier] = []
        item = {"node_id": entry.get("node_id"), "choice_id": entry.get("choice_id"),
                "action": entry["choice"], "explanation": entry.get("explanation", ""),
                "effects": entry.get("effects", {})}
        if "applied_effects" in feedback:
            item["applied_effects"] = feedback["applied_effects"]
        evidence[identifier].append(item)
    return {"episode_id": episode["id"], "objective": learning.get("objective", ""), "decision_count": len(decisions),
            "skills": [{"id": identifier, **SKILLS[identifier], "evidence": evidence[identifier]} for identifier in skill_ids],
            "success_criteria": learning.get("success_criteria", []), "transfer": learning.get("transfer", {})}


def learning_portfolio(story: dict, state: dict) -> list[dict]:
    """Keep learning notes and evidence accessible without revealing future episodes."""
    completed = set(state["completed_episodes"])
    started = completed | {state["episode_id"]} | {entry["episode_id"] for entry in state["history"]}
    portfolio = []
    for episode in story["episodes"]:
        if episode["id"] not in started:
            continue
        worksheet = state.get("worksheet", {}).get(episode["id"], {})
        portfolio.append({"episode_id": episode["id"], "title": episode["title"],
                          "perspective": episode.get("perspective", ""), "completed": episode["id"] in completed,
                          "learning": episode.get("learning", {}), "report": practice_report(episode, state["history"]),
                          "worksheet": {"prepare": worksheet.get("prepare", {}), "reflect": worksheet.get("reflect", {})}})
    return portfolio


async def play_payload(db: AsyncSession, user: User, run: SerialRun, reward: dict | None = None) -> dict:
    story = story_or_error(run.story_id)
    state = json.loads(run.state)
    episode = get_episode(story, state["episode_id"])
    node = get_node(episode, state["node_id"])
    owned = await owned_keys(db, user.id, story["id"])
    choices = []
    for choice in node.get("choices", []):
        key = f"choice:{episode['id']}:{node['id']}:{choice['id']}"
        is_owned = not choice.get("cost") or key in owned
        available = matches(state["flags"], choice.get("requires"))
        affordable = is_owned or user.stars >= choice.get("cost", 0)
        reason = None if available and affordable else (
            "Этот выбор зависит от предыдущих решений" if not available else "Недостаточно звёзд. Основная история доступна бесплатно")
        choices.append({"id": choice["id"], "text": choice["text"], "cost": choice.get("cost", 0),
                        "owned": is_owned, "available": available, "affordable": affordable, "locked_reason": reason,
                        **({"preview": choice["preview"]} if choice.get("preview") else {})})
    scene = {key: value for key, value in node.items() if key in ("id", "title", "background", "dialogue", "ending", "music", "art", "memory", "learning")}
    scene["choices"] = choices
    episodes = []
    for candidate in story["episodes"]:
        available, reason = episode_availability(story, state, candidate)
        unlocked = not candidate.get("cost") or f"episode:{candidate['id']}" in owned
        episodes.append({**episode_summary(candidate), "available": available,
                         "completed": candidate["id"] in state["completed_episodes"], "owned": unlocked,
                         "affordable": unlocked or user.stars >= candidate.get("cost", 0), "locked_reason": reason})
    history = [entry if is_negotiation_decision(entry.get("node_id")) else
               {key: value for key, value in entry.items() if key != "feedback"} for entry in state["history"]]
    last_entry = history[-1] if history else {}
    worksheet = state.get("worksheet", {}).get(episode["id"], {})
    return {"stars": user.stars, "story": story_summary(story),
            "run": {**run_summary(run, state), "flags": state["flags"], "history": history},
            "episode": episode_summary(episode), "scene": scene, "episodes": episodes,
            "history": history, "ending": state.get("ending"),
            "worksheet": {"prepare": worksheet.get("prepare", {}), "reflect": worksheet.get("reflect", {})},
            "learning_skills": skill_catalog(), "feedback": last_entry.get("feedback") if last_entry.get("choice") else None,
            "practice_report": practice_report(episode, state["history"]),
            "learning_portfolio": learning_portfolio(story, state),
            "reward": reward or {"stars": 0, "first_completion": False}}


async def start_run(db: AsyncSession, user: User, story_id: str, slot: int) -> dict:
    story = story_or_error(story_id)
    await lock_user(db, user)
    run = await db.scalar(select(SerialRun).where(SerialRun.user_id == user.id, SerialRun.story_id == story_id, SerialRun.slot == slot))
    if run is None:
        run = SerialRun(id=uuid.uuid4().hex, user_id=user.id, story_id=story_id, slot=slot,
                        revision=0, status="active", state=dump(new_state(story)))
        db.add(run)
        await db.flush()
    return await play_payload(db, user, run)


def mutation_state(run: SerialRun, revision: int, signature: dict) -> tuple[dict, bool]:
    state = json.loads(run.state)
    if revision != run.revision:
        if revision == run.revision - 1 and state.get("last_action") == {**signature, "revision": revision}:
            return state, True
        raise SerialError(409, "История уже изменилась. Обновите сохранение и продолжите")
    return state, False


async def persist(db: AsyncSession, run: SerialRun, state: dict, signature: dict, revision: int) -> None:
    result = await db.execute(update(SerialRun).where(SerialRun.id == run.id, SerialRun.revision == revision)
                              .values(revision=revision + 1))
    if result.rowcount != 1:
        raise SerialError(409, "Сохранение уже изменилось в другой вкладке")
    run.revision = revision + 1
    state["last_action"] = {**signature, "revision": revision}
    run.state = dump(state)
    run.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()


async def purchase_unlock(db: AsyncSession, user: User, story_id: str, key: str, cost: int, title: str) -> None:
    if not cost or key in await owned_keys(db, user.id, story_id):
        return
    try:
        await record_star_transaction(db, user, amount=-cost, transaction_type="SERIAL_PURCHASE", source="serial",
                                      source_id=f"{story_id}:{key}", description=title)
    except ValueError as exc:
        raise SerialError(400, "Недостаточно звёзд. Вы можете продолжить основную историю бесплатно") from exc
    db.add(SerialUnlock(user_id=user.id, story_id=story_id, content_key=key, cost=cost))
    await db.flush()


async def finish_episode(db: AsyncSession, user: User, run: SerialRun, story: dict, episode: dict, state: dict, ending: dict) -> dict:
    if episode["id"] not in state["completed_episodes"]:
        state["completed_episodes"].append(episode["id"])
    state["ending"] = ending
    main = [e for e in story["episodes"] if not e.get("bonus")]
    main_done = all(e["id"] in state["completed_episodes"] for e in main)
    run.status = "completed" if main_done else "episode_complete"
    if not episode.get("bonus") and main_done:
        state["main_ending"] = ending
    exists = await db.scalar(select(SerialCompletion.id).where(SerialCompletion.user_id == user.id,
                            SerialCompletion.story_id == story["id"], SerialCompletion.episode_id == episode["id"]))
    first = not bool(exists)
    if first:
        db.add(SerialCompletion(user_id=user.id, story_id=story["id"], episode_id=episode["id"]))
        await record_star_transaction(db, user, amount=2, transaction_type="SERIAL_REWARD", source="serial",
                                      source_id=f"{story['id']}:{episode['id']}", description=f"Серия пройдена: {episode['title']}")
    seen = await db.scalar(select(SerialEnding.id).where(SerialEnding.user_id == user.id,
                          SerialEnding.story_id == story["id"], SerialEnding.episode_id == episode["id"], SerialEnding.ending_id == ending["id"]))
    if not seen:
        db.add(SerialEnding(user_id=user.id, story_id=story["id"], episode_id=episode["id"], ending_id=ending["id"]))
    return {"stars": 2 if first else 0, "first_completion": first}


async def act(db: AsyncSession, user: User, run_id: str, revision: int, node_id: str, choice_id: str | None) -> dict:
    await lock_user(db, user)
    run = await get_run(db, user.id, run_id)
    signature = {"kind": "act", "node_id": node_id, "choice_id": choice_id}
    state, duplicate = mutation_state(run, revision, signature)
    if duplicate:
        return await play_payload(db, user, run)
    if run.status != "active" or node_id != state["node_id"]:
        raise SerialError(409, "Эта сцена уже завершена. Обновите сохранение")
    story = story_or_error(run.story_id)
    episode = get_episode(story, state["episode_id"])
    node = get_node(episode, node_id)
    entry = {"episode_id": episode["id"], "node_id": node_id, "dialogue": node.get("dialogue", [])}
    reward = None
    if node.get("ending"):
        if choice_id is not None:
            raise SerialError(400, "В финальной сцене нет такого выбора")
        reward = await finish_episode(db, user, run, story, episode, state, node["ending"])
    elif node.get("choices"):
        choice = next((candidate for candidate in node["choices"] if candidate["id"] == choice_id), None)
        if not choice:
            raise SerialError(400, "Выберите один из предложенных вариантов")
        if not matches(state["flags"], choice.get("requires")):
            raise SerialError(400, "Этот выбор недоступен после предыдущих решений")
        feedback = decision_feedback(episode, node, choice, state["flags"], state["metrics"])
        await purchase_unlock(db, user, story["id"], f"choice:{episode['id']}:{node_id}:{choice_id}",
                              choice.get("cost", 0), f"Дополнительная сцена: {story['title']}")
        entry["metrics_before"] = dict(state["metrics"])
        state["metrics"] = metric_effects(state["metrics"], choice.get("effects"))
        entry["metrics_after"] = dict(state["metrics"])
        state["flags"].update(choice.get("flags", {}))
        state["node_id"] = choice["next"]
        entry.update(choice_id=choice_id, choice=choice["text"], effects=choice.get("effects", {}),
                     explanation=choice.get("explanation", ""), memory=choice.get("memory", ""))
        if feedback:
            feedback["applied_effects"] = metric_delta(entry["metrics_before"], entry["metrics_after"])
            entry["feedback"] = feedback
    else:
        if choice_id is not None:
            raise SerialError(400, "В этой сцене нет такого выбора")
        following = target(node, state["flags"])
        if not following:
            raise SerialError(409, "Продолжение сцены не найдено")
        state["node_id"] = following
    state["history"].append(entry)
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run, reward)


async def start_episode(db: AsyncSession, user: User, run_id: str, revision: int, episode_id: str) -> dict:
    await lock_user(db, user)
    run = await get_run(db, user.id, run_id)
    signature = {"kind": "start_episode", "episode_id": episode_id}
    state, duplicate = mutation_state(run, revision, signature)
    if duplicate:
        return await play_payload(db, user, run)
    story = story_or_error(run.story_id)
    episode = next((e for e in story["episodes"] if e["id"] == episode_id), None)
    if episode is None:
        raise SerialError(404, "Серия не найдена")
    available, reason = episode_availability(story, state, episode)
    if not available or run.status == "active":
        raise SerialError(400, reason or "Сначала завершите текущую серию")
    await purchase_unlock(db, user, story["id"], f"episode:{episode_id}", episode.get("cost", 0), f"Другая сторона: {episode['title']}")
    state.update(episode_id=episode_id, node_id=episode["start"], ending=None)
    run.status = "active"
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run)


async def restart(db: AsyncSession, user: User, run_id: str, revision: int) -> dict:
    await lock_user(db, user)
    run = await get_run(db, user.id, run_id)
    signature = {"kind": "restart"}
    _, duplicate = mutation_state(run, revision, signature)
    if duplicate:
        return await play_payload(db, user, run)
    state = new_state(story_or_error(run.story_id))
    run.status = "active"
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run)


async def save_worksheet(db: AsyncSession, user: User, run_id: str, revision: int, episode_id: str, phase: str, values: dict) -> dict:
    await lock_user(db, user)
    run = await get_run(db, user.id, run_id)
    signature = {"kind": "worksheet", "episode_id": episode_id, "phase": phase, "values": values}
    state, duplicate = mutation_state(run, revision, signature)
    if duplicate:
        return await play_payload(db, user, run)
    story = story_or_error(run.story_id)
    if not any(episode["id"] == episode_id for episode in story["episodes"]):
        raise SerialError(404, "Серия не найдена")
    if episode_id != state["episode_id"] and episode_id not in state["completed_episodes"]:
        raise SerialError(400, "Подготовка откроется, когда вы начнёте эту серию")
    if phase == "reflect" and episode_id not in state["completed_episodes"]:
        raise SerialError(400, "Сначала завершите серию, затем сохраните выводы")
    worksheet = state.setdefault("worksheet", {}).setdefault(episode_id, {})
    worksheet[phase] = values
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run)
