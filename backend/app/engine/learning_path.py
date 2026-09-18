"""Canonical authored content and helpers for the AI Training learning path."""

from copy import deepcopy
from pathlib import Path
import re

CONTENT_PATH = Path(__file__).resolve().parents[1] / "data" / "learning_path_content.txt"
TYPE_IDS = {
    "РАСПОЗНАЙТЕ СИГНАЛ": "RECOGNIZE", "НАЙДИТЕ ОШИБКУ": "FIND_MISTAKE",
    "ВЫБЕРИТЕ ОТВЕТ": "CHOICE", "СРАВНИТЕ ПОДХОДЫ": "COMPARE",
    "ВЫБЕРИТЕ СЛЕДУЮЩИЙ ШАГ": "NEXT_MOVE", "ПРИМЕНИТЕ НАВЫК": "APPLY",
    "ПРОВЕРЬТЕ ПРЕДПОЛОЖЕНИЕ": "ASSUMPTION_CHECK", "СОБЕРИТЕ ГЛАВНОЕ": "SUMMARIZE",
    "ВЫСТРОЙТЕ ПОСЛЕДОВАТЕЛЬНОСТЬ": "SEQUENCE", "КОМПЛЕКСНОЕ ЗАДАНИЕ": "COMBINED",
}
QUALITY_IDS = {"Сильный ход": "strong", "Рабочий вариант": "acceptable", "Есть риск": "weak"}
CHAPTERS = [
    {"id": "chapter-1", "order": 1, "title": "Слышать и понимать", "description": "Понять эмоции, интересы и ожидания Алексея до собственной аргументации.", "prerequisite": None},
    {"id": "chapter-2", "order": 2, "title": "Вести сложный диалог", "description": "На основе выясненного вести разговор к ясному и уважительному решению.", "prerequisite": "chapter-1"},
]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _parse_content() -> list[dict]:
    text = CONTENT_PATH.read_text(encoding="utf-8")
    blocks = re.split(r"(?=Уровень\s+\d+\.\s)", text)
    levels: list[dict] = []
    chapter_index = 0
    for block in blocks:
        match = re.match(r"Уровень\s+(\d+)\.\s+(.+?)\n", block)
        if not match:
            continue
        local_order, title = int(match.group(1)), match.group(2).strip()
        if local_order == 1 and levels:
            chapter_index += 1
        if chapter_index > 1:
            break
        skill_match = re.search(r"Навык:\s*(.+?)\n\s*\n", block, re.S)
        skill = _clean(skill_match.group(1)) if skill_match else title
        headings = list(re.finditer(r"(?:^|\n)[ \t]*\d+\.\d+[ \t]+([^\n]+)\n", block, re.M))
        exercises = []
        for index, heading in enumerate(headings):
            type_label = heading.group(1).split("—", 1)[0].strip()
            exercise_type = TYPE_IDS.get(type_label, type_label)
            raw = block[heading.end():headings[index + 1].start() if index + 1 < len(headings) else len(block)]
            raw = raw.split("\nУровень ", 1)[0].strip()
            option_matches = list(re.finditer(r"-\s*[«\"](.+?)[»\"]\s*—\s*(Сильный ход|Рабочий вариант|Есть риск|strong|acceptable|weak)\.\s*(?:Разбор|Feedback):\s*(.+?)(?=\s*-\s*[«\"]|\s*\d+\.\d+\s+|$)", raw, re.S))
            if len(option_matches) < 3:
                option_matches = list(re.finditer(r"[«\"](.+?)[»\"]\s*—\s*(Сильный ход|Рабочий вариант|Есть риск|strong|acceptable|weak)\.\s*(?:Разбор|Feedback):\s*(.+?)(?=\s*-?\s*[«\"]|$)", raw, re.S))
            if len(option_matches) < 3:
                raise ValueError(f"Cannot parse canonical options for {title} {exercise_type}: {len(option_matches)}")
            option_matches = option_matches[:3]
            first = option_matches[0]
            prompt = _clean(raw[:first.start()])
            question = prompt
            context = ""
            if "Вопрос:" in prompt:
                context, question = prompt.split("Вопрос:", 1)
            options = []
            for option_index, option in enumerate(option_matches):
                answer, quality, feedback = _clean(option.group(1)), QUALITY_IDS.get(option.group(2), option.group(2)), _clean(option.group(3))
                alternatives = [item for item in option_matches if QUALITY_IDS.get(item.group(2), item.group(2)) == "strong"]
                alternative = _clean(alternatives[0].group(1))
                options.append({"id": f"{quality}-{option_index}", "text": answer, "quality": quality, "tags": [exercise_type.lower()], "feedback": feedback, "alternative": alternative})
            exercises.append({"id": f"chapter-{chapter_index + 1}-l{local_order}-ex{len(exercises) + 1}", "type": exercise_type, "context": _clean(context), "opponent_line": _clean(context), "question": _clean(question), "learning_objective": skill, "explanation": f"Упражнение развивает навык: {skill.lower()}.", "options": options})
        if len(exercises) != 4:
            raise ValueError(f"Canonical level {title} must have four exercises")
        levels.append({"id": f"chapter-{chapter_index + 1}-l{local_order}", "chapter_id": f"chapter-{chapter_index + 1}", "order": local_order, "title": title, "skill": skill, "objective": skill, "difficulty": "Начальная" if local_order < 3 else "Средняя" if local_order < 5 else "Повышенная", "exercise_type": exercises[0]["type"], "exercises": exercises})
    if len(levels) != 12:
        raise ValueError(f"Expected 12 canonical levels, got {len(levels)}")
    return levels


LEVELS = _parse_content()
for chapter in CHAPTERS:
    chapter["levels"] = [level["id"] for level in LEVELS if level["chapter_id"] == chapter["id"]]


def level_or_none(level_id: str) -> dict | None:
    return next((level for level in LEVELS if level["id"] == level_id), None)


def levels_for_chapter(chapter_id: str) -> list[dict]:
    return [level for level in LEVELS if level["chapter_id"] == chapter_id]


def exercise_pool(level_id: str) -> list[dict]:
    level = level_or_none(level_id)
    return deepcopy(level["exercises"]) if level else []


def snapshot_for_attempt(level_id: str, shuffle) -> list[dict]:
    """Create the stable shuffled option order for one persisted attempt."""
    snapshot = exercise_pool(level_id)
    for exercise in snapshot:
        shuffle(exercise["options"])
    return snapshot
