"""Contract, graph integrity and reward tests for the offline Game Lab."""
import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import create_token
from app.db import Base, get_db
from app.engine.game_lab import METRICS, trainers, validate_trainer
from app.lab_models import LabCompletion, LabEnding
from app.main import app
from app.models import StarTransaction, User


@pytest.fixture
def lab_client(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'lab.sqlite').as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([
                User(id=9401, username="lab-one", password_hash="unused", stars=3),
                User(id=9402, username="lab-two", password_hash="unused", stars=0),
            ])
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_token(9401, 'lab-one')}"}
    other = {"Authorization": f"Bearer {create_token(9402, 'lab-two')}"}
    try:
        yield client, headers, other, factory
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def start(client, headers, case_id="missed-deadline"):
    response = client.post(f"/api/lab/red-zone/cases/{case_id}/runs", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def act(client, headers, payload, choice_id=None, expected=200):
    body = {"revision": payload["run"]["revision"], "node_id": payload["scene"]["id"]}
    if choice_id:
        body["choice_id"] = choice_id
    response = client.post(f"/api/lab/runs/{payload['run']['id']}/act", headers=headers, json=body)
    assert response.status_code == expected, response.text
    return response.json()


def test_authored_release_has_five_complete_cases_and_ninety_responses():
    trainer = trainers()["red-zone"]
    validate_trainer(trainer)
    assert len(trainer["cases"]) == 5
    assert sum(len(case["nodes"]) for case in trainer["cases"]) == 30
    assert sum(len(node["choices"]) for case in trainer["cases"] for node in case["nodes"]) == 90
    for case in trainer["cases"]:
        assert len(case["nodes"]) == 6
        assert set(case["outcomes"]) == {"steady", "boundary", "fragile", "rupture"}
        assert len({item["id"] for item in case["outcomes"].values()}) == 4
        for node in case["nodes"]:
            for choice in node["choices"]:
                assert set(choice.get("effects", {})).issubset(METRICS)
                assert choice["reaction"] and choice["technique"]


def test_catalog_is_authenticated_and_does_not_leak_graph(lab_client):
    client, headers, _, _ = lab_client
    assert client.get("/api/lab").status_code == 401
    catalog = client.get("/api/lab", headers=headers)
    assert catalog.status_code == 200
    body = catalog.json()
    assert body["stars"] == 3 and body["trainers"][0]["case_count"] == 5
    assert "nodes" not in json.dumps(body, ensure_ascii=False)
    detail = client.get("/api/lab/red-zone", headers=headers).json()
    assert len(detail["cases"]) == 5
    assert "nodes" not in json.dumps(detail, ensure_ascii=False)
    assert client.get("/api/lab/unknown", headers=headers).status_code == 404


def test_server_owns_state_reactions_metrics_and_revision(lab_client):
    client, headers, other, _ = lab_client
    payload = start(client, headers)
    assert payload["scene"]["phase"] == "decision"
    assert payload["run"]["metrics"] == {metric: 50 for metric in METRICS}
    run_id = payload["run"]["id"]
    assert client.get(f"/api/lab/runs/{run_id}", headers=other).status_code == 404
    invalid = client.post(
        f"/api/lab/runs/{run_id}/act",
        headers=headers,
        json={"revision": 0, "node_id": payload["scene"]["id"], "choice_id": "name-impact", "metrics": {"trust": 100}},
    )
    assert invalid.status_code == 422

    original = payload
    payload = act(client, headers, payload, "name-impact")
    assert payload["scene"]["phase"] == "reaction"
    assert payload["scene"]["choices"] == []
    assert payload["run"]["metrics"] == {"trust": 58, "goal": 54, "control": 53, "eq": 57}
    repeated = act(client, headers, original, "name-impact")
    assert repeated["run"]["revision"] == payload["run"]["revision"]
    assert repeated["run"]["metrics"] == payload["run"]["metrics"]
    act(client, headers, original, "defend-team", expected=409)
    payload = act(client, headers, payload)
    assert payload["scene"]["id"] == "deadline-2" and payload["scene"]["phase"] == "decision"


def test_fact_check_unlocks_scope_branch_and_strong_run_rewards_once(lab_client):
    client, headers, _, factory = lab_client
    payload = start(client, headers)
    choices = ["name-impact", "timeline", "scope-boundary", "three-points", "criteria", "written-commitment"]
    for choice in choices:
        payload = act(client, headers, payload, choice)
        assert payload["scene"]["phase"] == "reaction"
        payload = act(client, headers, payload)
    assert payload["run"]["status"] == "completed"
    assert payload["report"]["outcome"]["type"] == "steady"
    assert payload["reward"] == {"stars": 2, "first_completion": True}
    assert payload["stars"] == 5
    assert payload["report"]["decisions"] == 6
    assert set(payload["report"]["metrics"]) == set(METRICS)

    restarted = client.post(
        f"/api/lab/runs/{payload['run']['id']}/restart",
        headers=headers,
        json={"revision": payload["run"]["revision"]},
    ).json()
    assert restarted["run"]["status"] == "active"
    while restarted["run"]["status"] == "active":
        if restarted["scene"]["phase"] == "decision":
            restarted = act(client, headers, restarted, restarted["scene"]["choices"][0]["id"])
        else:
            restarted = act(client, headers, restarted)
    assert restarted["reward"]["stars"] == 0 and restarted["stars"] == 5

    async def counts():
        async with factory() as db:
            return (
                await db.scalar(select(func.count()).select_from(LabCompletion)),
                await db.scalar(select(func.count()).select_from(LabEnding)),
                await db.scalar(select(func.count()).select_from(StarTransaction).where(StarTransaction.source == "game_lab")),
            )
    assert asyncio.run(counts()) == (1, 1, 1)


@pytest.mark.parametrize("case_id", [case["id"] for case in trainers()["red-zone"]["cases"]])
def test_every_case_has_a_reachable_complete_path(lab_client, case_id):
    client, headers, _, _ = lab_client
    payload = start(client, headers, case_id)
    calls = 0
    while payload["run"]["status"] == "active" and calls < 20:
        if payload["scene"]["phase"] == "decision":
            payload = act(client, headers, payload, payload["scene"]["choices"][0]["id"])
        else:
            payload = act(client, headers, payload)
        calls += 1
    assert payload["run"]["status"] == "completed"
    assert payload["report"]["outcome"]["type"] in {"steady", "boundary", "fragile", "rupture"}
    assert calls <= 12


def test_pause_is_a_professional_independent_outcome(lab_client):
    client, headers, _, _ = lab_client
    payload = start(client, headers, "we-know-better")
    for choice in ("ack-care", "ask-fear", "trial-plan", "show-work", "pause-until-tomorrow"):
        payload = act(client, headers, payload, choice)
        payload = act(client, headers, payload)
    assert payload["run"]["status"] == "completed"
    assert payload["run"]["tension_stage"] == "calm"
    assert payload["report"]["outcome"]["type"] == "boundary"
    assert payload["report"]["outcome"]["id"] == "parent-return-time"
