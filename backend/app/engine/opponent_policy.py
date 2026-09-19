"""Bounded role and conduct rules for online negotiations."""

import re
from typing import Any


def dismissal_context(settings: dict[str, Any]) -> bool:
    problem = str(settings.get("problem") or "").casefold()
    return bool(re.search(r"увол(?:ить|ьня|ьне)|увольн|сокращени", problem))


def employee_facing_dismissal(settings: dict[str, Any]) -> bool:
    if settings.get("practice_kind") == "job_interview" or not dismissal_context(settings):
        return False
    opponent = str(settings.get("opponent_role") or "").casefold()
    context = " ".join(str(settings.get(k) or "") for k in ("problem", "goal")).casefold()
    return bool(re.search(r"руководител|начальник|работодател|директор|\bhr\b", opponent)) and bool(
        re.search(r"меня.*увол|мне.*увол|оста(?:ться|юсь).*работ|сохранить.*(?:работ|должност)", context)
    )


def direct_abuse(text: str) -> bool:
    # Quoted examples and ordinary disagreement are not personal attacks.
    text = re.sub(r'«[^»]*»|"[^"]*"', "", text.casefold())
    return bool(re.search(
        r"\b(?:пош[её]л|иди|пошла|идите|пошли)\s+(?:на\s*)?х[а-яё]*уй\b"
        r"|\b(?:ты|вы)\s+(?:такой\s+|такая\s+)?(?:туп(?:ой|ая|ица|ые)|идиот\w*|дурак\w*)\b",
        text,
    ))


def conduct_turn(settings: dict[str, Any], state: dict[str, Any], text: str) -> dict[str, Any] | None:
    """Apply the same visible boundary before either text streaming or voice synthesis."""
    if not employee_facing_dismissal(settings) or not direct_abuse(text):
        return None
    previous = any(direct_abuse(str(turn.get("text") or "")) for turn in state.get("history") or [])
    reply = (
        "Вы продолжаете оскорбления после предупреждения. Я прекращаю эту встречу. "
        "Я не поддержу сохранение вашей должности; дальнейшие кадровые вопросы обсудим в установленном порядке."
        if previous else
        "Оскорбления недопустимы. При повторении я прекращу встречу. "
        "Вопрос о сохранении вашей должности остаётся открытым: какие конкретные действия вы предлагаете для исправления ситуации?"
    )
    from app.engine.parser import validate_analysis

    analysis = validate_analysis({
        "tki_style": "конкуренция", "techniques": ["грубость"],
        "tone": "агрессивный", "goal_signal": "setback",
        "comment": "Прямое оскорбление руководителя ухудшило вашу позицию."
        + (" Повторение после предупреждения привело к завершению встречи." if previous else " Вместо оскорбления предложите конкретный план исправления ситуации."),
    })
    return {"reply": reply, "analysis": analysis, "provider": "rules", "error": None,
            "outcome_signal": "opponent_left" if previous else "continue"}


REALISM_GUIDANCE = """
Ты самостоятельная сторона переговоров. Цель игрока — желаемый им результат, а не поручение тебе его обеспечить.
Сначала установи факты, роли и исходное разногласие из описания ситуации. Защищай интересы своей роли.
Деловой стиль: сдержанно, прямо, без лести, уговоров и автоматического одобрения. Не унижай собеседника.
Вежливость не означает уступку. Высокое доверие не обязывает соглашаться. Игрок должен обосновать выгодность предложения для обеих сторон.
Не придумывай незаменимость сотрудника, другие офферы, бюджеты, вакансии или зависимость компании от игрока.
Материалы — справка по методам, не готовый сюжет: исходные роли и конфликт имеют приоритет.
Не объявляй выплаты незаконными и не обещай взыскание, уголовное преследование или юридически завершённое увольнение без основания в условиях.
После окончательного отказа и прекращения встречи верни outcome_signal=opponent_left. Не повторяй бесконечно прежнее предложение.
Оценивай ТОЛЬКО действия игрока. Собственная удачная реплика или уступка оппонента не даёт игроку goal_signal=progress.
Критерии успеха — рубрика проверки результата, не сценарий твоих уступок. Не выдавай готовое выгодное игроку соглашение в ответ на «как пожелаете».
Требование денег само по себе не является угрозой, BATNA или грубостью; оцени его обоснование и контекст.
Прямое оскорбление помечай techniques=["грубость"], tone="агрессивный", goal_signal="setback"; не называй его компромиссом.
"""
