import hashlib
import importlib.util
import json
import sys
import zipfile
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from install.setup import domain_name, unpack_release, systemd_quote
from install.resources import valid
from worker.worker import backend_url


def test_domain_and_worker_url_validation():
    assert domain_name("пример.рф") == "xn--e1afmkfd.xn--p1ai"
    for bad in ["https://example.org", "example.org/a", "example.org;rm", "x\nexample.org", "user@example.org"]:
        with pytest.raises(ValueError): domain_name(bad)
    for bad in ["http://example.org", "https://localhost", "https://user:password@example.org", "https://example.org/path", "https://example.org?token=secret"]:
        with pytest.raises(ValueError): backend_url(bad)
    assert backend_url("http://127.0.0.1:8003", True) == "http://127.0.0.1:8003"


def bundle(path, files, checksums=None):
    meta = {"version": "test-1", "files": checksums or {k: hashlib.sha256(v).hexdigest() for k,v in files.items()}}
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("release.json", json.dumps(meta))
        for name, data in files.items(): z.writestr(name, data)


def test_release_verification_and_repeat(tmp_path):
    archive = tmp_path / "release.zip"
    bundle(archive, {"frontend/dist/index.html": b"test"})
    first = unpack_release(archive, tmp_path / "installation")
    assert (first / "frontend/dist/index.html").read_bytes() == b"test"
    assert unpack_release(archive, tmp_path / "installation") == first


def test_archive_traversal_and_corrupt_hash_rejected(tmp_path):
    archive = tmp_path / "release.zip"
    bundle(archive, {"../../outside.txt": b"bad"})
    with pytest.raises(ValueError): unpack_release(archive, tmp_path / "installation")
    assert not (tmp_path / "outside.txt").exists()
    bundle(archive, {"safe.txt": b"wrong"}, {"safe.txt": "0" * 64})
    with pytest.raises(ValueError): unpack_release(archive, tmp_path / "installation")


def test_pointer_is_not_a_valid_model(tmp_path):
    path = tmp_path / "model.bin"
    path.write_text("version https://git-lfs.github.com/spec/v1\n")
    assert not valid(path, {"bytes": 75000000, "sha256": "0" * 64})


def test_service_paths_preserve_spaces_and_percent():
    assert systemd_quote('/opt/Мой сайт 100%/python') == '"/opt/Мой сайт 100%%/python"'
