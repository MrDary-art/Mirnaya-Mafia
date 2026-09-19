"""Select a small, local reference brief for one online session."""

from functools import lru_cache
from pathlib import Path
import re
from typing import Any
from app.engine.opponent_policy import dismissal_context


ROOT = Path(__file__).resolve().parents[1] / "data" / "knowledge"
PROFILE_SECTIONS = {
    "Контекст профессии", "Типовые обязанности", "Ключевые компетенции",
    "Что проверять на собеседовании", "Типовые кейсы", "Признаки сильного ответа",
    "Признаки слабого ответа", "Red flags", "Уровни", "Ограничения",
}
SCENARIO_SECTIONS = {
    "Назначение", "Интересы сторон", "Базовая последовательность", "Грубые ошибки",
    "Сильные ходы", "Ограничения",
}
METHOD_SECTIONS = {"Суть", "Основные принципы", "Сильные маркеры", "Ошибки", "Ограничения"}
STOP_WORDS = {"и", "в", "на", "по", "для", "с", "of", "the", "and"}

SPECIAL_PROFILES = (
    (("учител", "математ"), "professions/education/math_teacher.md"),
    (("учител",), "professions/education/teacher.md"),
    (("преподавател", "вуз"), "professions/education/university_teacher.md"),
    (("python", "разработ"), "professions/it/backend.md"),
    (("backend",), "professions/it/backend.md"),
    (("бэкенд",), "professions/it/backend.md"),
    (("frontend",), "professions/it/frontend.md"),
    (("фронтенд",), "professions/it/frontend.md"),
    (("devops",), "professions/it/devops.md"),
    (("тестировщик",), "professions/it/qa.md"),
)
SCENARIOS = (
    ("interview.md", ("собеседован", "ваканс", "найм")),
    ("salary.md", ("зарплат", "оклад", "оффер")),
    ("dismissal.md", ("увольнен", "уволить")),
    ("promotion.md", ("повышен",)),
    ("budget.md", ("бюджет",)),
    ("deadlines.md", ("срок", "дедлайн")),
    ("client_refusal.md", ("отказ клиент",)),
    ("conflict.md", ("конфликт",)),
    ("return.md", ("возврат",)),
    ("procurement.md", ("закуп", "поставщик")),
    ("partnership.md", ("партнер", "партнёр")),
    ("investment.md", ("инвест",)),
    ("sales.md", ("продаж", "торг за цену")),
)


def _words(value: str) -> list[str]:
    return [word for word in re.findall(r"[a-zа-я0-9]+", value.casefold().replace("ё", "е")) if word not in STOP_WORDS]


def _section(document: str, name: str) -> str:
    match = re.search(rf"(?m)^## {re.escape(name)}\s*$\n(.*?)(?=^## |\Z)", document, re.DOTALL | re.MULTILINE)
    return match.group(1).strip() if match else ""


def _bullets(document: str, section: str) -> list[str]:
    return [line[2:].strip() for line in _section(document, section).splitlines() if line.startswith("- ")]


def _title(document: str) -> str:
    match = re.search(r"(?m)^# (.+)$", document)
    return match.group(1).strip() if match else ""


@lru_cache(maxsize=1)
def _profiles() -> tuple[tuple[str, str, tuple[str, ...]], ...]:
    result = []
    for path in sorted((ROOT / "professions").rglob("*.md")):
        relative = path.relative_to(ROOT).as_posix()
        if relative.startswith("professions/general/"):
            continue
        document = path.read_text(encoding="utf-8")
        labels = (_title(document), *_bullets(document, "Варианты названия / близкие роли"))
        result.append((relative, document, labels))
    return tuple(result)


def _profession(position: str) -> str | None:
    normalized = position.casefold().replace("ё", "е")
    for terms, path in SPECIAL_PROFILES:
        if all(term in normalized for term in terms):
            return path
    position_words = _words(position)
    matches = []
    for path, _, labels in _profiles():
        for label in labels:
            terms = _words(label)
            if terms and all(any(word.startswith(term[:5]) or term.startswith(word[:5]) for word in position_words) for term in terms):
                matches.append((len(terms), path))
                break
    if not matches:
        return None
    matches.sort(reverse=True)
    return matches[0][1] if len(matches) == 1 or matches[0][0] > matches[1][0] else None


def _scenario(settings: dict[str, Any]) -> str | None:
    if settings.get("practice_kind") == "job_interview":
        return "scenarios/interview.md"
    if dismissal_context(settings):
        return "scenarios/dismissal.md"
    for key in ("problem", "goal"):
        text = str(settings.get(key) or "").casefold().replace("ё", "е")
        for filename, terms in SCENARIOS:
            if any(term.replace("ё", "е") in text for term in terms):
                return f"scenarios/{filename}"
    return None


def _excerpt(document: str, sections: set[str]) -> str:
    selected = [f"## {name}\n{content.strip()}" for name in sorted(sections) if (content := _section(document, name))]
    return "\n".join(selected)[:2600]


def select_knowledge(settings: dict[str, Any]) -> dict[str, Any]:
    """Return verified repository paths and bounded reference text, never document instructions."""
    position = str(settings.get("target_position") or settings.get("role") or "")[:120]
    profession = _profession(position)
    scenario = _scenario(settings)
    paths = [path for path in ((profession, scenario) if settings.get("practice_kind") == "job_interview" else (scenario, profession)) if path]
    if settings.get("practice_kind") == "job_interview":
        paths.append("professions/general/candidate.md")
    elif scenario:
        method = "active_listening.md" if scenario.endswith(("conflict.md", "dismissal.md")) else "objections.md" if scenario.endswith(("client_refusal.md", "sales.md")) else "harvard.md"
        paths.append(f"negotiations/{method}")
    sources = []
    excerpts = []
    cases = []
    focus = []
    strengths = []
    weaknesses = []
    for relative in dict.fromkeys(paths):
        path = ROOT / relative
        if not path.is_file():
            continue
        document = path.read_text(encoding="utf-8")
        title = _title(document)
        sources.append({"path": relative, "title": title})
        sections = PROFILE_SECTIONS if relative.startswith("professions/") else SCENARIO_SECTIONS if relative.startswith("scenarios/") else METHOD_SECTIONS
        if relative.startswith("professions/") and settings.get("practice_kind") != "job_interview":
            sections = {"Контекст профессии", "Типовые обязанности", "Ключевые компетенции", "Red flags"}
        excerpts.append(f"[{title}]\n{_excerpt(document, sections)}")
        if relative == profession:
            cases = _bullets(document, "Типовые кейсы")[:3]
            focus = _bullets(document, "Что проверять на собеседовании")[:5]
            strengths = _bullets(document, "Признаки сильного ответа")[:3]
            weaknesses = _bullets(document, "Признаки слабого ответа")[:3]
    return {
        "source": "local_markdown" if sources else "none",
        "sources": sources,
        "brief": "\n\n".join(excerpts)[:6500],
        "cases": cases,
        "focus": focus,
        "strengths": strengths,
        "weaknesses": weaknesses,
    }
