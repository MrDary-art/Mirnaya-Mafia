"""Complete, evidence-bound report material shared by the web view and PDF."""
from copy import deepcopy

METRIC_LABELS = {"trust": "Доверие", "goal": "Продвижение к цели", "control": "Управление разговором", "eq": "Эмоциональная регуляция"}


def detailed_report(report, state, settings):
    result = deepcopy(report)
    history = state.get("history") or []
    note = result.get("narrative") or {}
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
    result["transcript"] = [{key: row.get(key) for key in ("text", "context", "reply")} for row in history]
    result["analysis_coverage"] = {"total": len(history), "reviewed": sum(item["source"] == "analysis" for item in reviews),
                                   "source": note.get("source", "record")}
    if state.get("final_decision"):
        result["final_decision"] = deepcopy(state["final_decision"])
    return result
