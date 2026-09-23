"""Canonical authored content and helpers for the AI Training learning path."""

from copy import deepcopy
from pathlib import Path
import re


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CONTENT_PATH = DATA_DIR / "learning_path_content.txt"
CHAPTERS_3_10_PATH = DATA_DIR / "learning_path_chapters_3_10_content.txt"

TYPE_IDS = {
    "Распознайте сигнал": "RECOGNIZE", "Распознайте ситуацию": "RECOGNIZE",
    "Распознайте изменение": "RECOGNIZE", "Найдите ошибку": "FIND_MISTAKE",
    "Найдите риск": "FIND_MISTAKE", "Сравните подходы": "COMPARE",
    "Выберите ответ": "CHOICE", "Выберите стратегию": "CHOICE",
    "Выберите следующий шаг": "NEXT_MOVE", "Проверьте результат": "NEXT_MOVE",
    "Примените навык": "APPLY", "Примите решение": "COMBINED",
    "Соберите главное": "SUMMARIZE", "Проверьте предположение": "ASSUMPTION_CHECK",
    "Выстройте последовательность": "SEQUENCE", "Сформулируйте ответ": "GUIDED_RESPONSE",
    "Комплексное задание": "COMBINED",
}
QUALITY_IDS = {
    "Сильный ход": "strong", "Рабочий вариант": "acceptable", "Есть риск": "weak",
    "strong": "strong", "acceptable": "acceptable", "weak": "weak",
    "С": "strong", "Р": "acceptable", "Риск": "weak",
}

LEGACY_CHAPTERS = [
    {
        "id": "chapter-1", "order": 1, "title": "Слышать и понимать",
        "description": "Понять эмоции, интересы и ожидания Алексея до собственной аргументации.",
        "story": "Вы — Марина, руководитель продуктовой команды. Алексей болезненно воспринимает оценку своей работы.",
        "learning": "Слышать смысл за словами, задавать уточняющие вопросы и отделять позицию от интереса.",
        "prerequisite": None,
    },
    {
        "id": "chapter-2", "order": 2, "title": "Вести сложный диалог",
        "description": "На основе выясненного вести разговор к ясному и уважительному решению.",
        "story": "Причины реакции Алексея прояснены; теперь разговор нужно привести к конкретной договорённости.",
        "learning": "Исследовать возражения, снижать напряжение и завершать разговор понятным следующим шагом.",
        "prerequisite": "chapter-1",
    },
]

# The authored file contains a learning goal, but the path cards need a concise
# scenario description. Keep those two content roles separate.
CHAPTER_DESCRIPTIONS = {
    3: "Клиент называет цену слишком высокой. Выясните, что на самом деле стоит за возражением.",
    4: "Закупщик требует скидку и ссылается на конкурента. Найдите условия для взаимовыгодного обмена.",
    5: "Продукт и разработка спорят о сроке релиза. Переведите позиции в интересы и соберите решение.",
    6: "Сотрудник обсуждает пересмотр зарплаты с руководителем при ограниченном бюджете.",
    7: "Клиент требует бесплатную доработку. Сохраните границы и найдите рабочий формат.",
    8: "Партнёр использует срочность и ложный выбор. Отделите факты от переговорных приёмов.",
    9: "Анна и Кирилл спорят о срыве интеграции. Восстановите диалог двух активных сторон.",
    10: "Три команды делят ограниченный бюджет. Определите приоритеты и соберите пакетное решение.",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _legacy_levels() -> list[dict]:
    """Parse the existing chapters 1–2 format without changing their authored content."""
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
            raw = block[heading.end():headings[index + 1].start() if index + 1 < len(headings) else len(block)]
            raw = raw.split("\nУровень ", 1)[0].strip()
            option_matches = list(re.finditer(r"-\s*[«\"](.+?)[»\"]\s*—\s*(Сильный ход|Рабочий вариант|Есть риск|strong|acceptable|weak)\.\s*(?:Разбор|Feedback):\s*(.+?)(?=\s*-\s*[«\"]|\s*\d+\.\d+\s+|$)", raw, re.S))
            if len(option_matches) < 3:
                option_matches = list(re.finditer(r"[«\"](.+?)[»\"]\s*—\s*(Сильный ход|Рабочий вариант|Есть риск|strong|acceptable|weak)\.\s*(?:Разбор|Feedback):\s*(.+?)(?=\s*-?\s*[«\"]|$)", raw, re.S))
            if len(option_matches) != 3:
                raise ValueError(f"Cannot parse canonical options for {title}: {len(option_matches)}")
            first = option_matches[0]
            prompt = _clean(raw[:first.start()])
            context, question = ("", prompt) if "Вопрос:" not in prompt else map(_clean, prompt.split("Вопрос:", 1))
            options = []
            strong_text = _clean(next(item.group(1) for item in option_matches if QUALITY_IDS[item.group(2)] == "strong"))
            for option_index, option in enumerate(option_matches):
                quality = QUALITY_IDS[option.group(2)]
                options.append({"id": f"{quality}-{option_index}", "text": _clean(option.group(1)), "quality": quality, "tags": [type_label.lower()], "feedback": _clean(option.group(3)), "alternative": strong_text})
            exercises.append({"id": f"chapter-{chapter_index + 1}-l{local_order}-ex{len(exercises) + 1}", "type": TYPE_IDS.get(type_label, type_label), "context": context, "opponent_line": context, "question": question, "learning_objective": skill, "explanation": f"Упражнение развивает навык: {skill.lower()}.", "options": options})
        if len(exercises) != 4:
            raise ValueError(f"Canonical level {title} must have four exercises")
        levels.append({"id": f"chapter-{chapter_index + 1}-l{local_order}", "chapter_id": f"chapter-{chapter_index + 1}", "order": local_order, "title": title, "skill": skill, "objective": skill, "difficulty": "Начальная" if local_order < 3 else "Средняя" if local_order < 5 else "Повышенная", "exercise_type": exercises[0]["type"], "exercises": exercises})
    return levels


def _chapter_title(value: str) -> str:
    return value.lower().capitalize()


def _chapters_3_10() -> tuple[list[dict], list[dict]]:
    """Parse the supplied canonical chapters 3–10 source."""
    text = CHAPTERS_3_10_PATH.read_text(encoding="utf-8")
    chapter_headers = list(re.finditer(r"^ГЛАВА\s+(\d+)\.\s+(.+?)\s*$", text, re.M))
    chapters, levels = [], []
    for chapter_position, header in enumerate(chapter_headers):
        chapter_number, raw_title = int(header.group(1)), _clean(header.group(2))
        block = text[header.end():chapter_headers[chapter_position + 1].start() if chapter_position + 1 < len(chapter_headers) else len(text)]
        story_match = re.search(r"Предыстория:\s*(.+?)(?=\nЦель главы:)", block, re.S)
        goal_match = re.search(r"Цель главы:\s*(.+?)(?=\nПерсонаж:|\nУРОВЕНЬ\s+1\s+ИЗ\s+6|\n[-=]{5,}|\Z)", block, re.S)
        story = _clean(story_match.group(1)) if story_match else ""
        goal = _clean(goal_match.group(1)) if goal_match else raw_title.lower().capitalize()
        chapter_id = f"chapter-{chapter_number}"
        chapters.append({"id": chapter_id, "order": chapter_number, "title": _chapter_title(raw_title), "description": CHAPTER_DESCRIPTIONS[chapter_number], "story": story, "learning": goal, "prerequisite": f"chapter-{chapter_number - 1}"})

        level_headers = list(re.finditer(r"^УРОВЕНЬ\s+(\d+)\s+ИЗ\s+6\.\s+(.+?)\s*$", block, re.M))
        for level_position, level_header in enumerate(level_headers):
            order, title = int(level_header.group(1)), _clean(level_header.group(2))
            level_block = block[level_header.end():level_headers[level_position + 1].start() if level_position + 1 < len(level_headers) else len(block)]
            objective_match = re.search(r"Цель уровня:\s*(.+?)(?=\n\s*ЗАДАНИЕ\s+1)", level_block, re.S)
            objective = _clean(objective_match.group(1)) if objective_match else title.lower().capitalize()
            transition_match = re.search(r"Разговор продолжается:\s*(.+?)(?=\n[-=]{5,}|\Z)", level_block, re.S)
            transition = _clean(transition_match.group(1)) if transition_match else ""
            task_headers = list(re.finditer(r"^ЗАДАНИЕ\s+(\d+)\s*(?:—|-)?\s*(.+?)\s*$", level_block, re.M))
            exercises = []
            for task_position, task_header in enumerate(task_headers):
                task_type = _clean(task_header.group(2))
                task_block = level_block[task_header.end():task_headers[task_position + 1].start() if task_position + 1 < len(task_headers) else len(level_block)]
                # A level transition belongs after its final task, not in the
                # feedback of that task's last answer.
                task_block = task_block.split("\nРазговор продолжается:", 1)[0]
                context_match = re.search(r"Ситуация:\s*(.+?)(?=\nВопрос:)", task_block, re.S)
                question_match = re.search(r"Вопрос:\s*(.+?)(?=\n\[С\])", task_block, re.S)
                option_headers = list(re.finditer(r"^\[(С|Риск|Р)\]\s*[«\"](.+?)[»\"]\.?\s*$", task_block, re.M))
                if len(option_headers) != 3:
                    raise ValueError(f"Cannot parse option headers for chapter {chapter_number}, level {order}, task {task_position + 1}: {len(option_headers)}")
                parsed_options = []
                for option_index, option in enumerate(option_headers):
                    fragment = task_block[option.end():option_headers[option_index + 1].start() if option_index + 1 < len(option_headers) else len(task_block)]
                    feedback_match = re.search(r"Разбор:\s*(.+)", fragment, re.S)
                    if not feedback_match:
                        raise ValueError(f"Cannot parse feedback for chapter {chapter_number}, level {order}, task {task_position + 1}")
                    parsed_options.append((option.group(1), _clean(option.group(2)), _clean(feedback_match.group(1))))
                strong_text = next(text for marker, text, _ in parsed_options if marker == "С")
                options = [{"id": f"{QUALITY_IDS[marker]}-{index}", "text": answer, "quality": QUALITY_IDS[marker], "tags": [task_type.lower()], "feedback": feedback, "alternative": strong_text} for index, (marker, answer, feedback) in enumerate(parsed_options)]
                context = _clean(context_match.group(1)) if context_match else ""
                question = _clean(question_match.group(1)) if question_match else _clean(task_block[:option_headers[0].start()])
                exercises.append({"id": f"{chapter_id}-l{order}-ex{task_position + 1}", "type": TYPE_IDS.get(task_type, task_type), "context": context, "opponent_line": context, "question": question, "learning_objective": objective, "explanation": f"Упражнение развивает навык: {objective.lower()}.", "options": options})
            if len(exercises) != 4:
                raise ValueError(f"Canonical chapter {chapter_number}, level {order} must have four exercises")
            levels.append({"id": f"{chapter_id}-l{order}", "chapter_id": chapter_id, "order": order, "title": _chapter_title(title), "skill": objective, "objective": objective, "transition": transition, "difficulty": "Начальная" if order < 3 else "Средняя" if order < 5 else "Повышенная", "exercise_type": exercises[0]["type"], "exercises": exercises})
    if len(chapters) != 8 or len(levels) != 48:
        raise ValueError(f"Expected 8 chapters and 48 levels, got {len(chapters)} chapters and {len(levels)} levels")
    return chapters, levels


EXTRA_CHAPTERS, EXTRA_LEVELS = _chapters_3_10()
CHAPTERS = LEGACY_CHAPTERS + EXTRA_CHAPTERS
LEVELS = _legacy_levels() + EXTRA_LEVELS
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
    snapshot = exercise_pool(level_id)
    for exercise in snapshot:
        shuffle(exercise["options"])
    return snapshot
