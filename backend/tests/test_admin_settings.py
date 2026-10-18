import json,re,time
import pytest
from sqlalchemy import select
from app.main import app
from app import mail_service
from app.installation import cipher,save_config
from app.auth import create_token,hash_password
from app.config import settings
from app.deployment_models import AdminChallenge,AdminAudit,SecurityAlert
from app.models import EmailOutbox,User,AppSetting
from app.routers import mail
from app import deployment_security
from .test_installation_security import client,storage,admin_token

@pytest.fixture(autouse=True)
def clear_limits():
    deployment_security._limits.clear()
    yield
    deployment_security._limits.clear()

async def smtp(storage,monkeypatch):
    monkeypatch.setattr(settings,"development_mailbox",True)
    async with storage() as db:
        await save_config(db,1,{"mail":{"enabled":True,"transport":"smtp","host":"smtp.example.test","port":587,"security":"starttls","sender":"arena@example.test","username":"arena","password":cipher().encrypt(b"smtp-private").decode()}},2,"test.mail")

async def code(storage,challenge_id,previous=False):
    async with storage() as db:
        key=f"admin-code:{challenge_id}"+(":previous" if previous else "")
        letter=await db.scalar(select(EmailOutbox).where(EmailOutbox.dedupe_key==key))
        return re.search(r"\b\d{6}\b",letter.body).group(0)

async def setup_recipient(client,storage,h):
    response=await client.post("/api/admin/password-confirmation/recipient/request",headers=h,json={"current":"private-password","email":"developer@example.test"})
    assert response.status_code==200,response.text
    cid=response.json()["challenge_id"]
    result=await client.post("/api/admin/password-confirmation/recipient/confirm",headers=h,json={"challenge_id":cid,"code":await code(storage,cid)})
    assert result.status_code==200,result.text

async def test_password_requires_developer_code_is_bound_and_single_use(client,storage,monkeypatch):
    h=await admin_token(storage,password="private-password");await smtp(storage,monkeypatch);await setup_recipient(client,storage,h)
    payload={"current":"private-password","password":"new-private-password"}
    assert (await client.post("/api/auth/password",headers=h,json=payload)).status_code==400
    sent=await client.post("/api/admin/password-confirmation/request",headers=h,json=payload)
    assert sent.status_code==200,sent.text
    cid=sent.json()["challenge_id"];otp=await code(storage,cid)
    assert otp not in sent.text
    assert (await client.get("/api/admin/mail/inbox",headers=h)).json()=={"items":[]}
    wrong=await client.post("/api/auth/password",headers=h,json={**payload,"password":"different-password","challenge_id":cid,"code":otp})
    assert wrong.status_code==400
    changed=await client.post("/api/auth/password",headers=h,json={**payload,"challenge_id":cid,"code":otp})
    assert changed.status_code==200,changed.text
    assert (await client.get("/api/admin/audit",headers=h)).status_code==401
    new_h={"Authorization":"Bearer "+changed.json()["access_token"]}
    replay=await client.post("/api/auth/password",headers=new_h,json={"current":"new-private-password","password":"new-private-password-again","challenge_id":cid,"code":otp})
    assert replay.status_code==400
    audit=(await client.get("/api/admin/audit",headers=new_h)).json()
    event=next(row for row in audit["items"] if row["action"]=="admin.password_changed")
    assert event["detail"]["ip"]=="127.0.0.1"
    assert otp not in json.dumps(audit) and "new-private-password" not in json.dumps(audit)

async def test_recipient_rotation_requires_old_and_new_codes(client,storage,monkeypatch):
    h=await admin_token(storage,password="private-password");await smtp(storage,monkeypatch);await setup_recipient(client,storage,h)
    response=await client.post("/api/admin/password-confirmation/recipient/request",headers=h,json={"current":"private-password","email":"next@example.test"})
    cid=response.json()["challenge_id"]
    assert response.json()["previous_required"] is True
    new=await code(storage,cid);old=await code(storage,cid,True)
    body={"challenge_id":cid,"code":new}
    assert (await client.post("/api/admin/password-confirmation/recipient/confirm",headers=h,json=body)).status_code==400
    assert (await client.get("/api/admin/password-confirmation",headers=h)).json()["recipient"]=="developer@example.test"
    assert (await client.post("/api/admin/password-confirmation/recipient/confirm",headers=h,json={**body,"previous_code":old})).status_code==200
    assert (await client.get("/api/admin/password-confirmation",headers=h)).json()["recipient"]=="next@example.test"

async def test_code_attempt_expiry_and_actor_boundaries(client,storage,monkeypatch):
    h=await admin_token(storage,password="private-password");await smtp(storage,monkeypatch);await setup_recipient(client,storage,h)
    sent=await client.post("/api/admin/password-confirmation/request",headers=h,json={"current":"private-password","password":"new-private-password"})
    cid=sent.json()["challenge_id"];otp=await code(storage,cid)
    async with storage() as db:
        db.add(User(id=8,username="second-admin",is_admin=1,password_hash=hash_password("second-private-password")));await db.commit()
        other=await db.get(User,8);other_h={"Authorization":"Bearer "+create_token(8,other.username,other.password_hash)}
    body={"current":"second-private-password","password":"new-private-password","challenge_id":cid,"code":otp}
    assert (await client.post("/api/auth/password",headers=other_h,json=body)).status_code==400
    body["current"]="private-password";body["code"]="999999" if otp!="999999" else "888888"
    for _ in range(5):assert (await client.post("/api/auth/password",headers=h,json=body)).status_code==400
    body["code"]=otp
    assert (await client.post("/api/auth/password",headers=h,json=body)).status_code==400
    async with storage() as db:
        row=await db.get(AdminChallenge,cid);assert row.attempts==5
        row.attempts=0;row.expires=time.time()-1;await db.commit()
    deployment_security._limits.clear()
    assert (await client.post("/api/auth/password",headers=h,json=body)).status_code==400

async def test_security_signals_and_page_audit_without_secrets(client,storage):
    h=await admin_token(storage,password="private-password")
    page=await client.post("/api/admin/activity",headers=h,json={"path":"/admin/settings","view":"audit"})
    assert page.status_code==200
    for _ in range(5):assert (await client.post("/api/auth/login",json={"username":"missing-account","password":"do-not-log-me"})).status_code==401
    alerts=(await client.get("/api/admin/security/alerts",headers=h)).json()
    assert alerts["total"]==1 and alerts["items"][0]["kind"]=="login_failures"
    assert alerts["items"][0]["ip"]=="127.0.0.1"
    rows=(await client.get("/api/admin/audit",headers=h)).json()
    assert any(row["action"]=="admin.page_open" and row["detail"]["view"]=="audit" for row in rows["items"])
    assert "do-not-log-me" not in json.dumps(rows)
    normal={"Authorization":"Bearer "+create_token(1,"alice")}
    assert (await client.get("/api/admin/security/alerts",headers=normal)).status_code==403
    alert=alerts["items"][0]
    assert (await client.post(f"/api/admin/security/alerts/{alert['id']}/acknowledge",headers=h)).status_code==200
    assert (await client.get("/api/admin/security/alerts",headers=h)).json()["total"]==0
    assert (await client.get("/api/admin/security/alerts?archive=true",headers=h)).json()["total"]==1

async def test_ai_probes_reject_fallback_and_do_not_create_sessions(client,storage,monkeypatch):
    from app.engine import llm
    h=await admin_token(storage,password="private-password")
    async def answer(*args,**kwargs):return "Пробный ответ","gigachat"
    monkeypatch.setattr(llm,"call_with_fallback_detailed",answer)
    response=await client.post("/api/admin/ai/chat",headers=h,json={"message":"Проверка"})
    assert response.json()["reply"]=="Пробный ответ"
    modes=(await client.get("/api/admin/ai/modes",headers=h)).json()
    for mode in modes:
        result=await client.post(f"/api/admin/ai/modes/{mode['id']}/check",headers=h)
        assert result.status_code==200,result.text
        assert result.json()["status"]==("ready" if mode["ai"] else "not_required")
    async def fallback(*args,**kwargs):return "Сценарная реплика","script"
    monkeypatch.setattr(llm,"call_with_fallback_detailed",fallback)
    assert (await client.post("/api/admin/ai/modes/online/check",headers=h)).status_code==503

async def test_local_mail_archive_and_verification_status(client,storage,monkeypatch):
    monkeypatch.setattr(settings,"development_mailbox",True);h=await admin_token(storage,password="private-password")
    async with storage() as db:
        await mail_service.issue_token(db,1,"verify","alice@example.test","http://test")
        await mail_service.enqueue(db,dedupe_key="admin-code:hidden",recipient="dev@example.test",subject="Private code",body="123456")
        await db.commit()
    inbox=(await client.get("/api/admin/mail/inbox",headers=h)).json()["items"]
    assert len(inbox)==1 and inbox[0]["verification"]=="pending"
    token=re.search(r"token=([^\s]+)",inbox[0]["body"]).group(1)
    assert (await client.post("/api/auth/email/verify",json={"token":token})).status_code==200
    assert (await client.get("/api/admin/mail/inbox",headers=h)).json()["items"][0]["verification"]=="confirmed"
    url=f"/api/admin/mail/inbox/{inbox[0]['id']}/archive"
    assert (await client.patch(url,headers=h,json={"archived":True})).status_code==200
    assert (await client.get("/api/admin/mail/inbox",headers=h)).json()["items"]==[]
    assert len((await client.get("/api/admin/mail/inbox?archive=true",headers=h)).json()["items"])==1
    assert (await client.patch(url,headers=h,json={"archived":False})).status_code==200


async def test_smtp_change_cannot_bypass_developer_confirmation(client,storage,monkeypatch):
    h=await admin_token(storage,password="private-password");await smtp(storage,monkeypatch);await setup_recipient(client,storage,h)
    sent=[]
    async def checked(config,recipient=None):sent.append(config["host"])
    monkeypatch.setattr(mail,"check_smtp",checked)
    payload={"revision":2,"host":"new-smtp.example.test","port":587,"security":"starttls","sender":"arena@example.test","username":"arena","password":"new-smtp-private"}
    response=await client.put("/api/admin/mail",headers=h,json=payload)
    assert response.status_code==400 and sent==[]
    requested=await client.post("/api/admin/password-confirmation/mail/request",headers=h,json={"current":"private-password","config":payload})
    assert requested.status_code==200,requested.text
    cid=requested.json()["challenge_id"]
    result=await client.put("/api/admin/mail",headers=h,json={**payload,"challenge_id":cid,"code":await code(storage,cid)})
    assert result.status_code==200,result.text
    assert sent==["new-smtp.example.test"] and result.json()["requires_confirmation"]
    assert (await client.post("/api/admin/mail/disable",headers=h,json={"revision":3})).status_code==400


async def test_security_codes_can_reenable_disabled_mail_without_using_local_inbox(client,storage,monkeypatch):
    h=await admin_token(storage,password="private-password");await smtp(storage,monkeypatch);await setup_recipient(client,storage,h)
    requested=await client.post("/api/admin/password-confirmation/mail/request",headers=h,json={"current":"private-password","disable":True})
    cid=requested.json()["challenge_id"]
    disabled=await client.post("/api/admin/mail/disable",headers=h,json={"revision":2,"challenge_id":cid,"code":await code(storage,cid)})
    assert disabled.status_code==200,disabled.text
    assert (await client.get("/api/admin/password-confirmation",headers=h)).json()["smtp_ready"] is True
    payload={"revision":3,"host":"smtp.example.test","port":587,"security":"starttls","sender":"arena@example.test","username":"arena","password":""}
    next_code=await client.post("/api/admin/password-confirmation/mail/request",headers=h,json={"current":"private-password","config":payload})
    assert next_code.status_code==200,next_code.text
    cid=next_code.json()["challenge_id"]
    async with storage() as db:
        row=await db.scalar(select(EmailOutbox).where(EmailOutbox.dedupe_key==f"admin-code:{cid}"))
        assert row.state=="pending"
    assert (await client.get("/api/admin/mail/inbox",headers=h)).json()["items"]==[]
    sent=[]
    monkeypatch.setattr(mail_service,"SessionLocal",storage)
    monkeypatch.setattr(mail_service,"_smtp_send",lambda config,recipient,*args:sent.append(recipient))
    assert await mail_service.deliver_once() is True
    assert sent==["developer@example.test"]
