"""Names for observable communication practices, never personality scores."""

SKILLS = {
    "interests": {"title": "Интересы и потребности", "description": "Выяснять, что важно участникам и какие причины стоят за их просьбами."},
    "questions": {"title": "Уточняющие вопросы", "description": "Проверять предположения и собирать недостающие факты до решения."},
    "listening": {"title": "Внимательное слушание", "description": "Уточнять смысл услышанного и давать собеседнику возможность поправить ваше понимание."},
    "boundaries": {"title": "Личные границы", "description": "Объяснять свои ограничения, отказывать и запрашивать согласие без давления."},
    "options": {"title": "Поиск вариантов", "description": "Предлагать несколько выполнимых способов действия с учётом интересов участников."},
    "criteria": {"title": "Общие критерии", "description": "Договариваться о наблюдаемых условиях, по которым можно проверить предложение."},
    "commitment": {"title": "Договорённости", "description": "Уточнять ответственность, сроки и способ проверки принятых обязательств."},
    "deescalation": {"title": "Снижение напряжения", "description": "Замечать напряжение, выбирать подходящий момент разговора и возвращаться к вопросу без нападения."},
    "perspective": {"title": "Другая точка зрения", "description": "Рассматривать ограничения другого участника, сохраняя ответственность каждого за свои действия."},
}


def skill_catalog() -> list[dict]:
    return [{"id": identifier, **value} for identifier, value in SKILLS.items()]


def is_negotiation_decision(node_id: str | None) -> bool:
    # Opening or skipping an optional scene is navigation, not observed communication.
    return node_id != "extra_invitation"
