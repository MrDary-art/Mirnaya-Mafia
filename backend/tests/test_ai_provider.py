import asyncio
import base64
import hashlib
import json
import time
from unittest.mock import AsyncMock

import httpx
import pytest

from app.engine import llm
from app.engine.metrics import empty_state
from app.engine.scenario import get_scenario

TEST_AUTH_KEY = base64.b64encode(b"test-client:test-secret").decode()


@pytest.mark.asyncio
async def test_gigachat_authorizes_automatically_at_startup(monkeypatch):
    auth = AsyncMock(return_value="access-token")
    monkeypatch.setattr(llm.settings, "gigachat_credentials", "test-authorization-key")
    monkeypatch.setattr(llm, "_gigachat_access_token", auth)
    await llm.warm_gigachat()
    auth.assert_awaited_once_with("test-authorization-key", llm.settings.llm_timeout)


@pytest.mark.asyncio
async def test_telegram_token_is_rejected_before_oauth_request(monkeypatch):
    client = AsyncMock()
    monkeypatch.setattr(llm.httpx, "AsyncClient", client)
    with pytest.raises(llm.LlmError, match="invalid format"):
        await llm._gigachat_access_token("123456:AAexample", 7)
    client.assert_not_called()


@pytest.mark.asyncio
async def test_gigachat_oauth_then_chat_uses_cached_access_token(monkeypatch):
    calls = []

    def handler(request: httpx.Request):
        calls.append(request)
        if request.url.path == "/api/v2/oauth":
            assert request.headers["Authorization"] == f"Basic {TEST_AUTH_KEY}"
            assert request.headers["RqUID"]
            assert request.headers["User-Agent"] == "Gigachat"
            assert b"scope=GIGACHAT_API_PERS" in request.content
            return httpx.Response(200, json={"access_token": "short-lived-access", "expires_at": time.time() + 1800})
        assert str(request.url) == "https://api.giga.chat/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer short-lived-access"
        assert json.loads(request.content)["model"] == "GigaChat-2"
        assert json.loads(request.content)["max_tokens"] == 300
        assert json.loads(request.content)["messages"][0]["role"] == "system"
        return httpx.Response(200, json={"choices": [{"message": {"content": "Здравствуйте"}}]})

    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda **kwargs: original(transport=transport, **kwargs))
    llm._token_cache.clear()
    config = {"provider": "gigachat", "model": "GigaChat-2", "credential": TEST_AUTH_KEY}
    assert await llm.call_with_fallback("first", config) == "Здравствуйте"
    assert await llm.call_with_fallback("second", config) == "Здравствуйте"
    assert [request.url.path for request in calls].count("/api/v2/oauth") == 1
    llm._token_cache.clear()


@pytest.mark.asyncio
async def test_gigachat_accepts_expires_in_and_refreshes_five_minutes_early(monkeypatch):
    oauth_calls = 0

    def handler(request: httpx.Request):
        nonlocal oauth_calls
        oauth_calls += 1
        return httpx.Response(200, json={"access_token": f"access-{oauth_calls}", "expires_in": 1800})

    original = httpx.AsyncClient
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    llm._token_cache.clear()
    assert await llm._gigachat_access_token(TEST_AUTH_KEY, 7) == "access-1"
    fingerprint = hashlib.sha256(TEST_AUTH_KEY.encode()).hexdigest()
    llm._token_cache[fingerprint] = ("access-1", time.time() + 250)
    assert await llm._gigachat_access_token(TEST_AUTH_KEY, 7) == "access-2"
    assert oauth_calls == 2
    llm._token_cache.clear()


@pytest.mark.asyncio
async def test_background_refresh_is_scheduled_before_expiry(monkeypatch):
    monkeypatch.setattr(llm.settings, "gigachat_credentials", TEST_AUTH_KEY)
    fingerprint = hashlib.sha256(TEST_AUTH_KEY.encode()).hexdigest()
    llm._token_cache.clear()
    delays = []

    async def authorize(_credential, _timeout):
        llm._token_cache[fingerprint] = ("access", time.time() + 1800)
        return "access"

    async def capture_delay(delay):
        delays.append(delay)
        raise asyncio.CancelledError

    monkeypatch.setattr(llm, "_gigachat_access_token", authorize)
    monkeypatch.setattr(llm.asyncio, "sleep", capture_delay)
    with pytest.raises(asyncio.CancelledError):
        await llm.keep_gigachat_authorized()
    assert 1490 < delays[0] <= 1500
    llm._token_cache.clear()


@pytest.mark.asyncio
async def test_selected_ollama_never_calls_gigachat(monkeypatch):
    giga = AsyncMock(return_value="wrong")
    ollama = AsyncMock(return_value="local")
    monkeypatch.setattr(llm, "_chat_gigachat", giga)
    monkeypatch.setattr(llm, "_chat_ollama", ollama)
    result = await llm.call_with_fallback("hello", {"provider": "ollama", "model": "local-model", "credential": "old-key"})
    assert result == "local"
    giga.assert_not_awaited()
    assert ollama.await_args.args[1] >= 30
    assert ollama.await_args.args[2] == "local-model"


@pytest.mark.asyncio
@pytest.mark.parametrize("status,body", [
    (429, {"error": "rate limit"}),
    (503, {"error": "server error"}),
    (200, {"choices": []}),
])
async def test_gigachat_chat_failures_fall_back_to_ollama(monkeypatch, status, body):
    def handler(request: httpx.Request):
        if request.url.path == "/api/v2/oauth":
            return httpx.Response(200, json={"access_token": "access", "expires_at": time.time() + 1800})
        return httpx.Response(status, json=body)

    original = httpx.AsyncClient
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    ollama = AsyncMock(return_value="локальный ответ")
    monkeypatch.setattr(llm, "_chat_ollama", ollama)
    llm._token_cache.clear()
    config = {"provider": "gigachat", "model": "GigaChat-2", "credential": TEST_AUTH_KEY}
    assert await llm.call_with_fallback("привет", config) == "локальный ответ"
    ollama.assert_awaited_once()
    llm._token_cache.clear()


@pytest.mark.asyncio
async def test_gigachat_timeout_and_ollama_failure_use_offline_line(monkeypatch):
    monkeypatch.setattr(llm, "_chat_gigachat", AsyncMock(side_effect=llm.TimeoutErrorLlm("timeout")))
    monkeypatch.setattr(llm, "_chat_ollama", AsyncMock(side_effect=llm.ServerError("down")))
    scenario = get_scenario("hr_firing_01")
    state = empty_state(scenario)
    line = await llm.get_opponent_response(
        {"scenario_id": "hr_firing_01"}, state, "Привет",
        {"provider": "gigachat", "model": "GigaChat-2", "credential": "test-auth-key"},
    )
    assert line == llm.offline_opponent_line(state, {"scenario_id": "hr_firing_01"}, "Привет")


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", ["not json", ""])
async def test_invalid_analyzer_output_uses_rule_based_result(monkeypatch, raw):
    monkeypatch.setattr(llm, "call_with_fallback", AsyncMock(return_value=raw))
    scenario = get_scenario("sales_discount_01")
    state = empty_state(scenario)
    result = await llm.analyze_block({"role": "Продавец", "opponent_role": "Клиент", "goal": "Сделка"}, state, "Давайте найдём решение")
    assert result["comment"] == "Rule-based разбор по ключевым словам."


@pytest.mark.asyncio
async def test_online_turn_uses_one_model_call_and_ignores_model_scores(monkeypatch):
    model = AsyncMock(return_value=(json.dumps({
        "reply": "Какой результат вы хотите получить?",
        "tki_style": "сотрудничество",
        "techniques": ["эмпатия"],
        "tone": "нейтральный",
        "comment": "Показал понимание.",
        "trust_delta": 1000,
    }, ensure_ascii=False), "gigachat"))
    monkeypatch.setattr(llm, "call_with_fallback_detailed", model)
    state = empty_state(get_scenario("hr_firing_01"))
    turn = await llm.get_online_turn(
        {"role": "Участник переговоров", "opponent_role": "Собеседник", "problem": ""},
        state, "Понимаю вас", {"provider": "gigachat", "model": "GigaChat-2", "credential": "test"},
        [{"sender": "player", "text": "Понимаю вас"}],
    )
    model.assert_awaited_once()
    assert turn["reply"] == "Какой результат вы хотите получить?"
    assert turn["analysis"]["trust_delta"] == 4
    assert turn["provider"] == "gigachat"


@pytest.mark.asyncio
async def test_online_turn_exposes_offline_failure_instead_of_repeating_scenario(monkeypatch):
    monkeypatch.setattr(llm, "call_with_fallback_detailed", AsyncMock(side_effect=llm.LlmError("Authorization key GigaChat не задан")))
    state = empty_state(get_scenario("hr_firing_01"))
    turn = await llm.get_online_turn({}, state, "Здравствуйте", {}, [])
    assert turn["provider"] == "offline"
    assert "ИИ сейчас недоступен" in turn["reply"]
    assert "Вы хотели меня видеть" not in turn["reply"]
    assert "Authorization key" in turn["error"]


@pytest.mark.asyncio
async def test_streamed_turn_hides_analysis_and_keeps_backend_scoring(monkeypatch):
    monkeypatch.setattr(llm.settings, "gigachat_credentials", TEST_AUTH_KEY)

    async def fake_stream(_prompt):
        yield "Здравствуйте. Давайте обсудим сроки.\n<ana"
        yield 'lysis>{"tki_style":"сотрудничество","techniques":["эмпатия"],'
        yield '"tone":"нейтральный","comment":"Хорошее уточнение","outcome_signal":"continue","trust_delta":1000}</analysis>'

    monkeypatch.setattr(llm, "_stream_gigachat", fake_stream)
    state = empty_state(get_scenario("hr_firing_01"))
    events = [event async for event in llm.stream_online_turn(
        {"role": "Участник", "opponent_role": "Собеседник"}, state, "Понимаю вас", [],
    )]
    visible = "".join(value for kind, value in events if kind == "reply")
    turn = events[-1][1]
    assert visible.strip() == turn["reply"]
    assert "<analysis>" not in visible
    assert turn["analysis"]["trust_delta"] == 4
    assert turn["provider"] == "gigachat"


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [llm.TimeoutErrorLlm("timeout"), llm.RateLimitError("429"), llm.ServerError("500")])
async def test_stream_failure_uses_existing_fallback_before_any_reply(monkeypatch, failure):
    monkeypatch.setattr(llm.settings, "gigachat_credentials", TEST_AUTH_KEY)

    async def broken_stream(_prompt):
        raise failure
        yield ""

    fallback = {"reply": "Продолжим позже.", "analysis": llm.rule_based_analysis("Здравствуйте"), "provider": "offline", "error": "Провайдер недоступен", "outcome_signal": "continue"}
    standard = AsyncMock(return_value=fallback)
    monkeypatch.setattr(llm, "_stream_gigachat", broken_stream)
    monkeypatch.setattr(llm, "get_online_turn", standard)
    state = empty_state(get_scenario("hr_firing_01"))
    events = [event async for event in llm.stream_online_turn({}, state, "Здравствуйте", [])]
    assert events == [("reply", fallback["reply"]), ("turn", fallback)]
    standard.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("suffix", ["", "\n<analysis>{broken}</analysis>"])
async def test_streamed_turn_invalid_analysis_uses_rule_based_tags(monkeypatch, suffix):
    monkeypatch.setattr(llm.settings, "gigachat_credentials", TEST_AUTH_KEY)

    async def fake_stream(_prompt):
        yield "Давайте обсудим решение." + suffix

    monkeypatch.setattr(llm, "_stream_gigachat", fake_stream)
    state = empty_state(get_scenario("hr_firing_01"))
    events = [event async for event in llm.stream_online_turn({}, state, "Я вас понимаю", [])]
    turn = events[-1][1]
    assert turn["reply"] == "Давайте обсудим решение."
    assert turn["analysis"]["comment"] == "Rule-based разбор по ключевым словам."
