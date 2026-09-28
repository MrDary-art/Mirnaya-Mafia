"""Dedicated outbound worker installation. Never modifies host GPU drivers."""
import json
import os
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from install.resources import download, ensure


def install_windows_service(home, release, python, config):
    """Register the outbound worker without exposing its enrollment token."""
    tools = home / "tools"
    tools.mkdir(exist_ok=True)
    entry = json.loads((release / "install/tools.json").read_text(encoding="utf-8"))["winsw-windows"]
    winsw = tools / "winsw.exe"
    download(entry, winsw)
    services = home / "services"
    logs = home / "logs"
    services.mkdir(exist_ok=True)
    logs.mkdir(exist_ok=True)
    name = "arena-whisper-worker"
    service_exe = services / (name + ".exe")
    registered = subprocess.run(["sc.exe", "query", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if registered:
        query = subprocess.check_output(["sc.exe", "qc", name], text=True, errors="replace")
        if not service_exe.exists() or str(service_exe).casefold() not in query.casefold():
            raise RuntimeError("Служба worker принадлежит другой установке")
    else:
        import shutil
        shutil.copy2(winsw, service_exe)
        args = subprocess.list2cmdline([str(release / "worker/worker.py"), "run", "--config", str(config)])
        xml = f'''<service><id>{name}</id><name>Мастер переговоров — Whisper worker</name><description>Outbound speech recognition</description><executable>{escape(str(python))}</executable><arguments>{escape(args)}</arguments><workingdirectory>{escape(str(release))}</workingdirectory><logpath>{escape(str(logs))}</logpath><log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log><serviceaccount><username>NT AUTHORITY\\LocalService</username></serviceaccount><onfailure action="restart" delay="10 sec"/><startmode>Automatic</startmode><stoptimeout>90 sec</stoptimeout></service>'''
        (services / (name + ".xml")).write_text(xml, encoding="utf-8")
    # LocalService reads the token and models; only Administrators and SYSTEM may edit them.
    subprocess.run(["icacls", str(home), "/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)RX", "/T", "/Q"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["icacls", str(logs), "/grant", "*S-1-5-19:(OI)(CI)M", "/T", "/Q"], check=True, stdout=subprocess.DEVNULL)
    if not registered:
        subprocess.run([str(service_exe), "install"], check=True)
    subprocess.run([str(service_exe), "start"], check=True)
    launcher = home / "arena-worker.cmd"
    launcher.write_text(f'@echo off\r\n"{python}" "{release / "install/worker_cli.py"}" --home "{home}" %*\r\n', encoding="utf-8")


def setup_worker(home, release):
    result = subprocess.run(["nvidia-smi", "--query-gpu=uuid,name,memory.total", "--format=csv,noheader"], capture_output=True, text=True, check=True)
    gpus = [line.split(",", 1) for line in result.stdout.strip().splitlines()]
    if not gpus:
        raise RuntimeError("GPU не предоставлен этой машине. Проверьте драйвер NVIDIA и доступность GPU для системы.")
    for index, (gpu, description) in enumerate(gpus, 1):
        print(f"{index}. {description.strip()} · {gpu}")
    private = home / "private"; private.mkdir(exist_ok=True, mode=0o700)
    python = home / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    config = private / "worker.json"
    if config.exists():
        selected = json.loads(config.read_text(encoding="utf-8"))["gpu_uuid"]
        if selected not in [gpu.strip() for gpu, _ in gpus]:
            raise RuntimeError("Ранее выбранная GPU недоступна. Восстановите её подключение к VM.")
        print("Продолжаем установку с сохранённым подключением и GPU.")
    else:
        choice = input("Номер выделенной для worker GPU: ").strip()
        if not choice.isdigit() or not 1 <= int(choice) <= len(gpus):
            raise ValueError("Выберите одну GPU из списка")
        selected = gpus[int(choice) - 1][0].strip()
        subprocess.run([str(python), str(release / "worker/worker.py"), "enroll", "--config", str(config), "--models", str(home / "models"), "--gpu", selected], check=True)
    print("Загружается large-v3-turbo (около 1,6 ГБ); остальные GPU не используются.")
    ensure("large-v3-turbo", home / "models")
    # Pip-provided CUDA runtime libraries; never install/replace the machine's driver.
    sites = home / "runtime/lib/python3.12/site-packages/nvidia"
    libraries = ":".join(str(sites / name / "lib") for name in ("cublas", "cudnn", "cuda_runtime"))
    env = dict(os.environ, CUDA_VISIBLE_DEVICES=selected)
    if os.name != "nt":
        env["LD_LIBRARY_PATH"] = libraries
    subprocess.run([str(python), str(release / "worker/worker.py"), "doctor", "--config", str(config)], env=env, check=True)
    if os.name == "nt":
        install_windows_service(home, release, python, config)
        (home / "installation.json").write_text(json.dumps({"role": "whisper-worker", "gpu": selected, "protocol": 1}), encoding="utf-8")
        print("Служба установлена. Проверка: " + str(home / "arena-worker.cmd") + " doctor")
        return
    if subprocess.run(["id", "-u", "arena-worker"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        subprocess.run(["useradd", "--system", "--home-dir", str(home), "--shell", "/usr/sbin/nologin", "arena-worker"], check=True)
    from install.setup import systemd_quote, grant_service_files
    grant_service_files(home, "arena-worker", ("private", "models"))
    command = " ".join(systemd_quote(x) for x in [python, release / "worker/worker.py", "run", "--config", config])
    unit = f'''[Unit]
Description=Arena outbound Whisper worker
After=network-online.target
Wants=network-online.target
[Service]
User=arena-worker
Group=arena-worker
ExecStart={command}
Environment={systemd_quote('LD_LIBRARY_PATH=' + libraries)}
Environment={systemd_quote('CUDA_VISIBLE_DEVICES=' + selected)}
Restart=on-failure
RestartSec=10
TimeoutStopSec=90
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={systemd_quote(private)}
[Install]
WantedBy=multi-user.target
'''
    path = Path("/etc/systemd/system/arena-whisper-worker.service")
    if path.exists() and path.read_text(encoding="utf-8") != unit:
        raise RuntimeError("Служба worker уже существует; конфигурация не заменена")
    path.write_text(unit, encoding="utf-8")
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", "--now", "arena-whisper-worker"], check=True)
    import shlex
    launcher = home / "arena-worker"
    launcher.write_text('#!/bin/sh\nexec ' + ' '.join(shlex.quote(str(x)) for x in [python, release / "install/worker_cli.py", "--home", home]) + ' "$@"\n', encoding="utf-8")
    launcher.chmod(0o755)
    (home / "installation.json").write_text(json.dumps({"role": "whisper-worker", "gpu": selected, "protocol": 1}), encoding="utf-8")
    print("Служба установлена и загружает модель. Проверка: sudo " + str(launcher) + " doctor")
    print("Откройте Настройки → Внешний Whisper на сайте и дождитесь готовности. Автозапуск настроен; VM должна оставаться включённой.")
