"""Online session verdicts and coaching; numeric state remains server owned."""

from typing import Any

from app.engine.llm import LlmError, call_with_fallback_detailed
from app.engine.metrics import START_METRICS
from app.engine.narrative_report import online_narrative, transcript_for_prompt
from app.engine.parser import extract_json
from app.engine.mentor import support_summary


def online_verdict(state: dict[str, Any]) -> tuple[str, str]:
    metrics = state["metrics"]
    if state.get("outcome_signal") == "opponent_left":
        return "online_partial", "РАЗГОВОР ЗАВЕРШЁН СОБЕСЕДНИКОМ"
    if state.get("outcome_signal") == "agreement":
        return "online_success", "ЦЕЛЬ ДОСТИГНУТА"
    return "online_partial", "ТРЕНИРОВКА ЗАВЕРШЕНА"


async def enrich_online_report(report: dict[str, Any], state: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    ending, verdict = online_verdict(state)
    title = "Переговоры двух участников" if settings.get("human_room") else "Парное собеседование с ИИ" if settings.get("interview_questions") else "Практика трудоустройства" if settings.get("practice_kind") == "job_interview" else "Онлайн-переговоры"
    report.update(ending_id=ending, verdict=verdict, outcome=ending, scenario_title=title)
    report["summary"] = (
        "Собеседник завершил переговоры после критической реплики. Разберите формулировку и попробуйте снова."
        if ending == "online_failed" else
        "Стороны достигли заявленной цели. Изучите сильные ходы и дальнейшие шаги."
        if ending == "online_success" else
        "Тренировка завершена. Изучите динамику метрик и рекомендации перед следующей попыткой."
    )
    report["metrics_chart"] = [{"turn": 0, **START_METRICS}] + report["metrics_chart"][1:]
    report["batna_assessment"] = (
        "Запасной вариант был обозначен в разговоре." if report.get("harvard", {}).get("batna")
        else "Запасной вариант в разговоре не прозвучал; оцените, уместен ли он для этой ситуации."
    )
    report["hidden_goal"] = None
    # Scenario-authored mistakes cannot describe an unrelated online conversation.
    report["mistakes"] = []
    report["assessment_source"] = "rules"
    history = state.get("history") or []
    report["narrative"] = online_narrative(report, state, settings)
    report["transcript"] = [{key: row.get(key) for key in ("text", "context", "reply")} for row in history]
    report["assistance_used"] = int(state.get("assistance_used") or 0)
    report["learning_support"] = support_summary(state)
    if not history:
        return report
    prompt = (
        ("Это учебное интервью. Оцени ответ по вопросу, конкретности, обоснованию и собственному вкладу. Не называй результат наймом. "
         if settings.get("practice_kind") or settings.get("interview_questions") else "Это переговоры. Отказ от условий, нарушающих ограничения игрока, может быть разумным итогом. ")
        + f"Ограничения: {settings.get('constraints') or 'не заданы'}. "
        + f"Поддержка в этой попытке: {report['learning_support']}. "
        "Не штрафуй за обучение с ментором, но не называй работу после помощи самостоятельной. "
        "Ты тренер по переговорам. Прочитай все пронумерованные ходы по порядку. "
        "Разбирай только наблюдаемые действия игрока относительно его цели. Учитывай, если он исправил ошибку позже. "
        "Не выдумывай реплики, соглашения, качества личности и причинную связь без подтверждения. "
        "В takeaway описывай действие, а не вымышленный результат: предложение сохранить бюджет ещё не означает согласие оппонента. "
        "Не придумывай обязательные ошибки: если их нет, выдели удачные решения. "
        "Вердикт и метрики уже определены сервером; не меняй их. Если нет явного соглашения, не объявляй цель достигнутой. "
        "Для собеседования оценивай конкретность и релевантность ответов, не придумывай опыт кандидата. "
        "Верни только JSON с полями summary (до 3 предложений), mistakes (список {what,chosen,alternative}), "
        "recommendations (список строк), narrative: {headline,takeaway,next_step,sections,terms,goal_evaluation}. "
        "Каждый элемент sections: {turn: номер хода, quote: ТОЧНЫЙ фрагмент реплики игрока, "
        "kind: strength|improve|sequence, title, body, alternative, principle}. "
        "principle только interests|criteria|options или null; используй теорию, только если она объясняет данный ход. "
        "terms — необязательный список только для явно обсуждавшихся условий: "
        "{label,proposal_turn,proposal_quote,confirmation_turn,confirmation_quote}; предложение дословно из реплики игрока, "
        "подтверждение дословно из реплики собеседника, "
        "если подтверждения нет, confirmation_turn и confirmation_quote равны null. "
        "Для обычной беседы выбери 3-5 важных моментов, для короткой меньше. "
        "goal_evaluation оценивает именно указанную цель: {status: achieved|partial|not_achieved|unconfirmed, "
        "turn: номер хода, speaker: player|opponent, quote: дословный фрагмент-основание}. "
        "Не объявляй цель достигнутой только потому, что игрок произнёс желаемый результат. "
        f"Ситуация: {str(settings.get('problem') or '')[:700]}. Цель: {str(settings.get('goal') or '')[:700]}. "
        f"Итог сервера: {verdict}. Стенограмма:\n{transcript_for_prompt(history)}"
    )
    try:
        raw, provider = await call_with_fallback_detailed(
            prompt, None, max_tokens=2400,
            system_prompt="Ты внимательный аналитик завершённой учебной беседы. Верни только проверяемый JSON-разбор по стенограмме. Пиши достаточно подробно, без обязательных ошибок и без выдуманных фактов.",
            timeout_seconds=40,
        )
        data = extract_json(raw)
        if not isinstance(data, dict):
            return report
        if isinstance(data.get("summary"), str) and data["summary"].strip():
            report["summary"] = data["summary"][:1200]
        mistakes = data.get("mistakes")
        if isinstance(mistakes, list):
            cleaned = []
            for item in mistakes[:3]:
                if (isinstance(item, dict) and all(isinstance(item.get(k), str) for k in ("what", "chosen", "alternative"))
                        and len(item["chosen"].strip()) >= 8
                        and any(item["chosen"].strip() in str(row.get("text") or "") for row in history)):
                    cleaned.append({k: item[k][:500] for k in ("what", "chosen", "alternative")})
            if cleaned:
                report["mistakes"] = cleaned
        recs = data.get("recommendations")
        if isinstance(recs, list):
            cleaned = [r[:500] for r in recs[:3] if isinstance(r, str) and r.strip()]
            if cleaned:
                report["recommendations"] = cleaned
        report["narrative"] = online_narrative(report, state, settings, data.get("narrative"))
        report["assessment_source"] = provider
    except LlmError:
        pass
    return report
