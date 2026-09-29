"""Optional mail setup and account ownership verification."""
import smtplib
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, get_current_user, hash_password
from app.config import settings
from app.db import get_db
from app.deployment_security import rate_limit
from app.installation import cipher, config_lock, read_config, save_config
from app.mail_service import (check_smtp, consume_token, decrypt_mail, issue_token,
                              enqueue, mail_enabled, normalized_email, public_mail)
from app.models import ArenaRoom, EmailOutbox, User
from app.engine.room_booking import booking_access
from app.routers.rooms import state_for

router = APIRouter(tags=["mail"])


@router.get("/mail/status")
async def status(db: AsyncSession = Depends(get_db)):
    _, value = await read_config(db)
    return {"enabled": mail_enabled(value)}


@router.get("/admin/mail")
async def admin_status(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    revision, value = await read_config(db)
    return {**public_mail(value), "revision": revision}


@router.get("/admin/mail/queue")
async def queue_status(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(EmailOutbox.state, func.count(EmailOutbox.id))
                             .group_by(EmailOutbox.state))).all()
    return {"counts": {state: count for state, count in rows}}


class MailConfig(BaseModel):
    revision: int = Field(ge=1)
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(ge=1, le=65535)
    security: Literal["starttls", "ssl"]
    sender: str = Field(max_length=254)
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(default="", max_length=1024, repr=False)

    @field_validator("sender")
    @classmethod
    def valid_sender(cls, value: str) -> str:
        return normalized_email(value)


async def candidate(body: MailConfig, db: AsyncSession):
    _, value = await read_config(db)
    previous = value.get("mail") or {}
    password = body.password or (cipher().decrypt(previous["password"].encode()).decode() if previous.get("password") else "")
    if not password:
        raise HTTPException(422, "Укажите пароль почтового ящика")
    host = body.host.strip().lower()
    if not host or any(ch.isspace() for ch in host):
        raise HTTPException(422, "Проверьте адрес SMTP-сервера")
    return {"host": host, "port": body.port, "security": body.security,
            "sender": normalized_email(body.sender), "username": body.username.strip(), "password": password}


async def checked(mail: dict, recipient: str | None = None):
    try:
        await check_smtp(mail, recipient)
    except (OSError, smtplib.SMTPException, TimeoutError) as exc:
        raise HTTPException(422, f"SMTP не подключился: {type(exc).__name__}. Проверьте адрес, порт, шифрование и пароль.") from None


@router.post("/admin/mail/check")
async def check(body: MailConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("mail-check", admin.id, 6, 60)
    mail = await candidate(body, db)
    await checked(mail)
    return {"ok": True, "detail": "SMTP принял вход. Проверьте отправку отдельным тестовым письмом."}


@router.put("/admin/mail")
async def save(body: MailConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("mail-save", admin.id, 6, 60)
    mail = await candidate(body, db)
    await checked(mail)
    mail["password"] = cipher().encrypt(mail["password"].encode()).decode()
    mail["enabled"] = True
    async with config_lock:
        result = await save_config(db, body.revision, {"mail": mail}, admin.id, "mail.updated")
    return {**public_mail({"mail": mail}), "revision": result["revision"]}


@router.post("/admin/mail/test")
async def test(body: MailConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("mail-test", admin.id, 4, 60)
    mail = await candidate(body, db)
    await checked(mail, mail["sender"])
    return {"ok": True, "detail": "SMTP принял тестовое письмо. Проверьте входящие и папку «Спам»."}


class MailRevision(BaseModel):
    revision: int = Field(ge=1)


@router.post("/admin/mail/disable")
async def disable(body: MailRevision, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    async with config_lock:
        _, value = await read_config(db)
        mail = dict(value.get("mail") or {})
        mail["enabled"] = False
        result = await save_config(db, body.revision, {"mail": mail}, admin.id, "mail.disabled")
        await db.execute(update(EmailOutbox).where(EmailOutbox.state.in_(["pending", "retry"]))
                         .values(state="cancelled"))
        await db.commit()
    return {**public_mail({"mail": mail}), "revision": result["revision"]}


class Address(BaseModel):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        return normalized_email(value)


@router.post("/auth/email")
async def set_address(body: Address, request: Request, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    rate_limit("email-address", user.id, 4, 3600)
    _, value = await read_config(db)
    if not mail_enabled(value):
        raise HTTPException(404)
    address = normalized_email(body.email)
    existing = await db.scalar(select(User.id).where(User.email == address, User.id != user.id))
    if existing:
        raise HTTPException(409, "Этот адрес уже занят")
    base = settings.public_base_url or str(request.base_url)
    await issue_token(db, user.id, "verify", address, base)
    await db.commit()
    return {"ok": True, "detail": "Отправили ссылку для подтверждения."}


class TokenInput(BaseModel):
    token: str = Field(min_length=20, max_length=200)


@router.post("/auth/email/verify")
async def verify_address(body: TokenInput, db: AsyncSession = Depends(get_db)):
    row = await consume_token(db, body.token, "verify")
    if row is None:
        raise HTTPException(400, "Ссылка недействительна или срок её действия истёк")
    user = await db.get(User, row.user_id)
    existing = await db.scalar(select(User.id).where(User.email == row.email, User.id != row.user_id))
    if existing:
        raise HTTPException(409, "Этот адрес уже занят")
    user.email = row.email
    user.email_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"ok": True}


@router.post("/auth/password/forgot")
async def forgot(body: Address, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit("password-forgot", request.client.host if request.client else "unknown", 5, 3600)
    _, value = await read_config(db)
    if not mail_enabled(value):
        raise HTTPException(404)
    try:
        address = normalized_email(body.email)
    except ValueError:
        return {"ok": True}
    user = await db.scalar(select(User).where(User.email == address, User.email_verified_at.is_not(None)))
    if user:
        await issue_token(db, user.id, "reset", address, settings.public_base_url or str(request.base_url))
        await db.commit()
    return {"ok": True, "detail": "Если адрес подтверждён, мы отправили ссылку."}


class ResetPassword(TokenInput):
    password: str = Field(min_length=12, max_length=100)


@router.post("/auth/password/reset")
async def reset(body: ResetPassword, db: AsyncSession = Depends(get_db)):
    row = await consume_token(db, body.token, "reset")
    if row is None:
        raise HTTPException(400, "Ссылка недействительна или срок её действия истёк")
    user = await db.get(User, row.user_id)
    if user.email != row.email or not user.email_verified_at:
        raise HTTPException(400, "Адрес изменён")
    user.password_hash = hash_password(body.password)
    await db.commit()
    return {"ok": True}


@router.post("/rooms/{room_id}/email-invite")
async def invite_by_email(room_id: int, body: Address, request: Request,
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rate_limit("room-email-invite", user.id, 8, 3600)
    _, config = await read_config(db)
    if not mail_enabled(config):
        raise HTTPException(404)
    room = await db.get(ArenaRoom, room_id)
    if room is None or room.host_id != user.id or room.status not in {"scheduled", "waiting", "lobby"}:
        raise HTTPException(404, "Встреча недоступна")
    address = normalized_email(body.email)
    state = state_for(room)
    invite = booking_access(room, state)
    base = settings.public_base_url or str(request.base_url)
    link = base.rstrip("/") + invite["invite_path"]
    await enqueue(db, dedupe_key=f"room-invite:{room.id}:{address}", recipient=address,
                  subject="Приглашение на переговоры 1×1",
                  body=f"{user.username} приглашает вас на встречу в Арене переговоров.\n"
                       f"Тема: {state['scenario'].get('title') or state.get('request_text', 'Переговоры')}\n"
                       f"Время: {state['scheduled_at']}\n\nОткрыть приглашение: {link}\n\n"
                       "Если у вас нет аккаунта, создайте его по этой ссылке. Вы также можете получить код приглашения у организатора.")
    await db.commit()
    return {"ok": True, "detail": "Приглашение поставлено в очередь. Ссылка доступна для отправки вручную."}
