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


def test_dns_failure_returns_to_menu_without_crashing(monkeypatch, capsys):
    from install import network, setup
    answers = iter(["2", "missing.example.org", "1"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *a, **k: (_ for _ in ()).throw(network.socket.gaierror(-2, "not found")))
    monkeypatch.setattr(setup, "free_port", lambda *a: True)
    result = network.choose_address()
    assert result["tls_mode"] == "local"
    assert result["url"] == "http://127.0.0.1:8080"
    output = capsys.readouterr().out
    assert "A-запись" in output and "Свой сертификат не исправляет DNS" in output


def test_internal_ip_requires_confirmation_and_preserves_ipv6(monkeypatch):
    from install import network, setup
    answers = iter(["3", "2001:db8::12", "да"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *a, **k: [(10, 1, 6, "", ("2001:db8::12", 443, 0, 0))])
    monkeypatch.setattr(setup, "free_port", lambda *a: True)
    result = network.choose_address()
    assert result["tls_mode"] == "internal"
    assert result["url"] == "https://[2001:db8::12]"


def test_public_domain_rejects_private_dns(monkeypatch, capsys):
    from install import network, setup
    answers = iter(["2", "private.example.org", "1"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("10.130.0.34", 443))])
    monkeypatch.setattr(setup, "free_port", lambda *a: True)
    assert network.choose_address()["tls_mode"] == "local"
    assert "внутренний адрес" in capsys.readouterr().out


def test_caddy_internal_public_and_local_are_separate(tmp_path):
    from install.setup import caddy_config
    caddy_config(tmp_path, tmp_path, "192.168.1.2", 443, 8100, "internal")
    contents = (tmp_path / "Caddyfile").read_text()
    assert "tls internal" in contents and "https://192.168.1.2" in contents
    assert "skip_install_trust" in contents
    caddy_config(tmp_path, tmp_path, "example.org", 443, 8100)
    assert "tls internal" not in (tmp_path / "Caddyfile").read_text()
    caddy_config(tmp_path, tmp_path, "", 8080, 8100)
    assert "bind 127.0.0.1" in (tmp_path / "Caddyfile").read_text()


def test_internal_tls_keeps_certificate_and_hostname_validation(tmp_path):
    import ssl
    from datetime import datetime, timedelta, timezone
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    from install.network import tls_context, root_certificate, certificate_info
    with pytest.raises(RuntimeError, match="ещё не создан"):
        tls_context(tmp_path, {"tls_mode": "internal"})
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Installation test CA")])
    now = datetime.now(timezone.utc)
    certificate = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now).not_valid_after(now + timedelta(days=1)).add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True).sign(key, hashes.SHA256())
    path = root_certificate(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    context = tls_context(tmp_path, {"tls_mode": "internal"})
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
    assert context.cert_store_stats()["x509_ca"] == 1
    certificate_info(tmp_path, {"tls_mode": "internal"})
    assert (tmp_path / "certificates/arena-root.crt").read_bytes() == path.read_bytes()
    assert not list((tmp_path / "certificates").glob("*.key"))


def test_bad_certificate_config_rolls_back_without_saving(monkeypatch, tmp_path):
    import subprocess
    from install import arena
    previous = b"previous valid caddy config"
    (tmp_path / "Caddyfile").write_bytes(previous)
    metadata = {"release": str(tmp_path), "domain": "example.org", "port": 443, "api_port": 8100}
    calls = []
    def run(command, **kwargs):
        calls.append(command)
        if "validate" in command:
            raise subprocess.CalledProcessError(1, command)
    monkeypatch.setattr(arena.subprocess, "run", run)
    with pytest.raises(subprocess.CalledProcessError):
        arena.apply_certificate_mode(tmp_path, metadata, "internal")
    assert (tmp_path / "Caddyfile").read_bytes() == previous
    assert not (tmp_path / "installation.json").exists()
