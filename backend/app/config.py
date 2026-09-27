from pathlib import Path
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=os.environ.get("ARENA_ENV_FILE", ".env"), extra="ignore")

    db_path: str = str(ROOT / "data" / "arena.db")
    secret_key: str = "arena-dev-secret-change-me-please-32b"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176"
    llm_timeout: float = 7.0
    gigachat_credentials: str = ""
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_model: str = "GigaChat-3-Ultra"
    gigachat_ca_bundle_file: str = str(ROOT / "backend" / "certs" / "russian_trusted_root_ca.pem")
    gpt2giga_url: str = "http://127.0.0.1:8090/v1"
    gpt2giga_api_key: str = ""
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b"
    data_dir: str = str(ROOT / "data")
    models_dir: str = str(ROOT / "models")
    piper_temp_dir: str = ""
    installation_key_file: str = str(ROOT / "data" / "private" / "installation.key")
    seed_demo_accounts: bool = False
    development_create_tables: bool = False
    allow_local_worker: bool = False
    public_base_url: str = ""
    stt_policy: str = "local"
    stt_queue_limit: int = 8
    stt_model: str = "tiny"
    ollama_enabled: bool = False
    stt_allow_download: bool = False
    stt_device: str = "cpu"
    stt_compute_type: str = "int8"
    stt_language: str = "ru"
    stt_cpu_threads: int = 2
    stt_workers: int = 1
    room_recordings_path: str = str(ROOT / "data" / "private" / "room-recordings")
    room_recording_retention_days: int = 7
    room_max_recording_bytes: int = 256_000_000
    room_ice_servers_json: str = '[{"urls":["stun:stun.l.google.com:19302"]}]'
    room_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176,http://localhost:8000,http://127.0.0.1:8000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @property
    def room_allowed_origin_list(self) -> list[str]:
        return [x.strip() for x in self.room_allowed_origins.split(",") if x.strip()]


settings = Settings()
