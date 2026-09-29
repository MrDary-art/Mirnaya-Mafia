"""Revisioned installation settings. Secret values never leave this module in responses."""
import asyncio
import base64
import json
import os
import time
from pathlib import Path

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select, update

from app.config import settings
from app.db import SessionLocal
from app.deployment_models import AdminAudit, InstallationConfig

config_lock = asyncio.Lock()


def cipher():
    path = Path(settings.installation_key_file)
    if not path.is_file():
        raise RuntimeError("Installation encryption key is missing; restore it from the private backup")
    return Fernet(path.read_bytes().strip())


def create_private_key():
    path = Path(settings.installation_key_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
            f.write(Fernet.generate_key())
    except FileExistsError:
        pass
    cipher()


def normalize_key(value):
    value = value.strip()
    if value.startswith("Basic "):
        value = value[6:].strip()
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
        if ":" not in decoded or not all(decoded.split(":", 1)):
            raise ValueError()
    except (ValueError, UnicodeError):
        raise HTTPException(422, "Нужен полный Authorization Key, а не Access Token") from None
    return value


async def read_config(db):
    row = await db.get(InstallationConfig, 1)
    if not row:
        return 0, {"stt_policy": settings.stt_policy, "stt_model": settings.stt_model,
                   "scope": settings.gigachat_scope, "model": settings.gigachat_model,
                   "onboarding_completed": None, "fresh_install": False}
    return row.revision, json.loads(row.value)


async def initialize_config(fresh=False):
    async with SessionLocal() as db:
        if await db.get(InstallationConfig, 1):
            return
        create_private_key()
        _, value = await read_config(db)
        value["fresh_install"] = fresh
        if settings.gigachat_credentials:
            value["credential"] = cipher().encrypt(normalize_key(settings.gigachat_credentials).encode()).decode()
        db.add(InstallationConfig(id=1, revision=1, value=json.dumps(value)))
        await db.commit()


def public_config(revision, value):
    return {**{k: v for k, v in value.items() if k not in {"credential", "mail"}}, "revision": revision,
            "key_configured": bool(value.get("credential")), "provider": "gigachat",
            "turn_configured": '"turn:' in settings.room_ice_servers_json or '"turns:' in settings.room_ice_servers_json}


def activate(value):
    # No awaits: following requests see a complete configuration revision.
    old_key, old_scope = settings.gigachat_credentials, settings.gigachat_scope
    settings.gigachat_credentials = cipher().decrypt(value["credential"].encode()).decode() if value.get("credential") else ""
    settings.gigachat_scope = value.get("scope", "GIGACHAT_API_PERS")
    settings.gigachat_model = value.get("model", "GigaChat-3-Ultra")
    settings.stt_policy = value.get("stt_policy", "local")
    settings.stt_model = value.get("stt_model", "tiny")
    if old_key and (old_key != settings.gigachat_credentials or old_scope != settings.gigachat_scope):
        import hashlib
        from app.engine.llm import _token_cache
        _token_cache.pop(hashlib.sha256((old_key + old_scope).encode()).hexdigest(), None)


async def load_runtime():
    async with SessionLocal() as db:
        _, value = await read_config(db)
        activate(value)


async def save_config(db, revision, changes, actor_id, action):
    current_revision, value = await read_config(db)
    if revision != current_revision:
        raise HTTPException(409, "Настройки изменились. Обновите страницу.")
    value.update(changes)
    result = await db.execute(update(InstallationConfig).where(
        InstallationConfig.id == 1, InstallationConfig.revision == revision
    ).values(revision=revision + 1, value=json.dumps(value)))
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Настройки изменились. Обновите страницу.")
    db.add(AdminAudit(actor_id=actor_id, action=action, detail=json.dumps({"fields": sorted(changes)}), created=time.time()))
    await db.commit()
    activate(value)
    return public_config(revision + 1, value)


async def check_gigachat(key, scope, model):
    from app.engine.llm import _gigachat_access_token, _gigachat_ssl_context, LlmError
    key = normalize_key(key)
    try:
        token = await _gigachat_access_token(key, 20, scope=scope)
        async with httpx.AsyncClient(timeout=20, verify=_gigachat_ssl_context()) as client:
            response = await client.get("https://api.giga.chat/v1/models", headers={"Authorization": f"Bearer {token}"})
        if response.status_code == 429:
            raise HTTPException(429, "GigaChat: лимит запросов. Повторите позже.")
        if response.status_code in (401, 403):
            raise HTTPException(422, "Ключ принят, но доступ к моделям запрещён для этого scope")
        response.raise_for_status()
        models = [x["id"] for x in response.json().get("data", []) if isinstance(x, dict) and isinstance(x.get("id"), str)]
        if model not in models:
            raise HTTPException(422, "Выбранная модель недоступна. Доступны: " + ", ".join(models))
        return {"status": "ready", "models": models, "checked_at": time.time()}
    except HTTPException:
        raise
    except LlmError as exc:
        message = str(exc)
        if "429" in message:
            raise HTTPException(429, "GigaChat: лимит авторизации") from None
        if "401" in message or "403" in message:
            raise HTTPException(422, "GigaChat отклонил ключ или scope") from None
        raise HTTPException(503, "Не удалось проверить GigaChat: соединение, сертификат или ответ сервера") from None
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "GigaChat недоступен. Проверьте сеть и доверенные сертификаты.") from None
