from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_path: str = str(ROOT / "data" / "arena.db")
    secret_key: str = "arena-dev-secret-change-me-please-32b"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    llm_timeout: float = 7.0
    gigachat_credentials: str = ""
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_model: str = "GigaChat-2-Max"
    gpt2giga_url: str = "http://127.0.0.1:8090/v1"
    gpt2giga_api_key: str = ""
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b"
    max_active_sessions: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()
