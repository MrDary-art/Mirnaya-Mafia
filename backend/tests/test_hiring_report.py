import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import ArenaRoom, User
from app.engine.room_v2 import build_state, utcnow
from app.routers import rooms
from app.engine import online_report
from app.engine.llm import LlmError
from app.engine.metrics import empty_state
from app.engine.scenario import build_report, get_scenario


@pytest.mark.asyncio
async def test_hiring_pdf_uses_final_comparison_and_only_own_private_report(monkeypatch):
    state = build_state(mode="duel", host_id=1, display_name="Анна", request_text="Разработчик в Арена",
                        goal="Получить работу", duration_minutes=15, scheduled_at=utcnow(),
                        timezone_name="Europe/Moscow", team_name=None, scenario_id=None, ranked=False)
    state["participants"]["2"] = {"display_name": "Борис"}
    state["reports"] = {"1": {"summary": "Финальный разбор", "competition_feedback": {"improvement": "PRIVATE_ANNA"}},
                        "2": {"competition_feedback": {"improvement": "PRIVATE_BORIS"}}}
    state["competition"] = {"status": "ready", "winner_id": 1, "criteria": [
        {"label": "Примеры", "candidates": {"1": {"score": 4, "quote": "Измерила результат"},
                                              "2": {"score": 2, "quote": "Пока не измерял"}}}]}
    room = ArenaRoom(id=42, host_id=1, guest_id=2, mode="duel", state=json.dumps(state))
    session = SimpleNamespace(id=11, user_id=1, role="Кандидат", state="{}", settings="{}", report='{"summary":"Ранний отчёт"}')
    state["sessions"] = {"1": 11}
    room.state = json.dumps(state)
    db = AsyncMock()
    db.get.side_effect = [room, session]
    exported = []
    def capture_pdf(**kwargs):
        exported.append(kwargs["report"])
        from app.report_pdf import render_report_pdf
        return render_report_pdf(**kwargs)
    monkeypatch.setattr(rooms, "render_report_pdf", capture_pdf)
    response = await rooms.room_report_pdf(42, db=db, user=User(id=1, username="anna"))
    assert response.body.startswith(b"%PDF-")
    assert exported[0]["summary"] == "Финальный разбор"
    assert exported[0]["hiring_result"]["decision"] == "Оффер получает Анна"
    assert "PRIVATE_ANNA" in str(exported) and "PRIVATE_BORIS" not in str(exported)
    assert len(exported[0]["hiring_result"]["criteria"][0]["candidates"]) == 2


@pytest.mark.asyncio
async def test_interview_without_ai_never_inherits_negotiation_recommendations(monkeypatch):
    scenario = get_scenario("hr_firing_01")
    state = empty_state(scenario)
    state["history"] = [{"text": "Я разработала API и проверила результат тестами", "context": "Расскажите о проекте"}]
    settings = {"practice_kind": "job_interview", "room_id": 42, "goal": "Получить работу"}
    initial = build_report(scenario, state, settings)
    assert initial["recommendations"]
    monkeypatch.setattr(online_report, "call_with_fallback_detailed", AsyncMock(side_effect=LlmError("offline")))
    result = await online_report.enrich_online_report(initial, state, settings)
    assert result["recommendations"] == []
    assert result["batna_assessment"] is None
    assert "общую вакансию" in result["narrative"]["lead"]
