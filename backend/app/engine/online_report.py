"""Online session verdicts and coaching; numeric state remains server owned."""

from typing import Any

from app.engine.llm import LlmError, call_with_fallback_detailed
from app.engine.metrics import START_METRICS
from app.engine.parser import extract_json


def online_verdict(state: dict[str, Any]) -> tuple[str, str]:
    metrics = state["metrics"]
    if state.get("outcome_signal") == "opponent_left" or metrics["trust"] < 25:
        return "online_failed", "ПРОВАЛЕНО"
    if state.get("outcome_signal") == "agreement" and metrics["trust"] >= 45:
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
    report["assessment_source"] = "rules"
    history = (state.get("history") or [])[-20:]
    if not history or state.get("ai_provider") == "offline":
        return report
    prompt = (
        "Ты тренер по деловым переговорам. Оцени только действия игрока по стенограмме. "
        "Вердикт и цифры уже определены сервером, не меняй их. "
        "Верни только JSON: {\"summary\":\"2-3 предложения\",\"mistakes\":[{\"what\":\"ошибка\",\"chosen\":\"точная реплика игрока\",\"alternative\":\"как сказать лучше\"}],\"recommendations\":[\"конкретный метод и следующий шаг\"]}. "
        "До 3 ошибок и до 3 рекомендаций. Если была угроза или саботаж, объясни почему это сорвало переговоры; предложи безопасную конструктивную формулировку. "
        f"Ситуация: {str(settings.get('problem') or '')[:500]}. Цель: {str(settings.get('goal') or '')[:500]}. "
        f"Вердикт: {verdict}. Реплики и разбор: "
        + str([{"player": h.get("text"), "opponent": h.get("reply") or h.get("context"), "comment": h.get("comment"), "delta": h.get("delta")} for h in history])[:9000]
    )
    try:
        raw, provider = await call_with_fallback_detailed(prompt, None, max_tokens=900)
        data = extract_json(raw)
        if not data or not isinstance(data.get("summary"), str):
            return report
        report["summary"] = data["summary"][:1200]
        mistakes = data.get("mistakes")
        if isinstance(mistakes, list):
            cleaned = []
            for item in mistakes[:3]:
                if isinstance(item, dict) and all(isinstance(item.get(k), str) for k in ("what", "chosen", "alternative")):
                    cleaned.append({k: item[k][:500] for k in ("what", "chosen", "alternative")})
            if cleaned:
                report["mistakes"] = cleaned
        recs = data.get("recommendations")
        if isinstance(recs, list):
            cleaned = [r[:500] for r in recs[:3] if isinstance(r, str) and r.strip()]
            if cleaned:
                report["recommendations"] = cleaned
        report["assessment_source"] = provider
    except LlmError:
        pass
    return report
