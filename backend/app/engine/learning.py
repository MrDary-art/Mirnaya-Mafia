from __future__ import annotations

from collections import Counter
from typing import Any

from app.engine.parser import rule_based_analysis


PROGRAMS: dict[str, dict[str, Any]] = {
    "hr_firing": {
        "id": "hr_firing",
        "title": "Увольнение без конфликта",
        "subtitle": "Сложный разговор: рамка, эмоции, решение",
        "skills": ["эмпатия", "вопросы", "объективные критерии", "структура"],
        "exercises": [
            {"id": "start", "type": "choice", "title": "Выберите лучший старт", "prompt": "Сотрудник: «Вы хотели меня видеть? Что-то случилось?»", "options": [
                {"id": "a", "text": "Есть сложный разговор. Сначала факты, затем варианты.", "correct": True, "tags": ["структура"]},
                {"id": "b", "text": "У вас проблемы с результатами, так больше нельзя.", "correct": False, "tags": ["premature_argumentation"]},
                {"id": "c", "text": "Да нет, просто хотел поболтать.", "correct": False, "tags": ["avoidance"]},
            ]},
            {"id": "emotion_error", "type": "find_mistake", "title": "Найдите ошибку", "dialogue": ["Сотрудник: «Мои три года здесь ничего не значат?»", "HR: «Решение принято, обсуждать нечего»."], "prompt": "Что пошло не так?", "options": [
                {"id": "a", "text": "HR проигнорировал эмоциональный сигнал.", "correct": True, "tags": ["emotion_ignored", "missing_empathy"]},
                {"id": "b", "text": "HR не назвал размер компенсации.", "correct": False, "tags": []},
                {"id": "c", "text": "HR слишком долго объяснял решение.", "correct": False, "tags": []},
            ]},
            {"id": "improve", "type": "improve_response", "title": "Исправьте реплику", "prompt": "Плохая реплика: «Решение принято. Обсуждать нечего».", "options": [
                {"id": "a", "text": "Понимаю, что это тяжело. Решение принято, но я объясню основания и обсудим корректный переход.", "correct": True, "tags": ["эмпатия", "структура"]},
                {"id": "b", "text": "Не драматизируйте, документы всё объясняют.", "correct": False, "tags": ["emotion_ignored"]},
                {"id": "c", "text": "Это не моя проблема.", "correct": False, "tags": ["грубость"]},
            ]},
            {"id": "complete", "type": "complete_response", "title": "Дополните конструкцию", "prompt": "«Я понимаю, почему ситуация вызывает у вас _____. Давайте сначала _____.»", "options": [
                {"id": "a", "text": "тревогу / разберём факты и ваши вопросы", "correct": True, "tags": ["эмпатия", "вопросы"]},
                {"id": "b", "text": "злость / подпишем документы", "correct": False, "tags": ["premature_argumentation"]},
                {"id": "c", "text": "ничего / закончим быстрее", "correct": False, "tags": ["emotion_ignored"]},
            ]},
            {"id": "guided", "type": "guided_response", "title": "Ответьте с подсказкой", "prompt": "Сотрудник: «Почему мне раньше никто этого не говорил?»", "goal": "Признайте эмоцию и задайте открытый вопрос.", "required_tags": ["эмпатия", "вопросы"]},
            {"id": "free", "type": "free_response", "title": "Мини-практика", "prompt": "Сотрудник: «Почему я должен соглашаться на ваши условия?»", "goal": "Сохраните уважение, назовите критерии и предложите следующий шаг.", "required_tags": ["объективные критерии", "структура"]},
        ],
    }
}


def program_summary(program: dict[str, Any]) -> dict[str, Any]:
    return {k: program[k] for k in ("id", "title", "subtitle", "skills")} | {"total_exercises": len(program["exercises"])}


def public_exercise(exercise: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in exercise.items() if k != "options"} | {
        "options": [{"id": o["id"], "text": o["text"]} for o in exercise.get("options", [])]
    }


def evaluate_exercise(exercise: dict[str, Any], option_id: str | None, answer: str | None) -> dict[str, Any]:
    if exercise["type"] in {"choice", "find_mistake", "improve_response", "complete_response"}:
        option = next((o for o in exercise["options"] if o["id"] == option_id), None)
        if not option:
            raise ValueError("Выберите вариант ответа")
        ok = bool(option["correct"])
        return {"ok": ok, "tags": option.get("tags", []), "feedback": "Сильный ход: продолжайте." if ok else "Вернитесь к эмоции и интересу оппонента, затем переходите к фактам."}
    if not (answer or "").strip():
        raise ValueError("Введите ответ")
    analysis = rule_based_analysis(answer or "")
    techniques = set(analysis.get("techniques") or [])
    required = set(exercise.get("required_tags") or [])
    ok = required <= techniques
    missing = sorted(required - techniques)
    tags = list(techniques) + ([f"missing_{tag}" for tag in missing] if missing else [])
    return {"ok": ok, "tags": tags, "analysis": analysis, "feedback": "Все целевые техники распознаны." if ok else f"Пока не хватает: {', '.join(missing)}."}


def mastery(attempts: list[dict[str, Any]], skills: list[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for skill in skills:
        relevant = [a for a in attempts if skill in a.get("tags", [])][-5:]
        result[skill] = round(100 * sum(1 for a in relevant if a.get("ok")) / len(relevant)) if relevant else 0
    return result


def error_summary(attempts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    errors = Counter(tag for a in attempts if not a.get("ok") for tag in a.get("tags", []) if tag.startswith(("missing_", "emotion_", "premature_", "avoidance", "грубость")))
    return [{"tag": tag, "count": count} for tag, count in errors.most_common()]
