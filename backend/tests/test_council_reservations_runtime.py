import json
from datetime import datetime,timedelta
from types import SimpleNamespace as S
from app.council_reservations import fits
from app.engine.council_report import build_council_report
from tests.test_council import council_client,request
from tests.test_council_operations import seed_company


def test_reservation_accounts_for_entire_interval_and_seats(monkeypatch):
    monkeypatch.setenv('COUNCIL_MAX_CONCURRENT_MEETINGS','3')
    monkeypatch.setenv('COUNCIL_MAX_CONCURRENT_SEATS','12')
    start=datetime(2026,10,18,12)
    rows=[S(scheduled_at=start,status='open',configuration=json.dumps({'capacity':8,'reservation_minutes':60}))]
    assert fits(rows,start,30,4)
    assert not fits(rows,start,30,5)
    assert not fits(rows,start-timedelta(minutes=30),45,5)
    assert fits(rows,start-timedelta(minutes=30),30,12)
    assert fits(rows,start+timedelta(minutes=60),90,12)
    rows[0].status='cancelled'
    assert fits(rows,start,30,12)


def test_personal_report_uses_only_own_public_evidence():
    people=[S(user_id=i,status='confirmed',role_key=None) for i in (1,2)]
    messages=[S(id=1,author_id=1,recipient_id=None,kind='transcript',text='Предлагаю проверить срок 30 дней.'),S(id=2,author_id=2,recipient_id=None,kind='chat',text='Какой нужен аванс?'),S(id=3,author_id=1,recipient_id=2,kind='private',text='Секретная реплика')]
    report=build_council_report({},messages,people,{1:'Анна',2:'Иван'},packets={1:{'name':'Директор','goal':'Получить инвестиции'},2:{'name':'Инвестор','goal':'Проверить риски'}})
    a=report['contributions']['1']['personal_report'];b=report['contributions']['2']['personal_report']
    assert [r['message_id'] for r in a['chronology']]==[1]
    assert [r['message_id'] for r in b['chronology']]==[2]
    assert a['chronology'][0]['source']=='voice'
    assert a['goal']!=b['goal']
    assert 'Секретная реплика' not in json.dumps(report,ensure_ascii=False)


def test_availability_and_runtime_permissions(council_client):
    client,h,clock=council_client;seed_company()
    start=clock['now']+timedelta(hours=1)
    body={'company_id':55,'audience':'company','visibility':'private','scheduled_at':start.isoformat()+'Z','reservation_minutes':60,'organizer_plays':False}
    created=client.post('/api/council',headers=h[9701],json=body)
    assert created.status_code==200,created.text
    mid=created.json()['id']
    slots=client.get('/api/council/availability',headers=h[9701],params={'day':start.date().isoformat(),'capacity':4,'duration':30}).json()['slots']
    bytime={s['time']:s for s in slots}
    assert bytime['16:00']['available'] is False
    assert bytime['15:45']['available'] is False
    assert bytime['17:00']['available'] is True
    assert client.post('/api/council',headers=h[9701],json=body).status_code==409
    assert client.get(f'/api/council-runtime/{mid}',headers=h[9706]).status_code in (403,404)
    # The owner is a facilitator and can veto participant transition proposals.
    assert client.post(f'/api/council-runtime/{mid}/stagepolicy',headers=h[9701],json={'enabled':False}).status_code==200
    assert client.post(f'/api/council-runtime/{mid}/recordstart',headers=h[9701],json={'mime':'audio/webm'}).status_code==403


def test_audio_pipeline_requires_verified_personal_quotes(council_client,monkeypatch):
    import asyncio
    from contextlib import asynccontextmanager
    from sqlalchemy import select
    from app.main import app
    from app.db import get_db
    from app.council_models import CouncilMeeting,CouncilMember,CouncilSignal
    from app.routers import council,council_runtime as runtime
    client,h,clock=council_client;seed_company()
    @asynccontextmanager
    async def session():
        async for db in app.dependency_overrides[get_db]():yield db
    monkeypatch.setattr(runtime,'SessionLocal',session)
    async def seed():
        async with session() as db:
            meeting=CouncilMeeting(organizer_id=9701,company_id=55,visibility='private',status='finished',scheduled_at=clock['now'],agreement='{"decision":"Пилот через месяц"}',configuration='{"audio_required":true}')
            db.add(meeting);await db.flush()
            db.add(CouncilMember(meeting_id=meeting.id,user_id=9701,status='facilitator',company_id=55))
            for index,uid in enumerate(range(9702,9706)):
                db.add(CouncilMember(meeting_id=meeting.id,user_id=uid,company_id=55,status='confirmed',seat=index+1,role_key=list(council.ROLES)[index]))
                db.add(CouncilSignal(meeting_id=meeting.id,author_id=uid,recipient_id=uid,kind='recording',payload=json.dumps({'id':str(uid),'member':str(uid),'name':str(uid),'status':'uploaded','bytes':10,'chunks':1})))
            await db.commit();return meeting.id
    mid=asyncio.run(seed())
    assert client.get(f'/api/council/{mid}',headers=h[9702]).json()['report'] is None
    async def speech(rec,mid):return 'Предлагаю пилот через месяц. Моя роль '+rec['member']
    async def review(prompt,**kwargs):
        own=json.loads(prompt)['own_speech'][0]
        return json.dumps({'summary':'Подробный разбор участия и согласованного решения. '*10,'findings':[{'message_id':own['id'],'quote':own['text'],'analysis':'Участник предлагает конкретный срок пилота. Это даёт возможность сопоставить обязательство с итоговым соглашением и проверить исполнимость решения.'}],'next_steps':['Уточнить бюджет','Закрепить ответственного','Проверить риски']}), 'test-gigachat'
    monkeypatch.setattr(runtime,'transcribe_record',speech)
    monkeypatch.setattr('app.engine.llm.call_with_fallback_detailed',review)
    asyncio.run(runtime.analyze(mid))
    a=client.get(f'/api/council/{mid}',headers=h[9702]).json()
    b=client.get(f'/api/council/{mid}',headers=h[9703]).json()
    assert a['audio_analysis']['status']=='complete'
    assert set(a['report']['contributions'])=={'9702'}
    ar=a['report']['contributions']['9702']['personal_report']['ai_review']
    br=b['report']['contributions']['9703']['personal_report']['ai_review']
    assert ar['findings'][0]['quote']!=br['findings'][0]['quote']
    assert '9703' not in ar['findings'][0]['quote']
    async def fabricated(prompt,**kwargs):
        raw,provider=await review(prompt,**kwargs)
        payload=json.loads(raw);payload['findings'][0]['quote']='Эту фразу участник не произносил'
        return json.dumps(payload),provider
    monkeypatch.setattr('app.engine.llm.call_with_fallback_detailed',fabricated)
    asyncio.run(runtime.analyze(mid))
    rejected=client.get(f'/api/council/{mid}',headers=h[9702]).json()
    assert rejected['audio_analysis']['status']=='error'
    assert rejected['report'] is None
