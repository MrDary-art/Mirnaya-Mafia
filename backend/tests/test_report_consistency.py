import asyncio
import json
from copy import deepcopy
from io import BytesIO
from unittest.mock import AsyncMock

import pytest

from app.models import ArenaRoom, ArenaRoomMessage, Session
from app.routers import rooms
from app.engine.council_report import attach_ai_review
from tests.test_room_bookings import booking_env


@pytest.mark.parametrize("mode", ["duel", "human"])
def test_room_screen_and_pdf_upgrade_saved_reports_without_reanalysis(booking_env, monkeypatch, mode):
    client, headers, factory = booking_env
    monkeypatch.setattr(rooms, "generate_interview_questions", AsyncMock(return_value=["Расскажите о проекте?", "Как проверяли результат?"]))
    created = client.post("/api/rooms", headers=headers[1], json={"mode": mode, "display_name": "Анна",
        "request_text": "Рабочие задачи разработчика в компании Арена", "goal": "Получить работу"})
    assert created.status_code == 200
    room_id = created.json()["id"]
    joined = client.post("/api/rooms/join", headers=headers[2], json={"code": created.json()["code"], "display_name": "Борис"})
    assert joined.status_code == 200
    history = [{"text": f"Сохранённый ответ {i}: я проверил результат тестами", "context": f"Вопрос {i}?", "reply": f"Уточнение собеседника {i}"} for i in range(1, 4)]

    async def save_legacy_reports():
        async with factory() as db:
            room = await db.get(ArenaRoom, room_id)
            state = json.loads(room.state)
            reports = {}
            for uid, marker in [(1, "PRIVATE_HOST"), (2, "PRIVATE_GUEST")]:
                reports[str(uid)] = {"summary": marker, "narrative": {"source": "ai", "sections": [
                    {"title": f"Подробный эпизод {i}", "body": "Разбор подтверждённого действия", "evidence": {"turn": i, "quote": history[i-1]["text"]}}
                    for i in range(1, 3)]}}
                if mode == "duel":
                    session = await db.get(Session, state["sessions"][str(uid)])
                    session.state = json.dumps({"history": history})
                    session.report = json.dumps(reports[str(uid)])
                    session.status = "finished"
            if mode == "human":
                for row in history:
                    db.add(ArenaRoomMessage(room_id=room_id, user_id=1, text=row["text"], analysis="{}"))
                    db.add(ArenaRoomMessage(room_id=room_id, user_id=2, text=row["reply"], analysis="{}"))
            state.update(phase="finished", reports=reports)
            room.status, room.state = "finished", json.dumps(state)
            await db.commit()
    asyncio.run(save_legacy_reports())
    monkeypatch.setattr(rooms, "enrich_online_report", AsyncMock(side_effect=AssertionError("Reading a saved report must not call AI")))
    result = client.get(f"/api/rooms/{room_id}", headers=headers[1])
    assert result.status_code == 200
    report = result.json()["your_report"]
    assert report["analysis_version"] == 2
    assert len(report["turn_reviews"]) == 3
    assert report["analysis_coverage"] == {"total": 3, "reviewed": 2, "source": "ai"}
    assert report["turn_reviews"][-1]["source"] == "record"
    assert report["speakers"]["opponent"] == ("Интервьюер" if mode == "duel" else "Собеседник")
    assert "PRIVATE_GUEST" not in result.text
    if mode == "duel":
        sid = created.json()["your_session_id"]
        from_history = client.get(f"/api/sessions/{sid}/report", headers=headers[1])
        assert from_history.status_code == 200
        assert from_history.json()["hiring_result"] == report["hiring_result"]
        assert from_history.json()["turn_reviews"] == report["turn_reviews"]
    response = client.get(f"/api/rooms/{room_id}/report/pdf", headers=headers[1])
    assert response.status_code == 200 and response.content.startswith(b"%PDF-")
    assert client.get(f"/api/rooms/{room_id}/report/pdf", headers=headers[3]).status_code == 404
    pypdf = pytest.importorskip("pypdf")
    text = "\n".join(page.extract_text() for page in pypdf.PdfReader(BytesIO(response.content)).pages)
    assert "Сохранённый ответ 3" in text and "Подробный эпизод 2" in text
    assert "PRIVATE_HOST" in text and "PRIVATE_GUEST" not in text


def test_council_ai_coverage_counts_distinct_own_messages_and_rejects_invented_evidence():
    own = [{"id": 1, "text": "Предлагаю проверить срок и назначить ответственного"},
           {"id": 2, "text": "Когда мы сможем подтвердить итоговый объём?"}]
    personal = {"chronology": [{"message_id": row["id"], "text": row["text"]} for row in own]}
    data = {"summary": "Подробный вывод по этой встрече. " * 15,
            "findings": [{"message_id": 1, "quote": own[0]["text"], "analysis": "Проверка срока помогает сформулировать проверяемое обязательство; подтверждения другого участника в этой записи пока нет."}],
            "next_steps": ["Назвать конкретный срок", "Запросить подтверждение коллеги", "Зафиксировать ответственного"]}
    result = attach_ai_review(deepcopy(personal), data, own, "gigachat")
    assert result["analysis_coverage"] == {"total": 2, "reviewed": 1, "source": "ai"}
    assert result["chronology"][1]["analysis_source"] == "record"
    invalid = deepcopy(data)
    invalid["findings"][0]["message_id"] = 2
    with pytest.raises(ValueError, match="цитата"):
        attach_ai_review(deepcopy(personal), invalid, own, "gigachat")
