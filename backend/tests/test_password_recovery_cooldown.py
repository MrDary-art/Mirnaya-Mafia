from datetime import datetime
from types import SimpleNamespace
import pytest
from sqlalchemy import select
from app import password_recovery, deployment_security
from app.config import settings
from app.models import User, EmailOutbox, AppSetting
from .test_installation_security import admin_token, client, storage


@pytest.fixture(autouse=True)
def reset_limits():
    deployment_security._limits.clear()
    yield
    deployment_security._limits.clear()


async def test_cooldown_ladder_is_persistent_shared_by_login_and_email_and_resets(client,storage,monkeypatch):
    monkeypatch.setattr(settings,"development_mailbox",True)
    now=[2000000000.0]
    monkeypatch.setattr(password_recovery,"time",SimpleNamespace(time=lambda:now[0]))
    async with storage() as db:
        user=await db.get(User,1); user.email="alice@example.test"; user.email_verified_at=datetime(2026,1,1); await db.commit()
    for index, delay in enumerate((30,60,300,300)):
        response=await client.post("/api/auth/password/forgot",json={"identifier":"alice"})
        assert response.status_code==200, response.text
        assert response.json()["retry_after"]==delay
        if index>=1: assert "Спам" in response.json()["detail"]
        denied=await client.post("/api/auth/password/forgot",json={"email":"alice@example.test"})
        assert denied.status_code==429 and int(denied.headers["retry-after"])==delay
        async with storage() as db:
            assert await db.get(AppSetting,"password-recovery:1")
            assert len((await db.scalars(select(EmailOutbox))).all())==index+1
        now[0]+=delay+1
    now[0]+=3601
    response=await client.post("/api/auth/password/forgot",json={"identifier":"alice"})
    assert response.json()["retry_after"]==30


async def test_no_email_and_unverified_email_explain_support_without_creating_letters(client,storage,monkeypatch):
    monkeypatch.setattr(settings,"development_mailbox",True)
    async with storage() as db:
        db.add(AppSetting(key="support_contact_email",value="support@example.test")); await db.commit()
    response=await client.post("/api/auth/password/forgot",json={"identifier":"alice"})
    assert response.json()["status"]=="support_required" and "не привязана" in response.json()["detail"]
    assert response.json()["support_email"]=="support@example.test"
    async with storage() as db:
        user=await db.get(User,1); user.email="unverified@example.test"; await db.commit()
    response=await client.post("/api/auth/password/forgot",json={"identifier":"alice"})
    assert "не подтверждена" in response.json()["detail"]
    async with storage() as db: assert (await db.scalars(select(EmailOutbox))).all()==[]


async def test_public_contact_is_configurable_by_admin_without_disclosing_security_recipient(client,storage):
    async with storage() as db:
        db.add(AppSetting(key="admin_confirmation_recipient",value="private-codes@example.test")); await db.commit()
    assert (await client.get("/api/mail/status")).json()["support_email"]==""
    body={"email":"help@example.test"}
    assert (await client.put("/api/admin/mail/support-contact",json=body)).status_code==401
    headers=await admin_token(storage)
    response=await client.put("/api/admin/mail/support-contact",headers=headers,json=body)
    assert response.status_code==200
    assert (await client.get("/api/mail/status")).json()["support_email"]=="help@example.test"
    assert (await client.put("/api/admin/mail/support-contact",headers=headers,json={"email":"invalid"})).status_code==422
    assert (await client.get("/api/admin/password-confirmation",headers=headers)).json()["recipient"]=="private-codes@example.test"
