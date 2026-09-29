"""Optional SMTP question shared by first installation and later updates."""
import getpass
import smtplib

from app.db import SessionLocal
from app.installation import cipher, config_lock, read_config, save_config
from app.mail_service import check_smtp, mail_enabled, normalized_email


def yes(value: str) -> bool:
    return value.strip().casefold() in {"да", "д", "yes", "y"}


async def configure_mail_interactive() -> None:
    async with SessionLocal() as db:
        _, value = await read_config(db)
        if mail_enabled(value):
            print("Почта уже настроена. Изменить её можно в админке → Настройки → Почта.")
            return
    print("Почта нужна для подтверждения адреса, восстановления пароля и приглашений 1×1.")
    if not yes(input("Подключить почту сейчас? [да/нет, по умолчанию нет]: ")):
        print("Почта пропущена. Позже её можно подключить в админке → Настройки → Почта.")
        return
    while True:
        try:
            mirea = yes(input("У вас почта МИРЭА? [да/нет]: "))
            default_host = "smtp.mirea.ru" if mirea else ""
            host = input(f"SMTP-сервер{f' [{default_host}]' if default_host else ''}: ").strip().lower() or default_host
            if not host or any(c.isspace() for c in host):
                raise ValueError("Укажите адрес SMTP-сервера")
            security = input("Защита: 1 — STARTTLS, 2 — SSL/TLS [1]: ").strip()
            if security not in {"", "1", "2"}:
                raise ValueError("Выберите 1 или 2")
            security = "ssl" if security == "2" else "starttls"
            default_port = 465 if security == "ssl" else 587
            port = int(input(f"Порт [{default_port}]: ").strip() or default_port)
            if not 1 <= port <= 65535:
                raise ValueError("Порт должен быть от 1 до 65535")
            sender = normalized_email(input("Адрес отправителя: "))
            username = input(f"Логин SMTP [{sender}]: ").strip() or sender
            password = getpass.getpass("Пароль почтового ящика (ввод не отображается): ")
            if not password:
                raise ValueError("Укажите пароль почтового ящика")
            mail = {"host": host, "port": port, "security": security,
                    "sender": sender, "username": username, "password": password}
            print("Проверяем защищённое подключение к SMTP…")
            await check_smtp(mail)
            async with config_lock:
                async with SessionLocal() as db:
                    revision, _ = await read_config(db)
                    await save_config(db, revision, {"mail": {**mail,
                        "password": cipher().encrypt(password.encode()).decode(), "enabled": True}},
                        None, "installer.mail_configured")
            print("Почта подключена. Отправьте тестовое письмо себе в админке → Настройки → Почта.")
            return
        except (OSError, smtplib.SMTPException, TimeoutError, ValueError) as exc:
            print(f"Почта не подключена: {type(exc).__name__}. Проверьте SMTP, порт, защиту и пароль.")
            if not yes(input("Попробовать ещё раз? [да/нет]: ")):
                print("Установка продолжится без почты. Подключить её можно в админке.")
                return
