import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

from app.auth import create_token
from app.main import app
from app.db import get_db
from app.models import User
from app.council_models import CouncilModerator
from app.routers import council
from tests.test_council import council_client
from tests.test_council_operations import seed_company


def test_ordinary_account_cannot_use_council_even_as_historical_moderator(council_client):
    client, _, clock = council_client
    async def seed():
        async for db in app.dependency_overrides[get_db]():
            db.add(User(id=9799, username="ordinary-council-denied", password_hash="unused"))
            await db.flush()
            db.add(CouncilModerator(user_id=9799, appointed_by=9708))
            await db.commit()
    asyncio.run(seed())
    headers = {"Authorization": "Bearer " + create_token(9799,"ordinary-council-denied")}
    for url in ["/api/council", "/api/council/permissions", "/api/council/profile", "/api/council/1", "/api/council-runtime/1"]:
        assert client.get(url, headers=headers).status_code == 403, url
    assert client.get("/api/council/availability", headers=headers, params={"day":clock["now"].date().isoformat(),"capacity":4}).status_code == 403
    assert client.post("/api/council/1/game/advance", headers=headers, json={"stage":0}).status_code == 403
    assert client.post("/api/council-runtime/1/gameadvance", headers=headers, json={"stage":0}).status_code == 403


def test_social_company_meeting_keeps_recording_required(council_client):
    client, headers, clock = council_client
    seed_company()
    response = client.post("/api/council", headers=headers[9701], json={"company_id":55, "visibility":"private", "audience":"company", "game_mode":"contract-social-v1", "scheduled_at":(clock["now"]+timedelta(hours=1)).isoformat()+"Z"})
    assert response.status_code == 200, response.text
    mid = response.json()["id"]
    detail = client.get(f"/api/council/{mid}", headers=headers[9701]).json()
    assert detail["title"] == "Контракт на кону"
    assert detail["business_meeting_id"]
    company_meeting = client.get(f"/api/company/55/meetings/{detail['business_meeting_id']}", headers=headers[9701])
    assert company_meeting.status_code == 200, company_meeting.text
    assert company_meeting.json()["council_meeting_id"] == mid
    async def inspect():
        from app.council_models import CouncilMeeting
        async for db in app.dependency_overrides[get_db]():
            return council.config(await db.get(CouncilMeeting,mid))
    cfg = asyncio.run(inspect())
    assert cfg["audio_required"] is True
    outcome = {"summary":"Контракт сохранён", "feasible":True, "contributions":{"private":"hidden"}}
    meeting = SimpleNamespace(configuration=json.dumps(cfg), result=json.dumps(outcome))
    assert council.public_social_outcome(meeting) is None
    cfg["audio_analysis"] = {"status":"complete"}
    meeting.configuration = json.dumps(cfg)
    published = council.public_social_outcome(meeting)
    assert published["feasible"] is True
    assert "contributions" not in published
