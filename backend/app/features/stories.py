"""Validated story graphs, deterministic traversal, and bounded feed projections."""

import json
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.metrics import clamp
from app.models import Friendship, User
from app.story_models import Story, StoryAttempt, StoryComment, StoryFollow, StoryLike, StorySave

METRICS = ("trust", "goal", "control", "eq")
TOPICS = [{"id": "career", "label": "Карьера"}, {"id": "clients", "label": "Клиенты"},
          {"id": "team", "label": "Команда"}]
Key = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
Delta = Annotated[int, Field(strict=True, ge=-20, le=20)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Effect(StrictModel):
    trust: Delta
    goal: Delta
    control: Delta
    eq: Delta


class Option(StrictModel):
    id: Key
    text: str = Field(min_length=1, max_length=500)
    next: Key
    effect: Effect
    explanation: str = Field(min_length=1, max_length=1000)


class Node(StrictModel):
    speaker: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=1500)
    options: list[Option] = Field(min_length=2, max_length=4)


class Role(StrictModel):
    id: Key
    label: str = Field(min_length=1, max_length=100)
    brief: str = Field(min_length=1, max_length=1000)
    start: Key


class Ending(StrictModel):
    title: str = Field(min_length=1, max_length=140)
    text: str = Field(min_length=1, max_length=1500)
    lesson: str = Field(min_length=1, max_length=1000)


class StoryGraph(StrictModel):
    roles: list[Role] = Field(min_length=1, max_length=2)
    nodes: dict[Key, Node] = Field(min_length=1, max_length=30)
    endings: dict[Key, Ending] = Field(min_length=2, max_length=30)

    @model_validator(mode="after")
    def validate_paths(self):
        if len({role.id for role in self.roles}) != len(self.roles):
            raise ValueError("Идентификаторы ролей должны быть уникальными")
        if self.nodes.keys() & self.endings.keys():
            raise ValueError("Узлы и развязки должны иметь разные идентификаторы")
        for node in self.nodes.values():
            if len({option.id for option in node.options}) != len(node.options):
                raise ValueError("Варианты в одном узле должны иметь уникальные идентификаторы")
        visited, visiting, terminals = set(), set(), {}

        def walk(key):
            if key in visiting:
                raise ValueError("История не должна содержать циклов")
            if key in visited:
                return terminals[key]
            if key in self.endings:
                visited.add(key)
                terminals[key] = {key}
                return terminals[key]
            if key not in self.nodes:
                raise ValueError("Переход ссылается на отсутствующий узел или развязку")
            visiting.add(key)
            reachable = set()
            for option in self.nodes[key].options:
                reachable.update(walk(option.next))
            visiting.remove(key)
            visited.add(key)
            terminals[key] = reachable
            return reachable

        for role in self.roles:
            if role.start not in self.nodes:
                raise ValueError("Каждая роль должна начинаться с узла диалога")
            if len(walk(role.start)) < 2:
                raise ValueError("У каждой роли должно быть хотя бы две достижимые развязки")
        if visited != set(self.nodes) | set(self.endings):
            raise ValueError("Все узлы и развязки должны быть достижимы")
        return self


class StoryIn(StrictModel):
    title: str = Field(min_length=3, max_length=140)
    hook: str = Field(min_length=10, max_length=500)
    topic: Literal["career", "clients", "team"]
    theme: Literal["mint", "amber", "violet", "sky", "rose", "copper"]
    duration_seconds: int = Field(ge=30, le=600, strict=True)
    graph: StoryGraph


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def timestamp(value) -> str | None:
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


async def blocked_ids(db: AsyncSession, user_id: int) -> set[int]:
    rows = (await db.execute(select(Friendship.user_id, Friendship.friend_id).where(
        Friendship.status == "BLOCKED", or_(Friendship.user_id == user_id, Friendship.friend_id == user_id),
    ))).all()
    return {second if first == user_id else first for first, second in rows}


def visible_clause(excluded: set[int]):
    return or_(Story.author_id.is_(None), Story.author_id.not_in(excluded))


async def get_story(db: AsyncSession, story_id: int, user: User, *, published=False) -> Story:
    story = await db.get(Story, story_id)
    if not story or (not user.is_admin and story.author_id in await blocked_ids(db, user.id)):
        raise HTTPException(404, "История не найдена")
    if story.status != "published" and (published or (story.author_id != user.id and not user.is_admin)):
        raise HTTPException(404, "История не найдена")
    return story


def author_payload(author: User | None, *, viewer_id: int, following=False) -> dict:
    if author is None:
        return {"id": None, "username": None, "display_name": "Редакция Арены", "following": False}
    # Publishing a story exposes its handle, not private profile fields.
    name = author.display_name if author.profile_visibility == "public" or author.id == viewer_id else None
    return {"id": author.id, "username": author.username, "display_name": name or author.username,
            "following": following}


async def summaries(db: AsyncSession, stories: list[Story], user: User) -> list[dict]:
    if not stories:
        return []
    ids = [row.id for row in stories]
    author_ids = {row.author_id for row in stories if row.author_id is not None}
    authors = {row.id: row for row in (await db.scalars(select(User).where(User.id.in_(author_ids)))).all()}
    following = set((await db.scalars(select(StoryFollow.author_id).where(
        StoryFollow.user_id == user.id, StoryFollow.author_id.in_(author_ids)))).all())
    counts, selected = {}, {}
    for kind, model in (("likes", StoryLike), ("comments", StoryComment), ("plays", StoryAttempt)):
        counts[kind] = dict((await db.execute(select(model.story_id, func.count()).where(
            model.story_id.in_(ids)).group_by(model.story_id))).all())
    for kind, model in (("liked", StoryLike), ("saved", StorySave)):
        selected[kind] = set((await db.scalars(select(model.story_id).where(
            model.user_id == user.id, model.story_id.in_(ids)))).all())
    return [{
        "id": row.id, "slug": row.slug, "title": row.title, "hook": row.hook,
        "topic": row.topic, "theme": row.theme, "duration_seconds": row.duration_seconds,
        "roles": [{key: role[key] for key in ("id", "label", "brief")} for role in json.loads(row.graph)["roles"]],
        "author": author_payload(authors.get(row.author_id), viewer_id=user.id, following=row.author_id in following),
        "counts": {key: values.get(row.id, 0) for key, values in counts.items()},
        "liked": row.id in selected["liked"], "saved": row.id in selected["saved"], "status": row.status,
        "moderation_note": row.moderation_note if user.is_admin or row.author_id == user.id else None,
        "created_at": timestamp(row.created_at), "published_at": timestamp(row.published_at),
    } for row in stories]


async def summary(db: AsyncSession, story: Story, user: User) -> dict:
    return (await summaries(db, [story], user))[0]


def attempt_payload(attempt: StoryAttempt) -> dict:
    graph, state = json.loads(attempt.graph), json.loads(attempt.state)
    key = state["current"]
    node = graph["nodes"].get(key)
    ending = graph["endings"].get(key)
    return {"id": attempt.id, "story_id": attempt.story_id, "role_id": attempt.role_id,
            "revision": attempt.revision, "status": attempt.status, "metrics": state["metrics"],
            "node": {"id": key, "speaker": node["speaker"], "text": node["text"],
                     "options": [{"id": option["id"], "text": option["text"]} for option in node["options"]]} if node else None,
            "history": state["history"], "ending": {"id": key, **ending} if ending else None}


def advance(attempt: StoryAttempt, node_id: str, option_id: str) -> dict:
    graph, state = json.loads(attempt.graph), json.loads(attempt.state)
    if state["current"] != node_id:
        raise HTTPException(409, "Эта реплика уже изменилась. Обновите историю")
    node = graph["nodes"][node_id]
    option = next((option for option in node["options"] if option["id"] == option_id), None)
    if option is None:
        raise HTTPException(422, "Выберите один из вариантов текущей реплики")
    before = state["metrics"]
    after = {key: clamp(before[key] + option["effect"][key]) for key in METRICS}
    state["history"].append({"speaker": node["speaker"], "text": node["text"], "choice": option["text"],
                             "explanation": option["explanation"], "delta": {key: after[key] - before[key] for key in METRICS}})
    state.update(current=option["next"], metrics=after)
    return {"state": dumps(state), "revision": attempt.revision + 1,
            "status": "finished" if option["next"] in graph["endings"] else "active",
            "finished_at": utcnow() if option["next"] in graph["endings"] else None}


async def seed_stories(db: AsyncSession) -> None:
    from app.data.stories import SEED_STORIES

    for seed in SEED_STORIES:
        value = StoryIn.model_validate({key: value for key, value in seed.items() if key != "slug"}).model_dump()
        value["graph"] = dumps(value["graph"])
        value["search_text"] = f"{value['title']} {value['hook']}".casefold()
        await db.execute(insert(Story).values(**value, slug=seed["slug"], author_id=None,
                                             status="published", published_at=utcnow()).on_conflict_do_nothing(index_elements=["slug"]))
    await db.commit()
