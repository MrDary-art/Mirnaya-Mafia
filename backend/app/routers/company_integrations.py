"""Corporate integration configuration without exposing credentials to clients."""

import base64
import hashlib

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.company_models import CompanyIntegration
from app.config import settings
from app.db import get_db
from app.models import User
from app.routers.company import audit, require_membership, require_role
from app.services import dumps

router = APIRouter(prefix="/company", tags=["company-integrations"])
SUPPORTED_PROVIDERS = {"teams", "slack", "hris", "crm", "webhook"}


class IntegrationIn(BaseModel):
    enabled: bool = False
    settings: dict[str, str] = Field(default_factory=dict)


def cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode("utf-8")).digest())
    return Fernet(key)


def public_payload(row: CompanyIntegration) -> dict:
    return {
        "provider": row.provider,
        "enabled": bool(row.enabled),
        "configured": bool(row.encrypted_config),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/{company_id}/integrations")
async def list_integrations(company_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    membership = await require_membership(db, user, company_id)
    require_role(membership, {"COMPANY_OWNER", "COMPANY_ADMIN"})
    rows = (await db.scalars(select(CompanyIntegration).where(CompanyIntegration.company_id == company_id))).all()
    configured = {row.provider: public_payload(row) for row in rows}
    return [configured.get(provider, {"provider": provider, "enabled": False, "configured": False, "updated_at": None})
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
    row = await db.scalar(select(CompanyIntegration).where(
        CompanyIntegration.company_id == company_id, CompanyIntegration.provider == provider))
    encoded = cipher().encrypt(dumps(normalized).encode("utf-8")).decode("ascii")
    if row is None:
        row = CompanyIntegration(company_id=company_id, provider=provider, enabled=int(body.enabled),
                                 encrypted_config=encoded, updated_by=user.id)
        db.add(row)
    else:
        row.enabled = int(body.enabled)
        row.encrypted_config = encoded
        row.updated_by = user.id
    await db.flush()
    await audit(db, membership, user.id, "INTEGRATION_SAVED", "integration", row.id, {"provider": provider, "enabled": body.enabled})
    await db.commit()
    return public_payload(row)


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
