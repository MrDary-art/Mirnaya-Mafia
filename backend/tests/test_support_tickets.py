import asyncio
import json
from datetime import datetime,timedelta
import pytest
from sqlalchemy import select,update
from app.auth import create_token
from app.models import User,Notification
from app.council_models import CouncilModerator
from app.support_models import SupportTicket,SupportTicketMessage,SupportActionLog
from app.support_service import record_action
from .test_installation_speech import storage
from .test_installation_security import client,admin_token


async def people(storage):
    async with storage() as db:
        db.add_all([User(id=3,username="moderator-a",password_hash="unused"),User(id=4,username="moderator-b",password_hash="unused"),User(id=5,username="outsider",password_hash="unused")])
        await db.flush()
        db.add_all([CouncilModerator(user_id=3,appointed_by=2),CouncilModerator(user_id=4,appointed_by=2)])
        await db.commit()
    return {uid:{"Authorization":"Bearer "+create_token(uid,"alice" if uid==1 else f"person-{uid}")} for uid in (1,3,4,5)}


async def new_ticket(client,headers):
    response=await client.post("/api/support/tickets/messages",headers=headers,json={"text":"Не получается сохранить результат","path":"/profile?token=never-store-this", "client":{"language":"ru-RU","timezone":"Europe/Moscow","viewport":"1280 × 800"}})
    assert response.status_code==200,response.text
    return response.json()["ticket_id"]


async def action(client,ticket,headers,kind,text=""):
    return await client.post(f"/api/admin/support/tickets/{ticket}/actions",headers=headers,json={"action":kind,"text":text})


async def test_ticket_lifecycle_requires_owner_confirmation_and_retains_archive(client,storage):
    admin=await admin_token(storage);h=await people(storage)
    ticket=await new_ticket(client,h[1])
    assert (await action(client,ticket,h[5],"claim")).status_code==403
    assert (await action(client,ticket,h[3],"reply","Попытка без захвата")).status_code==409
    assert (await action(client,ticket,h[3],"claim")).status_code==200
    assert (await action(client,ticket,h[4],"reply","Чужой ответ")).status_code==409
    assert (await action(client,ticket,h[3],"resolve","Исправили сохранение. Проверьте результат.")).json()["status"]=="WAITING_USER"
    assert (await client.get("/api/admin/support/tickets?status=CLOSED",headers=admin)).json()["total"]==0
    assert (await client.post(f"/api/support/tickets/{ticket}/confirm",headers=h[5],json={"resolved":True})).status_code==404
    assert (await client.post(f"/api/support/tickets/{ticket}/confirm",headers=h[1],json={"resolved":False})).json()["status"]=="IN_PROGRESS"
    assert (await action(client,ticket,h[3],"resolve","Второе исправление, проверьте ещё раз.")).status_code==200
    assert (await client.post(f"/api/support/tickets/{ticket}/confirm",headers=h[1],json={"resolved":True})).json()["status"]=="CLOSED"
    assert (await client.get("/api/admin/support/tickets?status=CLOSED",headers=admin)).json()["total"]==1
    assert (await action(client,ticket,h[3],"reply","После закрытия")).status_code==409
    assert (await client.get(f"/api/support/tickets/{ticket}",headers=h[1])).json()["messages"][-1]["text"]=="Второе исправление, проверьте ещё раз."


async def test_escalation_locks_moderators_and_notifies_developer(client,storage):
    admin=await admin_token(storage);h=await people(storage)
    ticket=await new_ticket(client,h[1])
    assert (await action(client,ticket,h[3],"claim")).status_code==200
    assert (await action(client,ticket,h[3],"escalate","Ошибка сохранения, нужен разработчик")).status_code==200
    for kind in ("claim","reply","resolve","release"):
        assert (await action(client,ticket,h[3],kind,"Обход ограничения")).status_code==403
    assert (await client.post("/api/admin/operations/support/1",headers=h[3],json={"text":"Обход старым API"})).status_code==403
    notice=(await client.get("/api/admin/support/developer-notifications",headers=admin)).json()
    assert notice["waiting"]==1 and notice["count"]==1
    assert (await client.get("/api/admin/support/developer-notifications",headers=h[3])).status_code==403
    assert (await action(client,ticket,admin,"claim")).status_code==200
    assert (await action(client,ticket,admin,"resolve","Разработчик исправил ошибку.")).status_code==200
    public=(await client.get(f"/api/support/tickets/{ticket}",headers=h[1])).json()
    assert "Ошибка сохранения, нужен разработчик" not in json.dumps(public,ensure_ascii=False)
    assert public["status"]=="WAITING_USER"


async def test_simultaneous_claims_have_exactly_one_winner(client,storage):
    await admin_token(storage);h=await people(storage)
    ticket=await new_ticket(client,h[1])
    responses=await asyncio.gather(action(client,ticket,h[3],"claim"),action(client,ticket,h[4],"claim"))
    assert sorted(r.status_code for r in responses)==[200,409]
    detail=(await client.get(f"/api/admin/support/tickets/{ticket}",headers=h[3])).json()
    assert detail["assigned_to"] in (3,4) and detail["assignee"]


async def test_private_snapshot_is_last_ten_actions_and_never_public(client,storage):
    admin=await admin_token(storage);h=await people(storage)
    async with storage() as db:
        for i in range(14):await record_action(db,1,"Действие",f"/business/6/calendar/{i}","POST",200)
        await record_action(db,1,"Не сохранять","/reset-password/secret")
        await db.commit()
    ticket=await new_ticket(client,h[1])
    private=(await client.get(f"/api/admin/support/tickets/{ticket}",headers=admin)).json()["diagnostics"]
    assert len(private["actions"])==10 and private["actions"][0]["route"].endswith("/4")
    assert private["actions"][-1]["route"].endswith("/13") and private["page"]=="/profile"
    assert "never-store-this" not in json.dumps(private)
    for path in ("/api/support/messages","/api/support/tickets",f"/api/support/tickets/{ticket}"):
        response=await client.get(path,headers=h[1])
        data=json.dumps(response.json())
        assert response.status_code==200
        for field in ("diagnostics","private_context","internal_note","viewport","browser","actions","assigned_to"):
            assert f'"{field}"' not in data
    assert (await client.get(f"/api/support/tickets/{ticket}",headers=h[5])).status_code==404
    assert (await client.get(f"/api/admin/support/tickets/{ticket}",headers=h[5])).status_code==403


async def test_community_and_support_share_queue_without_revealing_reporter(client,storage):
    from app.social_models import SocialPost
    admin=await admin_token(storage);h=await people(storage)
    async with storage() as db:
        db.add(SocialPost(id=80,author_user_id=5,body="Проверяемый текст",status="PUBLISHED",audience="PUBLIC"))
        await db.commit()
    posted=await client.post("/api/social/reports",headers=h[1],json={"target_type":"POST","target_id":80,"reason":"Нарушение правил"})
    assert posted.status_code==200,posted.text
    support=await new_ticket(client,h[1])
    queue=(await client.get("/api/admin/support/tickets",headers=h[3])).json()
    assert {row["kind"] for row in queue["items"]}=={"COMMUNITY","SUPPORT"}
    community=next(row for row in queue["items"] if row["kind"]=="COMMUNITY")
    assert len((await client.get("/api/admin/operations",headers=h[3])).json()["messages"])==1
    assert community["username"] is None and community["name"]=="Обращение сообщества"
    identifier=community["id"]
    assert (await action(client,identifier,h[3],"claim")).status_code==200
    response=await client.post(f"/api/admin/support/tickets/{identifier}/content",headers=h[3],json={"action":"hide"})
    assert response.status_code==200,response.text
    assert (await client.get(f"/api/admin/support/tickets/{identifier}",headers=admin)).json()["content"]["status"]=="HIDDEN"
    assert (await action(client,identifier,h[3],"resolve","Материал скрыт, спасибо за обращение.")).status_code==200
    assert (await client.get("/api/admin/support/tickets?status=CLOSED",headers=admin)).json()["total"]==0
    assert (await client.post(f"/api/support/tickets/{identifier}/confirm",headers=h[1],json={"resolved":True})).status_code==200


async def test_real_mutations_are_logged_without_request_body(client,storage,monkeypatch,caplog):
    from app import support_service
    observed=[]
    original=support_service.record_action
    async def record(*args,**kwargs):
        observed.append((args[1:4],kwargs))
        await original(*args,**kwargs)
    monkeypatch.setattr(support_service,"record_action",record)
    await admin_token(storage);h=await people(storage)
    response=await client.post("/api/social/reports",headers=h[1],json={"target_type":"POST","target_id":99999,"reason":"Do not put this body into action log"})
    assert response.status_code==404
    async with storage() as db:
        rows=(await db.scalars(select(SupportActionLog).where(SupportActionLog.user_id==1))).all()
        assert any(row.route=="/api/social/reports" and row.status_code==404 for row in rows), (observed,caplog.text)
        assert "Do not put this body" not in repr([(r.route,r.action) for r in rows])


async def test_new_message_reopens_pending_but_closed_ticket_cannot_be_written(client,storage):
    admin=await admin_token(storage);h=await people(storage)
    ticket=await new_ticket(client,h[1])
    await action(client,ticket,h[3],"claim")
    await action(client,ticket,h[3],"resolve","Предлагаем решение.")
    async with storage() as db:
        from app.support_service import now
        await db.execute(update(SupportTicketMessage).values(created_at=now()-timedelta(minutes=2)))
        await db.commit()
    response=await client.post("/api/support/tickets/messages",headers=h[1],json={"text":"Проблема ещё осталась","ticket_id":ticket})
    assert response.status_code==200,response.text
    assert (await client.get(f"/api/support/tickets/{ticket}",headers=h[1])).json()["status"]=="IN_PROGRESS"
    await action(client,ticket,h[3],"resolve","Новое решение.")
    await client.post(f"/api/support/tickets/{ticket}/confirm",headers=h[1],json={"resolved":True})
    assert (await client.post("/api/support/tickets/messages",headers=h[1],json={"text":"Нельзя в закрытый","ticket_id":ticket})).status_code==409


async def test_moderator_can_review_stories_but_not_site_settings(client,storage):
    await admin_token(storage);h=await people(storage)
    assert (await client.get("/api/admin/stories/queue",headers=h[3])).status_code==200
    assert (await client.get("/api/admin/stories/queue",headers=h[5])).status_code==403
    assert (await client.get("/api/admin/installation",headers=h[3])).status_code==403
    assert (await client.get("/api/admin/management/users",headers=h[3])).status_code==403
