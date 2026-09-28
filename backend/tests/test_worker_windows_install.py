"""The Windows worker service must keep its token out of service arguments."""

import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from install import worker_setup


def test_windows_worker_service_has_restricted_token_file(tmp_path, monkeypatch):
    home = tmp_path / "worker"
    release = tmp_path / "release"
    (release / "install").mkdir(parents=True)
    (release / "install/tools.json").write_text(
        json.dumps({"winsw-windows": {"url": "https://example.test/winsw", "bytes": 1, "sha256": "0" * 64}}),
        encoding="utf-8",
    )
    (home / "private").mkdir(parents=True)
    config = home / "private/worker.json"
    config.write_text('{"token":"secret-test-token"}', encoding="utf-8")
    commands = []

    def fake_download(_entry, target):
        target.write_bytes(b"winsw")

    def fake_run(command, **_kwargs):
        commands.append([str(part) for part in command])
        return SimpleNamespace(returncode=1 if command[:2] == ["sc.exe", "query"] else 0)

    monkeypatch.setattr(worker_setup, "download", fake_download)
    monkeypatch.setattr(worker_setup.subprocess, "run", fake_run)
    worker_setup.install_windows_service(home, release, home / "runtime/Scripts/python.exe", config)

    xml = (home / "services/arena-whisper-worker.xml").read_text(encoding="utf-8")
    assert "secret-test-token" not in xml
    assert "LocalService" in xml
    assert str(config) in xml
    assert any(command[0] == "icacls" and "*S-1-5-19:(OI)(CI)RX" in command for command in commands)
    assert any(command[-1] == "install" for command in commands)
    assert any(command[-1] == "start" for command in commands)
