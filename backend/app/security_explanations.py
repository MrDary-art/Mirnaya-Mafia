"""Human-readable security signals and allowlisted audit excerpts, not attack verdicts."""
import json
from sqlalchemy import select
from app.deployment_models import AdminAudit

SIGNALS = {
    "login_failures": (5, "Несколько неудачных попыток входа",
        "Сервер отклонил вход или ограничил частоту попыток входа. Возможны неверные данные, забытый пароль или автоматический подбор.",
        "Сверьте время с действиями пользователя. Повторные ошибки сами по себе не доказывают подбор пароля."),
    "confirmation_failures": (5, "Несколько ошибок подтверждения действия",
        "Не удалось подтвердить смену пароля или адреса разработчика: код мог быть неверным, просроченным или уже использованным.",
        "Уточните, выполнял ли администратор это действие. При необходимости запросите новый код."),
    "unauthorized": (10, "Запросы без действующего входа",
        "API вернул HTTP 401: запросы пришли без действующего сеанса. Так бывает после выхода, истечения токена или при автоматических запросах.",
        "Проверьте, не осталась ли открытой вкладка с истёкшим входом. Посмотрите повторяющиеся адреса запросов."),
    "forbidden": (10, "Сервер несколько раз отказал в доступе",
        "API вернул HTTP 403: запрошенное действие недоступно. Причиной могут быть права аккаунта или правила сайта, например закрытая регистрация.",
        "Проверьте адреса API и права пользователя. Отказ в доступе не означает, что данные были получены."),
    "not_found": (20, "Частые запросы к отсутствующим адресам или данным",
        "API вернул HTTP 404: адрес или запрошенный объект не найден. Возможны устаревшие ссылки, удалённые данные или автоматический перебор адресов.",
        "Сравните запросы с обычной работой сайта. Ошибка 404 не позволяет автоматически отличить старую ссылку от сканирования."),
    "rate_limit": (3, "Несколько срабатываний ограничения частоты",
        "API вернул HTTP 429: запросы поступали чаще разрешённого. Причиной могут быть частые нажатия, повторные запросы приложения или автоматическая нагрузка.",
        "Проверьте повторяющиеся запросы и ошибки клиента. Этот сигнал сам по себе не подтверждает DDoS."),
}
RESULTS = {400: "Подтверждение отклонено", 401: "Требуется действующий вход", 403: "Действие запрещено", 404: "Адрес или объект не найден", 429: "Превышен лимит запросов"}


def explanation(row):
    threshold, title, reason, recommendation = SIGNALS.get(row.kind, (
        None, "Событие требует ручной проверки", "Для этого типа события пока нет подробного описания.",
        "Посмотрите сохранённые запросы. Не делайте вывод об атаке только по названию события."))
    return {"title": title, "reason": reason, "recommendation": recommendation,
        "trigger": f"Число событий с одного IP за скользящее окно 5 минут: {row.count}. Порог срабатывания: {threshold}." if threshold else "Правило срабатывания для старого типа события неизвестно."}


def safe_route(value, known_routes):
    # Never echo unknown paths: a scanner may put credentials or personal data in them.
    if isinstance(value, str):
        if value in known_routes:
            return value
        # Some FastAPI versions store the router template before its /api mount prefix.
        if "/api" + value in known_routes:
            return "/api" + value
    return "/api/[неизвестный адрес скрыт]"


def alert_item(row, known_routes):
    return {**{key: getattr(row, key) for key in ("id", "kind", "ip", "severity", "count", "first_seen", "last_seen", "acknowledged_at")},
        "route": safe_route(row.route, known_routes), **explanation(row)}


async def evidence(db, row, known_routes):
    start, end = row.last_seen - 300, row.last_seen
    # Match the same rolling window and event kind as the detector. Bound work and output.
    rows = (await db.scalars(select(AdminAudit).where(AdminAudit.action == "security." + row.kind,
        AdminAudit.created >= start, AdminAudit.created <= end).order_by(AdminAudit.created.desc(), AdminAudit.id.desc()).limit(2001))).all()
    items = []
    matched = 0
    for entry in rows[:2000]:
        try:
            detail = json.loads(entry.detail)
        except (ValueError, TypeError):
            continue
        if not isinstance(detail, dict) or detail.get("ip") != row.ip:
            continue
        matched += 1
        if len(items) >= 50:
            continue
        status = detail.get("status")
        method = detail.get("method")
        items.append({"id": entry.id, "created": entry.created,
            "method": method if isinstance(method, str) and method in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"} else "—",
            "route": safe_route(detail.get("route"), known_routes),
            "status": status if type(status) is int and status in RESULTS else None,
            "result": RESULTS.get(status, "Код ответа не сохранён") if type(status) is int else "Код ответа не сохранён"})
    return {"alert_id": row.id, "window_start": start, "window_end": end, "items": items,
        "matched": matched, "truncated": len(rows) > 2000 or matched > len(items),
        "notice": "Выдержка из журнала API: тот же IP, тип события и 5 минут перед последним срабатыванием. Максимум 50 запросов. Тела, заголовки, параметры URL и неизвестные адреса скрыты. Это не полный сетевой журнал и не доказательство атаки."}
