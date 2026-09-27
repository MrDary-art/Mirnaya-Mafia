"""Local maintenance for the dedicated GPU worker; never opens a listening port."""
import argparse
import json
import os
import getpass
import shutil
import time
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("command", choices=["start", "stop", "restart", "status", "logs", "doctor", "reconnect"])
    args = parser.parse_args()
    home = args.home.resolve()
    if args.command == "reconnect":
        path = home / "private/worker.json"
        config = json.loads(path.read_text(encoding="utf-8"))
        code = getpass.getpass("Новый одноразовый код с этого же сайта: ").strip()
        import httpx
        with httpx.Client(timeout=30) as client:
            response = client.post(config["url"] + "/api/stt-workers/enroll", json={"protocol": 1, "code": code})
            if response.status_code != 200:
                raise SystemExit("Код отклонён. Существующая конфигурация не изменена.")
            candidate = {**config, "token": response.json()["token"]}
        subprocess.run(["systemctl", "stop", "arena-whisper-worker"], check=True)
        shutil.copy2(path, path.with_name(f"worker-{int(time.time())}.backup"))
        temporary = path.with_suffix(".tmp")
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as out:
            json.dump(candidate, out)
        shutil.chown(temporary, user="arena-worker", group="arena-worker")
        temporary.replace(path)
        subprocess.run(["systemctl", "start", "arena-whisper-worker"], check=True)
        print("Подключение обновлено. Дождитесь готовности в админке.")
    elif args.command == "logs":
        subprocess.run(["journalctl", "-u", "arena-whisper-worker", "-n", "100", "--no-pager"], check=True)
    elif args.command != "doctor":
        subprocess.run(["systemctl", args.command, "arena-whisper-worker"], check=True)
    else:
        # Avoid allocating a second model on the GPU beside the running service.
        config = json.loads((home / "private/worker.json").read_text(encoding="utf-8"))
        import httpx
        with httpx.Client(base_url=config["url"], headers={"Authorization": "Bearer " + config["token"]}, timeout=20) as client:
            response = client.get("/api/stt-workers/status")
            response.raise_for_status()
            state = response.json()
        print(json.dumps(state, ensure_ascii=False, indent=2))
        if not state["ready"]:
            raise SystemExit("Worker не готов. Проверьте status и logs; готовность требует реального теста GPU.")


if __name__ == "__main__":
    main()
