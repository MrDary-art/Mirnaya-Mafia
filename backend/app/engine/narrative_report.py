"""Evidence-led coaching notes for scenario and online sessions.

The existing game metrics and verdicts remain authoritative.  This module only
turns recorded actions into readable feedback; it never changes scoring.
"""

from __future__ import annotations

from typing import Any

from app.engine.grounding import validated_agreement, resolve_quote, acceptance_action


PON_URL = "https://www.pon.harvard.edu/daily/negotiation-skills-daily/principled-negotiation-focus-interests-create-value/"
PRINCIPLES = {
    "interests": ("Интересы за позицией", PON_URL, "Уточняйте причину требования: она может открыть варианты помимо немедленной уступки."),
    "criteria": ("Объективные критерии", PON_URL, "Сравнивайте предложения по одинаковым проверяемым условиям."),
    "options": ("Варианты решения", PON_URL, "Ищите несколько способов учесть интересы обеих сторон, прежде чем выбирать один."),
}


def _text(value: Any, limit: int = 900) -> str:
    return str(value or "").strip()[:limit]


def _status(report: dict[str, Any], state: dict[str, Any] | None = None) -> str:
    outcome = report.get("outcome")
    signal = (state or {}).get("outcome_signal")
    if (signal == "agreement" and validated_agreement((state or {}).get("agreement_evidence"), (state or {}).get("history") or [])) or outcome in {"goal_achieved", "win_win", "win", "process_ok", "excellent", "good", "online_success"}:
        return "Достигнута"
    if outcome in {"goal_failed", "fail", "loss", "failure", "conflict", "needs_work"}:
        return "Не достигнута"
    if report.get("ending_id", "").startswith("online_"):
        return "Результат не подтверждён"
    return "Частично"


def _principle(techniques: list[str] | None) -> dict[str, str] | None:
    names = " ".join(techniques or []).lower()
    key = (
        "criteria" if "критери" in names else
        "interests" if any(word in names for word in ("вопрос", "интерес", "слушан")) else
        "options" if any(word in names for word in ("вариант", "сотрудничеств")) else None
    )
    if not key:
        return None
    label, url, explanation = PRINCIPLES[key]
    return {"label": label, "url": url, "explanation": explanation}


def _section(turn: int, item: dict[str, Any], kind: str, title: str, body: str) -> dict[str, Any]:
    section = {
        "id": f"moment-{turn}", "kind": kind, "title": title,
        "body": _text(body, 1400),
        "evidence": {"turn": turn, "speaker": "Вы", "quote": _text(item.get("text"), 1000)},
    }
    alternative = _text(item.get("alternative"), 500)
    if item.get("context_before"):
        section["context"] = {"position": "before", "text": _text(item["context_before"], 550)}
    if kind == "improve" and alternative:
        section["alternative"] = alternative
    principle = _principle(item.get("techniques"))
    if principle:
        section["principle"] = principle
    return section


def scenario_narrative(report: dict[str, Any], history: list[dict[str, Any]], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    """Use authored option comments and recorded choices, never inferred traits."""
    status = _status(report)
    goal = _text(report.get("goal"), 220)
    scored = []
    steps = {step.get("id"): step for step in (scenario or {}).get("steps", [])}
    for turn, item in enumerate(history, 1):
        if not _text(item.get("text")):
            continue
        item = dict(item)
        item["context_before"] = steps.get(item.get("step_id"), {}).get("opponent_line")
        delta = item.get("delta") or {}
        score = sum(float(delta.get(key) or 0) for key in ("trust", "goal", "control", "eq"))
        scored.append((turn, item, score))
    positive = max((row for row in scored if row[2] > 0), key=lambda row: row[2], default=None)
    challenge = min((row for row in scored if row[2] < 0), key=lambda row: row[2], default=None)
    selected = []
    for row, kind, title in (
        (positive, "strength", "Ход, который помог"),
        (challenge, "improve", "Момент для следующей попытки"),
    ):
        if row:
            turn, item, _ = row
            selected.append(_section(turn, item, kind, title, item.get("comment") or "Этот ход повлиял на развитие сценария."))
    if scored and scored[-1][0] not in {s["evidence"]["turn"] for s in selected}:
        turn, item, _ = scored[-1]
        selected.append(_section(turn, item, "sequence", "Как вы завершили разговор", item.get("comment") or "Это последнее выбранное решение в этой попытке."))
    selected.sort(key=lambda item: item["evidence"]["turn"])
    next_step = (
        challenge[1].get("alternative") if challenge else
        "Сохраните удачный ход и проверьте, подходит ли он в похожей ситуации."
    )
    requirements = []
    for criterion in report.get("corporate_criteria") or []:
        label = _text(criterion, 300)
        low = label.lower()
        evidence = None
        for turn, item, _ in scored:
            techniques = " ".join(item.get("techniques") or []).lower()
            choice = _text(item.get("text"), 500).lower()
            if (("интерес" in low and ("вопрос" in techniques or "интерес" in choice)) or
                ("следующ" in low and "следующ" in choice) or
                ("критери" in low and "критери" in techniques)):
                evidence = {"turn": turn, "quote": _text(item.get("text"), 500)}
                break
        requirements.append({"label": label,
                             "status": "Подтверждено выбранным ходом" if evidence else "По записи не подтверждено",
                             "evidence": evidence})
    return {
        "status": status,
        "headline": _text(report.get("verdict"), 180) or "Разбор вашей попытки",
        "lead": (f"Цель практики: {goal}. " if goal else "") + f"Итог сценария: {_text(report.get('verdict'), 150).lower()}." if report.get("verdict") else "Разбор выбранных решений.",
        "takeaway": "Выберите один момент ниже и попробуйте изменить его в следующей попытке." if challenge else "В этой попытке нет подтверждённой критической ошибки.",
        "sections": selected,
        "requirements": requirements,
        "next_step": _text(next_step, 500),
        "source": "scenario",
    }


def _grounded_quote(item: dict[str, Any], proposed: Any) -> str | None:
    actual = _text(item.get("text"), 3000)
    quote = _text(proposed, 1000)
    if not actual or not quote or quote.casefold() not in actual.casefold():
        return None
    return actual[actual.casefold().find(quote.casefold()):][:len(quote)]


def online_narrative(
    report: dict[str, Any], state: dict[str, Any], settings: dict[str, Any],
    generated: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Accept generated observations only when their quoted turn exists."""
    history = state.get("history") or []
    status = "Достигнута" if validated_agreement(state.get("agreement_evidence"), state.get("history") or []) else "Результат не подтверждён"
    goal = _text(settings.get("goal"), 220)
    title = _text(report.get("scenario_title"), 120) or "Практика переговоров"
    sections = []
    accepted_generated = False
    if isinstance(generated, dict):
        for raw in (generated.get("sections") or [])[:6]:
            if not isinstance(raw, dict) or not isinstance(raw.get("turn"), int):
                continue
            turn = raw["turn"]
            if not 1 <= turn <= len(history):
                continue
            quote = _grounded_quote(history[turn - 1], raw.get("quote"))
            body = _text(raw.get("body"), 1100)
            heading = _text(raw.get("title"), 120)
            if not quote or not body or not heading:
                continue
            # A bare acceptance cannot be described as inventing the partner's solution.
            acceptance = acceptance_action(str(history[turn - 1].get("text") or ""))
            action = raw.get("action") if raw.get("action") in {"proposed", "clarified", "accepted", "declined", "question", "other"} else "other"
            if acceptance:
                action = acceptance
                heading = "Приняли предложение собеседника" if acceptance == "accepted" else "Уточнили условия предложения"
                body = "Вы выразили согласие. Это подтверждает принятие предложения, но не самостоятельную разработку решения." if acceptance == "accepted" else "Вы отреагировали на предложение собеседника и добавили уточнение или условие. Авторство исходной идеи нельзя приписывать вам."
            kind = raw.get("kind") if raw.get("kind") in {"strength", "improve", "sequence"} else "sequence"
            section = {"id": f"moment-{turn}", "kind": kind, "title": heading, "body": body,
                       "evidence": {"turn": turn, "speaker": "Вы", "quote": quote}, "action": action}
            if history[turn - 1].get("reply"):
                section["context"] = {"position": "after", "text": _text(history[turn - 1]["reply"], 550)}
            elif history[turn - 1].get("context"):
                section["context"] = {"position": "before", "text": _text(history[turn - 1]["context"], 550)}
            alternative = _text(raw.get("alternative"), 500)
            if kind == "improve" and alternative:
                section["alternative"] = alternative
            principle = PRINCIPLES.get(raw.get("principle"))
            if principle:
                section["principle"] = {"label": principle[0], "url": principle[1], "explanation": principle[2]}
            sections.append(section)
            accepted_generated = True
    if not sections:
        # A plain, factual fallback is preferable to unsupported coaching.
        for turn, item in list(enumerate(history, 1))[:2]:
            if not _text(item.get("text")):
                continue
            answer = _text(item.get("reply"), 250)
            context = _text(item.get("context"), 250)
            body = (
                "После этой реплики собеседник ответил: «" + answer + "»." if answer else
                "Перед этой репликой собеседник сказал: «" + context + "»." if context else
                "Эта реплика прозвучала в разговоре. По одной фразе нельзя установить её эффект."
            )
            sections.append(_section(turn, item, "sequence", f"Момент {turn} разговора", body))
    model = generated if isinstance(generated, dict) and accepted_generated else {}
    agreement = validated_agreement(state.get("agreement_evidence"), history)
    goal_evidence = agreement["confirmation"] if agreement else None
    agreement_table = []
    for term in (model.get("terms") or [])[:4]:
        if not isinstance(term, dict) or not isinstance(term.get("proposal_turn"), int):
            continue
        proposal_turn = term["proposal_turn"]
        if not 1 <= proposal_turn <= len(history):
            continue
        proposal_ref = {"turn": proposal_turn, "speaker": term.get("proposal_speaker", "player"), "position": term.get("proposal_position", "after"), "quote": term.get("proposal_quote")}
        proposal = resolve_quote(proposal_ref, history)
        label = _text(term.get("label"), 90)
        if not proposal or not label:
            continue
        confirmation = resolve_quote({"turn": term.get("confirmation_turn"), "speaker": term.get("confirmation_speaker", "opponent"), "position": term.get("confirmation_position", "after"), "quote": term.get("confirmation_quote")}, history)
        if confirmation and (confirmation["speaker"] == proposal["speaker"] or confirmation["order"] <= proposal["order"]):
            confirmation = None
        author = "Вы" if proposal["speaker"] == "player" else "Собеседник"
        agreement_table.append({"label": label, "proposed": author + ": «" + proposal["quote"] + "»",
                                "confirmed": "«" + confirmation["quote"] + "»" if confirmation else "В отмеченных репликах нет подтверждения"})
    # The status and explicit outcome remain server-owned even when a model writes the note.
    interview = settings.get("practice_kind") == "job_interview" or bool(settings.get("interview_questions"))
    outcome_line = (
        "Собеседование на общую вакансию завершено. Решение о выборе кандидата показано в общем результате 1×1." if interview and settings.get("room_id") else
        "Учебное интервью завершено. Разбор относится к этой попытке, а не к решению о найме." if interview else
        "Стороны явно зафиксировали соглашение." if status == "Достигнута" else
        "Собеседник завершил разговор." if state.get("outcome_signal") == "opponent_left" else
        "В записи нет подтверждённого итогового соглашения."
    )
    return {
        "status": status,
        "constraints": _text(settings.get("constraints"), 1500),
        "completion_reason": {"plan_completed": "Обсуждены все вопросы плана", "user_finished": "Вы завершили разговор", "time_limit": "Время тренировки завершилось"}.get(state.get("completion_reason"), "Разговор завершён собеседником" if state.get("outcome_signal") == "opponent_left" else "Разговор завершён"),
        "goal_evidence": goal_evidence,
        "headline": title,
        "lead": (f"Ваша цель: {goal}. " if goal else "") + outcome_line,
        "takeaway": ("Ответы разобраны по вопросам учебной попытки. Конкретные наблюдения — ниже." if interview else "Итог оценивается по подтверждённым условиям. Ниже — ваши предложения и реакция собеседника."),
        "sections": sections,
        "agreement_table": agreement_table,
        "next_step": _text(model.get("next_step"), 500) or "В следующей беседе уточните условия и попросите собеседника подтвердить итог своими словами.",
        "source": "ai" if model else "transcript",
    }


def transcript_for_prompt(history: list[dict[str, Any]], budget: int = 26000) -> str:
    """Include every turn, shortening long individual messages for bounded context."""
    if not history:
        return "Разговор не записан."
    per_turn = max(120, min(1200, budget // (2 * len(history))))
    rows = []
    for turn, item in enumerate(history, 1):
        def bounded(value):
            text = str(value or "").strip()
            return text if len(text) <= per_turn else text[:per_turn//2] + " [середина сокращена] " + text[-per_turn//2:]
        player, answer, context = (bounded(item.get(key)) for key in ("text", "reply", "context"))
        partner = (f"До вашей реплики: {context}. " if context else "") + (f"После вашей реплики: {answer}" if answer else "Реплика собеседника после ответа не записана")
        rows.append(f"{turn}. Вы: {player}\n   {partner}")
    return "\n".join(rows)
