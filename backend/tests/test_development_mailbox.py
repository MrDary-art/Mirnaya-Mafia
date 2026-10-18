"""Development mail uses real account tokens without sending anything to SMTP."""
import re

import httpx

from app import mail_service
from app.auth import create_token
from app.config import settings
from app.installation import cipher, save_config
from app.main import app
from .test_installation_security import admin_token, client, storage


async def test_local_mail_verification_reset_and_no_smtp(client, storage, monkeypatch):
    monkeypatch.setattr(settings, "development_mailbox", True)
    monkeypatch.setattr(settings, "public_base_url", "http://127.0.0.1:5173")
    monkeypatch.setattr(mail_service, "SessionLocal", storage)
    def unexpected_smtp(*args, **kwargs):
        raise AssertionError("Local mail must never call SMTP")
    monkeypatch.setattr(mail_service, "_smtp_send", unexpected_smtp)
    admin = await admin_token(storage)
    assert (await client.get("/api/mail/status")).json() == {"enabled": True}
    config = (await client.get("/api/admin/mail", headers=admin)).json()
    assert config["transport"] == "local" and not config["password_configured"]
    registered = await client.post("/api/auth/register", json={
        "username": "local-mail-user", "password": "original-password-123", "email": "local@example.test",
    })
    assert registered.status_code == 200, registered.text
    old_headers = {"Authorization": "Bearer " + registered.json()["access_token"]}
    credentials = {"username": "local@example.test", "password": "original-password-123"}
    assert (await client.post("/api/auth/login", json=credentials)).status_code == 401
    letters = (await client.get("/api/admin/mail/inbox", headers=admin)).json()["items"]
    assert len(letters) == 1 and letters[0]["recipient"] == "local@example.test"
    assert "http://127.0.0.1:5173/verify-email?token=" in letters[0]["body"]
    token = re.search(r"token=([^\s]+)", letters[0]["body"]).group(1)
    assert (await client.post("/api/auth/email/verify", json={"token": token})).status_code == 200
    assert (await client.post("/api/auth/email/verify", json={"token": token})).status_code == 400
    assert (await client.post("/api/auth/login", json=credentials)).status_code == 200
    assert (await client.post("/api/auth/password/forgot", json={"email": "local@example.test"})).status_code == 200
    letters = (await client.get("/api/admin/mail/inbox", headers=admin)).json()["items"]
    assert len(letters) == 2 and "reset-password?token=" in letters[0]["body"]
    token = re.search(r"token=([^\s]+)", letters[0]["body"]).group(1)
    reset = {"token": token, "password": "new-local-password-123"}
    assert (await client.post("/api/auth/password/reset", json=reset)).status_code == 200
    assert (await client.post("/api/auth/password/reset", json=reset)).status_code == 400
    assert (await client.post("/api/auth/login", json=credentials)).status_code == 401
    credentials["password"] = reset["password"]
    assert (await client.post("/api/auth/login", json=credentials)).status_code == 200
    assert (await client.get("/api/auth/me", headers=old_headers)).status_code == 401

    # Even configured SMTP must be bypassed; local letters cannot be sent later.
    async with storage() as db:
        await save_config(db, 1, {"mail": {"enabled": True, "host": "smtp.example.test",
            "sender": "sender@example.test", "password": cipher().encrypt(b"secret").decode()}}, 2, "test.smtp")
    assert not await mail_service.deliver_once()
    monkeypatch.setattr(settings, "development_mailbox", False)
    assert not await mail_service.deliver_once()


async def test_inbox_requires_local_mode_admin_and_loopback(client, storage, monkeypatch):
    admin = await admin_token(storage)
    monkeypatch.setattr(settings, "development_mailbox", False)
    assert (await client.get("/api/admin/mail/inbox", headers=admin)).status_code == 404
    monkeypatch.setattr(settings, "development_mailbox", True)
    assert (await client.get("/api/admin/mail/inbox")).status_code == 401
    normal = {"Authorization": "Bearer " + create_token(1, "alice")}
    assert (await client.get("/api/admin/mail/inbox", headers=normal)).status_code == 403
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("203.0.113.5", 1234)), base_url="http://test") as remote:
        assert (await remote.get("/api/admin/mail/inbox", headers=admin)).status_code == 404
    assert (await client.get("/api/admin/mail/inbox", headers=admin)).json() == {"items": []}
    assert (await client.post("/api/admin/mail/disable", headers=admin, json={"revision": 1})).status_code == 200
    payload = {"revision": 1, "host": "smtp.example.test", "port": 587, "security": "starttls",
        "sender": "sender@example.test", "username": "sender@example.test", "password": "secret"}
    async def smtp_ok(config,recipient=None):pass
    monkeypatch.setattr("app.routers.mail.check_smtp",smtp_ok)
    payload["revision"]=2
    saved=await client.put("/api/admin/mail", headers=admin, json=payload)
    assert saved.status_code == 200
    assert saved.json()["transport"] == "smtp"
