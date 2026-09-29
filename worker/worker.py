"""Outbound-only Whisper worker. Requires no Arena database or GigaChat key."""
import argparse
import asyncio
import getpass
import hashlib
import json
import os
import random
import re
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx

PROTOCOL = 1


def backend_url(value, allow_local=False):
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?::[0-9]+)?", value):
        value = "https://" + value
    parsed = urlsplit(value)
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Нужен адрес сайта без пути, пароля и параметров")
    if parsed.scheme != "https" and not (allow_local and parsed.scheme == "http"):
        raise ValueError("Для worker нужен HTTPS")
    if not allow_local and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Локальный адрес нельзя использовать на другом компьютере")
    return value.rstrip("/")


def prompt_backend_url(allow_local=False):
    while True:
        try:
            return backend_url(input("HTTPS-адрес сайта: "), allow_local)
        except UnicodeDecodeError:
            print("Не удалось прочитать ввод. Переключите раскладку на английскую и повторите адрес.")
        except ValueError as exc:
            print(f"{exc}. Пример: https://24projects.ru")


class Worker:
    def __init__(self, config):
        self.config = config
        self.url = backend_url(config["url"], config.get("allow_local", False))
        self.client = httpx.AsyncClient(base_url=self.url, headers={"Authorization": "Bearer " + config["token"]},
                                       timeout=35, follow_redirects=False)
        self.model = None
        self.ready = False
        self.error = "loading"
        self.job = None
        self.revoked = False

    async def request(self, method, path, **kwargs):
        if not path.startswith("/api/stt-workers/") or ".." in path or "//" in path or "?" in path:
            raise ValueError("Unexpected worker path")
        response = await self.client.request(method, path, **kwargs)
        if response.status_code in {401, 403, 426}:
            self.revoked = True
            raise RuntimeError("Доступ worker отозван или требуется обновление")
        response.raise_for_status()
        return response

    def load(self):
        if not self.config.get("gpu_uuid"):
            raise RuntimeError("Сначала выберите GPU в установщике")
        os.environ["CUDA_VISIBLE_DEVICES"] = self.config["gpu_uuid"]
        from faster_whisper import WhisperModel
        self.model = WhisperModel(self.config["model_path"], device="cuda", device_index=0,
            compute_type="float16", num_workers=1, local_files_only=True)
        pcm = Path(self.config["smoke_pcm"]).read_bytes()
        transcript = self.decode(pcm)
        words = set(re.findall(r"[а-яё]+", transcript.lower()))
        if not words.intersection({"проверка", "голоса", "переговоров", "здравствуйте"}):
            raise RuntimeError("GPU speech smoke test failed")

    def decode(self, pcm):
        import numpy as np
        if len(pcm) % 2 or not 9600 <= len(pcm) <= 1280000:
            raise ValueError("audio_corrupt")
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
        if np.max(np.abs(samples), initial=0) < 0.003:
            return ""
        segments, _ = self.model.transcribe(samples, language="ru", beam_size=5,
            vad_filter=True, condition_on_previous_text=False)
        return " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.8).strip()

    async def heartbeat(self):
        while not self.revoked:
            try:
                await self.request("POST", "/api/stt-workers/heartbeat", json={"protocol": PROTOCOL,
                    "ready": self.ready, "smoke_passed": self.ready, "model": "large-v3-turbo",
                    "gpu": self.config.get("gpu_uuid", ""), "error": self.error})
                if self.job:
                    response = await self.client.post(f"/api/stt-workers/jobs/{self.job['id']}/heartbeat", json={"lease": self.job["lease"]})
                    if response.status_code == 409:
                        self.job["expired"] = True
            except (httpx.HTTPError, RuntimeError):
                pass
            await asyncio.sleep(10)

    async def process(self, job):
        self.job = job
        try:
            job_id = job["id"]
            import uuid
            if str(uuid.UUID(job_id)) != job_id:
                raise ValueError("Invalid job id")
            response = await self.request("GET", f"/api/stt-workers/jobs/{job_id}/audio", headers={"X-Lease": job["lease"]})
            pcm = response.content
            if len(pcm) != job["bytes"] or len(pcm) > 1280000 or hashlib.sha256(pcm).hexdigest() != job["sha256"]:
                raise ValueError("audio_corrupt")
            text = await asyncio.to_thread(self.decode, pcm)
            payload = {"lease": job["lease"], "text": text, "model": "large-v3-turbo"}
            while time.time() < job["deadline"] and not job.get("expired") and not self.revoked:
                try:
                    await self.request("POST", f"/api/stt-workers/jobs/{job_id}/result", json=payload)
                    return
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 409:
                        return
                except httpx.RequestError:
                    pass
                await asyncio.sleep(1 + random.random())
        except Exception:
            if not self.revoked:
                try:
                    await self.request("POST", f"/api/stt-workers/jobs/{job['id']}/fail",
                        json={"lease": job["lease"], "error": "decode_failed"})
                except Exception:
                    pass
        finally:
            self.job = None

    async def run(self):
        heart = asyncio.create_task(self.heartbeat())
        try:
            try:
                await asyncio.to_thread(self.load)
                self.ready, self.error = True, ""
            except Exception:
                self.error = "model_or_gpu_smoke_failed"
                raise RuntimeError("Модель/GPU не прошли проверку. Выполните arena-worker doctor.") from None
            delay = 1
            while not self.revoked:
                try:
                    response = await self.request("POST", "/api/stt-workers/jobs/claim")
                    job = response.json().get("job")
                    if job:
                        await self.process(job)
                    delay = 1
                except (httpx.HTTPError, RuntimeError):
                    await asyncio.sleep(delay + random.random())
                    delay = min(delay * 2, 30)
        finally:
            heart.cancel()
            await asyncio.gather(heart, return_exceptions=True)
            await self.client.aclose()


async def enroll(args):
    url = backend_url(args.url, args.allow_local) if args.url else prompt_backend_url(args.allow_local)
    code = getpass.getpass("Одноразовый код подключения: ").strip()
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        response = await client.post(url + "/api/stt-workers/enroll", json={"code": code, "protocol": PROTOCOL})
        if response.status_code != 200:
            raise RuntimeError(f"Подключение отклонено ({response.status_code}). Получите новый код в админке.")
    config = {"url": url, "token": response.json()["token"], "gpu_uuid": args.gpu,
        "model_path": str(args.models.resolve() / "whisper-large-v3-turbo"),
        "smoke_pcm": str(Path(__file__).with_name("smoke.pcm").resolve()), "allow_local": args.allow_local}
    args.config.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(args.config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as out:
        json.dump(config, out)
    print("Worker зарегистрирован. Готовность появится после проверки модели и GPU.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["enroll", "run", "doctor"])
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--models", type=Path)
    parser.add_argument("--gpu")
    parser.add_argument("--url", help="HTTPS-адрес сайта; можно указать только домен")
    parser.add_argument("--allow-local", action="store_true", help="Только изолированная локальная проверка протокола")
    args = parser.parse_args()
    if args.command == "enroll":
        if not args.models or not args.gpu:
            parser.error("enroll requires --models and --gpu")
        if args.config.exists():
            parser.error("Worker уже подключён; сохраните конфигурацию или отзовите старый доступ перед повторным подключением")
        asyncio.run(enroll(args))
    else:
        config = json.loads(args.config.read_text(encoding="utf-8"))
        worker = Worker(config)
        if args.command == "doctor":
            worker.load(); print("GPU, модель и распознавание проверены. Связь с сайтом проверяется при запуске службы.")
        else:
            asyncio.run(worker.run())


if __name__ == "__main__":
    main()
