"""Installation network choices and explicit, verified local-CA support."""
import hashlib
import ipaddress
import json
import shutil
import socket
import ssl
import time
from pathlib import Path


def tls_mode(metadata):
    return metadata.get("tls_mode", "public" if metadata.get("domain") else "local")


def root_certificate(home):
    return Path(home) / "data/caddy/pki/authorities/local/root.crt"


def tls_context(home, metadata):
    # Trust only this installation's CA for this client, never disable verification.
    if tls_mode(metadata) == "internal":
        certificate = root_certificate(home)
        if not certificate.is_file():
            raise RuntimeError("Локальный сертификат ещё не создан. Проверьте arena logs.")
        return ssl.create_default_context(cafile=str(certificate))
    return ssl.create_default_context()


def certificate_info(home, metadata):
    if tls_mode(metadata) != "internal":
        print("Доменный сертификат выпускается и продлевается автоматически." if metadata.get("domain") else "Локальный доступ: HTTPS не требуется для localhost.")
        return
    source = root_certificate(home)
    if not source.is_file():
        raise RuntimeError("Сертификат пока не создан. Выполните arena status и arena logs.")
    target = Path(home) / "certificates/arena-root.crt"
    target.parent.mkdir(exist_ok=True)
    shutil.copyfile(source, target)
    der = ssl.PEM_cert_to_DER_cert(source.read_text(encoding="ascii"))
    fingerprint = hashlib.sha256(der).hexdigest().upper()
    print(f"Сертификат для вашего компьютера: {target}")
    print("SHA-256: " + ":".join(fingerprint[i:i+2] for i in range(0, len(fingerprint), 2)))
    print("Передайте только arena-root.crt через SSH/SCP. Закрытые .key не копируйте.")
    print("Windows: certutil -user -addstore Root .\\arena-root.crt")
    print("Добавьте сертификат только на устройства для тестирования, затем перезапустите браузер.")
    print("Для посетителей без этой настройки нужен домен с публичным HTTPS.")


def choose_address():
    from install.setup import domain_name, free_port
    while True:
        print("\nКак открыть сайт?\n1. Только на этом компьютере (или через SSH-туннель)\n2. Домен — бесплатный HTTPS для всех посетителей\n3. IP / внутренняя сеть — тестовый HTTPS со своим сертификатом")
        mode = input("Выберите 1, 2 или 3 [2]: ").strip() or "2"
        if mode == "1":
            port = next((p for p in range(8080, 8090) if free_port(p)), None)
            if port is None:
                print("Порты 8080–8089 заняты. Освободите порт и повторите."); continue
            print("Доступ только на сервере. На своём ПК используйте SSH-туннель из инструкции.")
            return {"domain": "", "port": port, "tls_mode": "local", "url": f"http://127.0.0.1:{port}"}
        if mode not in {"2", "3"}:
            print("Введите номер 1, 2 или 3."); continue
        value = input("Домен (например arena.example.ru): " if mode == "2" else "Доступный с вашего ПК IP или внутренний домен: ").strip()
        try:
            try:
                ip = ipaddress.ip_address(value)
            except ValueError:
                host = domain_name(value)
            else:
                if mode == "2":
                    raise ValueError("Для этого варианта нужен домен. Для IP выберите пункт 3.")
                if ip.is_unspecified or ip.is_multicast or ip.is_loopback:
                    raise ValueError("Укажите адрес сервера, доступный с вашего ПК; для localhost выберите 1.")
                host = str(ip)
            addresses = sorted({item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
        except socket.gaierror:
            print(f"Домен «{value}» не найден через DNS этого сервера.")
            print("Проверьте написание и A-запись домена: она должна указывать на внешний IP сервера.")
            print("Если есть AAAA-запись, IPv6 тоже должен вести на этот сервер. После изменения DNS подождите и повторите.")
            print("Свой сертификат не исправляет DNS. Можно выбрать пункт 3 и ввести доступный IP.")
            continue
        except (ValueError, UnicodeError) as exc:
            print(str(exc)); continue
        print("DNS / адрес: " + ", ".join(addresses))
        if mode == "2" and any(not ipaddress.ip_address(addr).is_global for addr in addresses):
            print("В DNS есть внутренний адрес. Для публичного HTTPS настройте внешний IP либо выберите пункт 3.")
            continue
        if not free_port(80, "0.0.0.0") or not free_port(443, "0.0.0.0"):
            print("Порты 80/443 заняты. Другой сайт не изменён. Освободите их или выберите пункт 1.")
            continue
        if mode == "3":
            print("Сертификат создастся автоматически. Чтобы браузер не предупреждал, нужно доверить его на каждом своём устройстве.")
            if input("Подходит для вашего тестирования? [да/нет]: ").strip().lower() not in {"да", "yes", "y"}:
                continue
        else:
            print("Сертификат заранее не нужен: Caddy выпустит его сам. Откройте TCP 80/443 в панели сервера и брандмауэре.")
            if input("Указанные адреса ведут на этот сервер? [да/нет]: ").strip().lower() not in {"да", "yes", "y"}:
                continue
        address = f"[{host}]" if ":" in host else host
        return {"domain": host, "port": 443, "tls_mode": "public" if mode == "2" else "internal", "url": "https://" + address}


def save_network_metadata(home, metadata):
    target = Path(home) / "installation.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(metadata), encoding="utf-8")
    temporary.replace(target)


def wait_for_https(home, metadata, seconds=45):
    import httpx
    deadline = time.monotonic() + seconds
    while True:
        try:
            with httpx.Client(timeout=4, verify=tls_context(home, metadata)) as client:
                if client.get(metadata["url"] + "/api").status_code == 200:
                    return True
        except (httpx.HTTPError, RuntimeError, OSError):
            pass
        if time.monotonic() >= deadline:
            return False
        time.sleep(2)
