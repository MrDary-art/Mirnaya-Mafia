import asyncio
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import create_token
from app.db import Base, get_db
from app.main import app
from app.models import ArenaRoom, DirectMessage, Friendship, Notification, Session, User
from app.routers import rooms
from app.engine import room_booking, room_v2
from app.engine.admin_overview import monthly_overview


@pytest.fixture
def booking_env(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    names = {1:"host", 2:"guest", 3:"stranger", 4:"demo", 5:"admin"}
    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all([User(id=uid, username=name, password_hash="unused", is_admin=int(uid==5)) for uid,name in names.items()])
            db.add(Friendship(user_id=1,friend_id=2,status="FRIENDS"))
            await db.commit()
    async def provide():
        async with factory() as db:
            yield db
    asyncio.run(setup())
    app.dependency_overrides[get_db]=provide
    monkeypatch.setattr(rooms,"generate_roles",AsyncMock(return_value={"host_role":"Заказчик","guest_role":"Исполнитель"}))
    headers={uid:{"Authorization":f"Bearer {create_token(uid,name)}"} for uid,name in names.items()}
    yield TestClient(app),headers,factory
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def body(day=1):
    return {"mode":"human","display_name":"Имя","request_text":"Согласовать бюджет","goal":"Найти решение",
            "scheduled_at":(datetime.now(timezone.utc)+timedelta(days=day)).isoformat(),"duration_minutes":15}


def test_booking_quota_invitation_cancel_and_access(booking_env):
    client,h,factory=booking_env
    created=[]
    for day in range(1,4):
        response=client.post('/api/rooms',headers=h[1],json=body(day))
        assert response.status_code==200,response.text
        created.append(response.json())
    room=created[0]; path=f"/api/rooms/{room['id']}"
    assert room['phase']=='scheduled' and not room['entry_available']
    assert client.post('/api/rooms',headers=h[1],json=body(4)).status_code==409
    assert client.post(path+'/ready',headers=h[1]).status_code==409
    assert client.post(path+'/signal',headers=h[1],json={"kind":"offer","data":{}}).status_code==409
    assert client.get(path+'/signals',headers=h[1]).status_code==409
    assert client.post(path+'/invite',headers=h[1],json={"friend_id":3}).status_code==403
    for _ in range(2):
        assert client.post(path+'/invite',headers=h[1],json={"friend_id":2}).status_code==200
    assert client.get(path,headers=h[1]).json()['invited_friend_ids']==[2]
    async def check_messages():
        async with factory() as db:
            messages=(await db.scalars(select(DirectMessage))).all()
            assert len(messages)==1
            assert json.loads(messages[0].payload)['path']==room['invite_path']
    asyncio.run(check_messages())
    preview=client.get('/api/rooms/preview/'+room['code'],headers=h[2]).json()
    assert preview['scheduled_at']==room['scheduled_at']
    joined=client.post('/api/rooms/join',headers=h[2],json={"code":room['code'],"display_name":"Друг","role_id":preview['available_roles'][0]['id']})
    assert joined.status_code==200,joined.text
    assert joined.json()['phase']=='scheduled'
    assert joined.json()['invited_friend_ids']==[]
    assert client.get('/api/rooms',headers=h[2]).json()[0]['id']==room['id']
    assert client.post(path+'/cancel',headers=h[3]).status_code==404
    assert client.post(path+'/cancel',headers=h[2]).json()['status']=='cancelled'
    assert client.post(path+'/cancel',headers=h[2]).status_code==200
    assert client.get('/api/rooms/availability',headers=h[1]).json()['quota']['remaining']==1
    assert client.post('/api/rooms',headers=h[1],json=body(4)).status_code==200
    assert client.get('/api/social/notifications',headers=h[1]).json()[0]['type']=='ROOM_CANCELLED'
    for uid in (4,5):
        for day in range(1,5):
            response=client.post('/api/rooms',headers=h[uid],json=body(day))
            assert response.status_code==200,response.text
        assert client.get('/api/rooms/availability',headers=h[uid]).json()['quota']['limit'] is None


def test_immediate_friend_invitation_opens_room(booking_env):
    client,h,_=booking_env
    request=body();request['scheduled_at']=None
    created=client.post('/api/rooms',headers=h[1],json=request)
    assert created.status_code==200,created.text
    room=created.json()
    assert room['entry_available'] and not room['awaiting_schedule']
    assert client.post(f"/api/rooms/{room['id']}/invite",headers=h[1],json={"friend_id":2}).status_code==200
    assert client.get(f"/api/rooms/{room['id']}",headers=h[1]).json()['invited_friend_ids']==[2]
    preview=client.get('/api/rooms/preview/'+room['code'],headers=h[2]).json()
    joined=client.post('/api/rooms/join',headers=h[2],json={"code":room['code'],"display_name":"Друг","role_id":preview['available_roles'][0]['id']})
    assert joined.status_code==200,joined.text
    assert joined.json()['guest_id']==2
    assert joined.json()['entry_available']


def test_schedule_boundaries_and_reminder_once(booking_env,monkeypatch):
    client,h,factory=booking_env
    scheduled=(datetime.now(timezone.utc)+timedelta(days=1)).replace(hour=9,minute=30,second=0,microsecond=0)
    request=body();request['scheduled_at']=scheduled.astimezone(timezone(timedelta(hours=3))).isoformat()
    room=client.post('/api/rooms',headers=h[1],json=request).json(); path=f"/api/rooms/{room['id']}"
    assert datetime.fromisoformat(room['scheduled_at'])==scheduled
    preview=client.get('/api/rooms/preview/'+room['code'],headers=h[2]).json()
    client.post('/api/rooms/join',headers=h[2],json={"code":room['code'],"display_name":"Друг","role_id":preview['available_roles'][0]['id']})
    def clock(value):
        for module in (rooms,room_booking,room_v2):
            monkeypatch.setattr(module,'utcnow',lambda:value)
    clock(scheduled-timedelta(minutes=15,seconds=1))
    assert client.get(path,headers=h[1]).json()['phase']=='scheduled'
    clock(scheduled-timedelta(minutes=15))
    for _ in range(2):
        assert client.get(path,headers=h[1]).json()['entry_available']
    assert len(client.get('/api/social/notifications',headers=h[1]).json())==1
    for uid in (1,2):
        ready=client.post(path+'/ready',headers=h[uid],json={"ready":True,"transport_ready":True})
        assert ready.status_code==200,ready.text
        assert ready.json()['phase']=='lobby'
    clock(scheduled)
    started=client.post(path+'/ready',headers=h[1],json={"ready":True,"transport_ready":True}).json()
    assert started['phase']=='active'
    assert datetime.fromisoformat(started['deadline'])==scheduled+timedelta(minutes=15)
    assert client.post(path+'/cancel',headers=h[1]).status_code==409


def test_guest_and_friend_accept_cannot_bypass_quota(booking_env):
    from app.routers.social import create_room_from_invitation
    client,h,factory=booking_env
    for day in range(1,4):
        assert client.post('/api/rooms',headers=h[2],json=body(day)).status_code==200
    room=client.post('/api/rooms',headers=h[1],json=body(5)).json()
    preview=client.get('/api/rooms/preview/'+room['code'],headers=h[2]).json()
    response=client.post('/api/rooms/join',headers=h[2],json={"code":room['code'],"display_name":"Друг","role_id":preview['available_roles'][0]['id']})
    assert response.status_code==409
    async def check_friend_path():
        async with factory() as db:
            with pytest.raises(HTTPException) as failure:
                await create_room_from_invitation(db,await db.get(User,1),await db.get(User,2),{})
            assert failure.value.status_code==409
    asyncio.run(check_friend_path())


def test_expired_booking_cannot_start(booking_env,monkeypatch):
    client,h,factory=booking_env
    room=client.post('/api/rooms',headers=h[1],json=body()).json()
    end=datetime.fromisoformat(room['reservation_ends_at'])
    for module in (rooms,room_booking,room_v2):
        monkeypatch.setattr(module,'utcnow',lambda:end)
    assert client.get('/api/rooms/preview/'+room['code'],headers=h[2]).status_code==410
    view=client.get(f"/api/rooms/{room['id']}",headers=h[1]).json()
    assert view['status']=='expired' and not view['entry_available']
    assert client.get('/api/rooms/availability',headers=h[1]).json()['quota']['active']==0


def test_monthly_admin_protected_and_no_double_count(booking_env):
    client,h,factory=booking_env
    now=datetime.now(timezone.utc)
    async def check():
        async with factory() as db:
            values={"trust":80,"goal":90,"control":60,"eq":70}
            report=json.dumps({"metrics":{"values":values}})
            for uid,age,settings in [(1,2,{'specialization':'Python разработчик'}),(2,31,{}),(4,1,{}),(1,1,{'room_id':99})]:
                db.add(Session(user_id=uid,mode='online',role='candidate',opponent_role='employer',status='finished',
                    settings=json.dumps(settings),report=report,finished_at=(now-timedelta(days=age)).replace(tzinfo=None)))
            db.add(ArenaRoom(id=99,code='report-test',mode='duel',host_id=1,guest_id=2,status='finished',
                finished_at=(now-timedelta(days=1)).replace(tzinfo=None),state=json.dumps({'specialization':'Учитель','reports':{'1':json.loads(report),'2':json.loads(report)}})))
            await db.commit()
            result=await monthly_overview(db,now)
            assert result['completed_attempts']==4
            assert result['excluded_demo_attempts']==1
            assert len(result['candidates'])==3
            assert result['averages']['goal']==90
            assert {row['industry'] for row in result['candidates']}=={'IT и разработка','Образование'}
            assert all(row['average']==81 for row in result['candidates'])
    asyncio.run(check())
    assert client.get('/api/admin/monthly-overview',headers=h[1]).status_code==403
    response=client.get('/api/admin/monthly-overview',headers=h[5])
    assert response.status_code==200,response.text
    assert len(response.json()['users'])==5
