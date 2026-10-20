"""Complete, evidence-bound report material shared by the web view and PDF."""
from copy import deepcopy

from app.engine.grounding import confirmed_next_step_from_exchange
from app.engine.narrative_report import online_takeaway
from app.engine.report_methodology import methodology, VERSION

METRIC_LABELS = {"trust": "Доверие", "goal": "Продвижение к цели", "control": "Управление разговором", "eq": "Эмоциональная регуляция"}


def detailed_report(report, state, settings):
    result = deepcopy(report)
    history = state.get("history") or []
    note = result.get("narrative") or {}
    # Old saved reports may still contain external theory links.  Keep the
    # observation, but route every reader to the matching in-product lesson.
    lesson_by_principle = {
        "Интересы за позицией": "/theory/positions-interests",
        "Объективные критерии": "/theory/objective-criteria",
        "Варианты решения": "/theory/meso",
    }
    for section in note.get("sections") or []:
        principle = section.get("principle") if isinstance(section, dict) else None
        if isinstance(principle, dict) and principle.get("label") in lesson_by_principle:
            principle["url"] = lesson_by_principle[principle["label"]]
    by_turn = {}
    for section in note.get("sections") or []:
        turn = (section.get("evidence") or {}).get("turn")
        if isinstance(turn, int):
            by_turn.setdefault(turn, []).append(section)
    reviews = []
    for index, row in enumerate(history, 1):
        evidence = row.get("evidence") or []
        tags = [item.get("tag") for item in evidence if isinstance(item, dict) and item.get("quote") and item["quote"] in str(row.get("text") or "")]
        observations = by_turn.get(index, [])
        reviews.append({"turn": index, "player": row.get("text") or "", "before": row.get("context") or "",
                        "after": row.get("reply") or "", "observations": observations,
                        "techniques": list(dict.fromkeys(tags)), "changes": row.get("scoring") or [],
                        "metrics_after": row.get("metrics_after") or {},
                        "source": "analysis" if observations and note.get("source") == "ai" else "record",
                        "note": "Выводы аналитика приведены в подробном разборе с цитатами." if observations and note.get("source") == "ai" else "Сохранённый ход. Причинное влияние этой реплики нельзя устанавливать без подтверждённого анализа."})
    result.update(analysis_version=2, turn_reviews=reviews,
                  practice_context={key: settings.get(key) or "" for key in ("problem", "goal", "role", "opponent_role", "constraints")})
    interview = settings.get("practice_kind") == "job_interview" or bool(settings.get("interview_questions"))
    result["report_kind"] = "hiring" if interview and settings.get("room_id") else "interview" if interview else "human" if settings.get("human_room") else "negotiation"
    result["speakers"] = {"player": "Вы", "opponent": "Интервьюер" if interview else "Собеседник" if settings.get("human_room") else "ИИ"}
    result["transcript"] = [{key: row.get(key) for key in ("text", "context", "reply")} for row in history]
    result["analysis_coverage"] = {"total": len(history), "reviewed": sum(item["source"] == "analysis" for item in reviews),
                                   "source": note.get("source", "record")}
    result["metrics_coverage"] = {"turns": len(history), "measured": sum(bool(row.get("scoring")) for row in history)}
    decision = state.get("final_decision") or confirmed_next_step_from_exchange(history)
    if decision:
        result["final_decision"] = deepcopy(decision)
        if note.get("status") == "Результат не подтверждён":
            note["status"] = "Частично"
            note["completion_reason"] = "Стороны подтвердили конкретный следующий шаг"
            note["lead"] = "Зафиксирован следующий шаг, но запись не подтверждает достижение исходной цели целиком."
    if note:
        note["takeaway"] = online_takeaway({**state, "final_decision": decision}, settings, note.get("sections"))
    result["methodology"] = methodology(note.get("sections") or [])
    if result.get("extended_analysis") and result.get("extended_analysis_version") != VERSION:
        result.pop("extended_analysis", None)
        result["extended_analysis_requested"] = False
        result["analysis_refresh_warning"] = "Ранее созданный дополнительный текст не проверялся по новой методике. Запросите подробный разбор, чтобы получить выводы с правилами и цитатами."
    return result
