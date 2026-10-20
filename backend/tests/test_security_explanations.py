import json
import time
from types import SimpleNamespace

import pytest
from app.auth import create_token
from app.deployment_models import AdminAudit, SecurityAlert
from app.security_explanations import SIGNALS, explanation
from .test_installation_security import client, storage, admin_token


@pytest.mark.parametrize("kind", SIGNALS)
def test_all_signal_types_have_factual_reason_and_next_step(kind):
    value = explanation(SimpleNamespace(kind=kind, count=25))
    assert value["title"] and value["reason"] and value["recommendation"]
    assert "5 минут" in value["trigger"] and "25" in value["trigger"]


async def seed_alert(storage, *, count=5, archived=False):
    now = time.time() - 1
    async with storage() as db:
        row = SecurityAlert(bucket="test:window", kind="login_failures", ip="192.0.2.10",
            route="/api/auth/login", severity="high", count=count, first_seen=now, last_seen=now,
            acknowledged_at=now if archived else None)
        db.add(row)
        await db.flush()
        identity = row.id
        await db.commit()
    return identity, now


async def test_evidence_matches_only_signal_ip_kind_and_time_and_never_returns_secrets(client, storage):
    headers = await admin_token(storage)
    alert_id, now = await seed_alert(storage)
    async with storage() as db:
        for action, ip, created, route in [
            ("security.login_failures", "192.0.2.10", now-1, "/auth/login"),
            ("security.login_failures", "192.0.2.10", now-2, "/api/secret-in-path?token=secret-query"),
            ("security.login_failures", "192.0.2.11", now-1, "/api/auth/login"),
            ("security.forbidden", "192.0.2.10", now-1, "/api/auth/login"),
            ("security.login_failures", "192.0.2.10", now-301, "/api/auth/login"),
            ("security.login_failures", "192.0.2.10", now+1, "/api/auth/login"),
        ]:
            db.add(AdminAudit(action=action, created=created, detail=json.dumps({"ip":ip, "route":route,
                "method":"POST", "status":401, "password":"secret-password", "authorization":"secret-header", "body":"secret-body"})))
        db.add(AdminAudit(action="security.login_failures", created=now-1, detail="bad-json"))
        await db.commit()
    response = await client.get(f"/api/admin/security/alerts/{alert_id}/evidence", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["items"]) == 2 and data["matched"] == 2
    assert data["items"][0]["status"] == 401
    assert data["items"][0]["route"] == "/api/auth/login"
    assert "secret-" not in response.text
    assert "скрыт" in data["items"][1]["route"]
    listed = (await client.get("/api/admin/security/alerts", headers=headers)).json()["items"][0]
    assert listed["title"] == "Несколько неудачных попыток входа"
    assert listed["reason"] and listed["trigger"] and listed["recommendation"]


async def test_evidence_is_admin_only_and_available_for_archived_signals(client, storage):
    headers = await admin_token(storage)
    alert_id, _ = await seed_alert(storage, archived=True)
    url = f"/api/admin/security/alerts/{alert_id}/evidence"
    assert (await client.get(url)).status_code == 401
    assert (await client.get(url, headers={"Authorization":"Bearer " + create_token(1,"alice")})).status_code == 403
    response = await client.get(url, headers=headers)
    assert response.status_code == 200 and response.json()["items"] == []
    assert (await client.get("/api/admin/security/alerts/999999/evidence", headers=headers)).status_code == 404


async def test_large_excerpt_is_bounded_and_explicitly_marked(client, storage):
    headers = await admin_token(storage)
    alert_id, now = await seed_alert(storage, count=60)
    async with storage() as db:
        db.add_all([AdminAudit(action="security.login_failures", created=now-i,
            detail=json.dumps({"ip":"192.0.2.10", "route":"/api/auth/login", "method":"POST", "status":401})) for i in range(60)])
        await db.commit()
    data = (await client.get(f"/api/admin/security/alerts/{alert_id}/evidence", headers=headers)).json()
    assert len(data["items"]) == 50 and data["matched"] == 60 and data["truncated"] is True


async def test_unknown_legacy_signal_is_explained_without_inventing_evidence(client, storage):
    headers = await admin_token(storage)
    alert_id, _ = await seed_alert(storage)
    async with storage() as db:
        row = await db.get(SecurityAlert, alert_id)
        row.kind = "legacy"
        row.route = "/api/private-token"
        await db.commit()
    data = (await client.get("/api/admin/security/alerts", headers=headers)).json()["items"][0]
    assert "ручной проверки" in data["title"]
    assert "неизвестно" in data["trigger"]
    assert "private-token" not in json.dumps(data)
