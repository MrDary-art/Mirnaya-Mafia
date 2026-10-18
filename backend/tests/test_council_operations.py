import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import select
from app.main import app
from app.db import get_db
from app.models import User
from app.company_models import Company, CompanyMembership
from app.routers.council import assign_roles
from app.council_models import CouncilMember, CouncilMeeting
from tests.test_council import council_client, request


def seed_company():
    async def seed():
        async for db in app.dependency_overrides[get_db]():
            db.add(Company(id=55, name="Команда теста", slug="test-team", created_by=9701))
            await db.flush()
            for uid in (9701,9702,9703,9704,9705):
                db.add(CompanyMembership(company_id=55,user_id=uid,status="ACTIVE",corporate_role="COMPANY_OWNER" if uid==9701 else "EMPLOYEE"))
            await db.commit()
    asyncio.run(seed())


def test_selected_company_audience_and_archive(council_client):
    client,h,clock=council_client
    seed_company()
    body={"scheduled_at":(clock["now"]+timedelta(days=5)).isoformat()+"Z","visibility":"private","company_id":55,"organizer_plays":False,"participant_ids":[9702],"audience":"invited"}
    created=client.post("/api/council",headers=h[9701],json=body)
    assert created.status_code==200,created.text
    mid=created.json()["id"]
    assert any(m["id"]==mid for m in client.get("/api/council",headers=h[9702]).json())
    assert all(m["id"]!=mid for m in client.get("/api/council",headers=h[9703]).json())
    assert client.get(f"/api/council/{mid}",headers=h[9703]).status_code==404
    assert client.get(f"/api/council/{mid}",headers=h[9706]).status_code in (403,404)
    body["audience"]="company"
    second=client.post("/api/council",headers=h[9701],json=body).json()["id"]
    assert client.get(f"/api/council/{second}",headers=h[9703]).status_code==200
    assert client.post(f"/api/council/{second}/join",headers=h[9703],json={"role":None}).status_code==200
    assert client.get(f"/api/council/public/{second}").status_code==404
    assert client.post("/api/admin/operations/companies/55/archive",headers=h[9702],json={"reason":"Проверка обращения"}).status_code==403
    assert client.post("/api/admin/operations/companies/55/archive",headers=h[9701],json={"reason":"Проверка обращения"}).status_code==200
    assert client.get("/api/admin/operations/archive",headers=h[9701]).status_code==403
    assert client.get(f"/api/council/{mid}",headers=h[9702]).status_code in (403,404)
    assert client.get("/api/council",headers=h[9701]).json()==[]
    archived=client.get("/api/admin/operations/archive",headers=client.council_admin_headers).json()
    assert archived[0]["reason"]=="Проверка обращения"
    assert client.post("/api/admin/operations/companies/55/restore",headers=client.council_admin_headers,json={"reason":"Проверка завершена"}).status_code==200
    assert client.get(f"/api/council/{mid}",headers=h[9702]).status_code==200


def test_support_boundaries_ban_and_moderator_observation(council_client):
    client,h,clock=council_client
    assert client.get("/api/support/status").json()["online"] is False
    assert client.post("/api/support/messages",headers=h[9702],json={"text":"Не могу войти в комнату","path":"/council"}).status_code==200
    assert client.get("/api/support/messages",headers=h[9703]).json()==[]
    assert "не в сети" in client.get("/api/support/messages",headers=h[9702]).json()[0]["receipt"]
    assert client.put("/api/admin/operations/availability",headers=h[9701],json={"available":True}).status_code==200
    assert client.get("/api/support/status").json()["online"] is True
    assert client.put("/api/admin/operations/availability",headers=h[9703],json={"available":True}).status_code==403
    assert client.get("/api/admin/operations",headers=h[9703]).status_code==403
    assert client.post("/api/admin/operations/support/9702",headers=h[9701],json={"text":"Проверяем приглашение"}).status_code==200
    assert len(client.get("/api/support/messages",headers=h[9702]).json())==2
    assert client.post("/api/admin/operations/users/9702/ban",headers=h[9701],json={"reason":"Помехи другим участникам","hours":1}).status_code==200
    assert client.get("/api/council",headers=h[9702]).status_code==403
    assert client.get("/api/support/messages",headers=h[9702]).status_code==200
    assert client.post("/api/admin/council/moderators",headers=client.council_admin_headers,json={"username":"council-9703"}).status_code==200
    body={"scheduled_at":(clock["now"]+timedelta(days=5)).isoformat()+"Z","visibility":"public","organizer_plays":False}
    mid=request(client,"POST","/api/council",h[9701],body)["id"]
    assert client.post(f"/api/council/{mid}/observe",headers=h[9703]).status_code==200
    assert client.get(f"/api/council/{mid}",headers=h[9703]).json()["can_manage"] is True
    client.delete("/api/admin/council/moderators/9703",headers=client.council_admin_headers)
    assert client.get(f"/api/council/{mid}",headers=h[9703]).json()["can_manage"] is False


def packets(count):
    return [{"key":f"role_{i}","name":f"Роль {i}","goal":"Найти общее решение","private_facts":["Известный факт"],"limits":["Не превышать бюджет"],"can_offer":"Поэтапный план","ask":"Уточнить сроки"} for i in range(count)]


def test_ai_cards_accept_lists_and_preserve_manual_fallback(council_client, monkeypatch):
    client, h, _ = council_client
    from app.engine import llm
    cards = packets(5)
    for card in cards:
        card["can_offer"] = ["План", "Обмен сведениями"]
        card["ask"] = ["Что произошло?", "Кто видел цветок?"]
    async def generated(*args, **kwargs):
        return json.dumps({"packets": cards}, ensure_ascii=False), "gigachat"
    monkeypatch.setattr(llm, "call_with_fallback_detailed", generated)
    body = {"capacity": 5, "title": "Цветочная мастерская", "goal": "Выяснить, куда пропал цветок",
            "roles": "Администратор\nПродавец\nостальные роли на твоё усмотрение"}
    result = client.post("/api/council/draft", headers=h[9701], json=body)
    assert result.status_code == 200
    assert result.json()["source"] == "gigachat"
    assert result.json()["packets"][0]["can_offer"] == "План\nОбмен сведениями"
    async def malformed(*args, **kwargs):
        return "{}", "gigachat"
    monkeypatch.setattr(llm, "call_with_fallback_detailed", malformed)
    fallback = client.post("/api/council/draft", headers=h[9701], json=body).json()
    assert fallback["source"] == "manual"
    assert fallback["packets"][2]["name"] == "Участник 3"


def test_short_notice_game_stays_open_until_preparation(council_client):
    client, h, clock = council_client
    seed_company()
    start = clock["now"] + timedelta(hours=12)
    body = {"scheduled_at": start.isoformat() + "Z", "visibility": "private", "company_id":55, "audience":"company",
            "organizer_plays": False, "capacity": 4, "packets": packets(4)}
    created = client.post("/api/council", headers=h[9701], json=body)
    assert created.status_code == 200, created.text
    path = f"/api/council/{created.json()['id']}"
    assert client.get(path, headers=h[9701]).json()["status"] == "open"
    clock["now"] = start - timedelta(minutes=16)
    assert client.post(path + "/join", headers=h[9702], json={"role": None}).status_code == 200
    assert client.get(path, headers=h[9701]).json()["status"] == "open"
    clock["now"] = start - timedelta(minutes=15)
    assert client.get(path, headers=h[9701]).json()["status"] == "cancelled"
    body["scheduled_at"] = (clock["now"] + timedelta(days=15)).isoformat() + "Z"
    assert client.post("/api/council", headers=h[9701], json=body).status_code == 422
    body["scheduled_at"] = (clock["now"] + timedelta(hours=11, minutes=59)).isoformat() + "Z"
    assert client.post("/api/council", headers=h[9701], json=body).status_code == 422


def test_five_person_custom_game_and_signed_results(council_client,monkeypatch):
    client,h,clock=council_client
    seed_company()
    async def extra_member():
        async for db in app.dependency_overrides[get_db]():
            db.add(CompanyMembership(company_id=55,user_id=9706,status="ACTIVE",corporate_role="EMPLOYEE"))
            await db.commit()
    asyncio.run(extra_member())
    start=clock["now"]+timedelta(days=5)
    created=client.post("/api/council",headers=h[9701],json={"scheduled_at":start.isoformat()+"Z","visibility":"private","company_id":55,"audience":"company","organizer_plays":False,"capacity":5,"packets":packets(5),"title":"Пять сторон","goal":"Согласовать совместную работу"})
    assert created.status_code==200,created.text
    path=f"/api/council/{created.json()['id']}"
    for uid in range(9702,9707):
        assert client.post(path+"/join",headers=h[uid],json={"role":None}).status_code==200
    clock["now"]=start-timedelta(hours=47)
    for uid in range(9702,9707):
        assert client.post(path+"/confirm",headers=h[uid]).status_code==200
    detail=client.get(path,headers=h[9701]).json()
    assert detail["capacity"]==5 and detail["status"]=="roles"
    role_keys=set()
    for uid in range(9702,9707):
        role_keys.add(client.get(path,headers=h[uid]).json()["my_role"]["key"])
    assert len(role_keys)==5
    assert client.post(path+"/finish",headers=h[9701]).status_code==200
    for uid in range(9702,9707):
        response=client.post(path+"/results",headers=h[uid],json={"achieved":"Согласован график","contribution":"Предложил план работ","unresolved":"Не указан бюджет"})
        assert response.status_code==200,response.text
    async def unavailable(*a,**kw):
        raise RuntimeError("provider offline")
    monkeypatch.setattr("app.engine.llm.call_with_fallback_detailed",unavailable)
    review=client.post(path+"/results/review",headers=h[9701])
    assert review.status_code==200,review.text
    assert review.json()["source"]=="rules"
    assert client.post(path+"/results/sign",headers=h[9702],json={"summary":"Проверенные итоги","questions":[]}).status_code==403
    assert client.post(path+"/results/sign",headers=h[9701],json={"summary":"Итоги сопоставлены с соглашением","questions":[]}).status_code==200
    profile=client.get("/api/council/profile/meetings",headers=h[9702]).json()
    assert profile[0]["report_signed"] is True
    assert client.post(path+"/results",headers=h[9702],json={"achieved":"Изменённый итог","contribution":"Другой вклад","unresolved":""}).status_code==409


def test_pdf_missing_metrics_and_long_narrative():
    from app.report_pdf import render_report_pdf
    result=render_report_pdf(report={"summary":"Проверяемая длинная запись. "*1200},session=SimpleNamespace(id=1,role="Участник",metrics=None),holder="Проверочный участник")
    assert result.startswith(b"%PDF")
    assert result.count(b"/Type /Page\n")>1
