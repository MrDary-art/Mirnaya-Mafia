import asyncio
from datetime import datetime, timezone

from app.council_models import CouncilMessage
from app.engine.council_review import review_from_segments
from tests.test_company_preparation import preparation_client


def test_review_candidates_preserve_evidence_and_do_not_invent_commitments():
    segments = [
        {"id": 1, "text": "Договорились запустить пилот в пятницу."},
        {"id": 2, "text": "Я подготовлю план до четверга."},
        {"id": 3, "text": "Мы не договорились о бюджете."},
        {"id": 4, "text": "Я не отправлю договор без проверки."},
        {"id": 5, "text": "Подготовлю ли я план завтра?"},
    ]
    summary, items = review_from_segments(segments)
    assert [item["kind"] for item in items] == ["DECISION", "ACTION", "QUESTION", "QUESTION", "QUESTION"]
    assert "пятницу" in summary and "четверга" in summary
    for item in items:
        assert item["text"] == next(row["text"] for row in segments if row["id"] == item["source_segment_ids"][0])
        assert "assignee_membership_id" not in item and "due_at" not in item


def test_working_call_starts_without_game_roles_and_has_private_evidence_report(preparation_client):
    client, headers, factory = preparation_client
    slots = client.get("/api/council/availability", headers=headers["owner"], params={
        "day": datetime.now(timezone.utc).date().isoformat(), "capacity": 2, "duration": 30})
    assert slots.status_code == 200, slots.text
    response = client.post("/api/company/601/meetings", headers=headers["owner"], json={
        "kind": "PREPARATION_CALL", "title": "Запуск пилотного проекта", "membership_ids": [602],
        "scheduled_at": datetime.now(timezone.utc).isoformat(), "duration_minutes": 30,
    })
    assert response.status_code == 201, response.text
    card = response.json()
    mid = card["council_meeting_id"]
    assert card["council"]["id"] == mid
    assert card["council"]["can_manage"] is True
    assert not any(person["ready"] for person in card["council"]["team"])
    assert client.post(f"/api/council/{mid}/start", headers=headers["member"]).status_code == 403
    started = client.post(f"/api/council/{mid}/start", headers=headers["owner"])
    assert started.status_code == 200, started.text
    lines = ["Договорились запустить пилот в пятницу.", "Я подготовлю план до четверга.", "Нужно уточнить бюджет."]
    async def add_evidence():
        async with factory() as db:
            for text in lines:
                db.add(CouncilMessage(meeting_id=mid, author_id=602, kind="transcript", text=text))
            db.add(CouncilMessage(meeting_id=mid, author_id=601, recipient_id=602, kind="message", text="Закрытая личная переписка"))
            await db.commit()
    asyncio.run(add_evidence())
    ended = client.post(f"/api/council-runtime/{mid}/leave", headers=headers["owner"], json={})
    assert ended.status_code == 200, ended.text
    detail = client.get(f"/api/company/601/meetings/{card['id']}", headers=headers["owner"]).json()
    assert detail["council"]["status"] == "finished"
    assert {item["kind"] for item in detail["report"]["items"]} == {"DECISION", "ACTION", "QUESTION"}
    assert all(item["source_segment_ids"] for item in detail["report"]["items"])
    assert "Закрытая личная" not in str(detail)
    transcript = client.get(f"/api/company/601/meetings/{card['id']}/transcript", headers=headers["owner"]).json()
    assert [row["text"] for row in transcript] == lines
    employee = client.get(f"/api/company/601/meetings/{card['id']}", headers=headers["member"]).json()
    assert "report" not in employee
    assert client.get(f"/api/company/601/meetings/{card['id']}/transcript", headers=headers["member"]).status_code == 403
    assert client.post(f"/api/company/601/meetings/{card['id']}/protocol/publish", headers=headers["owner"]).status_code == 409
