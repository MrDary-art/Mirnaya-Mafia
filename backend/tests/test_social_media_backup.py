"""Installer backups keep SQLite metadata and persistent social media together."""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

from app.config import settings

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from install.arena import backup


@pytest.fixture
def installation(tmp_path, monkeypatch):
    site = tmp_path / "site"
    (site / "private").mkdir(parents=True)
    (site / "data").mkdir()
    (site / "private" / "arena.env").write_text("DB_PATH=arena.db\n", encoding="utf-8")
    key = site / "private" / "installation.key"
    key.write_text("test-key-only", encoding="utf-8")
    db_path = site / "data" / "arena.db"
    with sqlite3.connect(db_path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("CREATE TABLE preserved (id INTEGER PRIMARY KEY, value TEXT)")
        db.execute("INSERT INTO preserved VALUES (1, 'existing profile')")
    monkeypatch.setattr(settings, "db_path", str(db_path))
    monkeypatch.setattr(settings, "data_dir", str(site / "data"))
    monkeypatch.setattr(settings, "installation_key_file", str(key))
    monkeypatch.setattr(settings, "social_media_path", "")
    return site


def test_backup_includes_originals_thumbnails_and_database(installation):
    media = installation / "data" / "private" / "social-media"
    media.mkdir(parents=True)
    (media / "image.webp").write_bytes(b"test-image")
    (media / "thumb.webp").write_bytes(b"test-thumbnail")
    destination = backup(installation)
    assert (destination / "social-media" / "image.webp").read_bytes() == b"test-image"
    assert (destination / "social-media" / "thumb.webp").read_bytes() == b"test-thumbnail"
    with sqlite3.connect(destination / "arena.db") as db:
        assert db.execute("SELECT value FROM preserved").fetchone()[0] == "existing profile"
    metadata = json.loads((destination / "metadata.json").read_text())
    assert metadata["protocol"] == 2 and metadata["social_media"] == "social-media"
    assert (destination / "installation.key").read_text() == "test-key-only"


def test_old_installation_without_media_still_backs_up(installation):
    destination = backup(installation)
    assert json.loads((destination / "metadata.json").read_text())["social_media"] is None
    assert (destination / "arena.db").is_file()


def test_custom_persistent_media_path_is_included(installation, tmp_path, monkeypatch):
    media = tmp_path / "persistent-media"
    media.mkdir()
    (media / "clip.mp4").write_bytes(b"test-video")
    monkeypatch.setattr(settings, "social_media_path", str(media))
    destination = backup(installation)
    assert (destination / "social-media" / "clip.mp4").read_bytes() == b"test-video"


def test_release_uses_actual_migration_head_and_excludes_runtime_media(tmp_path, monkeypatch):
    import zipfile
    from install import build_release
    source = tmp_path / "source"
    required = ["frontend/dist/index.html", "install/requirements.lock", "install/worker-requirements.lock", "install/resources.json", "install/tools.json", "worker/smoke.pcm"]
    for name in required:
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"test-build-file")
    versions = source / "backend/alembic/versions"
    versions.mkdir(parents=True)
    (versions / "0100_base.py").write_text("revision = '0100'\ndown_revision = None\n", encoding="utf-8")
    (versions / "0101_next.py").write_text("revision = '0101'\ndown_revision = '0100'\n", encoding="utf-8")
    private = source / "data/private/social-media/secret-video.mp4"
    private.parent.mkdir(parents=True)
    private.write_bytes(b"private-test-video")
    authored = source / "backend/app/data/scenarios/example.json"
    authored.parent.mkdir(parents=True)
    authored.write_text("{}", encoding="utf-8")
    compiled = authored.parent / "__pycache__/example.pyc"
    compiled.parent.mkdir()
    compiled.write_bytes(b"compiled-cache")
    monkeypatch.setattr(build_release, "ROOT", source)
    monkeypatch.setattr(build_release.subprocess, "check_output", lambda command, **kwargs: "testcommit\n" if "rev-parse" in command else "")
    archive = build_release.build("qa-test", tmp_path / "output")
    with zipfile.ZipFile(archive) as release:
        manifest = json.loads(release.read("release.json"))
        assert manifest["schema_revision"] == "0101"
        assert "backend/app/data/scenarios/example.json" in release.namelist()
        assert not any("secret-video" in path or "__pycache__" in path for path in release.namelist())
