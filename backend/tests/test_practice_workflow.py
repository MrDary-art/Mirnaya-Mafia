import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models import Message, Session, User
from app.engine.input_quality import validate_prompt
from app.engine.mentor import support_summary
from app.routers import game, rooms
from app import report_jobs
from tests.test_room_bookings import booking_env, body


@pytest.mark.parametrize("text", ["аолдрп", "аолдрп аолдрп", "!!!123", "asdf qwer", "аааааааааа"])
def test_random_setup_is_rejected_locally(text):
    with pytest.raises(ValueError):
        validate_prompt(text)


@pytest.mark.parametrize("text", ["Обсудить повышение зарплаты", "Backend Python developer", "Собеседование учителя математики", "Договориться с HR", "Купить дом из дерева"])
def test_specific_tasks_do_not_need_a_known_job_dictionary(text):
    assert validate_prompt(text) == text


def test_invalid_setup_does_not_call_planner_or_create_room(booking_env, monkeypatch):
    from app.engine import practice_plan
    client, headers, factory = booking_env
    planner = AsyncMock()
    monkeypatch.setattr(practice_plan, "prepare_practice", planner)
    assert client.post("/api/sessions", headers=headers[1], json={"mode":"online", "problem":"аолдрп"}).status_code == 400
    assert client.post("/api/rooms", headers=headers[1], json={**body(), "request_text":"аолдрп"}).status_code == 422
    planner.assert_not_called()
    rooms.generate_roles.assert_not_called()


def test_mentor_private_idempotent_and_forbidden_in_exam(booking_env, monkeypatch):
    from app.engine import mentor, practice_plan
    client, headers, factory = booking_env
    monkeypatch.setattr(practice_plan,"prepare_practice",AsyncMock(return_value={"opening":"Какое решение предлагаете?"}))
    provider=AsyncMock(return_value=("Вы хотите согласовать бюджет. Чем помочь?", "gigachat"))
    monkeypatch.setattr(mentor,"mentor_reply",provider)
    session=client.post("/api/sessions",headers=headers[1],json={"mode":"online","problem":"Согласовать бюджет проекта","goal":"Сохранить объём работ"}).json()
    path=f"/api/sessions/{session['id']}/mentor"
    assert client.post(path,headers=headers[2],json={}).status_code==404
    request={"request_id":"first","text":""}
    first=client.post(path,headers=headers[1],json=request)
    assert first.status_code==200,first.text
    assert len(client.post(path,headers=headers[1],json=request).json()["messages"])==2
    assert provider.await_count==1
    assert client.post(path,headers=headers[1],json={"text":"qwerty","request_id":"second"}).status_code==422
    transcript=client.get(f"/api/sessions/{session['id']}",headers=headers[1]).json()["messages"]
    assert len(transcript)==1 and "Чем помочь" not in transcript[0]["text"]
    async def attach_exam():
        async with factory() as db:
            row=await db.get(Session,session["id"])
            settings=json.loads(row.settings);settings.update(room_id=7,ghost=True)
            row.settings=json.dumps(settings);await db.commit()
    asyncio.run(attach_exam())
    assert client.post(path,headers=headers[1],json={"text":"Как ответить?"}).status_code==403
    assert client.post(f"/api/sessions/{session['id']}/coach",headers=headers[1]).status_code==403
    assert provider.await_count==1


def test_learning_support_does_not_claim_independent_mastery():
    state={"history":[{}, {}, {}],"mentor":{"first_turn":1,"messages":[{"role":"assistant"}]}}
    summary=support_summary(state)
    assert summary["used"] and summary["independent_answers"]==1 and summary["answers_after_activation"]==2
    assert "штраф" not in summary["summary"]


def test_report_queue_survives_disconnect_and_does_not_finish_twice(booking_env, monkeypatch):
    from app import services
    client, headers, factory = booking_env
    monkeypatch.setattr(report_jobs,"SessionLocal",factory)
    completed=[]
    async def finish(db,session,user,**kwargs):
        completed.append(session.id)
        session.report=json.dumps({"summary":"saved"});session.status="finished";await db.commit()
    monkeypatch.setattr(services,"finish_session",finish)
    async def run():
        async with factory() as db:
            row=Session(user_id=1,mode="online",status="active",settings="{}",state='{"history":[{"text":"Последний ответ"}]}',metrics="{}",role="Игрок",opponent_role="Собеседник")
            db.add(row);await db.commit();await db.refresh(row)
            await report_jobs.queue_report(db,row)
            saved_id=row.id
        await asyncio.gather(report_jobs.process_report(saved_id),report_jobs.process_report(saved_id))
        async with factory() as db:
            saved=await db.get(Session,saved_id)
            assert json.loads(saved.state)["history"][0]["text"]=="Последний ответ"
            assert saved.status=="finished"
        assert completed==[saved_id]
    asyncio.run(run())


def test_retry_enriches_saved_report_without_awarding_again(booking_env, monkeypatch):
    from app import services
    from app.engine import online_report
    client, headers, factory = booking_env
    monkeypatch.setattr(report_jobs, "SessionLocal", factory)
    finish = AsyncMock()
    monkeypatch.setattr(services, "finish_session", finish)
    async def enrich(report, state, settings):
        return {**report, "narrative": {"source": "ai", "headline": "Разбор"}}
    monkeypatch.setattr(online_report, "enrich_online_report", enrich)
    async def run():
        async with factory() as db:
            row = Session(user_id=1, mode="online", status="finished", settings="{}", state='{"history":[{"text":"Мой ответ"}]}', metrics="{}", role="Игрок", opponent_role="Собеседник", report=json.dumps({"stars_earned":3,"narrative":{"source":"transcript"}}))
            db.add(row); await db.commit(); await db.refresh(row)
            saved_id = row.id
            assert (await report_jobs.queue_report(db,row,retry=True))["report_status"] == "queued"
            assert json.loads(row.report)["stars_earned"] == 3
        await report_jobs.process_report(saved_id)
        async with factory() as db:
            row = await db.get(Session,saved_id)
            assert row.status == "finished"
            assert json.loads(row.report)["narrative"]["source"] == "ai"
            assert json.loads(row.report)["stars_earned"] == 3
        finish.assert_not_called()
    asyncio.run(run())


def test_invitation_decline_propose_time_and_accept_are_visible_to_both(booking_env):
    from datetime import datetime, timedelta, timezone
    client, h, factory = booking_env
    room = client.post('/api/rooms',headers=h[1],json=body()).json()
    assert client.post(f"/api/rooms/{room['id']}/invite",headers=h[1],json={"friend_id":2}).status_code == 200
    invitation = client.get('/api/social/messages/1',headers=h[2]).json()[-1]
    path = f"/api/social/booked-invitations/{invitation['id']}"
    assert client.post(path+'/decline',headers=h[3],json={}).status_code == 404
    assert client.post(path+'/decline',headers=h[2],json={}).status_code == 200
    assert client.get('/api/social/messages/2',headers=h[1]).json()[-1]['payload']['status'] == 'declined'
    proposed = (datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
    assert client.post(path+'/propose',headers=h[2],json={'scheduled_at':proposed}).status_code == 200
    assert client.get('/api/social/messages/2',headers=h[1]).json()[-1]['payload']['status'] == 'time_proposed'
    assert client.post(path+'/accept-time',headers=h[2],json={}).status_code == 403
    response = client.post(path+'/accept-time',headers=h[1],json={})
    assert response.status_code == 200, response.text
    assert client.get('/api/social/messages/1',headers=h[2]).json()[-1]['payload']['status'] == 'pending'
    actual = client.get(f"/api/rooms/{room['id']}",headers=h[1]).json()
    assert datetime.fromisoformat(actual['scheduled_at']) == datetime.fromisoformat(proposed)


def test_optional_events_only_change_enabled_prompt_at_designated_turn():
    from app.engine.practice_plan import plan_instruction
    normal = plan_instruction({}, {'turns':3})
    assert 'Дополнительный интерес' not in normal and 'усложнение' not in normal
    assert 'Дополнительный интерес' in plan_instruction({'hidden_goal':True}, {'turns':0})
    assert 'усложнение' in plan_instruction({'chaos':True}, {'turns':3})
    assert 'усложнение' not in plan_instruction({'chaos':True}, {'turns':4})
