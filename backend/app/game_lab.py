"""Server-owned Game Lab state, branching, reports and first-completion rewards."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from weakref import WeakValueDictionary

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.game_lab import (METRICS, apply_metrics, available_choices, case_summary, get_case,
                                 get_node, get_trainer, node_text, tension_stage, trainer_summary, trainers)
from app.features.progression import record_star_transaction
from app.lab_models import LabCompletion, LabEnding, LabRun
from app.models import User

_locks: WeakValueDictionary[int, asyncio.Lock] = WeakValueDictionary()


class LabError(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message
        super().__init__(message)


def user_lock(user_id: int) -> asyncio.Lock:
    lock = _locks.get(user_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[user_id] = lock
    return lock


def dump(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return (value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def trainer_or_error(trainer_id: str) -> dict:
    try:
        return get_trainer(trainer_id)
    except (KeyError, StopIteration) as exc:
        raise LabError(404, "Тренажёр не найден") from exc


def case_or_error(trainer: dict, case_id: str) -> dict:
    try:
        return get_case(trainer, case_id)
    except StopIteration as exc:
        raise LabError(404, "Кейс не найден") from exc


async def lock_user(db: AsyncSession, user: User) -> None:
    await db.execute(update(User).where(User.id == user.id).values(stars=User.stars))
    await db.refresh(user)


def is_echo(trainer: dict) -> bool:
    return trainer.get("mode") == "echo"


def new_echo_state(case: dict) -> dict:
    return {
        "node_id": "aftermath",
        "phase": "aftermath",
        "metrics": {metric: 50 for metric in METRICS},
        "tension": 0,
        "emotion": "neutral",
        "flags": {},
        "history": [],
        "evidence_seen": [],
        "causes_traced": [],
        "intervention": None,
        "ending": None,
    }


def new_state(case: dict, trainer: dict | None = None) -> dict:
    if trainer and is_echo(trainer):
        return new_echo_state(case)
    return {
        "node_id": case["start"],
        "phase": "decision",
        "metrics": {metric: 50 for metric in METRICS},
        "tension": case.get("initial_tension", 50),
        "emotion": "neutral",
        "flags": dict(case.get("initial_flags", {})),
        "history": [],
        "response": None,
        "pending_next": None,
        "pending_finish": False,
        "techniques": [],
        "ending": None,
    }


def outcome_type(state: dict) -> str:
    metrics = state["metrics"]
    if state["flags"].get("professional_stop"):
        return "boundary"
    if (state["tension"] <= 38 and metrics["trust"] >= 64 and metrics["goal"] >= 62
            and metrics["control"] >= 60 and metrics["eq"] >= 56):
        return "steady"
    if state["tension"] >= 74 or metrics["trust"] <= 34 or metrics["goal"] <= 32:
        return "rupture"
    return "fragile"


def run_summary(run: LabRun, state: dict | None = None) -> dict:
    state = state if state is not None else json.loads(run.state)
    return {
        "id": run.id,
        "trainer_id": run.trainer_id,
        "case_id": run.case_id,
        "revision": run.revision,
        "status": run.status,
        "node_id": state["node_id"],
        "phase": state["phase"],
        "metrics": state["metrics"],
        "tension_stage": tension_stage(state["tension"], bool(state["flags"].get("professional_stop") and state["phase"] == "reaction")),
        "emotion": state.get("emotion", "neutral"),
        "turn": len(state["history"]),
        "ending": state.get("ending"),
        "updated_at": utc_iso(run.updated_at),
    }


async def progress_for(db: AsyncSession, user_id: int, trainer_id: str) -> dict[str, dict]:
    rows = (await db.scalars(select(LabRun).where(LabRun.user_id == user_id, LabRun.trainer_id == trainer_id))).all()
    return {row.case_id: run_summary(row) for row in rows}


async def catalog(db: AsyncSession, user: User) -> dict:
    result = []
    for trainer in trainers().values():
        progress = await progress_for(db, user.id, trainer["id"])
        completed = sum(item["status"] == "completed" for item in progress.values())
        result.append({**trainer_summary(trainer), "case_count": len(trainer["cases"]), "completed": completed,
                       "progress": progress})
    return {"stars": user.stars, "trainers": result}


async def detail(db: AsyncSession, user: User, trainer_id: str) -> dict:
    trainer = trainer_or_error(trainer_id)
    progress = await progress_for(db, user.id, trainer_id)
    endings = (await db.scalars(select(LabEnding).where(
        LabEnding.user_id == user.id, LabEnding.trainer_id == trainer_id))).all()
    ending_counts: dict[str, int] = {}
    for ending in endings:
        ending_counts[ending.case_id] = ending_counts.get(ending.case_id, 0) + 1
    cases = []
    for case in trainer["cases"]:
        item = case_summary(case)
        item.update(run=progress.get(case["id"]), endings_found=ending_counts.get(case["id"], 0), endings_total=4)
        cases.append(item)
    return {"stars": user.stars, "trainer": trainer_summary(trainer), "cases": cases,
            "completed": sum(item["status"] == "completed" for item in progress.values())}


async def get_run(db: AsyncSession, user_id: int, run_id: str) -> LabRun:
    run = await db.scalar(select(LabRun).where(LabRun.id == run_id, LabRun.user_id == user_id))
    if run is None:
        raise LabError(404, "Прохождение не найдено")
    return run


def scene_payload(case: dict, state: dict) -> dict | None:
    if state["phase"] == "finished":
        return None
    node = get_node(case, state["node_id"])
    if state["phase"] == "reaction":
        return {
            "id": node["id"],
            "phase": "reaction",
            "speaker": case["character"]["name"],
            "text": state["response"]["text"],
            "technique": state["response"]["technique"],
            "emotion": state["response"].get("emotion", state.get("emotion", "neutral")),
            "can_continue": True,
            "choices": [],
        }
    choices = available_choices(node, state["flags"])
    return {
        "id": node["id"],
        "phase": "decision",
        "speaker": case["character"]["name"],
        "text": node_text(node, state["flags"]),
        "prompt": "Что вы ответите?",
        "emotion": state.get("emotion", "neutral"),
        "can_continue": False,
        "choices": [{"id": item["id"], "text": item["text"]} for item in choices],
    }


def echo_payload(case: dict, state: dict) -> dict:
    """A causal archive, deliberately separate from the dialogue scene contract."""
    seen = set(state.get("evidence_seen", []))
    traced = set(state.get("causes_traced", []))
    all_evidence_seen = len(seen) == len(case["evidence"])
    all_causes_traced = len(traced) == len(case["causes"])
    selected = next((item for item in case["interventions"] if item["id"] == state.get("intervention")), None)
    evidence = []
    for item in case["evidence"]:
        opened = item["id"] in seen
        evidence.append({
            "id": item["id"], "kind": item["kind"], "title": item["title"], "time": item.get("time", ""),
            "opened": opened, "excerpt": item["excerpt"] if opened else None,
            "detail": item.get("detail") if opened else None,
        })
    causes = []
    for item in case["causes"]:
        ready = all(ref in seen for ref in item.get("evidence", []))
        complete = item["id"] in traced
        causes.append({
            "id": item["id"], "title": item["title"], "evidence": item.get("evidence", []),
            "available": ready, "traced": complete, "summary": item["summary"] if complete else None,
        })
    interventions = []
    for item in case["interventions"]:
        interventions.append({
            "id": item["id"], "title": item["title"], "description": item["description"],
            "available": all_causes_traced, "selected": item["id"] == state.get("intervention"),
        })
    return {
        "phase": state["phase"],
        "aftermath": case["aftermath"],
        "map": case.get("map", {}),
        "evidence": evidence,
        "causes": causes,
        "interventions": interventions,
        "all_evidence_seen": all_evidence_seen,
        "all_causes_traced": all_causes_traced,
        "rewritten_future": selected.get("future") if selected else None,
        "selected_intervention": selected["id"] if selected else None,
    }


def report_payload(case: dict, state: dict) -> dict | None:
    if not state.get("ending"):
        return None
    if "techniques" not in state:
        return {"outcome": state["ending"], "metrics": state["metrics"],
                "decisions": len(state["history"]), "mode": "echo"}
    counts: dict[str, int] = {}
    for technique in state["techniques"]:
        counts[technique] = counts.get(technique, 0) + 1
    used = sorted(counts.items(), key=lambda item: (-item[1], state["techniques"].index(item[0])))
    return {"outcome": state["ending"], "metrics": state["metrics"],
            "techniques": [{"name": name, "count": count} for name, count in used[:4]],
            "decisions": len(state["history"])}


async def play_payload(db: AsyncSession, user: User, run: LabRun, reward: dict | None = None) -> dict:
    trainer = trainer_or_error(run.trainer_id)
    case = case_or_error(trainer, run.case_id)
    state = json.loads(run.state)
    payload = {
        "stars": user.stars,
        "trainer": trainer_summary(trainer),
        "case": case_summary(case),
        "run": run_summary(run, state),
        "scene": None if is_echo(trainer) else scene_payload(case, state),
        "report": report_payload(case, state),
        "reward": reward or {"stars": 0, "first_completion": False},
        "total_turns": len(case.get("nodes", [])),
    }
    if is_echo(trainer):
        payload["echo"] = echo_payload(case, state)
    return payload


async def start_run(db: AsyncSession, user: User, trainer_id: str, case_id: str) -> dict:
    trainer = trainer_or_error(trainer_id)
    case = case_or_error(trainer, case_id)
    await lock_user(db, user)
    run = await db.scalar(select(LabRun).where(
        LabRun.user_id == user.id, LabRun.trainer_id == trainer_id, LabRun.case_id == case_id))
    if run is None:
        run = LabRun(id=uuid.uuid4().hex, user_id=user.id, trainer_id=trainer_id, case_id=case_id,
                     revision=0, status="active", state=dump(new_state(case, trainer)))
        db.add(run)
        await db.flush()
    return await play_payload(db, user, run)


def mutation_state(run: LabRun, revision: int, signature: dict) -> tuple[dict, bool]:
    state = json.loads(run.state)
    if revision != run.revision:
        if revision == run.revision - 1 and state.get("last_action") == {**signature, "revision": revision}:
            return state, True
        raise LabError(409, "Разговор уже изменился. Обновите прохождение и продолжите")
    return state, False


async def persist(db: AsyncSession, run: LabRun, state: dict, signature: dict, revision: int) -> None:
    result = await db.execute(update(LabRun).where(LabRun.id == run.id, LabRun.revision == revision)
                              .values(revision=revision + 1))
    if result.rowcount != 1:
        raise LabError(409, "Прохождение уже изменилось в другой вкладке")
    run.revision = revision + 1
    state["last_action"] = {**signature, "revision": revision}
    run.state = dump(state)
    run.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()


async def finish(db: AsyncSession, user: User, run: LabRun, trainer: dict, case: dict, state: dict) -> dict:
    kind = outcome_type(state)
    ending = {**case["outcomes"][kind], "type": kind}
    result_emotion = "receptive" if kind == "steady" else "escalated" if kind == "rupture" else "neutral"
    state.update(phase="finished", ending=ending, emotion=result_emotion,
                 response=None, pending_next=None, pending_finish=False)
    run.status = "completed"
    exists = await db.scalar(select(LabCompletion.id).where(
        LabCompletion.user_id == user.id, LabCompletion.trainer_id == trainer["id"], LabCompletion.case_id == case["id"]))
    first = not bool(exists)
    if first:
        db.add(LabCompletion(user_id=user.id, trainer_id=trainer["id"], case_id=case["id"]))
        await record_star_transaction(db, user, amount=trainer["reward"], transaction_type="LAB_REWARD",
                                      source="game_lab", source_id=f"{trainer['id']}:{case['id']}",
                                      description=f"Тренажёр пройден: {case['title']}")
    ending_seen = await db.scalar(select(LabEnding.id).where(
        LabEnding.user_id == user.id, LabEnding.trainer_id == trainer["id"],
        LabEnding.case_id == case["id"], LabEnding.ending_id == ending["id"]))
    if not ending_seen:
        db.add(LabEnding(user_id=user.id, trainer_id=trainer["id"], case_id=case["id"], ending_id=ending["id"]))
    return {"stars": trainer["reward"] if first else 0, "first_completion": first}


async def finish_echo(db: AsyncSession, user: User, run: LabRun, trainer: dict, case: dict, state: dict) -> dict:
    intervention = next(item for item in case["interventions"] if item["id"] == state["intervention"])
    kind = intervention["outcome"]
    ending = {**case["outcomes"][kind], "type": kind}
    state.update(phase="finished", node_id="finished", ending=ending, emotion="neutral")
    run.status = "completed"
    exists = await db.scalar(select(LabCompletion.id).where(
        LabCompletion.user_id == user.id, LabCompletion.trainer_id == trainer["id"], LabCompletion.case_id == case["id"]))
    first = not bool(exists)
    if first:
        db.add(LabCompletion(user_id=user.id, trainer_id=trainer["id"], case_id=case["id"]))
        await record_star_transaction(db, user, amount=trainer["reward"], transaction_type="LAB_REWARD",
                                      source="game_lab", source_id=f"{trainer['id']}:{case['id']}",
                                      description=f"Тренажёр пройден: {case['title']}")
    ending_seen = await db.scalar(select(LabEnding.id).where(
        LabEnding.user_id == user.id, LabEnding.trainer_id == trainer["id"],
        LabEnding.case_id == case["id"], LabEnding.ending_id == ending["id"]))
    if not ending_seen:
        db.add(LabEnding(user_id=user.id, trainer_id=trainer["id"], case_id=case["id"], ending_id=ending["id"]))
    return {"stars": trainer["reward"] if first else 0, "first_completion": first}


def echo_history(state: dict, action: str, label: str) -> None:
    state["history"].append({"action": action, "label": label})


async def act_echo(db: AsyncSession, user: User, run: LabRun, trainer: dict, case: dict, state: dict,
                   revision: int, node_id: str, choice_id: str | None, signature: dict) -> dict:
    if choice_id is None:
        raise LabError(400, "Выберите действие")
    if node_id != state["node_id"]:
        raise LabError(409, "Эта точка траектории уже изменилась")
    phase = state["phase"]
    reward = None
    if phase == "aftermath":
        if choice_id != "open-archive":
            raise LabError(400, "Сначала откройте архив события")
        state.update(phase="archive", node_id="archive")
        echo_history(state, "open_archive", "Открыт архив события")
    elif phase == "archive":
        if choice_id == "trace-causes":
            if len(state["evidence_seen"]) != len(case["evidence"]):
                raise LabError(400, "Для причинной схемы откройте все фрагменты")
            state.update(phase="trace", node_id="trace")
            echo_history(state, "open_trace", "Собрана лента событий")
        else:
            evidence = next((item for item in case["evidence"] if item["id"] == choice_id), None)
            if evidence is None:
                raise LabError(400, "Такого фрагмента нет в архиве")
            if choice_id not in state["evidence_seen"]:
                state["evidence_seen"].append(choice_id)
                echo_history(state, "open_evidence", evidence["title"])
    elif phase == "trace":
        cause = next((item for item in case["causes"] if item["id"] == choice_id), None)
        if cause is None:
            raise LabError(400, "Такой связи нет на схеме")
        if not all(item in state["evidence_seen"] for item in cause.get("evidence", [])):
            raise LabError(400, "Сначала откройте связанные фрагменты")
        if choice_id in state["causes_traced"]:
            raise LabError(400, "Эта связь уже подтверждена")
        state["causes_traced"].append(choice_id)
        echo_history(state, "trace_cause", cause["title"])
        if len(state["causes_traced"]) == len(case["causes"]):
            state.update(phase="intervention", node_id="intervention")
    elif phase == "intervention":
        intervention = next((item for item in case["interventions"] if item["id"] == choice_id), None)
        if intervention is None:
            raise LabError(400, "Такого вмешательства нет")
        if len(state["causes_traced"]) != len(case["causes"]):
            raise LabError(400, "Сначала восстановите причинную траекторию")
        state["intervention"] = choice_id
        state["metrics"] = apply_metrics(state["metrics"], intervention.get("effects"))
        state.update(phase="reveal", node_id="reveal")
        echo_history(state, "intervention", intervention["title"])
    elif phase == "reveal":
        if choice_id != "finish":
            raise LabError(400, "Сначала сравните две траектории")
        reward = await finish_echo(db, user, run, trainer, case, state)
    else:
        raise LabError(409, "Этот разбор уже завершён")
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run, reward)


async def act(db: AsyncSession, user: User, run_id: str, revision: int, node_id: str,
              choice_id: str | None) -> dict:
    await lock_user(db, user)
    run = await get_run(db, user.id, run_id)
    signature = {"kind": "act", "node_id": node_id, "choice_id": choice_id}
    state, duplicate = mutation_state(run, revision, signature)
    if duplicate:
        return await play_payload(db, user, run)
    if run.status != "active" or state["phase"] == "finished":
        raise LabError(409, "Этот разговор уже завершён")
    trainer = trainer_or_error(run.trainer_id)
    case = case_or_error(trainer, run.case_id)
    if is_echo(trainer):
        return await act_echo(db, user, run, trainer, case, state, revision, node_id, choice_id, signature)
    if node_id != state["node_id"]:
        raise LabError(409, "Эта реплика уже не является текущей")
    node = get_node(case, node_id)
    reward = None
    if state["phase"] == "decision":
        if choice_id is None:
            raise LabError(400, "Выберите ответ")
        choice = next((item for item in available_choices(node, state["flags"]) if item["id"] == choice_id), None)
        if choice is None:
            raise LabError(400, "Этот ответ сейчас недоступен")
        before = dict(state["metrics"])
        state["metrics"] = apply_metrics(state["metrics"], choice.get("effects"))
        state["tension"] = max(0, min(100, state["tension"] + choice.get("tension", 0)))
        state["flags"].update(choice.get("flags", {}))
        state["techniques"].append(choice["technique"])
        state["history"].append({"node_id": node_id, "choice_id": choice_id, "choice": choice["text"],
                                 "technique": choice["technique"], "metrics_before": before,
                                 "metrics_after": state["metrics"]})
        state.update(phase="reaction", emotion=choice["emotion"],
                     response={"text": choice["reaction"], "technique": choice["technique"],
                               "emotion": choice["emotion"]},
                     pending_next=choice.get("next"), pending_finish=bool(choice.get("finish")))
    elif state["phase"] == "reaction":
        if choice_id is not None:
            raise LabError(400, "Сначала продолжите разговор")
        if state["pending_finish"]:
            reward = await finish(db, user, run, trainer, case, state)
        else:
            state.update(node_id=state["pending_next"], phase="decision", response=None,
                         pending_next=None, pending_finish=False)
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run, reward)


async def restart(db: AsyncSession, user: User, run_id: str, revision: int) -> dict:
    await lock_user(db, user)
    run = await get_run(db, user.id, run_id)
    signature = {"kind": "restart"}
    _, duplicate = mutation_state(run, revision, signature)
    if duplicate:
        return await play_payload(db, user, run)
    trainer = trainer_or_error(run.trainer_id)
    state = new_state(case_or_error(trainer, run.case_id), trainer)
    run.status = "active"
    await persist(db, run, state, signature, revision)
    return await play_payload(db, user, run)
