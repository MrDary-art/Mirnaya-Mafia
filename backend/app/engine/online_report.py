"""Online session verdicts and coaching; numeric state remains server owned."""

import asyncio
from typing import Any

from app.engine.llm import LlmError, call_with_fallback_detailed
from app.engine.metrics import START_METRICS, clamp, snapshot
from app.engine.parser import extract_json
from app.engine.goal_contract import fallback_criteria


def online_verdict(state: dict[str, Any], goal_status: str = "partial") -> tuple[str, str]:
    metrics = state["metrics"]
    if state.get("outcome_signal") == "goal_reached":
        return "online_success", "ПРОЙДЕНО"
    if state.get("outcome_signal") == "opponent_left" or metrics["trust"] < 25:
        return "online_failed", "ПРОВАЛЕНО"
    if goal_status == "failed":
        return "online_failed", "ПРОВАЛЕНО"
    if state.get("outcome_signal") == "interview_complete":
        return ("online_success", "ПРОЙДЕНО") if goal_status == "achieved" else ("online_failed", "ПРОВАЛЕНО")
    if metrics["trust"] >= 45 and metrics["goal"] >= 40 and (
        goal_status == "achieved" or state.get("outcome_signal") == "agreement" or all(value >= 80 for value in metrics.values())
    ):
        return "online_success", "ПРОЙДЕНО"
    return "online_partial", "ТРЕНИРОВКА ЗАВЕРШЕНА"


def interview_fallback_status(state: dict[str, Any]) -> str:
    """Decide a completed interview from validated turn tags when final AI review fails."""
    history = state.get("history") or []
    progress = sum(turn.get("goal_signal") == "progress" for turn in history)
    setbacks = sum(turn.get("goal_signal") == "setback" for turn in history)
    metrics = state["metrics"]
    if state.get("outcome_signal") == "opponent_left" or metrics["trust"] < 25:
        return "failed"
    if metrics["goal"] >= 70 and metrics["trust"] >= 45 and progress >= max(3, (len(history) + 1) // 2) and setbacks <= progress // 3:
        return "achieved"
    return "failed"


async def enrich_online_report(report: dict[str, Any], state: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    title = "Переговоры двух участников" if settings.get("human_room") else "Парное собеседование с ИИ" if settings.get("interview_questions") else "Практика трудоустройства" if settings.get("practice_kind") == "job_interview" else "Онлайн-переговоры"
    criteria = state.get("goal_criteria") or fallback_criteria(settings)
    report["goal_criteria"] = criteria
    report["metrics_chart"] = [{"turn": 0, **START_METRICS}] + report["metrics_chart"][1:]
    report["batna_assessment"] = (
        "Запасной вариант был обозначен в разговоре." if report.get("harvard", {}).get("batna")
        else "Запасной вариант в разговоре не прозвучал; оцените, уместен ли он для этой ситуации."
    )
    report["hidden_goal"] = None
    report["assessment_source"] = "rules"
    history = (state.get("history") or [])[-20:]
    goal_status = "partial"
    if history and state.get("ai_provider") != "offline":
        prompt = (
            "Ты независимый оценщик учебной беседы. Сравни действия участника с заранее заданными критериями. "
            "Верни только JSON: {\"goal_status\":\"achieved|failed|partial\",\"evidence\":\"точная короткая цитата из стенограммы\","
            "\"summary\":\"2-3 предложения о результате и действиях\",\"mistakes\":[{\"what\":\"ошибка\",\"chosen\":\"точная реплика игрока\",\"alternative\":\"как сказать лучше\"}],"
            "\"recommendations\":[\"конкретный следующий шаг\"]}. "
            "Статус achieved ставь, если действия убедительно достигают цели, даже когда собеседник не произнёс формального согласия; "
            "failed — при явном провале по критериям; иначе partial. Не выдумывай факты, цитата evidence должна дословно встречаться в стенограмме. "
            "Не вычисляй числовые метрики: их считает сервер. До 3 ошибок и рекомендаций. "
            f"Ситуация: {str(settings.get('problem') or '')[:500]}. Цель: {str(settings.get('goal') or '')[:500]}. "
            f"Критерии: {str(criteria)[:1800]}. Метрики: {state['metrics']}. "
            "Стенограмма: "
            + str([{"player": h.get("text"), "opponent": h.get("reply") or h.get("context"), "comment": h.get("comment")} for h in history])[:9000]
        )
        try:
            raw, provider = await asyncio.wait_for(call_with_fallback_detailed(prompt, None, max_tokens=900), timeout=20)
            data = extract_json(raw)
            if data and isinstance(data.get("summary"), str):
                evidence = data.get("evidence")
                evidence = evidence.strip().strip('«»"\' ') if isinstance(evidence, str) else ""
                transcript = " ".join(str(h.get(k) or "") for h in history for k in ("text", "reply", "context"))
                supported = len(evidence) >= 4 and evidence.lower() in transcript.lower()
                if data.get("goal_status") in {"achieved", "failed"} and not supported:
                    data = None
                elif supported and data.get("goal_status") in {"achieved", "failed", "partial"}:
                    goal_status = data["goal_status"]
                    report["goal_evidence"] = evidence[:300]
            if data and isinstance(data.get("summary"), str):
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
        except (LlmError, TimeoutError):
            pass
    if state.get("outcome_signal") == "goal_reached":
        if goal_status != "achieved":
            report["summary"] = "Цель достигла 100% по оценке ходов беседы. Изучите конкретные рекомендации и попробуйте закрепить результат."
        goal_status = "achieved"
    elif state.get("outcome_signal") == "interview_complete" and (
        goal_status == "partial" or (
            goal_status == "failed"
            and state["metrics"]["goal"] >= 85
            and state["metrics"]["trust"] >= 45
            and sum(turn.get("goal_signal") == "progress" for turn in history) >= max(3, (len(history) * 3 + 3) // 4)
            and not any(turn.get("goal_signal") == "setback" for turn in history)
        )
    ):
        goal_status = interview_fallback_status(state)
        report["assessment_source"] = "server_metrics"
        report.pop("goal_evidence", None)
        progress = sum(turn.get("goal_signal") == "progress" for turn in history)
        report["summary"] = (
            f"Собеседование завершено: {progress} из {len(history)} ответов продвинули вас к цели. "
            + ("По результатам ответов цель достигнута." if goal_status == "achieved" else "Для цели пока недостаточно подтверждённых ответов.")
        )
        if settings.get("practice_kind") == "job_interview":
            report["mistakes"] = []
            report["recommendations"] = [
                "Подкрепляйте ответы конкретным примером из своей работы и его результатом.",
                "Если вопрос распознан неточно, уточните его перед ответом.",
            ]
    ending, verdict = online_verdict(state, goal_status)
    old_goal = state["metrics"]["goal"]
    if ending == "online_success" and goal_status == "achieved":
        state["metrics"]["goal"] = clamp(max(old_goal, 80))
    elif ending == "online_failed" and goal_status == "failed":
        state["metrics"]["goal"] = clamp(min(old_goal, 35))
    if state["metrics"]["goal"] != old_goal:
        report["metrics"] = snapshot(state["metrics"], state.get("history") or [])
        report["metrics_chart"].append({"turn": len(state.get("history") or []) + 1, **state["metrics"]})
        report["goal_assessment_delta"] = state["metrics"]["goal"] - old_goal
    report.update(ending_id=ending, verdict=verdict, outcome=ending, scenario_title=title, goal_status=goal_status)
    report.setdefault("summary", "")
    if not report["summary"]:
        report["summary"] = (
            "Собеседник прекратил разговор или цель не была достигнута. Изучите реплики и попробуйте снова."
            if ending == "online_failed" else
            "Цель достигнута. Изучите сильные ходы и дальнейшие шаги."
            if ending == "online_success" else
            "Тренировка завершена. Изучите динамику метрик и рекомендации перед следующей попыткой."
        )
    return report
