"""Maintenance commands for an installed, isolated Arena deployment."""
import argparse
import asyncio
import getpass
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def configure_environment(home):
    env = home / "private" / "arena.env"
    if not env.is_file():
        raise RuntimeError("Установка не настроена. Запустите установщик.")
    from dotenv import dotenv_values
    for key, value in dotenv_values(env).items():
        if value is not None:
            os.environ[key] = value
    os.environ["ARENA_ENV_FILE"] = str(env)
    sys.path.insert(0, str(ROOT / "backend"))


def migrate():
    from alembic.config import Config
    from alembic import command
    config = Config(str(ROOT / "backend" / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "backend" / "alembic"))
    command.upgrade(config, "head")


def backup(home):
    from app.config import settings
    target = home / "backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target.mkdir(parents=True, mode=0o700)
    with sqlite3.connect(settings.db_path) as source, sqlite3.connect(target / "arena.db") as destination:
        source.backup(destination)
    shutil.copy2(home / "private" / "arena.env", target / "arena.env")
    shutil.copy2(settings.installation_key_file, target / "installation.key")
    (target / "metadata.json").write_text(json.dumps({"version": release_version(), "created": time.time(), "protocol": 1}), encoding="utf-8")
    for path in target.iterdir():
        path.chmod(0o600)
    print(f"Резервная копия: {target}. Содержит закрытые ключи; храните её приватно.")
    return target


def release_version():
    path = ROOT / "release.json"
    return json.loads(path.read_text(encoding="utf-8")).get("version", "source") if path.exists() else "source"


async def reset_admin():
    from app.auth import hash_password
    from app.db import SessionLocal
    from app.models import User
    from sqlalchemy import select
    login = input("Логин администратора: ").strip()
    password = password_input()
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.username == login, User.is_admin == 1))
        if not user:
            raise RuntimeError("Администратор не найден")
        user.password_hash = hash_password(password)
        await db.commit()
    print("Пароль изменён. Войдите заново.")


def password_input():
    while True:
        password = getpass.getpass("Пароль (не менее 12 символов): ")
        if len(password) < 12:
            print("Пароль слишком короткий."); continue
        if password != getpass.getpass("Повторите пароль: "):
            print("Пароли не совпадают."); continue
        return password


async def doctor(home, speech=False):
    from app.config import settings
    from app.installation import read_config
    from app.db import SessionLocal
    from sqlalchemy import text
    results = {}
    results["frontend"] = (ROOT / "frontend/dist/index.html").is_file()
    try:
        async with SessionLocal() as db:
            version = await db.scalar(text("select version_num from alembic_version"))
            results["database"] = version == "0031"
            _, cfg = await read_config(db)
            results["gigachat_configured"] = "configured" if cfg.get("credential") else "not configured (offline scenarios available)"
    except Exception:
        results["database"] = False
    from install.resources import valid, MANIFEST
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for name in (settings.stt_model, "piper"):
        resource = manifest["resources"][name]
        results[name + "_files"] = all(valid(Path(settings.models_dir) / resource["directory"] / f["path"], f) for f in resource["files"])
    if speech:
        from app.voice import local_engine, local_tts
        try:
            wav = await local_tts.synthesize("Здравствуйте. Это проверка голоса мастера переговоров.")
            import wave, io
            with wave.open(io.BytesIO(wav)) as source:
                results["piper_audio"] = source.getnframes() > source.getframerate() // 4
            pcm = (ROOT / "worker" / "smoke.pcm").read_bytes()
            transcript = await local_engine.transcribe(pcm)
            results["stt_audio"] = bool(transcript.strip())
        except Exception:
            results["speech_audio"] = False
    results["free_disk_gb"] = round(shutil.disk_usage(home).free / 1024**3, 1)
    import httpx
    base = settings.public_base_url or "http://127.0.0.1:8080"
    try:
        from install.network import tls_context
        metadata = json.loads((home / "installation.json").read_text(encoding="utf-8"))
        async with httpx.AsyncClient(timeout=10, verify=tls_context(home, metadata)) as client:
            response = await client.get(base + "/api")
            results["site_https_or_local"] = response.status_code == 200
    except (httpx.HTTPError, RuntimeError, OSError):
        results["site_https_or_local"] = False
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return all(v is not False for v in results.values())


def service(home, action):
    metadata = json.loads((home / "installation.json").read_text(encoding="utf-8"))
    if os.name == "nt":
        for name in ("arena-api", "arena-web"):
            subprocess.run([str(home / "services" / (name + ".exe")), action], check=True)
    else:
        subprocess.run(["systemctl", action, "arena-api.service", "arena-web.service"], check=True)


def apply_certificate_mode(home, metadata, mode):
    from install.setup import caddy_config
    from install.network import save_network_metadata
    previous = (home / "Caddyfile").read_bytes()
    updated = {**metadata, "tls_mode": mode}
    executable = home / "tools" / ("caddy.exe" if os.name == "nt" else "caddy")
    restart = [str(home / "services/arena-web.exe"), "restart"] if os.name == "nt" else ["systemctl", "restart", "arena-web"]
    try:
        caddy_config(home, Path(metadata["release"]), metadata["domain"], metadata["port"], metadata["api_port"], mode)
        subprocess.run([str(executable), "validate", "--config", str(home / "Caddyfile")], check=True)
        # validate provisions a new CA as root; the unprivileged service must read it.
        storage = home / "data/caddy"
        if os.name != "nt" and storage.exists():
            for path in [storage, *storage.rglob("*")]:
                if path.is_symlink():
                    raise RuntimeError("Символьная ссылка в хранилище сертификатов")
                shutil.chown(path, user="arena", group="arena")
                path.chmod(0o700 if path.is_dir() else 0o600)
        subprocess.run(restart, check=True)
        save_network_metadata(home, updated)
    except Exception:
        (home / "Caddyfile").write_bytes(previous)
        subprocess.run(restart, check=False)
        raise
    return updated


def change_certificate(home):
    from install.network import certificate_info, wait_for_https
    metadata = json.loads((home / "installation.json").read_text(encoding="utf-8"))
    if not metadata.get("domain"):
        raise RuntimeError("Локальный режим использует HTTP на localhost. Для публичного доступа настройте домен при установке.")
    print("1. Публичный HTTPS для домена\n2. Собственный сертификат для тестирования\n0. Отмена")
    choice = input("Выберите: ").strip()
    if choice not in {"1", "2"}:
        return
    if choice == "1":
        import ipaddress
        try:
            ipaddress.ip_address(metadata["domain"])
        except ValueError:
            pass
        else:
            raise RuntimeError("Для публичного режима этой установки нужен домен, а текущий адрес — IP.")
    else:
        print("На каждом устройстве потребуется добавить доверие к вашему сертификату. Публичный HTTPS перестанет использоваться.")
    if input("Перезапустить веб-сервер с этой настройкой? [да/нет]: ").strip().lower() not in {"да", "yes", "y"}:
        return
    metadata = apply_certificate_mode(home, metadata, "public" if choice == "1" else "internal")
    ready = wait_for_https(home, metadata)
    if choice == "2":
        certificate_info(home, metadata)
    print("HTTPS проверен: " + metadata["url"] if ready else "HTTPS пока не отвечает. Проверьте DNS, порты 80/443 и arena logs.")


def update(home, bundle, sha):
    if not sha or hashlib.sha256(bundle.read_bytes()).hexdigest() != sha.lower():
        raise RuntimeError("Укажите проверенную SHA-256 архива; контрольная сумма не совпала")
    # Updating active negotiations is an explicit maintenance decision.
    from app.config import settings
    with sqlite3.connect(settings.db_path) as db:
        active = db.execute("select count(*) from sessions where status in ('active','processing')").fetchone()[0]
        active += db.execute("select count(*) from speech_jobs where state in ('queued','leased','local','local_running')").fetchone()[0]
        active += db.execute("select count(*) from arena_rooms where status in ('active','processing','feedback')").fetchone()[0]
    if active:
        raise RuntimeError(f"Есть незавершённые сессии или задания ({active}). Завершите их перед обновлением.")
    from install.setup import unpack_release, activate_release, grant_service_files
    release = unpack_release(bundle, home)
    backup(home)
    service(home, "stop")
    try:
        env = dict(os.environ)
        python = home / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        uv = home / "tools" / ("uv.exe" if os.name == "nt" else "uv")
        subprocess.run([str(uv), "pip", "sync", "--python", str(python), "--require-hashes", str(release / "install/requirements.lock")], check=True)
        subprocess.run([str(python), str(release / "install/arena.py"), "--home", str(home), "migrate"], check=True, env=env)
        from install.setup import caddy_config
        metadata = json.loads((home / "installation.json").read_text(encoding="utf-8"))
        caddy_config(home, release, metadata["domain"], metadata["port"], metadata["api_port"], metadata.get("tls_mode"))
        metadata["release"] = str(release)
        from install.network import save_network_metadata
        save_network_metadata(home, metadata)
        activate_release(home, release)
        if os.name != "nt":
            grant_service_files(home, "arena", ("data", "models", "logs", "private"))
        service(home, "start")
    except Exception:
        raise RuntimeError("Обновление остановлено. Службы выключены; используйте резервную копию базы и соответствующую версию кода. Автоматический откат после миграции не выполнялся.") from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("command", nargs="?", choices=["start", "stop", "restart", "status", "logs", "doctor", "configure", "backup", "update", "reset-admin-password", "migrate", "model", "certificate", "https"])
    parser.add_argument("--speech", action="store_true")
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--sha256")
    parser.add_argument("--name", choices=["tiny", "base", "small"])
    args = parser.parse_args()
    home = args.home.resolve()
    configure_environment(home)
    if args.command is None:
        print("Мастер переговоров — управление\n1. Адрес сайта и админки\n2. Состояние\n3. Запустить\n4. Остановить\n5. Перезапустить\n6. Проверить установку\n7. Журнал ошибок\n8. Сертификат для тестового HTTPS\n9. Переключить сертификат\n0. Выход")
        commands = {"1": "configure", "2": "status", "3": "start", "4": "stop", "5": "restart", "6": "doctor", "7": "logs", "8": "certificate", "9": "https"}
        choice = input("Выберите действие: ").strip()
        if choice == "0":
            return
        args.command = commands.get(choice)
        if not args.command:
            print("Неизвестный пункт. Запустите меню ещё раз."); return
    if args.command == "certificate":
        from install.network import certificate_info
        certificate_info(home, json.loads((home / "installation.json").read_text(encoding="utf-8")))
    elif args.command == "https":
        change_certificate(home)
    elif args.command in {"start", "stop", "restart", "status"}:
        service(home, args.command)
    elif args.command == "logs":
        if os.name != "nt":
            subprocess.run(["journalctl", "-u", "arena-api", "-u", "arena-web", "-n", "100", "--no-pager"], check=True)
        for path in sorted((home / "logs").glob("*.log")):
            print(path.name)
            print("\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[-50:]))
    elif args.command == "doctor":
        sys.exit(0 if asyncio.run(doctor(home, args.speech)) else 1)
    elif args.command == "migrate":
        migrate()
    elif args.command == "backup":
        backup(home)
    elif args.command == "reset-admin-password":
        asyncio.run(reset_admin())
    elif args.command == "configure":
        from app.config import settings
        print((settings.public_base_url or "http://127.0.0.1:8080") + "/admin")
        print("Измените ключ, модель и распознавание в разделе Настройки. Пароль — через reset-admin-password.")
    elif args.command == "model":
        if not args.name:
            parser.error("Укажите --name tiny|base|small")
        from app.config import settings
        from install.resources import ensure
        ensure(args.name, settings.models_dir)
        print("Модель загружена. Примените её в настройках после окончания активных записей.")
    elif args.command == "update":
        if not args.bundle:
            parser.error("Укажите --bundle с проверенным архивом релиза")
        update(home, args.bundle.resolve(), args.sha256)


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    try:
        main()
    except (RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
