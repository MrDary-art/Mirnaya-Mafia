from unittest.mock import AsyncMock, patch

import pytest

from app.engine.llm import LlmError, ServerError, TimeoutErrorLlm, get_opponent_response, offline_opponent_line
from app.engine.metrics import empty_state
from app.engine.scenario import get_scenario


@pytest.mark.asyncio
async def test_offline_line_from_scenario():
    sc = get_scenario("hr_firing_01")
    state = empty_state(sc)
    line = offline_opponent_line(state, {"scenario_id": "hr_firing_01"}, "hello")
    assert "хотели меня видеть" in line.lower() or "случилось" in line.lower()


@pytest.mark.asyncio
async def test_fallback_gigachat_to_offline():
    sc = get_scenario("hr_firing_01")
    state = empty_state(sc)
    settings = {"scenario_id": "hr_firing_01", "opponent_role": "Подчинённый", "tone": "нейтральный"}
    with (
        patch("app.engine.llm.settings") as s,
        patch("app.engine.llm.call_with_fallback", new_callable=AsyncMock, side_effect=LlmError("down")),
    ):
        s.gpt2giga_api_key = "x"
        s.gigachat_credentials = "x"
        s.llm_timeout = 7
        text = await get_opponent_response(settings, state, "Привет")
        assert isinstance(text, str)
        assert len(text) > 5


@pytest.mark.asyncio
async def test_call_chain_errors():
    from app.engine.llm import call_with_fallback

    with (
        patch("app.engine.llm.settings") as s,
        patch("app.engine.llm._chat_gigachat", new_callable=AsyncMock, side_effect=ServerError("5xx")),
        patch("app.engine.llm._chat_ollama", new_callable=AsyncMock, side_effect=TimeoutErrorLlm("t")),
    ):
        s.gpt2giga_api_key = "k"
        s.gigachat_credentials = "c"
        s.llm_timeout = 7
        s.gigachat_model = "m"
        s.gpt2giga_url = "http://x"
        with pytest.raises(LlmError):
            await call_with_fallback("hi")
