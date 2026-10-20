import json
from datetime import datetime, timedelta
from types import SimpleNamespace
import pytest
from sqlalchemy import select
from app.auth import create_token
from app.models import Session, User
from app.personal_insights import eligible_personal_reports, build_progress, build_potential_twin, METRICS
from app.twin_duel import challenge_settings, attach_duel_result, opponent_instruction
from .test_installation_security import client, storage


def saved(index, score=65):
    return SimpleNamespace(id=index, user_id=1, mode="online", status="finished", role="Предприниматель", opponent_role="Инвестор", scenario_id="sales_discount_01",
        settings=json.dumps({"problem":"Обсудить инвестиции в развитие проекта", "goal":"Согласовать условия инвестиционного соглашения", "role":"Предприниматель", "opponent_role":"Инвестор"}),
        metrics=json.dumps({key:score for key in METRICS}), created_at=datetime(2026,1,1)+timedelta(days=index), finished_at=datetime(2026,1,1)+timedelta(days=index),
        report=json.dumps({"scenario_title":"Инвестиции", "narrative":{"sections":[{"kind":"strength", "title":"Уточнение интересов", "body":"В исходном разборе отмечен вопрос об интересах.", "evidence":{"quote":f"Источник {index}: что для вас важно?"}, "principle":{"label":"Активное слушание", "explanation":"Уточнение позиции собеседника."}}]}}))


def test_progress_compares_first_and_last_five_not_middle_and_has_real_sources():
    rows = eligible_personal_reports([saved(i, 40 if i<=5 else 99 if i<=10 else 70) for i in range(1,16)])
    data = build_progress(rows)["data"]
    assert data["baseline_score"] == 40 and data["current_score"] == 70
    development = data["development"]
    assert development["periods"][0]["source_ids"] == list(range(1,6))
    assert development["periods"][1]["source_ids"] == list(range(11,16))
    assert len(development["dimensions"]) == 4 and len(development["priorities"]) == 2
    assert all(example["quote"].startswith(f"Источник {example['source_id']}:") for example in development["examples"])
    assert build_progress(rows[:9])["locked"] and build_potential_twin(rows[:14])["locked"]
    assert build_potential_twin(rows)["data"]["potential_score"] == 99


def test_invalid_metrics_are_not_counted_and_hash_tracks_source_content():
    items = [saved(i) for i in range(1,11)]
    old_hash = build_progress(eligible_personal_reports(items))["source_hash"]
    items[0].report = '{"narrative":{"sections":[]},"changed":true}'
    assert build_progress(eligible_personal_reports(items))["source_hash"] != old_hash
    for value in (True, float("nan"), float("inf")):
        bad = saved(99)
        bad.metrics = json.dumps({key:value for key in METRICS})
        assert eligible_personal_reports([bad]) == []


def test_duel_snapshot_and_deterministic_verdict_are_honest():
    rows = eligible_personal_reports([saved(i,75) for i in range(1,16)])
    settings = challenge_settings(rows,"Анна")
    assert settings["twin_duel"]["topic_count"] == 15 and settings["opponent_role"] == "Инвестор"
    assert settings["twin_duel"]["target_score"] == 75 and settings["difficulty"] == "hard"
    assert "не его личность" in opponent_instruction(settings)
    for turns, score, status, expected in ((5,80,"Достигнута","passed"),(5,60,"Достигнута","not_passed"),(1,99,"Достигнута","insufficient"),(5,90,"Не достигнута","not_passed")):
        report = {"metrics":{"values":{key:score for key in METRICS}},"narrative":{"status":status}}
        attach_duel_result(report,{"history":[{"text":"Обсудим конкретное предложение"} for _ in range(turns)]},settings)
        assert report["twin_duel"]["status"] == expected
        assert report["scenario_title"].startswith("Бой с двойником")
    interrupted={"metrics":{"values":{key:99 for key in METRICS}},"narrative":{"status":"Достигнута"}}
    attach_duel_result(interrupted,{"history":[{"text":"Ответ"}]*5,"twin_interrupted":True},settings)
    assert interrupted["twin_duel"]["status"]=="insufficient"


def test_missing_historical_context_uses_explicit_fallback_not_an_invented_topic():
    rows=eligible_personal_reports([saved(i) for i in range(1,16)])
    for row in rows:
        row["settings"]={}; row["scenario_context"]=None; row["report"]={}; row["title"]="Демо-практика 1"
    settings=challenge_settings(rows,"Анна")
    assert settings["twin_duel"]["topic_is_fallback"]
    assert settings["twin_duel"]["topic_count"]==0
    assert "не сохранены" in settings["twin_duel"]["topic_reason"]


async def seed_sessions(storage, count=15):
    async with storage() as db:
        for i in range(1,count+1):
            item = saved(i)
            db.add(Session(**{key:getattr(item,key) for key in ("id","user_id","mode","status","role","opponent_role","scenario_id","settings","metrics","created_at","finished_at","report")}, state="{}"))
        await db.commit()


async def test_duel_is_owner_scoped_uses_existing_online_session_and_history(client,storage,monkeypatch):
    await seed_sessions(storage)
    headers={"Authorization":"Bearer "+create_token(1,"alice")}
    from app.engine import llm
    async def available(): pass
    monkeypatch.setattr(llm,"ensure_online_ai_available",available)
    result=await client.post("/api/analytics/potential-twin/duel",headers=headers,json={"target_score":1})
    assert result.status_code == 200, result.text
    data=result.json()
    assert data["mode"] == "online" and data["settings"]["twin_duel"]["target_score"] == 65
    assert data["settings"]["practice_plan"]["source"] == "template"
    assert (await client.get(f"/api/sessions/{data['id']}/mentor",headers=headers)).status_code==403
    history=(await client.get("/api/history",headers=headers)).json()
    assert any(row["session_id"]==data["id"] and row["title"].startswith("Бой с двойником") for row in history if "session_id" in row)
    async with storage() as db:
        db.add(User(id=99,username="other",password_hash="unused")); await db.commit()
    other={"Authorization":"Bearer "+create_token(99,"other")}
    assert (await client.post("/api/analytics/potential-twin/duel",headers=other)).status_code == 409
    assert (await client.get(f"/api/sessions/{data['id']}",headers=other)).status_code == 404
    assert (await client.post("/api/analytics/potential-twin/duel")).status_code == 401

    # Finish through the same persistent report path used by the background worker.
    from app import services
    async def enrich(report,state,settings):
        report["narrative"]={"status":"Не достигнута","sections":[]}
        return report
    monkeypatch.setattr(services,"enrich_online_report",enrich)
    async with storage() as db:
        session=await db.get(Session,data["id"])
        state=json.loads(session.state)
        state["history"]=[{"text":"Обсудим предложение и конкретные условия", "reply":"Уточним условия", "techniques":[], "metrics_after":{key:50 for key in METRICS}} for _ in range(5)]
        state["turns"]=5; session.state=json.dumps(state)
        report=await services.finish_session(db,session,await db.get(User,1),background_worker=True)
        assert report["twin_duel"]["status"]=="not_passed"
        assert json.loads(session.report)["twin_duel"]["target_score"]==65
    pdf=await client.get(f"/api/sessions/{data['id']}/report/pdf",headers=headers)
    assert pdf.status_code==200 and pdf.content.startswith(b"%PDF")


async def test_progress_and_twin_pdfs_are_available_only_when_unlocked(client,storage):
    headers={"Authorization":"Bearer "+create_token(1,"alice")}
    assert (await client.get("/api/analytics/progress-report/pdf",headers=headers)).status_code==409
    await seed_sessions(storage)
    for kind in ("progress-report","potential-twin"):
        response=await client.get(f"/api/analytics/{kind}/pdf",headers=headers)
        assert response.status_code==200 and response.content.startswith(b"%PDF")
        assert (await client.get(f"/api/analytics/{kind}/pdf")).status_code==401


async def test_duel_ai_unavailable_does_not_create_fake_session(client,storage,monkeypatch):
    await seed_sessions(storage)
    from app.engine import llm
    async def unavailable(): raise llm.LlmError("unavailable")
    monkeypatch.setattr(llm,"ensure_online_ai_available",unavailable)
    response=await client.post("/api/analytics/potential-twin/duel",headers={"Authorization":"Bearer "+create_token(1,"alice")})
    assert response.status_code==503
    async with storage() as db:
        assert len((await db.scalars(select(Session))).all())==15
