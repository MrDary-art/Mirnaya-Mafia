import asyncio
from datetime import timedelta
from sqlalchemy import select
from app.db import get_db
from app.main import app
from app.company_models import Company, CompanyMembership
from app.council_models import CouncilMember
from tests.test_council import council_client


def seed():
    async def run():
        async for db in app.dependency_overrides[get_db]():
            db.add_all([Company(id=101, name="Команда А", slug="team-a", created_by=9702), Company(id=102, name="Команда Б", slug="team-b", created_by=9704)])
            await db.flush()
            db.add_all(CompanyMembership(company_id=cid, user_id=uid, status="ACTIVE", corporate_role=role) for cid, uid, role in [
                (101,9702,"COMPANY_OWNER"),(101,9703,"EMPLOYEE"),(101,9706,"EMPLOYEE"),
                (102,9704,"COMPANY_OWNER"),(102,9705,"EMPLOYEE")])
            await db.commit()
    asyncio.run(run())


def schedule(client, clock, **changes):
    return {"scheduled_at": (clock["now"] + timedelta(hours=24)).isoformat()+"Z", "organizer_username": "council-9701",
        "format": "tournament", "companies": [{"company_id":101,"seats":2},{"company_id":102,"seats":2}],
        "director_permissions": {"scope":"own","muted":True,"camera_blocked":False,"kick":False}, **changes}


def publish(client, clock, **changes):
    response = client.post("/api/admin/council", headers=client.council_admin_headers, json=schedule(client,clock,**changes))
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_tournament_visibility_quotas_and_call_privacy(council_client):
    client,h,clock=council_client; seed(); mid=publish(client,clock); path=f"/api/council/{mid}"
    assert client.get("/api/council/catalog").json()==[]
    assert client.get(path,headers=h[9707]).status_code==404
    assert client.post(path+"/join",headers=h[9707],json={}).status_code==404
    assert client.get("/api/council",headers=h[9707]).json()==[]
    for company_id,uid in [(101,9702),(102,9704)]:
        rows=client.get(f"/api/council?company_id={company_id}",headers=h[uid]).json()
        assert [row["id"] for row in rows]==[mid]
        assert client.get(path+f"?company_id={company_id}",headers=h[uid]).status_code==200
    for uid in (9702,9703):
        assert client.post(path+"/join",headers=h[uid],json={}).json()["status"]=="confirmed"
    assert client.post(path+"/join",headers=h[9706],json={}).json()["status"]=="waitlist"
    for uid in (9704,9705): assert client.post(path+"/join",headers=h[uid],json={}).json()["status"]=="confirmed"
    clock["now"] += timedelta(hours=23,minutes=50)
    detail=client.get(path,headers=h[9702]).json()
    assert detail["status"]=="preparation" and detail["confirmed"]==4
    assert detail["can_manage"] is False and detail["can_moderate"] is True
    assert detail["my_role"] and all(p["packet"] is None for p in detail["managed_members"])
    assert detail["facilitator_roles"] is None
    assert {p["company_id"] for p in detail["managed_members"]}=={101}
    assert client.put(path+"/call",headers=h[9703],json={"session":"test-call-one","mic":True}).status_code==200
    assert client.get(path+"/call",headers=h[9707]).status_code==404
    assert client.post(path+"/signal",headers=h[9703],json={"recipient_id":9707,"kind":"offer","payload":{}}).status_code==422
    assert client.get(path+"?company_id=101",headers=h[9704]).status_code==403
    calendar=client.get("/api/company/102/calendar",headers=h[9704]).json()
    assert any(item.get("council_id")==mid for item in calendar)


def test_director_capabilities_scope_revocation_and_platform_control(council_client):
    client,h,clock=council_client;seed();mid=publish(client,clock);path=f"/api/council/{mid}"
    for uid in (9703,9705): assert client.post(path+"/join",headers=h[uid],json={}).status_code==200
    control=lambda actor,target,body:client.patch(path+f"/members/{target}/controls",headers=h[actor],json=body)
    assert control(9702,9703,{"muted":True}).status_code==200
    assert control(9702,9705,{"muted":True}).status_code==403
    assert control(9702,9703,{"camera_blocked":True}).status_code==403
    assert control(9702,9703,{"muted":False,"camera_blocked":True}).status_code==403
    assert client.post(path+"/members/9703/kick",headers=h[9702]).status_code==403
    assert client.post(path+"/finish",headers=h[9702]).status_code in (403,404)
    assert client.get(path,headers=h[9702]).json()["managed_members"][0]["packet"] is None
    policy_url=f"/api/admin/council/{mid}/director-permissions"
    assert client.patch(policy_url,headers=h[9702],json={"scope":"all","muted":True}).status_code==403
    assert client.patch(policy_url,headers=client.council_admin_headers,json={"scope":"all","muted":True,"camera_blocked":True,"kick":True}).status_code==200
    assert control(9702,9705,{"camera_blocked":True}).status_code==200
    assert control(9702,9701,{"muted":True}).status_code==403
    assert client.patch(policy_url,headers=client.council_admin_headers,json={"scope":"none"}).status_code==200
    assert control(9702,9703,{"muted":False}).status_code==403
    assert client.patch(f"/api/admin/council/{mid}/members/9703/controls",headers=client.council_admin_headers,json={"muted":False}).status_code==200
    assert client.get(f"/api/admin/council/{mid}/manage",headers=client.council_admin_headers).status_code==200
    assert client.get(f"/api/admin/council/{mid}/manage",headers=h[9702]).status_code==403


def test_company_schedule_validation_defaults_and_membership_revocation(council_client):
    client,h,clock=council_client;seed()
    for changes in [{"companies":[]},{"companies":[{"company_id":101,"seats":2},{"company_id":101,"seats":2}]},{"companies":[{"company_id":101,"seats":1},{"company_id":102,"seats":2}]},{"format":"company"},{"director_permissions":{"scope":"surprise"}},{"companies":[{"company_id":9999,"seats":4}]},{"organizer_plays":True}]:
        assert client.post("/api/admin/council",headers=client.council_admin_headers,json=schedule(client,clock,**changes)).status_code==422
    mid=publish(client,clock,format="company",companies=[{"company_id":101,"seats":4}])
    path=f"/api/council/{mid}"
    assert client.get(path,headers=h[9704]).status_code==404
    assert client.post(path+"/join",headers=h[9703],json={}).status_code==200
    policy={"scope":"own","muted":True,"camera_blocked":True,"kick":False}
    assert client.put("/api/admin/council/director-defaults",headers=client.council_admin_headers,json=policy).status_code==200
    assert client.get("/api/admin/council/director-defaults",headers=client.council_admin_headers).json()==policy
    async def remove():
        async for db in app.dependency_overrides[get_db]():
            membership=await db.scalar(select(CompanyMembership).where(CompanyMembership.user_id==9703,CompanyMembership.company_id==101))
            membership.status="REMOVED";await db.commit()
    asyncio.run(remove())
    assert client.get(path,headers=h[9703]).status_code==404
    assert client.get(path+"/call",headers=h[9703]).status_code==404


def test_company_reserve_cannot_cross_quota(council_client):
    client,h,clock=council_client;seed();mid=publish(client,clock);path=f"/api/council/{mid}"
    for uid in (9702,9703,9706):client.post(path+"/join",headers=h[uid],json={})
    assert client.post(path+"/leave",headers=h[9703]).status_code==200
    detail=client.get(path,headers=h[9706]).json()
    assert detail["my_status"]=="offered"
    assert client.post(path+"/join",headers=h[9706],json={}).json()["status"]=="confirmed"
