"""Exercise privileged mutations against an isolated database, never local accounts."""
import json
from datetime import datetime
import pytest
from sqlalchemy import select
from app.auth import create_token, hash_password, verify_password
from app.models import User, Session, AppSetting, StarTransaction, ArenaRoom
from app.company_models import Company, CompanyMembership
from app.deployment_models import AdminAudit
from app.lab_models import LabRun
from .test_installation_speech import storage
from .test_installation_security import client, admin_token


async def test_account_access_and_password_revocation(client, storage):
    headers = await admin_token(storage)
    async with storage() as db:
        user = await db.get(User, 1)
        user.password_hash = hash_password("old-password-for-test")
        token = create_token(1, user.username, user.password_hash)
        legacy_token = create_token(1, user.username)
        await db.commit()
    body = {"action":"password", "reason":"Смена в тесте", "password":"new-password-for-test"}
    assert (await client.post("/api/admin/management/users/1", headers={"Authorization":"Bearer "+token}, json=body)).status_code == 403
    assert (await client.post("/api/admin/management/users/2", headers=headers, json=body)).status_code == 409
    assert (await client.post("/api/admin/management/users/1", headers=headers, json=body)).status_code == 200
    assert (await client.get("/api/auth/me", headers={"Authorization":"Bearer "+token})).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization":"Bearer "+legacy_token})).status_code == 401
    async with storage() as db:
        user = await db.get(User, 1)
        assert verify_password(body["password"], user.password_hash)
        events = (await db.scalars(select(AdminAudit))).all()
        assert body["password"] not in events[-1].detail


async def test_stars_are_idempotent_and_cannot_overdraw(client, storage):
    headers = await admin_token(storage)
    body = {"action":"stars", "reason":"Награда в тесте", "amount":50, "operation_id":"test-reward"}
    for _ in range(2):
        assert (await client.post("/api/admin/management/users/1", headers=headers, json=body)).status_code == 200
    async with storage() as db:
        assert (await db.get(User, 1)).stars == 50
        assert len((await db.scalars(select(StarTransaction))).all()) == 1
    response = await client.post("/api/admin/management/users/1", headers=headers, json={**body,"amount":-51,"operation_id":"debit"})
    assert response.status_code == 409


async def test_delete_retains_reports_closes_tokens_and_restore_needs_new_password(client, storage):
    headers = await admin_token(storage)
    async with storage() as db:
        user = await db.get(User, 1)
        user.password_hash = hash_password("old-password-for-test")
        token = create_token(1, user.username, user.password_hash)
        db.add(Session(id=1,user_id=1,mode="scenario",role="a",opponent_role="b",report='{"saved":true}'))
        await db.commit()
    body = {"action":"delete","reason":"Удаление в тесте","confirmation":"wrong"}
    assert (await client.post("/api/admin/management/users/1",headers=headers,json=body)).status_code == 409
    body["confirmation"] = "alice"
    assert (await client.post("/api/admin/management/users/1",headers=headers,json=body)).status_code == 200
    assert (await client.get("/api/auth/me",headers={"Authorization":"Bearer "+token})).status_code == 401
    assert (await client.get("/api/admin/management/users?limit=20",headers=headers)).json()["total"] == 1
    assert (await client.get("/api/admin/management/users?deleted=true",headers=headers)).json()["items"][0]["username"] == "alice"
    async with storage() as db:
        assert json.loads((await db.get(Session,1)).report) == {"saved":True}
    assert (await client.post("/api/admin/management/users/1",headers=headers,json={"action":"restore","reason":"Восстановление в тесте"})).status_code == 200
    assert (await client.post("/api/auth/login",json={"username":"alice","password":"old-password-for-test"})).status_code == 401


async def make_company(storage):
    async with storage() as db:
        db.add(User(id=3,username="successor",password_hash="unused"))
        db.add(Company(id=1,name="Original",slug="original",created_by=1))
        await db.flush()
        db.add(CompanyMembership(id=1,company_id=1,user_id=1,status="ACTIVE",corporate_role="COMPANY_OWNER"))
        await db.commit()


async def test_company_name_lock_cannot_be_cleared_through_owner_settings(client,storage):
    headers = await admin_token(storage)
    await make_company(storage)
    body={"action":"rename","name":"Moderated name","reason":"Исправление названия"}
    assert (await client.post("/api/admin/management/companies/1",headers=headers,json=body)).status_code == 200
    owner={"Authorization":"Bearer "+create_token(1,"alice")}
    response=await client.put("/api/company/1/settings",headers=owner,json={"name":"Bypass","settings":{}})
    assert response.status_code == 403
    assert (await client.get("/api/company/context?company_id=1",headers=owner)).json()["company"]["name_locked"] is True
    assert (await client.put("/api/company/1/settings",headers=owner,json={"description":"Other fields work","settings":{}})).status_code == 200
    assert (await client.put("/api/company/1/settings",headers=owner,json={"short_name":"Bypass"})).status_code == 403
    assert (await client.post("/api/admin/management/companies/1",headers=headers,json={"action":"unlock_name","reason":"Запрос рассмотрен"})).status_code == 200
    assert (await client.put("/api/company/1/settings",headers=owner,json={"name":"Allowed"})).status_code == 200


async def test_owner_transfer_and_last_owner_protection(client,storage):
    headers=await admin_token(storage)
    await make_company(storage)
    path="/api/admin/management/companies/1"
    remove={"action":"remove_member","username":"alice","reason":"Передача руководства"}
    assert (await client.post(path,headers=headers,json=remove)).status_code == 409
    assert (await client.post("/api/admin/management/users/1",headers=headers,json={"action":"delete","reason":"Удаление в тесте","confirmation":"alice"})).status_code == 409
    assert (await client.post(path,headers=headers,json={"action":"member","username":"successor","role":"COMPANY_OWNER","reason":"Назначение директора"})).status_code == 200
    assert (await client.post(path,headers=headers,json=remove)).status_code == 200
    async with storage() as db:
        assert (await db.get(Company,1)).created_by == 3
        assert (await db.get(CompanyMembership,1)).status == "LEFT"


async def test_unified_activity_deduplicates_duel_and_shows_zero_modes(client,storage):
    from app.council_models import CouncilMeeting, CouncilMember
    headers=await admin_token(storage)
    async with storage() as db:
        db.add(User(id=3,username="guest",password_hash="unused"))
        await db.flush()
        db.add_all([Session(id=1,user_id=1,mode="scenario",role="a",opponent_role="b",status="finished",finished_at=datetime(2026,1,1),created_at=datetime(2026,1,1)),
                    Session(id=2,user_id=1,mode="online",role="a",opponent_role="b",settings='{"room_id":1}'),
                    ArenaRoom(id=1,code="room-one",host_id=1,guest_id=3,mode="duel",state="{}",status="finished",started_at=datetime(2026,1,2),finished_at=datetime(2026,1,2)),
                    ArenaRoom(id=2,code="room-two",host_id=1,mode="human",state="{}",status="waiting"),
                    LabRun(id="lab1",user_id=1,trainer_id="echo",case_id="case1",status="completed",state="{}")])
        db.add(CouncilMeeting(id=1,organizer_id=1,visibility="public",scheduled_at=datetime(2026,1,3),status="open"))
        await db.flush()
        db.add(CouncilMember(meeting_id=1,user_id=3,status="confirmed"))
        await db.commit()
    response=await client.get("/api/admin/management/overview",headers=headers)
    assert response.status_code == 200, response.text
    data=response.json()
    rows={row["id"]:row for row in data["modes"]}
    assert rows["scenario"]["finished"] == 1 and rows["online"]["started"] == 0
    assert rows["duel"]["started"] == 1 and rows["human"]["started"] == 0
    assert rows["lab:echo"]["finished"] == 1 and rows["council"]["started"] == 0
    assert data["started"] == 3
    listed=(await client.get("/api/admin/management/activity?sort=oldest",headers=headers)).json()
    assert listed["items"][0]["id"] == "1" and listed["items"][0]["kind"] == "session"
    assert listed["total"] == 5
    today=(await client.get("/api/admin/management/overview?days=1",headers=headers)).json()
    assert next(row for row in today["modes"] if row["id"] == "scenario")["started"] == 0
    assert (await client.get("/api/admin/management/activity?mode=lab%3Aecho",headers=headers)).json()["total"] == 1
    guest_rows=(await client.get("/api/admin/management/activity?q=guest",headers=headers)).json()["items"]
    assert len(guest_rows) == 2
    assert all("guest" in [p["username"] for p in row["participants"]] for row in guest_rows)


async def test_ban_and_unban_use_existing_access_control(client,storage):
    headers=await admin_token(storage)
    user_headers={"Authorization":"Bearer "+create_token(1,"alice")}
    assert (await client.post("/api/admin/management/users/1",headers=headers,json={"action":"ban","hours":24,"reason":"Блокировка в тесте"})).status_code == 200
    assert (await client.get("/api/profile",headers=user_headers)).status_code == 403
    assert (await client.post("/api/admin/management/users/1",headers=headers,json={"action":"unban","reason":"Разблокировка в тесте"})).status_code == 200
    async with storage() as db:
        assert await db.get(AppSetting,"moderation_ban:1") is None


async def test_recognition_summary_is_on_dashboard(client,storage):
    import time
    from app.deployment_models import SpeechJob
    from .test_installation_speech import queued
    headers=await admin_token(storage)
    for state in ("ready","no_speech","failed"):
        identifier=await queued(storage)
        async with storage() as db:
            row=await db.get(SpeechJob,identifier)
            row.state=state
            row.created=time.time()-10
            row.finished=row.created+5
            await db.commit()
    response=await client.get("/api/admin/server-status",headers=headers)
    assert response.status_code == 200, response.text
    data=response.json()["recognition"]
    assert data["completed"] == 2 and data["failed"] == 1 and data["no_speech"] == 1
    assert data["success_percent"] == 66.7 and data["mean_seconds"] == 5


async def test_pagination_and_invalid_page_sizes(client,storage):
    headers=await admin_token(storage)
    async with storage() as db:
        db.add_all(User(username=f"page-{i:03d}",password_hash="unused") for i in range(53))
        await db.commit()
    for limit in (20,50,100,200):
        result=(await client.get(f"/api/admin/management/users?limit={limit}",headers=headers)).json()
        assert result["total"] == 55 and len(result["items"]) == min(55,limit)
    assert (await client.get("/api/admin/management/users?limit=25",headers=headers)).status_code == 422
    assert len((await client.get("/api/admin/management/users?limit=20&page=3",headers=headers)).json()["items"]) == 15
