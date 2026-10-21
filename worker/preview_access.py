"""Optional access to Arena's preview gate; never persist the plaintext password."""
import getpass
import hashlib
import re


def preview_headers(config):
    value = config.get("preview_cookie_sha256", "")
    if not value:
        return {}
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
        raise ValueError("Invalid preview cookie in worker configuration")
    return {"Cookie": "__Host-arena_preview=" + value}


def is_preview_gate(response):
    return (response.status_code == 403
            and "text/html" in response.headers.get("content-type", "").lower()
            and "__Host-arena_preview" in response.text)


def ask_preview_cookie():
    password = getpass.getpass("Пароль заглушки сайта (ввод скрыт): ").strip()
    if not password:
        raise ValueError("Пароль заглушки не введён")
    return hashlib.sha256(password.encode("utf-8")).hexdigest()
