import json
import base64
import httpx
import pytest
from fastapi import HTTPException
from app.main import app  # Register related SQLAlchemy models for the isolated database.
from app import installation, ai_diagnostics
from app.config import settings
from app.engine import llm
from app.routers import deployment
from app.deployment_models import InstallationConfig
from .test_installation_speech import storage


@pytest.fixture(autouse=True)
def runtime(monkeypatch):
    for name in ("ai_provider", "ai_api_key", "ai_model", "ai_project_id", "gigachat_credentials", "gigachat_model", "gigachat_scope"):
        monkeypatch.setattr(settings, name, getattr(settings, name))
    monkeypatch.setattr(settings, "ai_provider", "gigachat")
    monkeypatch.setattr(settings, "ollama_enabled", False)


async def test_profiles_encrypted_switch_and_legacy_key(storage, monkeypatch):
    async def ready(*args, **kwargs):
        return "готово"
    async def giga(*args):
        return {"status": "ready", "models": ["GigaChat-3-Ultra"]}
    monkeypatch.setattr(llm, "_chat_openai_compatible", ready)
    monkeypatch.setattr(deployment, "check_gigachat", giga)
    key = base64.b64encode(b"id:legacy-secret").decode()
    async with storage() as db:
        await installation.save_config(db, 1, {"credential": installation.cipher().encrypt(key.encode()).decode()}, 1, "test")
        for provider, secret, model, project in [("yandex", "yandex-secret", "aliceai-llm", "folder-1"), ("deepseek", "deepseek-secret", "deepseek-flash", "")]:
            revision, _ = await installation.read_config(db)
            result = await deployment.save_ai(deployment.AIConfig(revision=revision, provider=provider, key=secret, model=model, project_id=project), admin=type("Admin", (), {"id": 1})(), db=db)
            assert result["provider"] == provider and result["key_configured"]
            assert "secret" not in json.dumps(result) and "credential" not in json.dumps(result)
            assert settings.ai_provider == provider
        row = await db.get(InstallationConfig, 1)
        await db.refresh(row)
        assert "yandex-secret" not in row.value and "deepseek-secret" not in row.value
        revision, value = await installation.read_config(db)
        assert installation.cipher().decrypt(value["credential"].encode()).decode() == key
        result = await deployment.save_ai(deployment.AIConfig(revision=revision, model="GigaChat-3-Ultra"), admin=type("Admin", (), {"id": 1})(), db=db)
        assert result["provider"] == "gigachat" and result["profiles"]["deepseek"]["key_configured"]
        assert settings.gigachat_credentials == key


@pytest.mark.parametrize("provider,model,project,url", [
    ("yandex", "aliceai-llm", "folder-1", "https://ai.api.cloud.yandex.net/v1/chat/completions"),
    ("deepseek", "deepseek-flash", "", "https://api.deepseek.com/chat/completions"),
])
async def test_real_transport_and_stream(monkeypatch, provider, model, project, url):
    requests = []
    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        assert str(request.url) == url
        assert request.headers["Authorization"] == "Bearer test-key"
        if provider == "yandex":
            assert body["model"] == "gpt://folder-1/aliceai-llm"
            assert request.headers["OpenAI-Project"] == "folder-1"
        else:
            assert body["thinking"] == {"type": "disabled"}
        if body.get("stream"):
            return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Привет"}}]}\n\ndata: [DONE]\n\n')
        return httpx.Response(200, json={"choices": [{"message": {"content": "Привет"}}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(settings, "ai_provider", provider)
    monkeypatch.setattr(settings, "ai_api_key", "test-key")
    monkeypatch.setattr(settings, "ai_model", model)
    monkeypatch.setattr(settings, "ai_project_id", project)
    assert await llm.call_with_fallback_detailed("тест") == ("Привет", provider)
    assert [part async for part in llm._stream_gigachat("тест")] == ["Привет"]
    assert len(requests) == 2


async def test_missing_project_rejected_before_network(storage):
    async with storage() as db:
        with pytest.raises(HTTPException) as error:
            await deployment.ai_candidate(deployment.AIConfig(revision=1, provider="yandex", key="test-key", model="aliceai-llm"), db)
        assert error.value.status_code == 422


async def test_diagnostics_rejects_fallback(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "deepseek")
    async def fallback(*args, **kwargs):
        return "fallback", "ollama"
    monkeypatch.setattr(llm, "call_with_fallback_detailed", fallback)
    with pytest.raises(HTTPException) as error:
        await ai_diagnostics.generate("тест")
    assert error.value.status_code == 503


async def test_failed_save_keeps_previous_provider(storage, monkeypatch):
    async def rejected(*args, **kwargs):
        raise llm.LlmError("Provider rejected request (401)")
    monkeypatch.setattr(llm, "_chat_openai_compatible", rejected)
    async with storage() as db:
        with pytest.raises(HTTPException):
            await deployment.save_ai(deployment.AIConfig(revision=1, provider="deepseek", key="bad-key", model="deepseek-flash"), admin=type("Admin", (), {"id": 1})(), db=db)
        revision, value = await installation.read_config(db)
        assert revision == 1 and "ai_profiles" not in value
        assert settings.ai_provider == "gigachat"
