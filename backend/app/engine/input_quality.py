"""Cheap input checks before AI setup. No model call and no dictionary of allowed jobs."""
import re
import unicodedata

WORDS = re.compile(r"[^\W\d_]+", re.UNICODE)
VOWELS = set("аеёиоуыэюяaeiouy")
ACRONYMS = {"sql", "css", "html", "hr", "it", "php", "http", "ssr", "ml", "llm", "рф", "снг", "жкх", "ссср", "мвд", "гк", "ввс"}
KEYBOARD = ("йцук", "цукен", "фыва", "ывапр", "олдж", "джэ", "ячсм", "asdf", "qwer", "zxcv", "аолдрп")


def looks_random(value):
    words = WORDS.findall(value.lower())
    if not words:
        return True
    useful = []
    for word in words:
        if len(word) < 3 or word in ACRONYMS:
            continue
        bad = bool(re.search(r"(.)\1{3,}", word)) or len(word) > 32
        bad |= any(run in word for run in KEYBOARD)
        bad |= not bool(set(word) & VOWELS)
        useful.append(bad)
    return bool(useful) and sum(useful) >= max(1, len(useful) / 2)


def validate_prompt(value, label="Задача", *, descriptive=True, optional=False):
    value = unicodedata.normalize("NFKC", str(value or "")).strip()
    if optional and not value:
        return value
    words = WORDS.findall(value)
    if looks_random(value):
        raise ValueError(f"{label}: похоже на случайные символы. Напишите, какой разговор хотите отработать. Например: «Обсудить повышение зарплаты с руководителем».")
    if descriptive and (len(words) < 2 or sum(map(len, words)) < 8):
        raise ValueError(f"{label}: добавьте конкретику — с кем беседуете и что хотите получить. Сейчас описания недостаточно для подготовки.")
    if not descriptive and sum(map(len, words)) < 2:
        raise ValueError(f"{label}: укажите понятное название или вопрос.")
    return value


def validate_practice(settings):
    if settings.get("mode") != "online":
        return
    validate_prompt(settings.get("problem"), "Ситуация")
    validate_prompt(settings.get("goal"), "Цель")
    if settings.get("practice_kind") == "job_interview":
        validate_prompt(settings.get("target_position"), "Должность", descriptive=False)
    for key, label in (("constraints", "Ограничения"), ("vacancy_description", "Описание вакансии"),
                       ("role", "Ваша роль"), ("opponent_role", "Роль собеседника"), ("target_company", "Компания")):
        validate_prompt(settings.get(key), label, descriptive=False, optional=True)
