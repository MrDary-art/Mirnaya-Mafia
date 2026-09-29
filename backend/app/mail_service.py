"""Optional outbound mail. SMTP credentials stay in encrypted installation config."""
import asyncio
import hashlib
import logging
import re
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote

from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.db import SessionLocal
from app.installation import cipher, read_config
from app.models import EmailOutbox, EmailToken, User
from app.config import settings

logger = logging.getLogger(__name__)
EMAIL = re.compile(r"^[^\s@<>]{1,64}@[^\s@<>]{1,189}\.[^\s@<>]{2,63}$")


def normalized_email(value: str) -> str:
    address = value.strip().casefold()
    if len(address) > 254 or not EMAIL.fullmatch(address):
        raise ValueError("Проверьте адрес электронной почты")
    return address


def mail_enabled(value: dict) -> bool:
    mail = value.get("mail") or {}
    return bool(mail.get("enabled") and mail.get("host") and mail.get("sender") and mail.get("password"))


def public_mail(value: dict) -> dict:
    mail = value.get("mail") or {}
    return {"enabled": mail_enabled(value), "host": mail.get("host", ""),
            "port": mail.get("port", 587), "security": mail.get("security", "starttls"),
            "sender": mail.get("sender", ""), "username": mail.get("username", ""),
            "password_configured": bool(mail.get("password"))}


def _smtp_send(mail: dict, recipient: str | None, subject: str, body: str) -> None:
    port = int(mail["port"])
    if mail["security"] == "ssl":
        server = smtplib.SMTP_SSL(mail["host"], port, timeout=12, context=ssl.create_default_context())
    else:
        server = smtplib.SMTP(mail["host"], port, timeout=12)
    with server:
        server.ehlo()
        if mail["security"] == "starttls":
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        server.login(mail["username"], mail["password"])
        if recipient:
            message = EmailMessage()
            message["From"] = mail["sender"]
            message["To"] = recipient
            message["Subject"] = subject
            message.set_content(body)
            server.send_message(message)


async def check_smtp(mail: dict, recipient: str | None = None) -> None:
    await asyncio.to_thread(_smtp_send, mail, recipient, "Проверка почты Арены переговоров",
                            "Почта настроена. Это проверочное письмо из панели управления.")


def decrypt_mail(value: dict) -> dict:
    mail = dict(value.get("mail") or {})
    if mail.get("password"):
        mail["password"] = cipher().decrypt(mail["password"].encode()).decode()
    return mail


async def enqueue(db, *, dedupe_key: str, recipient: str, subject: str, body: str) -> bool:
    _, config = await read_config(db)
    if not mail_enabled(config):
        return False
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stmt = sqlite_insert(EmailOutbox).values(
        dedupe_key=dedupe_key, recipient=normalized_email(recipient), subject=subject,
        body=body, state="pending", attempts=0, next_attempt_at=now, created_at=now,
    ).on_conflict_do_nothing(index_elements=["dedupe_key"])
    result = await db.execute(stmt)
    return result.rowcount == 1


async def notify_room_participants(db, room, *, event: str, subject: str, message: str) -> None:
    if not settings.public_base_url:
        return
    link = settings.public_base_url.rstrip("/") + f"/room/{room.id}"
    for user_id in {room.host_id, room.guest_id} - {None}:
        user = await db.get(User, user_id)
        if user and user.email and user.email_verified_at:
            await enqueue(db, dedupe_key=f"room:{room.id}:{event}:{user_id}", recipient=user.email,
                          subject=subject, body=f"{message}\n\nОткрыть встречу: {link}")


async def issue_token(db, user_id: int, purpose: str, email: str, base_url: str) -> None:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(EmailToken(user_id=user_id, purpose=purpose, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                      email=email, expires_at=now + timedelta(minutes=30)))
    await db.flush()
    path = "verify-email" if purpose == "verify" else "reset-password"
    link = f"{base_url.rstrip('/')}/{path}?token={quote(token)}"
    await enqueue(db, dedupe_key=f"{purpose}:{hashlib.sha256(token.encode()).hexdigest()}", recipient=email,
                  subject="Подтвердите почту" if purpose == "verify" else "Восстановление доступа",
                  body=f"Для {'подтверждения адреса' if purpose == 'verify' else 'смены пароля'} откройте ссылку:\n{link}\n\nСсылка действует 30 минут. Если это были не вы, проигнорируйте письмо.")


async def consume_token(db, token: str, purpose: str):
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = await db.scalar(select(EmailToken).where(EmailToken.token_hash == digest,
        EmailToken.purpose == purpose, EmailToken.used_at.is_(None), EmailToken.expires_at > now))
    if row is None:
        return None
    claim = await db.execute(update(EmailToken).where(
        EmailToken.id == row.id, EmailToken.used_at.is_(None), EmailToken.expires_at > now,
    ).values(used_at=now))
    return row if claim.rowcount == 1 else None


async def deliver_once() -> bool:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with SessionLocal() as db:
        _, config = await read_config(db)
        if not mail_enabled(config):
            return False
        candidate = await db.scalar(select(EmailOutbox.id).where(
            EmailOutbox.state.in_(["pending", "retry", "sending"]), EmailOutbox.next_attempt_at <= now
        ).order_by(EmailOutbox.id).limit(1))
        if candidate is None:
            return False
        result = await db.execute(update(EmailOutbox).where(EmailOutbox.id == candidate,
            EmailOutbox.state.in_(["pending", "retry", "sending"]), EmailOutbox.next_attempt_at <= now
        ).values(state="sending", next_attempt_at=now + timedelta(minutes=2),
                 attempts=EmailOutbox.attempts + 1))
        if result.rowcount != 1:
            await db.rollback()
            return True
        await db.commit()
        job = await db.get(EmailOutbox, candidate)
        try:
            await asyncio.to_thread(_smtp_send, decrypt_mail(config), job.recipient, job.subject, job.body)
            job.state = "sent"
            job.last_error = None
        except Exception as exc:
            logger.warning("Mail delivery failed for job %s: %s", job.id, type(exc).__name__)
            job.state = "failed" if job.attempts >= 5 else "retry"
            job.next_attempt_at = now + timedelta(minutes=min(60, 2 ** job.attempts))
            job.last_error = type(exc).__name__
        await db.commit()
        return True


async def delivery_loop() -> None:
    while True:
        try:
            while await deliver_once():
                await asyncio.sleep(0)
        except Exception as exc:
            logger.warning("Mail worker interrupted: %s", type(exc).__name__)
        await asyncio.sleep(15)
