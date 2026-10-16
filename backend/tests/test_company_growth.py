import asyncio
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.company_models import (Company, CompanyAssignment, CompanyAssignmentAttempt, CompanyAssignmentTarget,
    CompanyMembership, CompanySubscription)
from app.db import Base, get_db
from app.main import app
from app.models import User
from app.services import dumps


def test_schedules_packs_leagues_and_personalization_are_real_and_scoped():
    engine=create_async_engine("sqlite+aiosqlite:///:memory:",poolclass=StaticPool)
    factory=async_sessionmaker(engine,expire_on_commit=False)
    async def setup():
        async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            users=[User(id=i,username=f"member-{i}",password_hash="unused",display_name=f"Участник {i}") for i in range(1,7)]
            db.add_all(users);db.add(Company(id=1,name="Лига",slug="league",created_by=1));await db.flush()
            members=[]
            for i in range(1,7):
                member=CompanyMembership(id=i,company_id=1,user_id=i,corporate_role="COMPANY_OWNER" if i==1 else "EMPLOYEE",status="ACTIVE",personalization_enabled=1 if i==2 else 0)
                members.append(member)
            db.add_all(members);db.add(CompanySubscription(company_id=1,plan_code="BUSINESS",status="ACTIVE",licensed_seats=10));await db.flush()
            assignment=CompanyAssignment(id=1,company_id=1,title="Шаблон",scenario_id="sales_discount_01",created_by=1,assignment_snapshot="{}")
            db.add(assignment);await db.flush()
            for i in range(1,7):
                target=CompanyAssignmentTarget(company_id=1,assignment_id=1,membership_id=i,status="PASSED",best_score=70+i)
                db.add(target);await db.flush()
                db.add(CompanyAssignmentAttempt(company_id=1,assignment_id=1,target_id=target.id,membership_id=i,
                    final_score=70+i,status="COMPLETED",metrics_snapshot=dumps({"trust":60+i,"goal":70+i,"control":65+i,"eq":68+i}),completed_at=datetime.now()))
            await db.commit()
    async def provide_db():
        async with factory() as db: yield db
    asyncio.run(setup());app.dependency_overrides[get_db]=provide_db
    owner={"Authorization":f"Bearer {create_token(1,'member-1')}"};employee={"Authorization":f"Bearer {create_token(2,'member-2')}"}
    try:
        client=TestClient(app)
        installed=client.post("/api/company/1/industry-packs/sales/install",headers=owner)
        assert installed.status_code==200 and installed.json()["created"]==3
        assert client.post("/api/company/1/industry-packs/sales/install",headers=owner).json()["created"]==0
        schedule=client.post("/api/company/1/assignment-schedules",headers=owner,json={
            "template_assignment_id":1,"cadence":"WEEKLY","next_run_at":(datetime.now()+timedelta(days=1)).isoformat(),
            "deadline_offset_days":5,"membership_ids":[2,3],
        })
        assert schedule.status_code==200
        schedule_id=schedule.json()["id"]
        run=client.post(f"/api/company/1/assignment-schedules/{schedule_id}/run",headers=owner)
        assert run.status_code==200 and run.json()["recipients"]==2
        paused=client.patch(f"/api/company/1/assignment-schedules/{schedule_id}",headers=owner,json={"status":"PAUSED"})
        assert paused.status_code==200 and paused.json()["status"]=="PAUSED"
        league=client.post("/api/company/1/leagues",headers=owner,json={"title":"Осенний сезон","season":"2026"})
        assert league.status_code==200
        league_id=league.json()["id"]
        joined=client.post(f"/api/company/1/leagues/{league_id}/join",headers=owner,json={"public_name":"Команда Лига"})
        assert joined.status_code==200 and joined.json()["status"]=="PUBLISHED"
        standings=client.get(f"/api/company/1/leagues/{league_id}/standings",headers=employee).json()
        assert standings["standings"][0]["name"]=="Команда Лига"
        assert "company_id" not in standings["standings"][0]
        entry_id=standings["standings"][0]["id"]
        moderated=client.patch(f"/api/company/1/leagues/{league_id}/entries/{entry_id}",headers=owner,json={"status":"SUSPENDED"})
        assert moderated.status_code==200
        assert client.get(f"/api/company/1/leagues/{league_id}/standings",headers=employee).json()["standings"]==[]
        left=client.delete(f"/api/company/1/leagues/{league_id}/membership",headers=owner)
        assert left.status_code==200 and left.json()["status"]=="WITHDRAWN"
        insights=client.get("/api/company/1/personalization/insights",headers=employee)
        assert insights.status_code==200 and insights.json()["sample_size"]==1
        assert insights.json()["recommendations"][0]["evidence"]["attempts"]==1
    finally:
        app.dependency_overrides.clear();asyncio.run(engine.dispose())
