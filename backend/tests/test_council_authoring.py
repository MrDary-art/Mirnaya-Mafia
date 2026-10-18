import json
from app.routers import council
from tests.test_council import council_client
from tests.test_council_operations import seed_company


def test_idea_requires_owner_and_validates_ai(council_client,monkeypatch):
    client,h,_=council_client
    seed_company()
    calls=[]
    async def generated(prompt,**kwargs):
        calls.append(json.loads(prompt))
        return json.dumps({'goal':'Команде нужно согласовать запуск пилота за 30 дней с бюджетом 2 миллиона рублей и распределить обязанности.', 'roles':'Директор — защитить бюджет\nПродажи — сохранить клиента\nФинансист — проверить расходы\nТехнический руководитель — обеспечить сроки'},ensure_ascii=False),'gigachat'
    monkeypatch.setattr('app.engine.llm.call_with_fallback_detailed',generated)
    assert client.post('/api/council/idea',headers=h[9702],json={'capacity':4}).status_code==403
    result=client.post('/api/council/idea',headers=h[9701],json={'capacity':4})
    assert result.status_code==200,result.text
    assert len(result.json()['roles'].splitlines())==4
    assert calls[0]['goal']==''
    async def unavailable(*args,**kwargs):raise RuntimeError('offline')
    monkeypatch.setattr('app.engine.llm.call_with_fallback_detailed',unavailable)
    failed=client.post('/api/council/idea',headers=h[9701],json={'capacity':4,'goal':'Мой исходный замысел'})
    assert failed.status_code==503
    assert 'вручную' in failed.json()['detail']
    async def malformed(*args,**kwargs):return '{"goal":"коротко","roles":"нет ролей"}','gigachat'
    monkeypatch.setattr('app.engine.llm.call_with_fallback_detailed',malformed)
    assert client.post('/api/council/idea',headers=h[9701],json={'capacity':4}).status_code==503


def test_company_meeting_uses_fixed_title(council_client):
    from datetime import timedelta
    client,h,clock=council_client
    seed_company()
    result=client.post('/api/council',headers=h[9701],json={'company_id':55,'visibility':'private','audience':'company','organizer_plays':False,'scheduled_at':(clock['now']+timedelta(hours=1)).isoformat()+'Z','title':'Произвольное название'})
    assert result.status_code==200,result.text
    mid=result.json()['id']
    assert client.get(f'/api/council/{mid}',headers=h[9701]).json()['title']=='Совет Решений'
