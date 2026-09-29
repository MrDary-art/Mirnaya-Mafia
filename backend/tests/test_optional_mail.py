"""Mail stays optional; verification gates email login and never exposes SMTP secrets."""
import json
import re
from datetime import timedelta

from sqlalchemy import select

from app.config import settings
from app import mail_service
from app.models import ArenaRoom, EmailOutbox, User
from app.engine.room_v2 import build_state, utcnow
from app.routers import mail
from .test_installation_security import admin_token, client, storage


async def test_mail_hidden_until_configured(client):
    assert (await client.get("/api/mail/status")).json() == {"enabled": False}
    registration = await client.post("/api/auth/register", json={
        "username": "without-mail", "password": "long-password-123", "email": "ignored@example.org",
    })
    assert registration.status_code == 200
    assert (await client.get("/api/auth/me", headers={
        "Authorization": "Bearer " + registration.json()["access_token"],
    })).json()["email"] is None
    assert (await client.post("/api/auth/password/forgot", json={"email": "ignored@example.org"})).status_code == 404


async def test_admin_enable_and_user_verify(client, storage, monkeypatch):
    async def smtp_ok(*_args, **_kwargs):
        return None

    monkeypatch.setattr(mail, "check_smtp", smtp_ok)
    monkeypatch.setattr(settings, "public_base_url", "https://example.org")
    admin = await admin_token(storage)
    payload = {
        "revision": 1, "host": "smtp.example.org", "port": 587, "security": "starttls",
        "sender": "team@example.org", "username": "team@example.org", "password": "secret-password",
    }
    saved = await client.put("/api/admin/mail", headers=admin, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["enabled"] is True
    assert "secret-password" not in saved.text
    assert "secret-password" not in (await client.get("/api/admin/installation", headers=admin)).text
    assert (await client.post("/api/auth/register", json={
        "username": "invalid-mail", "password": "long-password-123", "email": "bad-address",
    })).status_code == 422

    registered = await client.post("/api/auth/register", json={
        "username": "with-mail", "password": "long-password-123", "email": "person@example.org",
    })
    assert registered.status_code == 200, registered.text
    user_headers = {"Authorization": "Bearer " + registered.json()["access_token"]}
    assert (await client.post("/api/auth/email", headers=user_headers, json={
        "email": "bad-address",
    })).status_code == 422
    assert (await client.post("/api/auth/login", json={
        "username": "person@example.org", "password": "long-password-123",
    })).status_code == 401
    async with storage() as db:
        row = await db.scalar(select(EmailOutbox).where(EmailOutbox.recipient == "person@example.org"))
        assert row and "https://example.org/verify-email?token=" in row.body
        token = re.search(r"token=([^\s]+)", row.body).group(1)
    verified = await client.post("/api/auth/email/verify", json={"token": token})
    assert verified.status_code == 200, verified.text
    assert (await client.post("/api/auth/email/verify", json={"token": token})).status_code == 400
    assert (await client.post("/api/auth/login", json={
        "username": "person@example.org", "password": "long-password-123",
    })).status_code == 200
    async with storage() as db:
        user = await db.scalar(select(User).where(User.username == "with-mail"))
        assert user.email == "person@example.org" and user.email_verified_at is not None
        state = build_state(mode="human", host_id=user.id, display_name="Участник",
            request_text="Обсудить сроки", goal="Договориться", duration_minutes=15,
            scheduled_at=utcnow() + timedelta(days=1), timezone_name="Europe/Moscow",
            team_name=None, scenario_id=None, ranked=False)
        db.add(ArenaRoom(id=12, code="test-invite", mode="human", host_id=user.id,
            status="waiting", state=json.dumps(state, ensure_ascii=False)))
        await db.commit()
    invitation = await client.post("/api/rooms/12/email-invite", headers=user_headers,
        json={"email": "friend@example.org"})
    assert invitation.status_code == 200, invitation.text
    assert (await client.get("/api/admin/mail/queue", headers=user_headers)).status_code == 403
    queue = await client.get("/api/admin/mail/queue", headers=admin)
    assert queue.status_code == 200 and queue.json()["counts"]["pending"] >= 2
    sent = []
    monkeypatch.setattr(mail_service, "SessionLocal", storage)
    monkeypatch.setattr(mail_service, "_smtp_send", lambda config, recipient, subject, body:
                        sent.append((config["password"], recipient, subject)))
    assert await mail_service.deliver_once()
    assert sent[0][0] == "secret-password"
    async with storage() as db:
        letter = await db.scalar(select(EmailOutbox).where(EmailOutbox.recipient == "friend@example.org"))
        assert letter and "https://example.org/rooms?code=test-invite" in letter.body
    disabled = await client.post("/api/admin/mail/disable", headers=admin,
        json={"revision": saved.json()["revision"]})
    assert disabled.status_code == 200 and disabled.json()["enabled"] is False
    assert (await client.get("/api/mail/status")).json() == {"enabled": False}
    assert (await client.post("/api/auth/login", json={
        "username": "person@example.org", "password": "long-password-123",
    })).status_code == 401
    assert (await client.post("/api/auth/login", json={
        "username": "with-mail", "password": "long-password-123",
    })).status_code == 200
    async with storage() as db:
        letter = await db.scalar(select(EmailOutbox).where(EmailOutbox.recipient == "friend@example.org"))
        assert letter.state == "cancelled"
