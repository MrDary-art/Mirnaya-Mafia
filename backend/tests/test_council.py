"""Private role information and one-version agreement are enforced by the server."""
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import create_token, hash_password
from app.db import Base, get_db
from app.main import app
from app.models import User
from app.routers import council


@pytest.fixture
def council_client(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'council.sqlite').as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    clock = {"now": datetime(2026, 10, 16, 12, 0)}
    monkeypatch.setattr(council, "now_utc", lambda: clock["now"])

    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            db.add_all(User(id=uid, username=f"council-{uid}", password_hash="unused") for uid in range(9701, 9708))
            db.add(User(id=9708, username="council-admin", password_hash=hash_password("test-only-password"), is_admin=1))
            await db.commit()

    async def provide_db():
        async with factory() as db:
            yield db

    asyncio.run(setup())
    app.dependency_overrides[get_db] = provide_db
    headers = {uid: {"Authorization": f"Bearer {create_token(uid, f'council-{uid}')}"} for uid in range(9701, 9708)}
    try:
        client = TestClient(app)
        async def admin_header():
            async with factory() as db:
                admin = await db.get(User, 9708)
                return {"Authorization": f"Bearer {create_token(admin.id, admin.username, admin.password_hash)}"}
        client.council_admin_headers = asyncio.run(admin_header())
        assert client.post("/api/admin/council/moderators", headers=client.council_admin_headers, json={"username": "council-9701"}).status_code == 200
        yield client, headers, clock
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def request(client, method, path, headers, body=None, status=200):
    # Publish open slots through the project administrator, as in the product.
    if method == "POST" and path == "/api/council" and body.get("visibility") == "public" and status == 200:
        import jwt
        actor = jwt.decode(headers["Authorization"].split()[1], options={"verify_signature": False})["username"]
        assert client.post("/api/admin/council/moderators", headers=client.council_admin_headers, json={"username": actor}).status_code == 200
        response = client.post("/api/admin/council", headers=client.council_admin_headers, json={"scheduled_at": body["scheduled_at"], "organizer_username": actor, "organizer_plays": body.get("organizer_plays", True)})
    else:
        response = client.request(method, path, headers=headers, json=body)
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def test_private_roles_votes_and_report(council_client):
    client, h, clock = council_client
    start = clock["now"] + timedelta(days=7)
    assert client.get("/api/council", headers=h[9701]).json() == []
    meeting_id = request(client, "POST", "/api/council", h[9701], {
        "scheduled_at": start.isoformat() + "Z", "visibility": "private", "preferred_role": "project",
    })["id"]
    path = f"/api/council/{meeting_id}"
    request(client, "GET", path, h[9705], status=404)
    for uid in (9702, 9703, 9704):
        request(client, "POST", path + "/invite", h[9701], {"username": f"council-{uid}"})
        request(client, "POST", path + "/join", h[uid], {"role": None})
    before = request(client, "GET", path, h[9701])
    assert before["my_role"] is None and before["can_manage"] is True
    outsider_packet = request(client, "GET", path, h[9702])
    assert outsider_packet["managed_members"] == [] and outsider_packet["facilitator_roles"] is None

    clock["now"] = start - timedelta(hours=47)
    for uid in (9701, 9702, 9703, 9704):
        request(client, "POST", path + "/confirm", h[uid])
    clock["now"] = start - timedelta(hours=23)
    locked = request(client, "GET", path, h[9702])
    assert locked["status"] == "locked" and locked["my_role"] is None
    clock["now"] = start - timedelta(minutes=119)
    project = request(client, "GET", path, h[9701])
    client_role = request(client, "GET", path, h[9702])
    request(client, "GET", path, h[9705], status=404)
    assert project["my_role"]["key"] == "project"
    assert client_role["my_role"]["key"] != "project"
    assert project["my_role"]["private_facts"][0] not in str(client_role)
    request(client, "PUT", path + "/notes", h[9701], {"text": "Мой закрытый план"})
    assert "Мой закрытый план" not in str(request(client, "GET", path, h[9702]))

    clock["now"] = start - timedelta(minutes=14)
    for uid in (9701, 9702, 9703, 9704):
        request(client, "POST", path + "/role-read", h[uid])
        request(client, "POST", path + "/ready", h[uid])
    request(client, "POST", path + "/start", h[9701], status=409)
    clock["now"] = start
    request(client, "POST", path + "/start", h[9701])
    request(client, "POST", path + "/messages", h[9701], {"text": "Лично о сроке", "recipient_id": 9702})
    request(client, "POST", path + "/messages", h[9702], {"text": "Нужна первая партия", "kind": "proposal"})
    assert "Лично о сроке" not in str(request(client, "GET", path, h[9703]))
    assert "Нужна первая партия" in str(request(client, "GET", path, h[9703]))

    agreement = {"version": 0, "decision": "Две поставки с письменным графиком", "first_batch_percent": 40,
                 "first_batch_days": 14, "balance_days": 30, "extra_cost": 20000,
                 "prepayment_percent": 30, "owner": "Руководитель проекта", "open_issues": ""}
    request(client, "PUT", path + "/agreement", h[9701], agreement)
    request(client, "GET", path, h[9705], status=404)
    request(client, "POST", path + "/vote", h[9701], {"version": 1, "approve": True})
    changed = dict(agreement, version=1, owner="Финансист")
    request(client, "PUT", path + "/agreement", h[9702], changed)
    assert not any(member["vote"] for member in request(client, "GET", path, h[9703])["team"])
    request(client, "POST", path + "/vote", h[9701], {"version": 1, "approve": True}, status=409)
    for uid in (9701, 9702, 9703, 9704):
        request(client, "POST", path + "/vote", h[uid], {"version": 2, "approve": True})
    result = request(client, "GET", path, h[9701])
    assert result["status"] == "finished" and result["report"]["feasible"] is True
    assert result["report"]["role_facts"]["client"]["private_facts"]
    assert "Лично о сроке" not in str(result["report"])
    assert "Нужна первая партия" in str(result["report"])
    assert set(result["report"]["contributions"]) == {"9701"}


def prepare_group(client, headers, clock, *, facilitator=False):
    start = clock["now"] + timedelta(days=5)
    mid = request(client, "POST", "/api/council", headers[9701], {
        "scheduled_at": start.isoformat() + "Z", "visibility": "public", "organizer_plays": not facilitator,
    })["id"]
    path = f"/api/council/{mid}"
    players = [9702, 9703, 9704, 9705] if facilitator else [9701, 9702, 9703, 9704]
    for uid in players:
        if uid != 9701:
            request(client, "POST", path + "/join", headers[uid], {"role": None})
    clock["now"] = start - timedelta(hours=47)
    for uid in players:
        request(client, "POST", path + "/confirm", headers[uid])
    return path, start, players


def test_facilitator_reserve_and_call_privacy(council_client):
    client, h, clock = council_client
    path, start, players = prepare_group(client, h, clock, facilitator=True)
    request(client, "POST", path + "/join", h[9706], {"role": None})
    clock["now"] = start - timedelta(hours=23)
    roles = dict(zip(players, ("finance", "production", "client", "project")))
    request(client, "PUT", path + "/roles", h[9701], {"roles": roles})
    request(client, "PUT", path + "/roles", h[9702], {"roles": roles}, status=403)
    clock["now"] = start - timedelta(minutes=14)
    leader = request(client, "GET", path, h[9701])
    assert leader["my_status"] == "facilitator" and leader["my_role"] is None
    assert len(leader["facilitator_roles"]) == 4
    assert request(client, "GET", path, h[9702])["my_role"]["key"] == "finance"
    assert request(client, "GET", path, h[9702])["facilitator_roles"] is None
    request(client, "POST", path + "/ready", h[9701], status=403)
    for uid in players[:-1]:
        request(client, "POST", path + "/role-read", h[uid])
        request(client, "POST", path + "/ready", h[uid])
    request(client, "PUT", path + "/call", h[9702], {"session": "player-session"})
    request(client, "PUT", path + "/call", h[9701], {"session": "leader-session"})
    call = request(client, "GET", path + "/call", h[9702])
    assert {person["user_id"] for person in call["peers"]} == {9701, 9702}
    request(client, "POST", path + "/signal", h[9702], {"recipient_id": 9701, "kind": "offer", "payload": {"description": "private-sdp"}})
    assert "private-sdp" in str(request(client, "GET", path + "/call", h[9701]))
    assert "private-sdp" not in str(request(client, "GET", path + "/call", h[9703]))
    request(client, "GET", path + "/call", h[9707], status=404)
    request(client, "POST", path + "/signal", h[9702], {"recipient_id": 9707, "kind": "offer", "payload": {}}, status=422)
    request(client, "DELETE", path + "/call", h[9702])
    assert len(request(client, "GET", path + "/call", h[9701])["peers"]) == 1
    clock["now"] = start + timedelta(minutes=4)
    request(client, "POST", path + "/replace", h[9701], {"absent_user_id": 9705, "reserve_user_id": 9706}, status=409)
    clock["now"] = start + timedelta(minutes=5)
    request(client, "POST", path + "/replace", h[9701], {"absent_user_id": 9705, "reserve_user_id": 9706})
    assert request(client, "GET", path, h[9706])["my_role"] is None
    request(client, "POST", path + "/join", h[9706], {"role": None})
    assert request(client, "GET", path, h[9706])["my_role"]["key"] == "project"
    request(client, "POST", path + "/role-read", h[9706])
    request(client, "POST", path + "/ready", h[9706])
    request(client, "POST", path + "/start", h[9701])
    request(client, "POST", path + "/vote", h[9701], {"version": 1, "approve": True}, status=403)
    request(client, "POST", path + "/messages", h[9705], {"text": "Я больше не участник"}, status=403)


def test_reserve_offer_expires_without_auto_confirmation(council_client):
    client, h, clock = council_client
    path, start, _ = prepare_group(client, h, clock)
    for uid in (9705, 9706):
        request(client, "POST", path + "/join", h[uid], {"role": None})
    request(client, "POST", path + "/leave", h[9704])
    assert request(client, "GET", path, h[9705])["my_status"] == "offered"
    clock["now"] += timedelta(minutes=11)
    assert request(client, "GET", path, h[9705])["my_status"] == "expired"
    assert request(client, "GET", path, h[9706])["my_status"] == "offered"
    assert request(client, "GET", path, h[9706])["confirmed"] == 3


def test_anonymous_catalog_and_demo(council_client, monkeypatch):
    client, h, clock = council_client
    private_id = request(client, "POST", "/api/council", h[9701], {
        "scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "private",
    })["id"]
    public_id = request(client, "POST", "/api/council", h[9702], {
        "scheduled_at": (clock["now"] + timedelta(days=6)).isoformat() + "Z", "visibility": "public",
    })["id"]
    assert [item["id"] for item in client.get("/api/council/catalog").json()] == [public_id]
    assert client.get(f"/api/council/public/{private_id}").status_code == 404
    detail = client.get(f"/api/council/public/{public_id}").json()
    assert "team" not in detail and "private_facts" not in str(detail)
    assert client.get("/api/council/demo/qr", params={"role": "client", "origin": "http://localhost:5173"}).json()["svg"].startswith("<?xml")
    assert client.get("/api/council/demo/qr", params={"role": "client", "origin": "javascript:bad"}).status_code == 422
    assert client.get("/api/council/demo/role/client").json()["name"] == "Представитель клиента"
    async def fail(*args, **kwargs):
        raise RuntimeError("offline")
    monkeypatch.setattr("app.engine.llm.call_with_fallback_detailed", fail)
    answer = request(client, "POST", "/api/council/demo/reply", h[9701], {"role": "finance", "message": "Какие условия?"})
    assert answer["source"] == "script" and "25 000" in answer["text"]


def test_company_calendar_scopes_and_invites(council_client):
    from app.company_models import Company, CompanyMembership
    client, h, clock = council_client
    async def seed():
        async for db in app.dependency_overrides[get_db]():
            db.add(Company(id=9801, name="Council Corp", slug="council-corp", created_by=9701))
            await db.flush()
            db.add_all(CompanyMembership(company_id=9801, user_id=uid, corporate_role="COMPANY_OWNER" if uid == 9701 else "EMPLOYEE", status="ACTIVE") for uid in (9701, 9702, 9703))
            await db.commit()
    asyncio.run(seed())
    body = {"scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "private", "company_id": 9801}
    request(client, "POST", "/api/council", h[9702], body, status=403)
    # A manager is not the company creator and cannot open registration either.
    async def promote_manager():
        from sqlalchemy import update
        async for db in app.dependency_overrides[get_db]():
            await db.execute(update(CompanyMembership).where(CompanyMembership.user_id == 9702).values(corporate_role="COMPANY_ADMIN"))
            await db.commit()
    asyncio.run(promote_manager())
    request(client, "POST", "/api/council", h[9702], body, status=403)
    mid = request(client, "POST", "/api/council", h[9701], body)["id"]
    path = f"/api/council/{mid}"
    request(client, "POST", path + "/invite", h[9701], {"username": "council-9704"}, status=422)
    request(client, "POST", path + "/invite", h[9701], {"username": "council-9702"})
    company_meetings = request(client, "GET", "/api/council?company_id=9801", h[9702])
    assert [row["id"] for row in company_meetings] == [mid]
    assert request(client, "GET", path + "?company_id=9801", h[9702])["company_id"] == 9801
    assert any(row.get("council_id") == mid for row in request(client, "GET", "/api/company/9801/calendar", h[9702]))
    assert not any(row.get("council_id") == mid for row in request(client, "GET", "/api/company/9801/calendar", h[9703]))
    open_mid = request(client, "POST", "/api/council", h[9701], {**body, "audience": "company", "title": "Open company council"})["id"]
    open_rows = request(client, "GET", "/api/council?company_id=9801", h[9703])
    open_item = next(row for row in open_rows if row["id"] == open_mid)
    assert open_item["audience"] == "company" and open_item["accepting_registration"] is True and open_item["registration_open"] is True
    assert open_item["available_seats"] == 3 and open_item["registration_closes_at"]
    open_detail = request(client, "GET", f"/api/council/{open_mid}?company_id=9801", h[9703])
    assert open_detail["registration_open"] is True
    request(client, "POST", f"/api/council/{open_mid}/join", h[9703], {"role": None})
    assert request(client, "GET", f"/api/council/{open_mid}?company_id=9801", h[9703])["registration_open"] is False
    async def revoke():
        from sqlalchemy import update
        async for db in app.dependency_overrides[get_db]():
            await db.execute(update(CompanyMembership).where(CompanyMembership.user_id == 9702).values(status="INACTIVE"))
            await db.commit()
    asyncio.run(revoke())
    request(client, "GET", path, h[9702], status=403)
    assert not any(row["id"] == mid for row in request(client, "GET", "/api/council", h[9702]))


def test_concurrent_edits_and_votes(council_client):
    from concurrent.futures import ThreadPoolExecutor
    client, h, clock = council_client
    path, start, players = prepare_group(client, h, clock)
    clock["now"] = start - timedelta(minutes=14)
    for uid in players:
        request(client, "POST", path + "/role-read", h[uid])
        request(client, "POST", path + "/ready", h[uid])
    clock["now"] = start
    request(client, "POST", path + "/start", h[9701])
    body = {"version": 0, "decision": "Две поставки", "first_batch_percent": 40, "first_batch_days": 14,
            "balance_days": 30, "extra_cost": 20000, "prepayment_percent": 30, "owner": "Команда"}
    def edit(uid):
        return client.put(path + "/agreement", headers=h[uid], json={**body, "decision": f"Предложение {uid}"})
    with ThreadPoolExecutor(max_workers=2) as pool:
        edits = list(pool.map(edit, players[:2]))
    assert sorted(response.status_code for response in edits) == [200, 409]
    detail = request(client, "GET", path, h[9701])
    assert detail["agreement_version"] == 1
    request(client, "POST", path + "/vote", h[9701], {"version": 1, "approve": False})
    assert request(client, "GET", path, h[9702])["report"] is None
    def vote(uid):
        return client.post(path + "/vote", headers=h[uid], json={"version": 1, "approve": True})
    with ThreadPoolExecutor(max_workers=4) as pool:
        votes = list(pool.map(vote, players))
    assert [response.status_code for response in votes] == [200] * 4
    assert request(client, "GET", path, h[9701])["status"] == "finished"


def test_only_appointed_moderator_publishes_public_schedule(council_client):
    client, h, clock = council_client
    body = {"scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "public"}
    assert client.post("/api/council", headers=h[9702], json=body).status_code == 403
    assert client.get("/api/admin/council", headers=h[9701]).status_code == 403
    request(client, "POST", "/api/council", h[9701], body)
    rows = client.get("/api/admin/council", headers=client.council_admin_headers).json()
    assert len(rows) == 1
    assert client.post(f"/api/admin/council/{rows[0]['id']}/cancel", headers=client.council_admin_headers).status_code == 200
    assert client.get("/api/council/catalog").json() == []


def test_private_team_has_voluntary_reserve(council_client):
    client, h, clock = council_client
    mid = request(client, "POST", "/api/council", h[9701], {
        "scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "private",
    })["id"]
    path = f"/api/council/{mid}"
    for uid in (9702, 9703, 9704):
        request(client, "POST", path + "/invite", h[9701], {"username": f"council-{uid}"})
        request(client, "POST", path + "/join", h[uid], {"role": None})
    request(client, "POST", path + "/invite", h[9701], {"username": "council-9705"})
    detail = request(client, "GET", path, h[9705])
    assert detail["my_status"] == "reserve_invited"
    assert detail["seats_taken"] == 4 and detail["waitlist"] == 0 and detail["my_role"] is None
    assert request(client, "POST", path + "/join", h[9705], {"role": None})["status"] == "waitlist"
    request(client, "POST", path + "/leave", h[9704])
    assert request(client, "GET", path, h[9705])["my_status"] == "offered"
    assert request(client, "GET", path, h[9705])["my_role"] is None


def test_schedule_and_cancellation(council_client):
    client, h, clock = council_client
    request(client, "POST", "/api/council", h[9701], {
        "scheduled_at": (clock["now"] + timedelta(hours=11)).isoformat() + "Z", "visibility": "private",
    }, status=422)
    meeting_id = request(client, "POST", "/api/council", h[9701], {
        "scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "public",
    })["id"]
    path = f"/api/council/{meeting_id}"
    assert request(client, "GET", path, h[9705])["my_role"] is None
    request(client, "POST", path + "/join", h[9702], {"role": None})
    request(client, "POST", path + "/leave", h[9702])
    assert request(client, "POST", path + "/join", h[9702], {"role": "finance"})["status"] == "booked"
    request(client, "POST", path + "/leave", h[9701], status=409)
    clock["now"] += timedelta(days=4)
    result = request(client, "GET", path, h[9701])
    assert result["status"] == "cancelled" and result["report"] is None


def test_public_spectator_cannot_see_roles_or_working_agreement(council_client):
    client, h, clock = council_client
    start = clock["now"] + timedelta(days=5)
    meeting_id = request(client, "POST", "/api/council", h[9701], {
        "scheduled_at": start.isoformat() + "Z", "visibility": "public",
    })["id"]
    path = f"/api/council/{meeting_id}"
    for uid in (9702, 9703, 9704):
        request(client, "POST", path + "/join", h[uid], {"role": None})
    clock["now"] = start - timedelta(hours=47)
    for uid in (9701, 9702, 9703, 9704):
        request(client, "POST", path + "/confirm", h[uid])
    clock["now"] = start - timedelta(hours=2)
    spectator = request(client, "GET", path, h[9705])
    assert spectator["status"] == "roles"
    assert all(member["role"] is None for member in spectator["team"])
    assert request(client, "GET", path, h[9701])["my_role"] is not None
    clock["now"] = start - timedelta(minutes=14)
    for uid in (9701, 9702, 9703, 9704):
        request(client, "POST", path + "/role-read", h[uid])
        request(client, "POST", path + "/ready", h[uid])
    clock["now"] = start
    request(client, "POST", path + "/start", h[9701])
    request(client, "PUT", path + "/agreement", h[9701], {
        "version": 0, "decision": "Тестовое решение", "first_batch_percent": 40,
        "first_batch_days": 14, "balance_days": 30, "extra_cost": 20000,
        "prepayment_percent": 30, "owner": "Команда", "open_issues": "",
    })
    spectator = request(client, "GET", path, h[9705])
    assert spectator["agreement"] == {} and spectator["agreement_version"] == 0
    request(client, "POST", path + "/messages", h[9705], {"text": "Вторжение"}, status=404)


def test_moderation_controls_roles_kick_and_end(council_client):
    client, h, clock = council_client
    path, start, players = prepare_group(client, h, clock, facilitator=True)
    clock["now"] = start
    for uid in (9702, 9703, 9704, 9705):
        request(client, "POST", path + "/role-read", h[uid])
        request(client, "POST", path + "/ready", h[uid])
    request(client, "POST", path + "/start", h[9701])
    controls = path + "/members/9702/controls"
    request(client, "PATCH", controls, h[9703], {"muted": True}, status=403)
    request(client, "PATCH", controls, h[9701], {"muted": True, "camera_blocked": True})
    request(client, "POST", path + "/messages", h[9702], {"text": "Blocked"}, status=403)
    request(client, "PUT", path + "/call", h[9702], {"session": "test-session", "mic": True, "camera": True})
    snapshot = request(client, "GET", path + "/call", h[9703])
    peer = next(p for p in snapshot["peers"] if p["user_id"] == 9702)
    assert peer["muted"] and peer["camera_blocked"] and not peer["mic"] and not peer["camera"]
    packet = dict(council.ROLES["finance"], role="finance", name="Новый финансист", goal="Особое задание", private_facts=["Закрытый изменённый факт"])
    request(client, "PUT", path + "/members/9702/role", h[9701], packet)
    mine = request(client, "GET", path, h[9702])
    assert mine["my_role"]["goal"] == "Особое задание" and not mine["my_role_read"]
    assert mine["agreement_version"] == 1
    request(client, "POST", path + "/vote", h[9702], {"version": 1, "approve": True}, status=409)
    other = request(client, "GET", path, h[9703])
    assert "Закрытый изменённый факт" not in str(other)
    roles = [p["role"] for p in request(client, "GET", path, h[9701])["team"]]
    assert len(set(roles)) == 4
    request(client, "PATCH", controls, h[9701], {"muted": False, "camera_blocked": False})
    request(client, "POST", path + "/messages", h[9702], {"text": "Allowed"})
    request(client, "POST", path + "/members/9702/kick", h[9701])
    for method, suffix, body in [("GET", "", None), ("GET", "/call", None), ("POST", "/join", {"role": None}), ("POST", "/messages", {"text": "No"})]:
        request(client, method, path + suffix, h[9702], body, status=403)
    assert not any(p["user_id"] == 9702 for p in request(client, "GET", path + "/call", h[9703])["peers"])
    request(client, "POST", path + "/finish", h[9703], status=403)
    request(client, "POST", path + "/finish", h[9701])
    result = request(client, "GET", path, h[9703])
    assert result["status"] == "finished" and result["report"]["ended_by_organizer"]
    request(client, "GET", path + "/call", h[9703], status=403)


def test_appointment_revocation_and_ordinary_create_denied(council_client):
    client, h, clock = council_client
    body = {"scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "private"}
    request(client, "POST", "/api/council", h[9702], body, status=403)
    request(client, "POST", "/api/admin/council/moderators", h[9702], {"username": "council-9702"}, status=403)
    created = request(client, "POST", "/api/council", h[9701], body)
    assert client.delete("/api/admin/council/moderators/9701", headers=client.council_admin_headers).status_code == 200
    request(client, "POST", "/api/council", h[9701], body, status=403)
    request(client, "POST", f"/api/council/{created['id']}/finish", h[9701], status=403)
    assert request(client, "GET", "/api/council/permissions", h[9701])["moderator"] is False


def test_organizer_can_edit_before_reveal_and_only_own_meeting(council_client):
    client, h, clock = council_client
    body = {"scheduled_at": (clock["now"] + timedelta(days=5)).isoformat() + "Z", "visibility": "private"}
    mid = request(client, "POST", "/api/council", h[9701], body)["id"]
    path = f"/api/council/{mid}"
    request(client, "POST", path + "/invite", h[9701], {"username": "council-9702"})
    packet = dict(council.ROLES["finance"], role="finance", goal="Задание до начала")
    request(client, "PUT", path + "/members/9702/role", h[9701], packet)
    request(client, "PUT", path + "/members/9701/role", h[9701], dict(council.ROLES["project"], role="project"))
    assert request(client, "GET", path, h[9702])["my_role"] is None
    for uid in (9702, 9703, 9704):
        if uid != 9702:
            request(client, "POST", path + "/invite", h[9701], {"username": f"council-{uid}"})
        request(client, "POST", path + "/join", h[uid], {"role": None})
    request(client, "POST", path + "/invite", h[9701], {"username": "council-9705"})
    request(client, "POST", path + "/join", h[9705], {"role": None})
    request(client, "PUT", path + "/members/9705/role", h[9701], packet)
    clock["now"] += timedelta(days=3, hours=1)
    for uid in (9701, 9702, 9703, 9704):
        request(client, "POST", path + "/confirm", h[uid])
    clock["now"] += timedelta(days=1, hours=22)
    assert request(client, "GET", path, h[9702])["status"] == "roles"
    assert client.post("/api/admin/council/moderators", headers=client.council_admin_headers, json={"username": "council-9702"}).status_code == 200
    request(client, "POST", path + "/finish", h[9702], status=403)
    request(client, "POST", path + "/finish", h[9701])
    assert request(client, "GET", path, h[9701])["status"] == "finished"
