"""Contract, narrative integrity and transactional currency tests for Arena Serial."""
import asyncio
import copy
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import serials
from app.auth import create_token
from app.db import Base, get_db
from app.engine import serials as narrative
from app.engine.serial_learning import is_negotiation_decision
from app.features.progression import record_star_transaction
from app.main import app
from app.models import StarTransaction, User
from app.serial_models import SerialCompletion, SerialEnding, SerialRun, SerialUnlock


def sample_story():
    def guide(skill):
        return {"skill": skill, "principle": "Сначала проверьте, одинаково ли вы поняли ситуацию.",
                "signal": "Собеседник говорит о последствиях решения.", "reflection": "Какой факт помог бы уточнить следующий шаг?"}
    def learning(objective, skills):
        return {"objective": objective, "role": "Участник разговора",
                "brief": {"goal": "Выяснить условия и договориться о следующем шаге", "facts": ["Встреча назначена"],
                          "constraints": ["Времени мало"], "unknowns": ["Причина изменения"], "fallback": "Перенести обсуждение"},
                "success_criteria": ["Отделить факт от предположения"], "skills": skills,
                "transfer": {"task": "Применить приём в обычном разговоре", "prompt": "Какой вопрос вы зададите?"}}
    def end(identifier, text):
        return {"id": identifier, "dialogue": [{"speaker": "narrator", "text": text}],
                "ending": {"id": identifier, "title": text, "text": text, "reflection": "Проверьте свои договорённости"}}
    return {"id": "contract_story", "title": "История", "characters": [], "cover": "school",
            "learning": {"purpose": "Разобрать наблюдаемые действия в разговоре", "skills": ["questions", "listening", "commitment"]}, "episodes": [
        {"id": "first", "title": "Первый разговор", "start": "opening", "cost": 0,
         "learning": learning("Проверить предположения", ["questions", "listening"]), "nodes": [
            {"id": "opening", "background": "school", "learning": guide("questions"), "dialogue": [{"speaker": "you", "text": "Давай поговорим"}], "choices": [
                {"id": "public", "text": "Обсудить вместе", "next": "dispatch", "flags": {"route": "public", "agreed": True},
                 "effects": {"trust": 90, "goal": -90}, "explanation": "Общий разговор позволяет сверить известные факты."},
                {"id": "quiet", "text": "Поговорить отдельно", "next": "dispatch", "flags": {"route": "quiet"}, "effects": {"eq": 5},
                 "explanation": "Разговор наедине меняет условия обсуждения."},
                {"id": "extra", "text": "Зайти на репетицию", "next": "premium", "cost": 3, "explanation": "Объяснение дополнительной платной сцены"},
                {"id": "gated", "text": "Позвать Леру", "next": "dispatch", "requires": {"agreed": True}}]},
            {"id": "premium", "learning": guide("listening"), "dialogue": [{"speaker": "narrator", "text": "Новая сцена"}], "choices": [
                {"id": "listen", "text": "Выслушать", "next": "dispatch", "flags": {"route": "public"}, "effects": {"trust": 2}}]},
            {"id": "dispatch", "dialogue": [{"speaker": "narrator", "text": "Последствия"}],
             "branches": [{"when": {"route": "public"}, "next": "together"}], "next": "apart"},
            end("together", "Общий разговор"), end("apart", "Разговор наедине")]},
        {"id": "second", "title": "Договорённость", "start": "promise", "learning": learning("Зафиксировать следующий шаг", ["commitment"]), "nodes": [
            {"id": "promise", "learning": guide("commitment"), "dialogue": [{"speaker": "you", "text": "Что дальше?"}], "choices": [
                {"id": "agree", "text": "Согласовать", "next": "final"}]}, end("final", "Договорились")]},
        {"id": "other_side", "title": "Другая сторона", "bonus": True, "cost": 5, "start": "parent", "nodes": [
            {"id": "parent", "dialogue": [{"speaker": "you", "text": "Я вижу ситуацию иначе"}], "next": "perspective"},
            end("perspective", "Услышать друг друга")]},
    ]}


@pytest.fixture
def serial_client(tmp_path, monkeypatch):
    story = sample_story()
    narrative.validate_story(story)
    monkeypatch.setattr(narrative, "stories", lambda: {story["id"]: story})
    monkeypatch.setattr(serials, "stories", lambda: {story["id"]: story})
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'serials.sqlite').as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([User(id=9201, username="serial-one", password_hash="unused", stars=5),
                        User(id=9202, username="serial-two", password_hash="unused", stars=0)])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_token(9201, 'serial-one')}"}
    other = {"Authorization": f"Bearer {create_token(9202, 'serial-two')}"}
    try:
        yield client, headers, other, factory
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def start(client, headers, slot=1):
    response = client.post("/api/serials/contract_story/runs", headers=headers, json={"slot": slot})
    assert response.status_code == 200, response.text
    return response.json()


def action(client, headers, payload, choice=None, expected=200):
    body = {"revision": payload["run"]["revision"], "node_id": payload["scene"]["id"]}
    if choice is not None:
        body["choice_id"] = choice
    response = client.post(f"/api/serials/runs/{payload['run']['id']}/act", headers=headers, json=body)
    assert response.status_code == expected, response.text
    return response.json()


def finish_first(client, headers, payload, choice="quiet"):
    payload = action(client, headers, payload, choice)
    payload = action(client, headers, payload)
    return action(client, headers, payload)


def next_episode(client, headers, payload, episode):
    response = client.post(f"/api/serials/runs/{payload['run']['id']}/episodes/{episode}/start", headers=headers,
                           json={"revision": payload["run"]["revision"]})
    assert response.status_code == 200, response.text
    return response.json()


def test_auth_slots_persistence_and_server_owned_contract(serial_client):
    client, headers, other, _ = serial_client
    assert client.get("/api/serials").status_code == 401
    assert client.get("/api/serials/unknown", headers=headers).status_code == 404
    catalog = client.get("/api/serials", headers=headers).json()
    assert catalog["stars"] == 5 and not catalog["welcome_claimed"]
    assert "nodes" not in json.dumps(catalog["stories"][0])
    run = start(client, headers)
    run_id = run["run"]["id"]
    assert start(client, headers)["run"]["id"] == run_id
    assert client.get(f"/api/serials/runs/{run_id}", headers=other).status_code == 404
    assert client.post(f"/api/serials/runs/{run_id}/restart", headers=other, json={"revision": 0}).status_code == 404
    assert client.post(f"/api/serials/runs/{run_id}/act", headers=other,
                       json={"revision": 0, "node_id": "opening", "choice_id": "public"}).status_code == 404
    assert client.post("/api/serials/contract_story/runs", headers=headers, json={"slot": 4}).status_code == 422
    assert client.post("/api/serials/contract_story/runs", headers=headers, json={"slot": True}).status_code == 422
    assert client.post(f"/api/serials/runs/{run_id}/act", headers=headers,
                       json={"revision": 0, "node_id": "opening", "choice_id": "public", "metrics": {"trust": 100}}).status_code == 422
    run = action(client, headers, run, "public")
    assert run["run"]["metrics"] == {"trust": 100, "goal": 0, "control": 50, "eq": 50}
    assert start(client, headers)["run"]["node_id"] == "dispatch"
    start(client, headers, 2)
    start(client, headers, 3)
    assert len(client.get("/api/serials/contract_story", headers=headers).json()["slots"]) == 3


def test_welcome_gift_once_and_no_get_mutations(serial_client):
    client, headers, _, factory = serial_client
    for _ in range(2):
        assert client.get("/api/serials", headers=headers).json()["stars"] == 5
    assert client.post("/api/serials/welcome", headers=headers).json() == {"stars": 10, "granted": 5, "welcome_claimed": True}
    assert client.post("/api/serials/welcome", headers=headers).json()["granted"] == 0
    assert client.get("/api/serials", headers=headers).json()["stars"] == 10

    async def transactions():
        async with factory() as db:
            return await db.scalar(select(func.count()).select_from(StarTransaction))
    assert asyncio.run(transactions()) == 1


def test_purchase_atomic_idempotent_and_permanent_between_slots(serial_client):
    client, headers, other, factory = serial_client
    original = start(client, headers)
    bought = action(client, headers, original, "extra")
    assert bought["stars"] == 2
    assert bought["run"]["revision"] == 1
    repeated = action(client, headers, original, "extra")
    assert repeated["stars"] == 2 and repeated["run"]["revision"] == 1
    action(client, headers, original, "quiet", expected=409)
    second = start(client, headers, 2)
    assert next(c for c in second["scene"]["choices"] if c["id"] == "extra")["owned"]
    assert action(client, headers, second, "extra")["stars"] == 2
    second = client.get(f"/api/serials/runs/{second['run']['id']}", headers=headers).json()
    restarted = client.post(f"/api/serials/runs/{second['run']['id']}/restart", headers=headers,
                            json={"revision": second["run"]["revision"]}).json()
    assert action(client, headers, restarted, "extra")["stars"] == 2

    poor = start(client, other)
    action(client, other, poor, "extra", expected=400)
    poor_after = client.get(f"/api/serials/runs/{poor['run']['id']}", headers=other).json()
    assert poor_after["run"] == poor["run"]
    assert poor_after["stars"] == 0

    async def counts():
        async with factory() as db:
            return (await db.scalar(select(func.count()).select_from(SerialUnlock)),
                    await db.scalar(select(func.count()).select_from(StarTransaction)))
    assert asyncio.run(counts()) == (1, 1)


def test_rewards_once_across_slots_and_collection_distinct_endings(serial_client):
    client, headers, _, factory = serial_client
    run = start(client, headers)
    assert client.post(f"/api/serials/runs/{run['run']['id']}/episodes/second/start", headers=headers,
                       json={"revision": 0}).status_code == 400
    action(client, headers, run, "gated", expected=400)
    run = finish_first(client, headers, run, "quiet")
    assert run["run"]["status"] == "episode_complete"
    assert run["stars"] == 7 and run["reward"] == {"stars": 2, "first_completion": True}
    second_slot = finish_first(client, headers, start(client, headers, 2), "public")
    assert second_slot["stars"] == 7 and second_slot["reward"]["stars"] == 0
    run = next_episode(client, headers, run, "second")
    assert run["run"]["flags"]["route"] == "quiet"
    run = action(client, headers, run, "agree")
    before_finish = run
    run = action(client, headers, run)
    assert run["stars"] == 9 and run["run"]["status"] == "completed"
    duplicate = action(client, headers, before_finish)
    assert duplicate["stars"] == 9 and duplicate["reward"]["stars"] == 0
    main_ending = run["run"]["main_ending"]
    run = next_episode(client, headers, run, "other_side")
    assert run["stars"] == 4
    run = action(client, headers, run)
    run = action(client, headers, run)
    assert run["stars"] == 6 and run["run"]["main_ending"] == main_ending
    saved = client.get("/api/serials", headers=headers).json()["collection"]
    assert saved["stories_completed"] == 1 and saved["episodes_completed"] == 3
    assert len(saved["endings"]) == 4
    assert {e["ending_id"] for e in saved["endings"]} == {"apart", "together", "final", "perspective"}
    assert len(saved["unlocks"]) == 1


def test_parallel_duplicate_purchase_cannot_double_charge(serial_client):
    client, headers, _, factory = serial_client
    run = start(client, headers)
    body = {"node_id": "opening", "choice_id": "extra", "revision": 0}
    path = f"/api/serials/runs/{run['run']['id']}/act"
    async def concurrent_requests():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as concurrent_client:
            return await asyncio.gather(*(concurrent_client.post(path, headers=headers, json=body) for _ in range(2)))
    results = asyncio.run(concurrent_requests())
    assert all(response.status_code in (200, 409) for response in results)
    assert any(response.status_code == 200 for response in results)
    saved = client.get(f"/api/serials/runs/{run['run']['id']}", headers=headers).json()
    assert saved["stars"] == 2 and saved["run"]["revision"] == 1
    async def count():
        async with factory() as db:
            return await db.scalar(select(func.count()).select_from(StarTransaction))
    assert asyncio.run(count()) == 1


def test_database_lock_protects_purchase_between_independent_workers(serial_client, monkeypatch):
    client, headers, _, factory = serial_client
    first, second = start(client, headers, 1), start(client, headers, 2)
    # Separate workers do not share process locks. Force independent locks here;
    # the SQLite writer lock and unique ledger/entitlement must still protect money.
    monkeypatch.setattr(serials, "user_lock", lambda _user_id: asyncio.Lock())
    async def concurrent_requests():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as concurrent_client:
            return await asyncio.gather(*(concurrent_client.post(
                f"/api/serials/runs/{run['run']['id']}/act", headers=headers,
                json={"node_id": "opening", "choice_id": "extra", "revision": 0}) for run in (first, second)))
    results = asyncio.run(concurrent_requests())
    assert all(response.status_code in (200, 409) for response in results)
    assert any(response.status_code == 200 for response in results)
    async def balance_and_count():
        async with factory() as db:
            return (await db.get(User, 9201)).stars, await db.scalar(select(func.count()).select_from(SerialUnlock))
    assert asyncio.run(balance_and_count()) == (2, 1)


def test_shared_reward_with_stale_user_cannot_overwrite_serial_purchase(serial_client):
    _, _, _, factory = serial_client

    async def interleave_requests():
        async with factory() as old_reward_request, factory() as serial_request:
            old_user = await old_reward_request.get(User, 9201)
            serial_user = await serial_request.get(User, 9201)
            assert old_user.stars == serial_user.stars == 5
            payload = await serials.start_run(serial_request, serial_user, "contract_story", 1)
            await serial_request.commit()
            await serials.act(serial_request, serial_user, payload["run"]["id"], 0, "opening", "extra")
            await serial_request.commit()
            assert serial_user.stars == 2 and old_user.stars == 5
            old_user.xp += 50
            await record_star_transaction(old_reward_request, old_user, amount=2, transaction_type="SESSION_REWARD",
                                          source="test", source_id="stale-reward", description="Existing game reward")
            await old_reward_request.commit()
        async with factory() as check:
            user = await check.get(User, 9201)
            assert user.stars == 4  # 5 - 3 + 2; the previous helper incorrectly overwrote it with 7.
            assert user.xp == 50
            reward = await check.scalar(select(StarTransaction).where(StarTransaction.source_id == "stale-reward"))
            assert reward.balance_after == 4
    asyncio.run(interleave_requests())


def test_learning_level_reward_shares_wallet_and_repeat_does_not_reward_twice(serial_client):
    from app.routers.learning_path import submit_answer
    from app.schemas import LearningPathAnswerIn

    client, headers, _, factory = serial_client
    level_id = "chapter-1-l1"
    response = client.post(f"/api/learning-path/levels/{level_id}/attempts", headers=headers)
    assert response.status_code == 200, response.text
    attempt = response.json()
    for exercise in attempt["exercises"][:-1]:
        selected = next(option for option in exercise["options"] if option["quality"] == "strong")
        result = client.post(f"/api/learning-path/attempts/{attempt['attempt_id']}/answers", headers=headers,
                             json={"exercise_id": exercise["id"], "option_id": selected["id"]})
        assert result.status_code == 200 and not result.json()["finished"]
    exercise = attempt["exercises"][-1]
    selected = next(option for option in exercise["options"] if option["quality"] == "strong")

    async def interleave_requests():
        async with factory() as learning_db, factory() as serial_db:
            old_user = await learning_db.get(User, 9201)
            serial_user = await serial_db.get(User, 9201)
            run = await serials.start_run(serial_db, serial_user, "contract_story", 1)
            await serial_db.commit()
            await serials.act(serial_db, serial_user, run["run"]["id"], 0, "opening", "extra")
            await serial_db.commit()
            assert old_user.stars == 5 and serial_user.stars == 2
            result = await submit_answer(attempt["attempt_id"],
                                         LearningPathAnswerIn(exercise_id=exercise["id"], option_id=selected["id"]),
                                         db=learning_db, user=old_user)
            assert result["finished"] and result["xp_earned"] == 50 and result["report"]["stars"] == 3
        async with factory() as check:
            user = await check.get(User, 9201)
            assert user.stars == 5 and user.xp == 50  # 5 - 3 + 3, regardless of the stale learning request.
    asyncio.run(interleave_requests())

    repeat = client.post(f"/api/learning-path/levels/{level_id}/attempts", headers=headers).json()
    for exercise in repeat["exercises"]:
        selected = next(option for option in exercise["options"] if option["quality"] == "strong")
        result = client.post(f"/api/learning-path/attempts/{repeat['attempt_id']}/answers", headers=headers,
                             json={"exercise_id": exercise["id"], "option_id": selected["id"]})
        assert result.status_code == 200, result.text
    assert result.json()["finished"] and result.json()["xp_earned"] == 0
    assert client.get("/api/serials", headers=headers).json()["stars"] == 5
    async def count_rewards():
        async with factory() as check:
            return await check.scalar(select(func.count()).select_from(StarTransaction).where(StarTransaction.type == "LEARNING_REWARD"))
    assert asyncio.run(count_rewards()) == 1


def test_decision_feedback_is_saved_and_compares_only_previously_available_free_actions(serial_client):
    client, headers, _, _ = serial_client
    run = start(client, headers)
    assert run["feedback"] is None
    assert run["scene"]["learning"]["skill"] == "questions"
    assert run["practice_report"]["decision_count"] == 0
    assert len(run["learning_skills"]) == 9
    assert all("explanation" not in choice and "effects" not in choice for choice in run["scene"]["choices"])
    assert "Объяснение дополнительной платной сцены" not in json.dumps(run, ensure_ascii=False)
    # Owning the paid scene does not make its content a free comparison in another save.
    action(client, headers, run, "extra")
    second = start(client, headers, 2)
    assert next(choice for choice in second["scene"]["choices"] if choice["id"] == "extra")["owned"]
    second = action(client, headers, second, "public")
    feedback = second["feedback"]
    assert feedback["skill"] == "questions" and feedback["skill_title"] == "Уточняющие вопросы"
    assert feedback["action"] == "Обсудить вместе" and feedback["choice_id"] == "public"
    assert feedback["effects"] == {"trust": 90, "goal": -90}
    assert [alternative["choice_id"] for alternative in feedback["alternatives"]] == ["quiet"]
    # The chosen action sets agreed=True, but gated was unavailable BEFORE that action.
    assert second["run"]["flags"]["agreed"] is True
    assert feedback["alternatives"][0]["reaction"] == [{"speaker": "narrator", "text": "Последствия"}]
    entry = second["history"][-1]
    assert entry["metrics_before"] == {key: 50 for key in narrative.METRICS}
    assert entry["metrics_after"] == {"trust": 100, "goal": 0, "control": 50, "eq": 50}
    assert set(entry["metrics_before"]) == set(entry["metrics_after"]) == set(narrative.METRICS)
    assert second["practice_report"]["decision_count"] == 1
    evidence = next(skill for skill in second["practice_report"]["skills"] if skill["id"] == "questions")["evidence"]
    assert len(evidence) == 1 and evidence[0]["action"] == entry["choice"]
    assert "score" not in second["practice_report"]
    before = copy.deepcopy(feedback)
    # Once saved, feedback must retain the observed explanation even if authoring metadata changes.
    source = narrative.get_story("contract_story")["episodes"][0]["nodes"][0]
    source["learning"]["principle"] = "Изменённый материал"
    source["choices"][0]["explanation"] = "Изменённое объяснение"
    loaded = client.get(f"/api/serials/runs/{second['run']['id']}", headers=headers).json()
    assert loaded["feedback"] == before
    assert loaded["practice_report"]["skills"][0]["evidence"][0]["explanation"] == entry["explanation"]
    advanced = action(client, headers, loaded)
    assert advanced["feedback"] is None
    assert advanced["practice_report"]["decision_count"] == 1


def test_feedback_uses_actual_clamped_deltas_and_projects_alternatives_from_the_same_before_state(serial_client):
    client, headers, _, factory = serial_client
    opening = narrative.get_story("contract_story")["episodes"][0]["nodes"][0]
    opening["choices"][0]["effects"] = {"trust": 5, "goal": -5}
    opening["choices"][1]["effects"] = {"trust": 9, "goal": -9, "eq": -5}
    opening["choices"][1]["flags"]["alternative_only"] = True
    source = copy.deepcopy(opening)
    run = start(client, headers)
    before = {"trust": 99, "goal": 2, "control": 50, "eq": 2}

    async def set_metrics():
        async with factory() as db:
            row = await db.get(SerialRun, run["run"]["id"])
            state = json.loads(row.state)
            state["metrics"] = before
            row.state = json.dumps(state, ensure_ascii=False)
            await db.commit()
    asyncio.run(set_metrics())

    chosen = action(client, headers, run, "public")
    feedback = chosen["feedback"]
    assert feedback["effects"] == {"trust": 5, "goal": -5}
    assert feedback["applied_effects"] == {"trust": 1, "goal": -2, "control": 0, "eq": 0}
    alternative = feedback["alternatives"][0]
    assert alternative["choice_id"] == "quiet"
    assert alternative["effects"] == {"trust": 9, "goal": -9, "eq": -5}
    assert alternative["projected_effects"] == {"trust": 1, "goal": -2, "control": 0, "eq": -2}
    assert chosen["run"]["metrics"] == {"trust": 100, "goal": 0, "control": 50, "eq": 2}
    assert "alternative_only" not in chosen["run"]["flags"]
    assert chosen["history"][-1]["metrics_before"] == before
    assert opening == source, "Projecting a comparison must not mutate the authored option or its flags"
    evidence = chosen["practice_report"]["skills"][0]["evidence"][0]
    assert evidence["effects"] == feedback["effects"] and evidence["applied_effects"] == feedback["applied_effects"]
    repeated = action(client, headers, run, "public")
    assert repeated["history"] == chosen["history"] and repeated["run"]["metrics"] == chosen["run"]["metrics"]
    assert repeated["feedback"] == feedback and repeated["stars"] == 5

    # An older snapshot may have raw effects and metric history but no exact display fields.
    # Loading it must not silently relabel raw authored effects as actual changes.
    async def remove_display_deltas():
        async with factory() as db:
            row = await db.get(SerialRun, run["run"]["id"])
            state = json.loads(row.state)
            snapshot = state["history"][-1]["feedback"]
            snapshot.pop("applied_effects")
            for other in snapshot["alternatives"]:
                other.pop("projected_effects")
            row.state = json.dumps(state, ensure_ascii=False)
            await db.commit()
    asyncio.run(remove_display_deltas())
    loaded = client.get(f"/api/serials/runs/{run['run']['id']}", headers=headers).json()
    assert "applied_effects" not in loaded["feedback"]
    assert all("projected_effects" not in alternative for alternative in loaded["feedback"]["alternatives"])
    assert "applied_effects" not in loaded["practice_report"]["skills"][0]["evidence"][0]


def test_worksheet_revision_auth_limits_and_episode_lifecycle(serial_client):
    client, headers, other, factory = serial_client
    run = start(client, headers)
    path = f"/api/serials/runs/{run['run']['id']}/worksheet"
    body = {"revision": 0, "episode_id": "first", "phase": "prepare",
            "values": {"goal": "Согласовать время", "question": "Что уже известно?", "boundary": "Не обещать за других"}}
    assert run["worksheet"] == {"prepare": {}, "reflect": {}}
    assert [item["episode_id"] for item in run["learning_portfolio"]] == ["first"]
    assert run["learning_portfolio"][0]["learning"] == run["episode"]["learning"]
    assert not run["learning_portfolio"][0]["completed"]
    assert client.post(path, headers=other, json=body).status_code == 404
    assert client.post(path, headers=headers, json={**body, "episode_id": "second"}).status_code == 400
    assert client.post(path, headers=headers, json={**body, "episode_id": "missing"}).status_code == 404
    assert client.post(path, headers=headers, json={**body, "phase": "reflect", "values": {"takeaway": "Вывод", "next_action": "Вопрос"}}).status_code == 400
    for bad in (
        {**body, "values": {"goal": "Не все поля"}},
        {**body, "values": {**body["values"], "stars": "100"}},
        {**body, "values": {**body["values"], "goal": "а" * 1501}},
        {**body, "values": {**body["values"], "goal": 42}},
        {**body, "metrics": {"trust": 100}},
        {**body, "phase": "unknown"},
    ):
        assert client.post(path, headers=headers, json=bad).status_code == 422
    saved = client.post(path, headers=headers, json=body)
    assert saved.status_code == 200, saved.text
    saved = saved.json()
    assert saved["run"]["revision"] == 1 and saved["worksheet"]["prepare"] == body["values"]
    assert saved["stars"] == 5 and saved["run"]["metrics"] == run["run"]["metrics"]
    assert saved["history"] == [] and saved["practice_report"]["decision_count"] == 0
    repeat = client.post(path, headers=headers, json=body).json()
    assert repeat["run"]["revision"] == 1 and repeat["worksheet"] == saved["worksheet"]
    assert client.post(path, headers=headers, json={**body, "values": {**body["values"], "goal": "Другая цель"}}).status_code == 409
    action(client, headers, run, "quiet", expected=409)
    completed = finish_first(client, headers, saved)
    assert completed["stars"] == 7
    reflection = {"revision": completed["run"]["revision"], "episode_id": "first", "phase": "reflect",
                  "values": {"takeaway": "Сначала уточнять", "next_action": "Задать один открытый вопрос"}}
    result = client.post(path, headers=headers, json=reflection).json()
    assert result["worksheet"]["reflect"] == reflection["values"]
    assert result["stars"] == 7 and result["run"]["metrics"] == completed["run"]["metrics"]
    assert result["practice_report"]["decision_count"] == 1 and len(result["history"]) == len(completed["history"])
    resumed = start(client, headers)
    assert resumed["worksheet"] == result["worksheet"]
    following = next_episode(client, headers, resumed, "second")
    assert following["worksheet"] == {"prepare": {}, "reflect": {}}
    assert following["practice_report"]["episode_id"] == "second" and following["practice_report"]["decision_count"] == 0
    portfolio = following["learning_portfolio"]
    assert [item["episode_id"] for item in portfolio] == ["first", "second"]
    assert portfolio[0]["completed"] and not portfolio[1]["completed"]
    assert portfolio[0]["worksheet"] == result["worksheet"]
    assert portfolio[0]["report"] == result["practice_report"]
    assert portfolio[1]["report"] == following["practice_report"]
    assert all(not skill["evidence"] for skill in portfolio[1]["report"]["skills"])
    previous_note = {**body, "revision": following["run"]["revision"],
                     "values": {**body["values"], "goal": "Уточнённая цель прошлого разговора"}}
    edited = client.post(path, headers=headers, json=previous_note)
    assert edited.status_code == 200, edited.text
    edited = edited.json()
    assert edited["run"]["episode_id"] == "second" and edited["run"]["node_id"] == following["run"]["node_id"]
    assert edited["worksheet"] == following["worksheet"]
    assert edited["learning_portfolio"][0]["worksheet"] == {"prepare": previous_note["values"], "reflect": reflection["values"]}
    assert edited["learning_portfolio"][0]["report"] == portfolio[0]["report"]
    assert edited["run"]["metrics"] == following["run"]["metrics"] and edited["history"] == following["history"]
    assert edited["stars"] == following["stars"]
    assert client.post(path, headers=headers, json={**previous_note, "values": body["values"]}).status_code == 409
    resumed = start(client, headers)
    assert resumed["learning_portfolio"] == edited["learning_portfolio"]
    decided = action(client, headers, resumed, "agree")
    previous_report, current_report = [item["report"] for item in decided["learning_portfolio"]]
    assert previous_report == portfolio[0]["report"]
    assert current_report["episode_id"] == "second" and current_report["decision_count"] == 1
    assert [entry["action"] for skill in current_report["skills"] for entry in skill["evidence"]] == ["Согласовать"]
    assert client.get(f"/api/serials/runs/{run['run']['id']}", headers=other).status_code == 404
    async def retained_notes():
        async with factory() as db:
            row = await db.get(SerialRun, run["run"]["id"])
            state = json.loads(row.state)
            return state["worksheet"]["first"], await db.scalar(select(func.count()).select_from(StarTransaction))
    notes, transaction_count = asyncio.run(retained_notes())
    assert notes == {"prepare": previous_note["values"], "reflect": reflection["values"]}
    assert transaction_count == 1  # Only the existing episode completion reward.


def test_legacy_saves_enrich_practice_evidence_without_inventing_old_comparisons(serial_client):
    client, headers, _, factory = serial_client
    run = action(client, headers, start(client, headers), "quiet")
    original_entry = copy.deepcopy(run["history"][0])
    async def make_legacy():
        async with factory() as db:
            row = await db.get(SerialRun, run["run"]["id"])
            state = json.loads(row.state)
            state.pop("worksheet", None)
            for entry in state["history"]:
                for key in ("feedback", "metrics_before", "metrics_after"):
                    entry.pop(key, None)
            row.state = json.dumps(state, ensure_ascii=False)
            await db.commit()
    asyncio.run(make_legacy())
    loaded = client.get(f"/api/serials/runs/{run['run']['id']}", headers=headers).json()
    assert loaded["worksheet"] == {"prepare": {}, "reflect": {}} and loaded["feedback"] is None
    assert loaded["practice_report"]["decision_count"] == 1
    evidence = next(skill for skill in loaded["practice_report"]["skills"] if skill["id"] == "questions")["evidence"]
    assert evidence[0]["action"] == original_entry["choice"] and evidence[0]["explanation"] == original_entry["explanation"]
    reconstructed = serials.historical_feedback(narrative.get_story("contract_story")["episodes"][0], loaded["history"][0])
    assert reconstructed["alternatives"] == []
    assert "applied_effects" not in reconstructed and "applied_effects" not in evidence[0]
    assert [item["episode_id"] for item in loaded["learning_portfolio"]] == ["first"]
    assert loaded["learning_portfolio"][0]["report"] == loaded["practice_report"]
    assert loaded["learning_portfolio"][0]["worksheet"] == {"prepare": {}, "reflect": {}}
    body = {"revision": loaded["run"]["revision"], "episode_id": "first", "phase": "prepare",
            "values": {"goal": "Цель", "question": "Вопрос", "boundary": "Граница"}}
    saved = client.post(f"/api/serials/runs/{run['run']['id']}/worksheet", headers=headers, json=body)
    assert saved.status_code == 200 and saved.json()["run"]["node_id"] == run["run"]["node_id"]
    assert saved.json()["stars"] == loaded["stars"] and saved.json()["history"] == loaded["history"]


def test_worksheet_and_paid_decision_race_cannot_overwrite_each_other(serial_client):
    client, headers, _, _ = serial_client
    run = start(client, headers)
    root = f"/api/serials/runs/{run['run']['id']}"
    notes = {"revision": 0, "episode_id": "first", "phase": "prepare",
             "values": {"goal": "Цель", "question": "Вопрос", "boundary": "Граница"}}
    choice = {"revision": 0, "node_id": "opening", "choice_id": "extra"}
    async def race():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as concurrent:
            return await asyncio.gather(concurrent.post(root + "/worksheet", headers=headers, json=notes),
                                        concurrent.post(root + "/act", headers=headers, json=choice))
    results = asyncio.run(race())
    assert sorted(response.status_code for response in results) == [200, 409]
    saved = client.get(root, headers=headers).json()
    assert saved["run"]["revision"] == 1
    if results[0].status_code == 200:
        assert saved["worksheet"]["prepare"] == notes["values"] and saved["history"] == []
        assert saved["stars"] == 5 and saved["run"]["node_id"] == "opening"
        result = client.post(root + "/act", headers=headers, json={**choice, "revision": 1})
    else:
        assert saved["worksheet"]["prepare"] == {} and len(saved["history"]) == 1
        assert saved["stars"] == 2 and saved["run"]["node_id"] == "premium"
        result = client.post(root + "/worksheet", headers=headers, json={**notes, "revision": 1})
    assert result.status_code == 200, result.text
    final = result.json()
    assert final["run"]["revision"] == 2 and final["stars"] == 2
    assert len(final["history"]) == final["practice_report"]["decision_count"] == 1
    assert final["worksheet"]["prepare"] == notes["values"]


def test_optional_scene_purchase_or_skip_is_not_skill_evidence_including_old_feedback(serial_client):
    client, headers, _, factory = serial_client
    story = narrative.get_story("contract_story")
    episode = story["episodes"][0]
    invitation = episode["nodes"][0]
    invitation["id"] = "extra_invitation"
    episode["start"] = "extra_invitation"
    for choice in invitation["choices"]:
        choice["effects"] = {}
    opened = action(client, headers, start(client, headers), "extra")
    assert opened["stars"] == 2 and opened["feedback"] is None
    assert opened["history"][-1]["choice"] == "Зайти на репетицию"
    assert "feedback" not in opened["history"][-1]
    assert opened["practice_report"]["decision_count"] == 0
    assert all(not skill["evidence"] for skill in opened["practice_report"]["skills"])
    practiced = action(client, headers, opened, "listen")
    assert practiced["feedback"]["skill"] == "listening" and practiced["practice_report"]["decision_count"] == 1
    assert next(skill for skill in practiced["practice_report"]["skills"] if skill["id"] == "listening")["evidence"][0]["action"] == "Выслушать"
    skipped = action(client, headers, start(client, headers, 2), "quiet")
    assert skipped["stars"] == 2 and skipped["feedback"] is None and skipped["practice_report"]["decision_count"] == 0
    async def make_old_invitation_feedback():
        async with factory() as db:
            row = await db.get(SerialRun, skipped["run"]["id"])
            state = json.loads(row.state)
            state["history"][-1]["feedback"] = {"skill": "questions", "action": "Старая покупка", "alternatives": []}
            row.state = json.dumps(state, ensure_ascii=False)
            await db.commit()
    asyncio.run(make_old_invitation_feedback())
    loaded = client.get(f"/api/serials/runs/{skipped['run']['id']}", headers=headers).json()
    assert loaded["feedback"] is None and loaded["practice_report"]["decision_count"] == 0
    assert "feedback" not in loaded["history"][-1] and loaded["history"][-1]["choice"] == "Поговорить отдельно"
    assert all(not skill["evidence"] for skill in loaded["practice_report"]["skills"])


def test_work_revised_launch_and_optional_conversation_preserve_the_agreement():
    """An explicit revision supersedes the initial full-launch promise."""
    story = narrative.get_story("work")
    episode = narrative.get_episode(story, "offer")
    for proposal, verification, expected in (
        ("full", "show", "postpone"),
        ("full", "later", "postpone"),
        ("full", "owner", "overreach"),
        ("reduce", "owner", "scope"),
        ("staged", "show", "pilot"),
    ):
        for extra in (False, True):
            flags = {"w_resource_verified": True}
            decisions = {"proposal": proposal, "verification": verification, "signoff": "signed",
                         "extra_invitation": "extra" if extra else "continue", "language": "define"}
            node = narrative.get_node(episode, episode["start"])
            for _ in range(60):
                if node.get("ending"):
                    assert node["ending"]["id"] == expected, (proposal, verification, extra)
                    break
                if node.get("choices"):
                    if node["id"] in decisions:
                        choice = next(option for option in node["choices"] if option["id"] == decisions[node["id"]])
                    else:
                        assert node["id"].startswith("practice_") and node.get("learning"), node["id"]
                        choice = next(option for option in node["choices"] if not option.get("cost")
                                      and narrative.matches(flags, option.get("requires")))
                    assert narrative.matches(flags, choice.get("requires"))
                    flags.update(choice.get("flags", {}))
                    following = choice["next"]
                else:
                    following = narrative.target(node, flags)
                node = narrative.get_node(episode, following)
            else:
                pytest.fail("Work agreement did not reach an ending")


def test_content_validator_rejects_broken_graphs_and_score_aliases():
    story = sample_story()
    narrative.validate_story(story)
    for mutate in (
        lambda data: data["episodes"][0]["nodes"][0]["choices"][0].update(next="missing"),
        lambda data: data["episodes"][0]["nodes"][0]["choices"][0].update(effects={"empathy": 10}),
        lambda data: data["episodes"][0]["nodes"][0]["choices"][0].update(cost=100),
        lambda data: data["episodes"][0]["nodes"][0]["choices"][0].update(next="opening"),
        lambda data: data["episodes"][0]["nodes"][0]["learning"].update(skill="personality"),
        lambda data: data["episodes"][0]["nodes"][0]["learning"].update(alternatives=["future answer"]),
    ):
        bad = copy.deepcopy(story)
        mutate(bad)
        with pytest.raises(ValueError):
            narrative.validate_story(bad)
    assert not narrative.matches({}, {"flag": False})
    assert narrative.matches({"flag": False}, {"flag": False})


def test_all_authored_stories_are_complete_and_have_free_paths():
    loaded = narrative.stories()
    assert len(loaded) >= 5
    assert all(len(story["episodes"]) >= 4 for story in loaded.values())
    for story in loaded.values():
        narrative.validate_story(story)
        assert story.get("learning", {}).get("version") == 1, "Shipped JSON must include the authored curriculum"
        for episode in story["episodes"]:
            assert episode.get("learning", {}).get("objective")
            decisions = [node for node in episode["nodes"] if node.get("choices")]
            assert all(node.get("learning") for node in decisions)
            assert episode["learning"]["decision_points"] == sum(is_negotiation_decision(node["id"]) for node in decisions)


def test_curriculum_preserves_original_scenes_and_redirects_all_incoming_edges(monkeypatch):
    import importlib
    from functools import lru_cache

    directory = Path(__file__).resolve().parents[1] / "app" / "data" / "serials"
    monkeypatch.syspath_prepend(str(directory))
    builders = importlib.import_module("_build_catalog").STORY_BUILDERS
    work = importlib.import_module("_build_work").work
    compiler = importlib.import_module("_curriculum")
    for build in [*builders, work]:
        original = build()
        before = copy.deepcopy(original)
        compiled = compiler.enrich_story(original)
        assert original == before, "Compiling a curriculum must not mutate its narrative source"
        assert compiled.get("learning", {}).get("version") == 1
        narrative.validate_story(compiled)
        assert compiler.enrich_story(compiled) == compiled, "Rebuilding must not insert the practice twice"
        assert compiled == narrative.get_story(original["id"]), "Shipped JSON must be reproducible from authoring sources"
        curriculum = json.loads((compiler.CURRICULUM_DIR / f"{original['id']}.json").read_text(encoding="utf-8-sig"))
        lessons = {lesson["id"]: lesson for lesson in curriculum["episodes"]}
        for episode, enriched in zip(original["episodes"], compiled["episodes"]):
            assert episode["id"] == enriched["id"]
            nodes = {node["id"]: node for node in enriched["nodes"]}
            scenes = lessons[episode["id"]]["practice_scenes"]
            def redirected(identifier):
                for scene in scenes:
                    if identifier == scene["before"]:
                        identifier = scene["id"]
                return identifier
            assert enriched["start"] == redirected(episode["start"])
            for node in episode["nodes"]:
                preserved = nodes[node["id"]]
                assert {key: value for key, value in node.items() if key not in ("next", "choices", "branches", "learning")} == {
                    key: value for key, value in preserved.items() if key not in ("next", "choices", "branches", "learning")}
                if node.get("next"):
                    assert preserved["next"] == redirected(node["next"])
                for key in ("choices", "branches"):
                    assert len(node.get(key, [])) == len(preserved.get(key, []))
                    for old_edge, new_edge in zip(node.get(key, []), preserved.get(key, [])):
                        assert new_edge["next"] == redirected(old_edge["next"])
                        assert {k: v for k, v in old_edge.items() if k != "next"} == {k: v for k, v in new_edge.items() if k != "next"}
            decisions = [node for node in enriched["nodes"] if node.get("choices")]
            assert len(decisions) == sum(bool(node.get("choices")) for node in episode["nodes"]) + 3
            assert enriched["learning"]["decision_points"] == sum(is_negotiation_decision(node["id"]) for node in decisions)
            assert all(node.get("learning") for node in decisions)
            for scene in scenes:
                practice = nodes[scene["id"]]
                assert len(practice["choices"]) >= 3
                for choice in practice["choices"]:
                    assert not choice.get("cost") and not choice.get("flags") and not choice.get("requires")
                    reaction = nodes[choice["next"]]
                    assert not reaction.get("effects") and not reaction.get("choices"), "Reactions must not apply scores again"
            practice_ids = {scene["id"] for scene in scenes}
            @lru_cache(None)
            def minimum_free_practice(identifier):
                node = nodes[identifier]
                count = int(identifier in practice_ids)
                if node.get("ending"):
                    return count
                following = [choice["next"] for choice in node.get("choices", []) if not choice.get("cost")]
                following += [branch["next"] for branch in node.get("branches", [])]
                if node.get("next"):
                    following.append(node["next"])
                return count + min(minimum_free_practice(target) for target in following)
            assert minimum_free_practice(enriched["start"]) == 3, "A free route must include all three authored practice scenes"


def test_authored_flags_have_no_dead_ends_and_multiple_free_finales():
    for story in narrative.stories().values():
        read_flags = {key for episode in story["episodes"] for node in episode["nodes"]
                      for condition in ([branch.get("when", {}) for branch in node.get("branches", [])]
                                        + [choice.get("requires", {}) for choice in node.get("choices", [])])
                      for key in condition}
        def relevant(flags):
            return {key: value for key, value in flags.items() if key in read_flags}
        for free_only in (True, False):
            inherited = [dict(story.get("initial_flags", {}))]
            main_finales = set()
            ordered = ([episode for episode in story["episodes"] if not episode.get("bonus")]
                       + [episode for episode in story["episodes"] if episode.get("bonus")])
            for episode in ordered:
                index = {node["id"]: node for node in episode["nodes"]}
                pending = [(episode["start"], flags) for flags in inherited]
                visited, finished = set(), {}
                final_endings = set()
                while pending:
                    node_id, flags = pending.pop()
                    flags = relevant(flags)
                    key = node_id, json.dumps(flags, sort_keys=True)
                    if key in visited:
                        continue
                    visited.add(key)
                    assert len(visited) < 200_000, f"Unexpected graph expansion: {story['id']}"
                    node = index[node_id]
                    if node.get("ending"):
                        final_endings.add(node["ending"]["id"])
                        finished[json.dumps(flags, sort_keys=True)] = flags
                    elif node.get("choices"):
                        choices = [c for c in node["choices"] if narrative.matches(flags, c.get("requires"))
                                   and (not free_only or not c.get("cost"))]
                        assert choices, f"Dead end: {story['id']}/{episode['id']}/{node_id}"
                        for choice in choices:
                            pending.append((choice["next"], {**flags, **choice.get("flags", {})}))
                    else:
                        following = narrative.target(node, flags)
                        assert following in index
                        pending.append((following, flags))
                assert finished, f"Episode cannot finish: {story['id']}/{episode['id']}"
                if not free_only:
                    authored_endings = {node["ending"]["id"] for node in episode["nodes"] if node.get("ending")}
                    assert final_endings == authored_endings, f"Unreachable ending: {story['id']}/{episode['id']}"
                if not episode.get("bonus"):
                    main_finales = final_endings
                    inherited = list(finished.values())
            assert len(main_finales) >= 2, f"Story needs distinct free finales: {story['id']}"


def test_entire_catalog_free_and_extra_routes_persist_with_one_reward_per_episode(tmp_path):
    """Play all authored episodes twice through the real state/currency service."""
    catalog = narrative.stories()
    assert len(catalog) >= 5
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'catalog.sqlite').as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def play_catalog():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            user = User(username="catalog-player", password_hash="unused", stars=100, xp=125, level=3)
            db.add(user)
            await db.commit()
            episode_count = sum(len(story["episodes"]) for story in catalog.values())
            bonus_cost = sum(episode.get("cost", 0) for story in catalog.values() for episode in story["episodes"])
            premium_cost = 0
            for slot in (1, 2):
                for story in catalog.values():
                    payload = await serials.start_run(db, user, story["id"], slot)
                    await db.commit()
                    for index, episode in enumerate(story["episodes"]):
                        if index:
                            payload = await serials.start_episode(db, user, payload["run"]["id"], payload["run"]["revision"], episode["id"])
                            await db.commit()
                        steps = 0
                        while payload["run"]["status"] == "active":
                            steps += 1
                            assert steps < 150, f"Episode stuck: {story['id']}/{episode['id']}"
                            choices = [choice for choice in payload["scene"]["choices"] if choice["available"] and choice["affordable"]]
                            chosen = None
                            if choices:
                                paid = [choice for choice in choices if choice.get("cost")]
                                free = [choice for choice in choices if not choice.get("cost")]
                                chosen = paid[0] if slot == 2 and paid else free[0]
                                if slot == 2 and chosen.get("cost") and not chosen["owned"]:
                                    premium_cost += chosen["cost"]
                            payload = await serials.act(db, user, payload["run"]["id"], payload["run"]["revision"],
                                                        payload["scene"]["id"], chosen["id"] if chosen else None)
                            await db.commit()
                            assert all(0 <= value <= 100 for value in payload["run"]["metrics"].values())
                            if slot == 2:
                                assert payload["reward"]["stars"] == 0
                    assert payload["run"]["status"] == "completed"
                    assert payload["run"]["main_ending"]
                    assert set(payload["run"]["completed_episodes"]) == {episode["id"] for episode in story["episodes"]}
            await db.refresh(user)
            assert user.stars == 100 + episode_count * 2 - bonus_cost - premium_cost
            assert user.xp == 125 and user.level == 3
            saved = await serials.collection(db, user.id)
            assert saved["stories_completed"] == len(catalog)
            assert saved["episodes_completed"] == episode_count
            assert len(saved["endings"]) >= episode_count
            assert await db.scalar(select(func.count()).select_from(StarTransaction).where(StarTransaction.type == "SERIAL_REWARD")) == episode_count
    try:
        asyncio.run(play_catalog())
    finally:
        asyncio.run(engine.dispose())


def test_alembic_serial_schema_upgrade_downgrade(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect
    from app.config import settings

    database = tmp_path / "migration.sqlite"
    monkeypatch.setattr(settings, "db_path", str(database))
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{database.as_posix()}")
    try:
        tables = set(inspect(engine).get_table_names())
        assert {"serial_runs", "serial_unlocks", "serial_completions", "serial_endings", "users"} <= tables
        checks = inspect(engine).get_check_constraints("serial_runs")
        assert any(check["name"] == "ck_serial_slot_range" for check in checks)
        assert any(c["name"] == "uq_serial_unlock" for c in inspect(engine).get_unique_constraints("serial_unlocks"))
        command.downgrade(config, "0030")
        assert "users" in inspect(engine).get_table_names()
        assert "serial_runs" not in inspect(engine).get_table_names()
        command.upgrade(config, "head")
        assert "serial_runs" in inspect(engine).get_table_names()
    finally:
        engine.dispose()
