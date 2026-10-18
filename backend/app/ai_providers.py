"""Trusted provider presets shared by installation settings and runtime calls."""
from app.config import settings

PROVIDERS = {
    "gigachat": {"title": "GigaChat · Сбер", "models": ["GigaChat-3-Ultra", "GigaChat-3-Pro", "GigaChat-3-Lightning"],
                 "key_label": "Authorization Key", "help_url": "https://developers.sber.ru/portal/products/gigachat-api"},
    "yandex": {"title": "Алиса AI / YandexGPT · Яндекс", "models": ["aliceai-llm", "aliceai-llm-flash", "yandexgpt-5.1", "yandexgpt-5-pro"],
               "key_label": "API-ключ Yandex AI Studio", "project_required": True,
               "help_url": "https://aistudio.yandex.ru/ru/docs/ai-studio/quickstart/"},
    "deepseek": {"title": "DeepSeek", "models": ["deepseek-flash", "deepseek-v4-pro"],
                 "key_label": "API-ключ DeepSeek", "help_url": "https://platform.deepseek.com/api_keys"},
}
BASE_URLS = {"yandex": "https://ai.api.cloud.yandex.net/v1", "deepseek": "https://api.deepseek.com"}
ONLINE_PROVIDERS = frozenset(PROVIDERS) | {"ollama", "gpt2giga"}


def runtime_config():
    if settings.ai_provider == "gigachat":
        return {"provider": "gigachat", "credential": settings.gigachat_credentials, "model": settings.gigachat_model}
    return {"provider": settings.ai_provider, "credential": settings.ai_api_key,
            "model": settings.ai_model, "project_id": settings.ai_project_id}


def model_id(config):
    model = config["model"]
    return f"gpt://{config['project_id']}/{model}" if config["provider"] == "yandex" else model


def request_options(config):
    if config["provider"] == "yandex":
        return {"extra_headers": {"OpenAI-Project": config["project_id"]}}
    if config["provider"] == "deepseek":
        return {"extra_payload": {"thinking": {"type": "disabled"}}}
    return {}
