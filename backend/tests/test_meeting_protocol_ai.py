"""The meeting summary may use AI, but never needs it to remain usable."""
import asyncio

from app.engine.llm import LlmError


def test_ai_summary_refines_only_the_reviewable_copy(monkeypatch):
    import app.engine.meeting_protocol as protocol

    async def recommend(*_args, **_kwargs):
        return ('{"summary":"Команда согласовала позицию по условиям клиента и проверит расчёт до следующей встречи."}', "test-ai")

    monkeypatch.setattr(protocol, "_ai_summary_available", lambda: True)
    monkeypatch.setattr(protocol, "call_with_fallback_detailed", recommend)
    result = asyncio.run(protocol.refine_summary_with_ai(
        "Исходный черновик.", [{"id": 1, "text": "Согласовали позицию и проверим расчёт."}],
    ))
    assert result == "Команда согласовала позицию по условиям клиента и проверит расчёт до следующей встречи."


def test_ai_summary_falls_back_to_the_deterministic_draft(monkeypatch):
    import app.engine.meeting_protocol as protocol

    async def unavailable(*_args, **_kwargs):
        raise LlmError("provider unavailable")

    monkeypatch.setattr(protocol, "_ai_summary_available", lambda: True)
    monkeypatch.setattr(protocol, "call_with_fallback_detailed", unavailable)
    draft = "Исходный проверяемый черновик."
    assert asyncio.run(protocol.refine_summary_with_ai(draft, [{"id": 1, "text": "Факт встречи."}])) == draft
