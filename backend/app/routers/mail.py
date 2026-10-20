"""Optional mail setup and account ownership verification."""
import smtplib
from ipaddress import ip_address
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, get_current_user, hash_password
from app.config import settings
from app.db import get_db
from app.deployment_security import rate_limit
from app.installation import cipher, config_lock, read_config, save_config
from app.mail_service import (check_smtp, consume_token, decrypt_mail, issue_token,
                              enqueue, mail_enabled, normalized_email, public_mail)
from app.models import ArenaRoom, EmailOutbox, EmailToken, User
from app.engine.room_booking import booking_access
from app.routers.rooms import state_for

router = APIRouter(tags=["mail"])


@router.get("/mail/status")
async def status(db: AsyncSession = Depends(get_db)):
    _, value = await read_config(db)
    # The configured sender is the only support contact that is guaranteed to
    # receive replies to platform notifications.  It is safe to disclose (it is
    # already visible in mail headers) and avoids hard-coding a private address
    # in the client.
    mail = value.get("mail") or {}
    return {"enabled": mail_enabled(value), "support_email": mail.get("sender", "")}


@router.get("/admin/mail")
async def admin_status(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.routers.admin_settings import contact
    revision, value = await read_config(db)
    return {**public_mail(value), "revision": revision,"requires_confirmation":bool(await contact(db))}


@router.get("/admin/mail/queue")
async def queue_status(admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(EmailOutbox.state, func.count(EmailOutbox.id))
                             .group_by(EmailOutbox.state))).all()
    return {"counts": {state: count for state, count in rows}}


@router.get("/admin/mail/inbox")
async def local_inbox(request: Request, archive: bool=False, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    try:
        local = request.client is not None and ip_address(request.client.host).is_loopback
    except ValueError:
        local = False
    if not settings.development_mailbox or not local:
        raise HTTPException(404)
    letters = (await db.scalars(select(EmailOutbox).where(EmailOutbox.state == "local",~EmailOutbox.dedupe_key.like("admin-code:%"),EmailOutbox.archived_at.is_not(None) if archive else EmailOutbox.archived_at.is_(None))
                               .order_by(EmailOutbox.id.desc()).limit(100))).all()
    tokens={row.token_hash:row for row in (await db.scalars(select(EmailToken).where(EmailToken.token_hash.in_([letter.dedupe_key.removeprefix("verify:") for letter in letters if letter.dedupe_key.startswith("verify:")])))).all()}
    verified=set((await db.scalars(select(User.email).where(User.email.in_([letter.recipient for letter in letters]),User.email_verified_at.is_not(None)))).all())
    return {"items": [{"id": letter.id, "recipient": letter.recipient, "subject": letter.subject,
                       "body": letter.body, "created_at": letter.created_at,"archived":bool(letter.archived_at),
                       "verification": ("confirmed" if letter.recipient in verified or tokens[letter.dedupe_key[7:]].used_at else "expired" if tokens[letter.dedupe_key[7:]].expires_at<datetime.now(timezone.utc).replace(tzinfo=None) else "pending") if letter.dedupe_key.startswith("verify:") and letter.dedupe_key[7:] in tokens else None} for letter in letters]}


def require_smtp_mode():
    # The administrator can connect SMTP directly even in a development install.
    return None


class MailConfig(BaseModel):
    revision: int = Field(ge=1)
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(ge=1, le=65535)
    security: Literal["starttls", "ssl"]
    sender: str = Field(max_length=254)
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(default="", max_length=1024, repr=False)
    challenge_id: str = Field(default="",max_length=36)
    code: str = Field(default="",max_length=6,repr=False)

    @field_validator("sender")
    @classmethod
    def valid_sender(cls, value: str) -> str:
        return normalized_email(value)


async def candidate(body: MailConfig, db: AsyncSession):
    require_smtp_mode()
    _, value = await read_config(db)
    previous = value.get("mail") or {}
    if not body.password and previous.get("password") and (body.host.strip().lower()!=previous.get("host") or body.username.strip()!=previous.get("username")):
        raise HTTPException(422,"Для другого SMTP-сервера или логина введите пароль заново")
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
    from app.routers.admin_settings import contact,consume
    from app.admin_security import fingerprint
    import json
    protected=bool(await contact(db))
    if protected:
        await consume(db,admin,body.challenge_id,body.code,"mail",target_hash=fingerprint(json.dumps(mail,sort_keys=True)))
    await checked(mail)
    mail["password"] = cipher().encrypt(mail["password"].encode()).decode()
    mail["enabled"] = True
    mail["transport"] = "smtp"
    async with config_lock:
        result = await save_config(db, body.revision, {"mail": mail}, admin.id, "mail.updated")
    return {**public_mail({"mail": mail}), "revision": result["revision"],"requires_confirmation":protected}


@router.post("/admin/mail/test")
async def test(body: MailConfig, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rate_limit("mail-test", admin.id, 4, 60)
    mail = await candidate(body, db)
    await checked(mail, mail["sender"])
    return {"ok": True, "detail": "SMTP принял тестовое письмо. Проверьте входящие и папку «Спам»."}


class MailRevision(BaseModel):
    revision: int = Field(ge=1)
    challenge_id: str = Field(default="",max_length=36)
    code: str = Field(default="",max_length=6,repr=False)


class MailArchive(BaseModel):
    archived: bool=True


@router.patch("/admin/mail/inbox/{letter_id}/archive")
async def archive_letter(letter_id:int,body:MailArchive,admin=Depends(get_admin),db:AsyncSession=Depends(get_db)):
    letter=await db.get(EmailOutbox,letter_id)
    if not letter or letter.state!="local" or letter.dedupe_key.startswith("admin-code:"):
        raise HTTPException(404,"Письмо не найдено")
    letter.archived_at=datetime.now(timezone.utc).replace(tzinfo=None) if body.archived else None
    await db.commit();return {"ok":True}


@router.post("/admin/mail/disable")
async def disable(body: MailRevision, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.routers.admin_settings import contact,consume
    if await contact(db):await consume(db,admin,body.challenge_id,body.code,"mail",target_hash="disable")
    require_smtp_mode()
    async with config_lock:
        _, value = await read_config(db)
        mail = dict(value.get("mail") or {})
        mail["enabled"] = False
        mail["transport"] = "smtp"
        result = await save_config(db, body.revision, {"mail": mail}, admin.id, "mail.disabled")
        await db.execute(update(EmailOutbox).where(EmailOutbox.state.in_(["pending", "retry"]))
                         .values(state="cancelled"))
        await db.commit()
    return {**public_mail({"mail": mail}), "revision": result["revision"],"requires_confirmation":bool(await contact(db))}


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
    existing = await db.scalar(select(User.id).where(
        User.id != user.id,
        or_(User.email == address, User.login == address, User.username == address),
    ))
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
    existing = await db.scalar(select(User.id).where(
        User.id != row.user_id,
        or_(User.email == row.email, User.login == row.email, User.username == row.email),
    ))
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
    if user and not user.is_admin:
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
    if user.is_admin:
        raise HTTPException(403,"Пароль администратора меняется только с кодом разработчика в панели управления")
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
