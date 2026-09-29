"""Shared interactive installation, run only from an explicit installer command."""
import argparse
import asyncio
import getpass
import hashlib
import json
import os
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from install.resources import download, ensure


def domain_name(value):
    value = value.strip().rstrip(".")
    if any(c in value for c in "/:@?#\\\n\r\t "):
        raise ValueError("Введите только домен, например arena.example.ru")
    value = value.encode("idna").decode("ascii").lower()
    if len(value) > 253 or "." not in value or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", p) for p in value.split(".")):
        raise ValueError("Неверное имя домена")
    return value


def free_port(port, host="127.0.0.1"):
    with socket.socket() as sock:
        try:
            sock.bind((host, port)); return True
        except OSError:
            return False


def check_platform(home):
    if platform.machine().lower() not in {"amd64", "x86_64"}:
        raise RuntimeError("Поддерживается только x86_64")
    if os.name == "nt":
        import ctypes
        if not ctypes.windll.shell32.IsUserAnAdmin():
            raise RuntimeError("Откройте PowerShell от имени администратора для установки служб")
        if sys.getwindowsversion().build < 19045:
            raise RuntimeError("Нужна Windows 10 22H2 или Windows 11")
    else:
        info = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
        if info.get("ID", "").strip('"') != "ubuntu" or info.get("VERSION_ID", "").strip('"') not in {"22.04", "24.04", "26.04"}:
            raise RuntimeError("Нужна Ubuntu 22.04, 24.04 или 26.04 LTS")
        if os.geteuid() != 0:
            raise RuntimeError("Установку служб нужно запускать через sudo")
    home.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(home).free < 8 * 1024**3:
        raise RuntimeError("Нужно хотя бы 8 ГБ свободного места для установки и резервных копий")
    if os.name == "nt":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(name, ctypes.c_ulonglong) for name in ("physical", "available", "page", "free_page", "virtual", "free_virtual", "extended")]
        status = MemoryStatus(); status.length = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise RuntimeError("Не удалось определить объём памяти")
        memory = status.physical
    else:
        memory = os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")
    print(f"Процессоров: {os.cpu_count() or 1}; ОЗУ: {memory / 1024**3:.1f} ГБ")
    if memory < 1.8 * 1024**3:
        raise RuntimeError("Для сайта требуется не менее 2 ГБ ОЗУ")


def unpack_release(bundle, home):
    """Reject traversal/symlinks; verify every archive member against release hashes."""
    with zipfile.ZipFile(bundle) as source:
        meta = json.loads(source.read("release.json"))
        version = meta["version"]
        if not re.fullmatch(r"[a-zA-Z0-9._-]{1,80}", version):
            raise ValueError("Неверная версия релиза")
        target = home / "releases" / version
        stage = home / "releases" / (version + ".partial")
        stage.mkdir(parents=True, exist_ok=True)
        names = set(source.namelist())
        if len(names) != len(source.namelist()) or names != set(meta["files"]) | {"release.json"}:
            raise ValueError("Манифест архива не совпадает с содержимым")
        for name in source.namelist():
            dest = (stage / name).resolve()
            item = source.getinfo(name)
            if not dest.is_relative_to(stage.resolve()) or "\\" in name or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Недопустимый путь в архиве")
            blob = source.read(name)
            if name != "release.json" and hashlib.sha256(blob).hexdigest() != meta["files"][name]:
                raise ValueError("Контрольная сумма релиза не совпала: " + name)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(blob)
        if target.exists():
            # Never overwrite a running version; verify exact same contents.
            for name, sha in meta["files"].items():
                if not (target / name).is_file() or hashlib.sha256((target / name).read_bytes()).hexdigest() != sha:
                    raise RuntimeError("Эта версия уже существует с другими файлами")
            return target
        stage.rename(target)
        return target


def activate_release(home, release):
    state = home / "active.json"
    temporary = state.with_suffix(".tmp")
    temporary.write_text(json.dumps({"release": str(release.resolve())}), encoding="utf-8")
    temporary.replace(state)


def grant_service_files(home, account, writable):
    """Give the service read access to code without making secrets world-readable."""
    import stat
    home = home.resolve()
    shutil.chown(home, group=account)
    home.chmod(0o750)
    immutable = ("releases", "runtime", "python", "tools", "launcher.py", "active.json", "Caddyfile", "installation.json")
    for name in immutable:
        root = home / name
        paths = [root, *root.rglob("*")] if root.is_dir() else [root]
        for path in paths:
            if not path.exists() or path.is_symlink():
                continue
            shutil.chown(path, group=account)
            mode = stat.S_IMODE(path.stat().st_mode)
            path.chmod(mode | (0o050 if path.is_dir() or mode & 0o100 else 0o040))
    for name in writable:
        root = home / name
        root.mkdir(parents=True, exist_ok=True)
        for path in [root, *root.rglob("*")]:
            if path.is_symlink():
                raise RuntimeError("Символьная ссылка в изменяемых данных установки: " + str(path))
            shutil.chown(path, user=account, group=account)
            path.chmod(0o700 if path.is_dir() else 0o600)


def get_tools(home):
    tools = json.loads((ROOT / "install/tools.json").read_text(encoding="utf-8"))
    folder = home / "tools"
    folder.mkdir(exist_ok=True)
    windows = os.name == "nt"
    entry = tools["caddy-windows" if windows else "caddy-linux"]
    archive = folder / ("caddy.zip" if windows else "caddy.tar.gz")
    download(entry, archive)
    if windows:
        with zipfile.ZipFile(archive) as source:
            (folder / "caddy.exe").write_bytes(source.read("caddy.exe"))
        download(tools["winsw-windows"], folder / "winsw.exe")
    else:
        with tarfile.open(archive) as source:
            member = source.extractfile("caddy")
            (folder / "caddy").write_bytes(member.read())
        (folder / "caddy").chmod(0o755)


def write_env(home, values):
    folder = home / "private"
    folder.mkdir(exist_ok=True, mode=0o700)
    path = folder / "arena.env"
    if path.exists():
        raise RuntimeError("Настройки уже существуют; повторная установка не должна их перезаписывать")
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as stream:
        for key, value in values.items():
            # JSON quotes provide dotenv-compatible backslash/space handling.
            stream.write(f"{key}={json.dumps(str(value), ensure_ascii=False)}\n")
    os.environ.update({k: str(v) for k, v in values.items()})


async def initialize(home, login, password, key, scope):
    from install.arena import migrate
    migrate()
    from app.auth import hash_password
    from app.models import User
    from app.db import SessionLocal
    from app.installation import initialize_config, read_config, save_config, cipher, normalize_key, check_gigachat
    from sqlalchemy import select
    await initialize_config(fresh=True)
    async with SessionLocal() as db:
        if not await db.scalar(select(User.id).where(User.is_admin == 1)):
            if await db.scalar(select(User.id).where(User.username == login)):
                raise RuntimeError("Логин занят обычным пользователем; его права не изменены")
            db.add(User(username=login, password_hash=hash_password(password), is_admin=1))
            await db.commit()
        if key:
            checked = await check_gigachat(key, scope, "GigaChat-3-Ultra")
            revision, _ = await read_config(db)
            await save_config(db, revision, {"credential": cipher().encrypt(normalize_key(key).encode()).decode(),
                "scope": scope, "ai_check": checked}, None, "installer.ai_configured")


def caddy_config(home, release, domain, port, api_port, tls_mode=None):
    tls_mode = tls_mode or ("public" if domain else "local")
    host = f"[{domain}]" if ":" in domain else domain
    address = f"https://{host}" if domain else f"http://localhost:{port}, http://127.0.0.1:{port}"
    bind = "" if domain else "bind 127.0.0.1\n"
    tls = "tls internal" if tls_mode == "internal" else ""
    root = (release / "frontend/dist").as_posix()
    value = f'''{{
    admin off
    skip_install_trust
    storage file_system {{
        root "{(home / 'data/caddy').as_posix()}"
    }}
}}
{address} {{
    {bind}
    {tls}
    encode gzip
    header X-Content-Type-Options nosniff
    handle /api* {{
        reverse_proxy 127.0.0.1:{api_port} {{
            flush_interval -1
        }}
    }}
    handle {{
        root * "{root}"
        try_files {{path}} /index.html
        file_server
    }}
}}
'''
    (home / "Caddyfile").write_text(value, encoding="utf-8")


def systemd_quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def systemd_directory(value):
    # WorkingDirectory is one scalar path: outer quotes become part of that path.
    value = str(value)
    if not value.startswith("/") or any(c in value for c in "\r\n\t\\"):
        raise ValueError("Для systemd нужен абсолютный путь без управляющих символов")
    return value.replace("%", "%%")


def site_unit(home, name, executable, arguments):
    command = " ".join(systemd_quote(x) for x in [executable, *arguments])
    environment = "\n".join("Environment=" + systemd_quote(key + "=" + str(home / "data" / folder))
        for key, folder in (("XDG_CONFIG_HOME", "config"), ("XDG_DATA_HOME", "state"), ("XDG_CACHE_HOME", "cache")))
    return f'''[Unit]
Description=Arena {name}
After=network-online.target
Wants=network-online.target
[Service]
User=arena
Group=arena
WorkingDirectory={systemd_directory(home)}
ExecStart={command}
{environment}
Restart=on-failure
RestartSec=10
TimeoutStopSec=90
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={" ".join(systemd_quote(home / p) for p in ('data','models','logs','private'))}
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
[Install]
WantedBy=multi-user.target
'''


def install_services(home, release, api_port, resume=False):
    services = home / "services"; services.mkdir(exist_ok=True)
    (home / "logs").mkdir(exist_ok=True)
    python = home / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    launcher = home / "launcher.py"
    launcher.write_text('''import json,os,subprocess,sys
from pathlib import Path
home=Path(__file__).resolve().parent
release=Path(json.loads((home/'active.json').read_text(encoding='utf-8'))['release'])
os.environ['ARENA_ENV_FILE']=str(home/'private/arena.env')
sys.path.insert(0,str(release/'backend'))
if sys.argv[1]=='api':
 import uvicorn
 uvicorn.run('app.main:app',host='127.0.0.1',port=int(sys.argv[2]),workers=1,proxy_headers=True,forwarded_allow_ips='127.0.0.1',access_log=False)
else:
 sys.path.insert(0,str(release))
 from install.arena import main
 sys.argv=[sys.argv[0],'--home',str(home)]+sys.argv[1:]
 main()
''', encoding="utf-8")
    commands = {"arena-api": (python, [str(launcher), "api", str(api_port)]),
                "arena-web": (home / "tools" / ("caddy.exe" if os.name == "nt" else "caddy"), ["run", "--config", str(home / "Caddyfile")])}
    if os.name == "nt":
        for name, (exe, args) in commands.items():
            service_exe = services / (name + ".exe")
            registered = subprocess.run(["sc.exe", "query", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            if registered:
                if not resume or not service_exe.exists():
                    raise RuntimeError("Служба установки уже существует; используйте arena update")
                query = subprocess.check_output(["sc.exe", "qc", name], text=True, errors="replace")
                if str(service_exe).casefold() not in query.casefold():
                    raise RuntimeError("Служба принадлежит другой установке: " + name)
                continue
            shutil.copy2(home / "tools/winsw.exe", service_exe)
            arguments = subprocess.list2cmdline(args)
            xml = f'''<service><id>{name}</id><name>Мастер переговоров — {name}</name><description>Arena isolated installation</description><executable>{escape(str(exe))}</executable><arguments>{escape(arguments)}</arguments><workingdirectory>{escape(str(home))}</workingdirectory><logpath>{escape(str(home / 'logs'))}</logpath><log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log><serviceaccount><username>NT AUTHORITY\\LocalService</username></serviceaccount><onfailure action="restart" delay="10 sec"/><startmode>Automatic</startmode><stoptimeout>90 sec</stoptimeout></service>'''
            (services / (name + ".xml")).write_text(xml, encoding="utf-8")
            subprocess.run([str(service_exe), "install"], check=True)
        # LocalService reads the immutable release/runtime and writes only managed data.
        subprocess.run(["icacls", str(home), "/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)RX", "/T", "/Q"], check=True, stdout=subprocess.DEVNULL)
        for name in ("data", "models", "logs", "private"):
            subprocess.run(["icacls", str(home / name), "/grant", "*S-1-5-19:(OI)(CI)M", "/T", "/Q"], check=True, stdout=subprocess.DEVNULL)
        from app.config import settings
        if settings.piper_temp_dir:
            subprocess.run(["icacls", settings.piper_temp_dir, "/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)M", "/T", "/Q"], check=True, stdout=subprocess.DEVNULL)
        (home / "arena.cmd").write_text(f'@echo off\r\n"{python}" "{launcher}" %*\r\n', encoding="utf-8")
    else:
        if subprocess.run(["id", "-u", "arena"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            subprocess.run(["useradd", "--system", "--home-dir", str(home), "--shell", "/usr/sbin/nologin", "arena"], check=True)
        grant_service_files(home, "arena", ("data", "models", "logs", "private"))
        for name, (exe, args) in commands.items():
            unit_path = Path("/etc/systemd/system") / (name + ".service")
            unit = site_unit(home, name, exe, args)
            if unit_path.exists():
                previous = unit_path.read_text(encoding="utf-8")
                # Accept only our exact previous template, including the .2 quoting bug.
                legacy = "\n".join(line for line in unit.splitlines() if not line.startswith("Environment=")) + "\n"
                quoted_legacy = legacy.replace("WorkingDirectory=" + systemd_directory(home), "WorkingDirectory=" + systemd_quote(home))
                if not resume or previous not in {unit, legacy, quoted_legacy}:
                    raise RuntimeError("Служба с таким именем принадлежит другой установке: " + name)
            unit_path.write_text(unit, encoding="utf-8")
        subprocess.run(["systemd-analyze", "verify", "/etc/systemd/system/arena-api.service", "/etc/systemd/system/arena-web.service"], check=True)
        subprocess.run(["systemctl", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "enable", "arena-api", "arena-web"], check=True)
        cli = home / "arena"
        cli.write_text(f'#!/bin/sh\nexec "{python}" "{launcher}" "$@"\n', encoding="utf-8")
        cli.chmod(0o755)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--role", choices=["site", "whisper-worker"], default="site")
    args = parser.parse_args()
    home = args.home.resolve()
    check_platform(home)
    if args.role == "whisper-worker":
        from install.worker_setup import setup_worker
        setup_worker(home, ROOT)
        return
    if (home / "installation.json").exists():
        print("Установка уже существует. Данные и пароль сохранены. Для обновления используйте arena update --bundle <релиз.zip>.")
        return
    if (home / "private/arena.env").exists():
        plan_path = home / "installation-plan.json"
        if not plan_path.is_file():
            raise RuntimeError("Существует конфигурация без плана установки. Сохраните её и восстановите план; файлы не изменены.")
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        if Path(plan["release"]).resolve() != ROOT.resolve():
            raise RuntimeError("Возобновите установку тем же проверенным релизом")
        print("Продолжаем незавершённую установку. Существующие данные и пароль будут сохранены.")
        from install.arena import configure_environment, migrate, password_input
        configure_environment(home)
        migrate()
        async def has_admin():
            from app.db import SessionLocal
            from app.models import User
            from sqlalchemy import select
            async with SessionLocal() as db:
                return bool(await db.scalar(select(User.id).where(User.is_admin == 1)))
        if not asyncio.run(has_admin()):
            asyncio.run(initialize(home, plan["login"], password_input(), "", "GIGACHAT_API_PERS"))
        from install.mail_setup import configure_mail_interactive
        asyncio.run(configure_mail_interactive())
        finish_install(home, plan, resume=True)
        return
    print("Мастер переговоров — настройка установки")
    from install.network import choose_address
    network = choose_address()
    api_port = next((p for p in range(8100, 8120) if free_port(p)), None)
    if not api_port:
        raise RuntimeError("Нет свободного внутреннего порта API")
    sys.path.insert(0, str(ROOT / "backend"))
    from install.arena import password_input
    login = input("Логин администратора [admin]: ").strip() or "admin"
    if not re.fullmatch(r"[a-zA-Z0-9_-]{3,40}", login):
        raise ValueError("Логин: 3–40 латинских букв, цифр, дефис или подчёркивание")
    password = password_input()
    base = network["url"]
    plan = {"release": str(ROOT), "login": login, "api_port": api_port, **network}
    (home / "installation-plan.json").write_text(json.dumps(plan), encoding="utf-8")
    piper_temp = home / "data/piper-temp"
    if not str(piper_temp).isascii() and os.name == "nt":
        piper_temp = Path(os.environ.get("SystemDrive", "C:") + "\\") / "ProgramData/ArenaSpeechCache" / secrets.token_hex(8)
    piper_temp.mkdir(parents=True, exist_ok=True)
    write_env(home, {"PIPER_TEMP_DIR": piper_temp.as_posix(), "DB_PATH": (home / "data/arena.db").as_posix(), "DATA_DIR": (home / "data").as_posix(),
        "MODELS_DIR": (home / "models").as_posix(), "INSTALLATION_KEY_FILE": (home / "private/installation.key").as_posix(),
        "SECRET_KEY": secrets.token_urlsafe(48), "SEED_DEMO_ACCOUNTS": "false", "STT_MODEL": "tiny", "STT_WORKERS": "1",
        "PUBLIC_BASE_URL": base, "CORS_ORIGINS": base, "ROOM_ALLOWED_ORIGINS": base,
        "ROOM_RECORDINGS_PATH": (home / "data/private/room-recordings").as_posix()})
    for name in ("data", "models", "logs"):
        (home / name).mkdir(exist_ok=True)
    from app.installation import check_gigachat, normalize_key
    key, scope = "", "GIGACHAT_API_PERS"
    while True:
        print("Подключение GigaChat. Пустой ввод — пропустить; готовые сценарии продолжат работать.")
        candidate = getpass.getpass("Authorization Key: ")
        if not candidate.strip():
            if input("Оставить ИИ неподключённым? [да/нет]: ").strip().lower() == "да":
                break
            continue
        scope = input("Scope [GIGACHAT_API_PERS]: ").strip() or "GIGACHAT_API_PERS"
        if scope not in {"GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"}:
            print("Неизвестный scope"); continue
        try:
            key = normalize_key(candidate)
            asyncio.run(check_gigachat(key, scope, "GigaChat-3-Ultra"))
            break
        except Exception as exc:
            print(getattr(exc, "detail", "Проверка не удалась. Повторите ввод."))
            key = ""
    asyncio.run(initialize(home, login, password, key, scope))
    from install.mail_setup import configure_mail_interactive
    asyncio.run(configure_mail_interactive())
    finish_install(home, plan)


def finish_install(home, plan, resume=False):
    print("Загрузка и проверка локального распознавания и голоса…")
    ensure("tiny", home / "models")
    ensure("piper", home / "models")
    get_tools(home)
    activate_release(home, ROOT)
    caddy_config(home, ROOT, plan["domain"], plan["port"], plan["api_port"], plan.get("tls_mode"))
    executable = home / "tools" / ("caddy.exe" if os.name == "nt" else "caddy")
    subprocess.run([str(executable), "validate", "--config", str(home / "Caddyfile")], check=True)
    install_services(home, ROOT, plan["api_port"], resume=resume)
    (home / "installation.json").write_text(json.dumps({"role": "site", **plan}), encoding="utf-8")
    from install.arena import service, doctor
    service(home, "start")
    print("Проверка запуска служб…")
    time.sleep(5)
    from install.network import certificate_info, tls_mode, wait_for_https
    if plan.get("domain"):
        print("Проверяем HTTPS и ждём выпуска сертификата (до 45 секунд)…")
        ready = wait_for_https(home, plan)
        if not ready and tls_mode(plan) == "public":
            print("Публичный HTTPS пока не готов. Caddy продолжит выпуск сертификата автоматически.")
            print(f"Проверьте A/AAAA-записи домена, входящие TCP 80/443 и журнал: sudo {home / 'arena'} logs.")
            print("Для публичного домена тестовый сертификат не включается: браузеры посетителей ему не доверяют.")
    if tls_mode(plan) == "internal":
        certificate_info(home, plan)
    ok = asyncio.run(doctor(home, speech=True))
    print(f"Сайт: {plan['url']}\nАдминка: {plan['url']}/admin\nЛогин: {plan['login']}")
    print("Службы запускаются автоматически при включении компьютера.")
    if not ok:
        raise RuntimeError("Установка сохранена, но не все проверки пройдены. Выполните arena doctor --speech; HTTPS может ожидать DNS/сертификат.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as exc:
        print(f"Команда {exc.cmd[0]} завершилась с ошибкой {exc.returncode}. Данные сохранены. Проверьте журнал служб через arena logs.", file=sys.stderr)
        sys.exit(1)
