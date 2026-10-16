"""Corporate integration configuration without exposing credentials to clients."""

import base64
import hashlib
import json
from datetime import datetime

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import CompanyIntegration, CompanyIntegrationRun
from app.config import settings
from app.db import get_db
from app.models import User
from app.routers.company import audit, require_membership, require_role
from app.services import dumps

router = APIRouter(prefix="/company", tags=["company-integrations"])
PROVIDER_CATALOG = {
    "teams": {"label": "Microsoft Teams", "required": [], "capabilities": ["notifications"]},
    "slack": {"label": "Slack", "required": [], "capabilities": ["notifications"]},
    "webhook": {"label": "Вебхуки", "required": ["webhook_url"], "capabilities": ["notifications", "events"]},
    "hris": {"label": "HRIS", "required": ["base_url", "api_token"], "capabilities": ["employee_import", "structure_sync"]},
    "lms": {"label": "LMS", "required": ["base_url", "client_id", "client_secret"], "capabilities": ["completion_export", "program_catalog"]},
    "crm": {"label": "CRM", "required": ["base_url", "api_token"], "capabilities": ["lead_export"]},
    "calendar": {"label": "Календарь", "required": ["base_url", "api_token"], "capabilities": ["meeting_export"]},
    "sso_oidc": {"label": "SSO · OIDC", "required": ["issuer", "client_id", "client_secret"], "capabilities": ["sso"]},
    "sso_saml": {"label": "SSO · SAML", "required": ["metadata_url", "entity_id", "certificate"], "capabilities": ["sso"]},
}
SUPPORTED_PROVIDERS = set(PROVIDER_CATALOG)


class IntegrationIn(BaseModel):
    enabled: bool = False
    settings: dict[str, str] = Field(default_factory=dict)


def cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode("utf-8")).digest())
    return Fernet(key)


def public_payload(row: CompanyIntegration) -> dict:
    return {
        "provider": row.provider,
        "label": PROVIDER_CATALOG.get(row.provider, {}).get("label", row.provider),
        "enabled": bool(row.enabled),
        "configured": bool(row.encrypted_config),
        "status": row.status,
        "capabilities": json.loads(row.capabilities or "[]"),
        "last_checked_at": row.last_checked_at.isoformat() if row.last_checked_at else None,
        "last_error": row.last_error,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/{company_id}/integrations")
async def list_integrations(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    rows = (await db.scalars(select(CompanyIntegration).where(CompanyIntegration.company_id == company_id))).all()
    configured = {row.provider: public_payload(row) for row in rows}
    return [configured.get(provider, {"provider": provider, "label": PROVIDER_CATALOG[provider]["label"],
            "enabled": False, "configured": False, "status": "NOT_CONFIGURED",
            "capabilities": PROVIDER_CATALOG[provider]["capabilities"], "last_checked_at": None,
            "last_error": None, "updated_at": None})
            for provider in sorted(SUPPORTED_PROVIDERS)]


@router.put("/{company_id}/integrations/{provider}")
async def save_integration(company_id: int, provider: str, body: IntegrationIn,
                           db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(404, "Интеграция не поддерживается")
    membership = await require_membership(db, user, company_id)
    require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    normalized = {key.strip()[:80]: value.strip()[:4000] for key, value in body.settings.items()
                  if key.strip() and value.strip()}
    webhook_url = normalized.get("webhook_url")
    if webhook_url and not webhook_url.startswith("https://"):
        raise HTTPException(400, "Адрес вебхука должен начинаться с https://")
    for url_key in ("base_url", "issuer", "metadata_url"):
        if normalized.get(url_key) and not normalized[url_key].startswith("https://"):
            raise HTTPException(400, f"Поле {url_key} должно начинаться с https://")
    missing = [key for key in PROVIDER_CATALOG[provider]["required"] if not normalized.get(key)]
    if body.enabled and missing:
        raise HTTPException(400, "Для включения заполните: " + ", ".join(missing))
    row = await db.scalar(select(CompanyIntegration).where(
        CompanyIntegration.company_id == company_id, CompanyIntegration.provider == provider))
    encoded = cipher().encrypt(dumps(normalized).encode("utf-8")).decode("ascii")
    if row is None:
        row = CompanyIntegration(company_id=company_id, provider=provider, enabled=int(body.enabled),
                                 encrypted_config=encoded, updated_by=user.id,
                                 status="CONFIGURED" if not missing else "INCOMPLETE",
                                 capabilities=dumps(PROVIDER_CATALOG[provider]["capabilities"]))
        db.add(row)
    else:
        row.enabled = int(body.enabled)
        row.encrypted_config = encoded
        row.updated_by = user.id
        row.status = "CONFIGURED" if not missing else "INCOMPLETE"
        row.capabilities = dumps(PROVIDER_CATALOG[provider]["capabilities"])
        row.last_error = None
    await db.flush()
    await audit(db, membership, user.id, "INTEGRATION_SAVED", "integration", row.id, {"provider": provider, "enabled": body.enabled})
    await db.commit()
    return public_payload(row)


@router.post("/{company_id}/integrations/{provider}/check")
async def check_integration(company_id: int, provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Validate stored configuration locally; provider connectivity is never fabricated."""
    membership = await require_membership(db, user, company_id)
    require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await db.scalar(select(CompanyIntegration).where(
        CompanyIntegration.company_id == company_id, CompanyIntegration.provider == provider))
    if row is None or provider not in PROVIDER_CATALOG:
        raise HTTPException(404, "Интеграция не настроена")
    try:
        config = json.loads(cipher().decrypt(row.encrypted_config.encode("ascii")).decode("utf-8"))
    except Exception:
        row.status, row.last_error = "ERROR", "Не удалось прочитать сохранённую конфигурацию"
        config = {}
    missing = [key for key in PROVIDER_CATALOG[provider]["required"] if not config.get(key)]
    row.last_checked_at = datetime.now()
    row.status = "CONFIGURED" if not missing else "INCOMPLETE"
    row.last_error = ("Не заполнены: " + ", ".join(missing)) if missing else None
    run = CompanyIntegrationRun(company_id=company_id, integration_id=row.id, operation="CONFIG_CHECK",
        status="SUCCESS" if not missing else "FAILED", processed=1 if not missing else 0,
        failed=1 if missing else 0, detail=dumps({"missing": missing, "connectivity_checked": False}), created_by=user.id)
    db.add(run)
    await audit(db, membership, user.id, "INTEGRATION_CHECKED", "integration", row.id,
                {"provider": provider, "status": row.status})
    await db.flush()
    await db.refresh(row)
    payload = {**public_payload(row), "connectivity_checked": False,
               "message": "Конфигурация корректна. Для проверки обмена нужны доступ и учётные данные провайдера." if not missing else row.last_error}
    await db.commit()
    return payload


@router.get("/{company_id}/integrations/runs")
async def integration_runs(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    rows = (await db.scalars(select(CompanyIntegrationRun).where(
        CompanyIntegrationRun.company_id == company_id).order_by(CompanyIntegrationRun.created_at.desc()).limit(100))).all()
    return [{"id": row.id, "integration_id": row.integration_id, "operation": row.operation,
             "status": row.status, "processed": row.processed, "failed": row.failed,
             "detail": json.loads(row.detail or "{}"), "created_at": row.created_at.isoformat()} for row in rows]


@router.delete("/{company_id}/integrations/{provider}")
async def remove_integration(company_id: int, provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    row = await db.scalar(select(CompanyIntegration).where(
        CompanyIntegration.company_id == company_id, CompanyIntegration.provider == provider))
    if not row:
        raise HTTPException(404, "Интеграция не настроена")
    await audit(db, membership, user.id, "INTEGRATION_REMOVED", "integration", row.id, {"provider": provider})
    await db.delete(row)
    await db.commit()
    return {"ok": True}
