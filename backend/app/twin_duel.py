"""Server-owned personal twin challenge. Targets are frozen before play, never LLM scores."""
from collections import Counter
import re
from statistics import mean
from app.personal_insights import build_potential_twin, METRICS
from app.longitudinal_report import LABELS, theme


def topic_group(row):
    text = theme(row).casefold()
    for label, roots in (("Инвестиции", ("инвест", "инвестор")), ("Продажи", ("продаж", "скидк", "покупател")),
                         ("Трудоустройство", ("собеседован", "ваканси", "зарплат")), ("Проекты и сроки", ("проект", "дедлайн", "срок"))):
        if any(root in text for root in roots): return label
    return " ".join(text.split())


def challenge_settings(rows, display_name):
    twin = build_potential_twin(rows)
    if twin["locked"]: raise ValueError("Для дуэли нужно минимум 15 подходящих отчётов")
    usable = []
    for row in rows:
        practice_context = (row.get("report") or {}).get("practice_context")
        practice_context = practice_context if isinstance(practice_context, dict) else {}
        context = (row.get("settings") or {}).get("problem") or row.get("scenario_context") or practice_context.get("problem")
        if context and not re.match(r"(?i)^демо[-\s]?практика", str(context)):
            usable.append({**row, "settings": {**(row.get("settings") or {}), "problem":str(context)[:700]}})
    groups = Counter(topic_group(row) for row in usable)
    group = groups.most_common(1)[0][0] if usable else "Деловое сотрудничество"
    selected = next(row for row in reversed(usable) if topic_group(row) == group) if usable else rows[-1]
    saved = selected.get("settings") or {}
    target = twin["data"]["potential"]
    snapshot = {"version": "twin-duel-v1", "source_hash": twin["source_hash"], "source_count": len(rows),
        "source_ids": [row["source_id"] for row in rows], "topic_source_id": selected["source_id"],
        "topic": group, "topic_count": groups[group], "topic_is_fallback":not bool(usable), "target": target,
        "topic_reason": "Выбрана самая частая сохранённая тема; исходная ситуация взята из последнего отчёта этой группы." if usable else "Темы прежних отчётов не сохранены. Используется нейтральная учебная ситуация, а не предположение о ваших интересах.",
        "target_score": round(mean(target.values())), "minimum_turns": 5,
        "rules": "Не менее 5 содержательных ходов; среднее не ниже профиля двойника; не менее трёх из четырёх показателей не ниже его уровня; цель разговора подтверждена в отчёте.",
        "disclaimer": "Двойник - учебная модель лучших показанных результатов, а не точная копия личности. Сочетание лучших показателей не обязательно достигалось одновременно. Победа - выполнение правил этого упражнения, не доказательство превосходства над собой."}
    return {"mode": "online", "display_name": display_name, "problem": theme(selected) if usable else "Обсудить условия делового сотрудничества с клиентом",
        "role": saved.get("role") or selected.get("role") or "Участник переговоров",
        "opponent_role": saved.get("opponent_role") or selected.get("opponent_role") or "Деловой собеседник",
        "goal": saved.get("goal") or "Согласовать конкретное решение и следующий шаг по теме разговора",
        "constraints": saved.get("constraints") or "Не вводить новые бюджет, сроки и ограничения сверх исходной ситуации.",
        "difficulty": "hard" if snapshot["target_score"] >= 75 else "medium", "tone": "деловой",
        "ghost": False, "chaos": False, "hidden_goal": False, "twin_duel": snapshot}


def opponent_instruction(settings):
    duel = settings.get("twin_duel")
    if not duel: return ""
    strongest = sorted(duel["target"], key=duel["target"].get, reverse=True)[:2]
    tactics = {"trust": "пересказывай интересы сторон и проверяй понимание", "goal": "требуй конкретных условий и проверяемого следующего шага",
        "control": "сохраняй повестку, подводи итоги и возвращай разговор к нерешённым вопросам", "eq": "спокойно уточняй опасения и отделяй человека от проблемы"}
    return "\nРЕЖИМ БОЯ С ДВОЙНИКОМ. Ты моделируешь лучшие показанные переговорные навыки игрока, а не его личность. " + "; ".join(tactics[k] for k in strongest) + ". Сохраняй роль противоположной стороны и её разумные интересы. Не поддавайся, не соглашайся автоматически, не выдумывай факты и не оскорбляй. Не объявляй победу и не выставляй баллы: итог вычисляет сервер. Один содержательный вопрос или возражение за ход."


def attach_duel_result(report, state, settings):
    duel = settings.get("twin_duel")
    if not duel: return
    actual = (report.get("metrics") or {}).get("values") or {}
    complete = all(type(actual.get(key)) in (int, float) for key in METRICS)
    turns = len([turn for turn in state.get("history", []) if str(turn.get("text") or "").strip()])
    score = round(mean(actual.values())) if complete else None
    reached = sum(actual[k] >= duel["target"][k] for k in METRICS) if complete else 0
    goal = (report.get("narrative") or {}).get("status") == "Достигнута"
    enough = complete and turns >= duel["minimum_turns"] and not state.get("twin_interrupted") and not state.get("assistance_used")
    passed = enough and score >= duel["target_score"] and reached >= 3 and goal
    report["twin_duel"] = {**duel, "status": "passed" if passed else "not_passed" if enough else "insufficient",
        "label": "Вы справились с испытанием двойника" if passed else "Испытание двойника пока не пройдено" if enough else "Недостаточно данных для итога дуэли",
        "actual_score": score, "turns": turns, "goal_confirmed": goal, "metrics_reached": reached,
        "comparison": [{"id": k, "label": LABELS[k], "target": duel["target"][k], "actual": actual.get(k),
                        "delta": actual[k]-duel["target"][k] if complete else None} for k in METRICS],
        "next_step": "ИИ был недоступен на части ходов или использовались подсказки. Сохранён разбор, но честный соревновательный итог не выставлен. Повторите дуэль без этих ограничений." if state.get("twin_interrupted") or state.get("assistance_used") else "Откройте подробный разбор реплик ниже. Повторите ситуацию, уделив внимание показателям ниже цели; успешный исход не отменяет оставшихся точек роста."}
    report["scenario_title"] = "Бой с двойником - " + str(settings.get("problem") or "Переговорная практика")
