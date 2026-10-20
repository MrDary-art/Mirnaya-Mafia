import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta

from sqlalchemy import select
from app.main import app
from app.db import get_db
from app.council_models import CouncilMeeting, CouncilMember, CouncilSignal
from app.routers import council, council_runtime as runtime
from tests.test_council import council_client


@asynccontextmanager
async def session():
    async for db in app.dependency_overrides[get_db]():
        yield db


async def seed(clock, status='active', recording_status='recording', byte_count=0):
    async with session() as db:
        meeting=CouncilMeeting(organizer_id=9701,visibility='private',status=status,scheduled_at=clock['now'],configuration='{"audio_required":true}')
        db.add(meeting);await db.flush()
        db.add(CouncilMember(meeting_id=meeting.id,user_id=9701,status='facilitator'))
        for seat,uid in enumerate(range(9702,9706)):
            db.add(CouncilMember(meeting_id=meeting.id,user_id=uid,status='confirmed',seat=seat+1,role_key=list(council.ROLES)[seat]))
        rid=str(uuid.uuid4())
        db.add(CouncilSignal(meeting_id=meeting.id,author_id=9702,recipient_id=9702,kind='recording',created_at=clock['now']-timedelta(minutes=10),payload=json.dumps({'id':rid,'member':'9702','name':'Test','status':recording_status,'bytes':byte_count,'chunks':0,'mime':'audio/webm'})))
        for kind in ('board','offer','presence'):
            db.add(CouncilSignal(meeting_id=meeting.id,author_id=9702,recipient_id=9702,kind=kind,payload='{}',created_at=clock['now']-timedelta(minutes=10)))
        await db.commit();return meeting.id,rid


def test_housekeeping_preserves_board_and_audio(council_client):
    _,_,clock=council_client
    mid,_=asyncio.run(seed(clock))
    async def check():
        async with session() as db:
            await council.dispatch_due_councils(db)
            kinds=list((await db.scalars(select(CouncilSignal.kind).where(CouncilSignal.meeting_id==mid))).all())
            assert sorted(kinds)==['board','recording']
    asyncio.run(check())


def test_finish_preserves_recording_and_accepts_final_chunk(council_client,monkeypatch,tmp_path):
    client,h,clock=council_client
    mid,rid=asyncio.run(seed(clock))
    monkeypatch.setattr(runtime.settings,'data_dir',str(tmp_path))
    assert client.post(f'/api/council/{mid}/finish',headers=h[9701]).status_code==200
    response=client.post(f'/api/council-runtime/{mid}/audio/{rid}',headers=h[9702],content=b'final media chunk')
    assert response.status_code==200,response.text
    response=client.post(f'/api/council-runtime/{mid}/recordfinish',headers=h[9702],json={'id':rid})
    assert response.status_code==200,response.text
    assert response.json()['recordings'][0]['status']=='uploaded'


def test_zero_byte_recording_can_be_closed(council_client):
    client,h,clock=council_client
    mid,rid=asyncio.run(seed(clock))
    response=client.post(f'/api/council-runtime/{mid}/recordfinish',headers=h[9702],json={'id':rid})
    assert response.status_code==200,response.text
    assert response.json()['recordings'][0]['status']=='empty'


def test_new_offer_is_visible_after_a_large_ice_backlog(council_client):
    client,h,clock=council_client
    mid,_=asyncio.run(seed(clock))
    async def backlog():
        async with session() as db:
            db.add_all(CouncilSignal(meeting_id=mid,author_id=9703,recipient_id=9702,kind='ice',
                                    payload='{}',created_at=clock['now']) for _ in range(510))
            db.add(CouncilSignal(meeting_id=mid,author_id=9703,recipient_id=9702,kind='offer',
                                payload='{"type":"offer","sdp":"latest"}',created_at=clock['now']))
            await db.commit()
    asyncio.run(backlog())
    signals=client.get(f'/api/council-runtime/{mid}',headers=h[9702]).json()['signals']
    assert len(signals)==500
    assert signals[-1]['kind']=='offer'
    assert [s['id'] for s in signals]==sorted(s['id'] for s in signals)


def test_missing_members_have_bounded_upload_grace(council_client,monkeypatch):
    _,_,clock=council_client
    mid,_=asyncio.run(seed(clock,status='finished'))
    invoked=[]
    async def analyze(meeting_id):
        invoked.append(meeting_id);runtime.running.discard(meeting_id)
    monkeypatch.setattr(runtime,'analyze',analyze)
    async def check():
        async with session() as db:
            meeting=await db.get(CouncilMeeting,mid)
            await runtime.schedule_analysis(meeting,db)
            assert not invoked
            clock['now']+=timedelta(seconds=121)
            await runtime.schedule_analysis(meeting,db)
            await asyncio.sleep(0)
            assert invoked==[mid]
            record=(await runtime.rows(db,mid,'recording'))[0]
            assert json.loads(record.payload)['status']=='empty'
    asyncio.run(check())


def test_silent_recording_generates_evidence_limited_report(council_client,monkeypatch):
    client,h,clock=council_client
    mid,_=asyncio.run(seed(clock,status='finished',recording_status='uploaded',byte_count=10))
    monkeypatch.setattr(runtime,'SessionLocal',session)
    async def silent(*args):return ''
    async def review(*args):return None
    monkeypatch.setattr(runtime,'transcribe_record',silent)
    monkeypatch.setattr('app.engine.council_report.attach_theory_review',review)
    asyncio.run(runtime.analyze(mid))
    data=client.get(f'/api/council/{mid}',headers=h[9702]).json()
    assert data['audio_analysis']['status']=='complete'
    assert data['report']['audio_coverage']['recordings']==[{'member':'9702','status':'empty'}]
    assert data['report']['contributions']['9702']['personal_report']['strengths']==[]


def test_leader_exit_finishes_once_and_starts_automatic_processing(council_client, monkeypatch):
    client,h,clock=council_client
    mid,_=asyncio.run(seed(clock))
    response=client.post(f'/api/council-runtime/{mid}/leave',headers=h[9701],json={})
    assert response.status_code==200,response.text
    assert response.json()['canJoin'] is False
    assert response.json()['phase']=='analysis'
    async def verify():
        async with session() as db:
            meeting=await db.get(CouncilMeeting,mid)
            assert meeting.status=='finished'
            assert council.config(meeting)['audio_upload_deadline']
            assert len(await runtime.rows(db,mid,'recording'))==1
            assert len(await runtime.rows(db,mid,'board'))==1
    asyncio.run(verify())
    # Safe to retry after a lost HTTP response.
    assert client.post(f'/api/council-runtime/{mid}/leave',headers=h[9701],json={}).status_code==200
    assert client.post(f'/api/council-runtime/{mid}/call',headers=h[9702],json={'active':True}).status_code==409
    invoked=[]
    async def analyze(meeting_id):
        invoked.append(meeting_id);runtime.running.discard(meeting_id)
    monkeypatch.setattr(runtime,'analyze',analyze)
    clock['now']+=timedelta(seconds=121)
    client.get(f'/api/council-runtime/{mid}',headers=h[9702])
    assert invoked==[mid]


def test_employee_exit_and_leader_refresh_do_not_end_the_conference(council_client):
    client,h,clock=council_client
    mid,_=asyncio.run(seed(clock))
    for uid in (9701,9702):
        assert client.post(f'/api/council-runtime/{mid}/call',headers=h[uid],json={'active':True}).status_code==200
    response=client.post(f'/api/council-runtime/{mid}/leave',headers=h[9702],json={})
    assert response.status_code==200,response.text
    assert response.json()['canJoin'] is True
    assert not next(m for m in response.json()['members'] if m['id']=='9702')['inCall']
    response=client.post(f'/api/council-runtime/{mid}/call',headers=h[9701],json={'active':False})
    assert response.status_code==200
    assert response.json()['canJoin'] is True
    assert client.post(f'/api/council-runtime/{mid}/leave',headers=h[9707],json={}).status_code in (403,404)


def test_final_audio_upload_survives_leader_exit(council_client,monkeypatch,tmp_path):
    client,h,clock=council_client
    mid,rid=asyncio.run(seed(clock))
    monkeypatch.setattr(runtime.settings,'data_dir',str(tmp_path))
    assert client.post(f'/api/council-runtime/{mid}/leave',headers=h[9701],json={}).status_code==200
    response=client.post(f'/api/council-runtime/{mid}/audio/{rid}',headers=h[9702],content=b'last chunk')
    assert response.status_code==200,response.text
    response=client.post(f'/api/council-runtime/{mid}/recordfinish',headers=h[9702],json={'id':rid})
    assert response.status_code==200,response.text
    assert response.json()['recordings'][0]['status']=='uploaded'
    assert client.post(f'/api/council-runtime/{mid}/recordstart',headers=h[9702],json={'mime':'audio/webm'}).status_code==403
