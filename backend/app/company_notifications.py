"""Delivery of company events to configured HTTPS webhook integrations."""

import base64
import hashlib

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.company_models import CompanyIntegration
from app.config import settings
from app.services import loads


def _cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode("utf-8")).digest())
    return Fernet(key)


async def deliver_company_event(db: AsyncSession, company_id: int, event: dict) -> None:
    """Best effort delivery. Corporate data creation must never depend on a remote service."""
    rows = (await db.scalars(select(CompanyIntegration).where(
        CompanyIntegration.company_id == company_id,
        CompanyIntegration.enabled == 1,
        CompanyIntegration.provider.in_(["teams", "slack", "webhook"]),
    ))).all()
    for row in rows:
        try:
            config = loads(_cipher().decrypt(row.encrypted_config.encode("ascii")).decode("utf-8"), {})
            url = config.get("webhook_url", "")
            if not isinstance(url, str) or not url.startswith("https://"):
                continue
            headers = {"Content-Type": "application/json", "User-Agent": "Arena-Negotiations/1.0"}
            if config.get("access_token"):
                headers["Authorization"] = f"Bearer {config['access_token']}"
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
                await client.post(url, json={"source": "arena-negotiations", **event}, headers=headers)
        except (InvalidToken, httpx.HTTPError, ValueError, TypeError):
            # A failing channel is isolated from the corporate workflow.
            continue
