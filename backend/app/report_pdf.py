"""Native ReportLab PDF documents for personal reports and longitudinal insights."""
from __future__ import annotations

import hashlib
import json
from io import BytesIO
from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ASSETS = Path(__file__).resolve().parent / "assets"
W, H = A4

def _fonts():
    for name, filename in (("ArenaPdf", "DejaVuSans.ttf"), ("ArenaPdfBold", "DejaVuSans-Bold.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames(): pdfmetrics.registerFont(TTFont(name, str(ASSETS / filename)))

def report_id(kind: str, source: object) -> str:
    digest = hashlib.sha256(json.dumps(source, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()[:6].upper()
    return f"ARENA-{kind}-{digest}"

def _header(page, title, identifier, number):
    page.setFillColor(HexColor("#10261a")); page.rect(0, H-74, W, 74, fill=1, stroke=0)
    page.drawImage(str(ASSETS / "arena-owl-logo.png"), 36, H-61, 34, 34, mask="auto")
    page.setFillColor(HexColor("#F4F1E7")); page.setFont("ArenaPdfBold", 12); page.drawString(80, H-42, "АРЕНА ПЕРЕГОВОРОВ")
    page.setFillColor(HexColor("#B1C2B5")); page.setFont("ArenaPdf", 8); page.drawRightString(W-36, H-42, identifier)
    page.setFillColor(HexColor("#203126")); page.setFont("ArenaPdfBold", 16); page.drawString(40, H-104, title)
    page.setFillColor(HexColor("#748477")); page.setFont("ArenaPdf", 7); page.drawRightString(W-40, 24, f"Страница {number} · Внутренняя отметка платформы, не является ЭП")

def _line(page, text, y, *, bold=False, size=10):
    page.setFont("ArenaPdfBold" if bold else "ArenaPdf", size); page.setFillColor(HexColor("#24362a"))
    words, line = str(text or "—").split(), ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(candidate, "ArenaPdfBold" if bold else "ArenaPdf", size) > W-80:
            page.drawString(40, y, line); y -= size * 1.5; line = word
        else: line = candidate
    if line: page.drawString(40, y, line); y -= size * 1.5
    return y

def _seal(page, y):
    page.setStrokeColor(HexColor("#7C926C")); page.circle(W-86, y+22, 30, stroke=1, fill=0)
    page.setFont("ArenaPdfBold", 6); page.setFillColor(HexColor("#486344")); page.drawCentredString(W-86, y+28, "МИРНАЯ МАФИЯ")
    page.drawCentredString(W-86, y+18, "ОТЧЁТ СФОРМИРОВАН")
    page.setFont("ArenaPdf", 6); page.drawCentredString(W-86, y+8, "ARENA NEGOTIATION LAB")


def _document(title, identifier, sections):
    """Flowables wrap long text and carry sections across pages."""
    from html import escape
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
    from reportlab.lib.styles import ParagraphStyle
    _fonts()
    output = BytesIO()
    normal = ParagraphStyle("ArenaBody", fontName="ArenaPdf", fontSize=10, leading=16, textColor=HexColor("#24362a"), spaceAfter=9, splitLongWords=True)
    heading = ParagraphStyle("ArenaHeading", parent=normal, fontName="ArenaPdfBold", fontSize=13, leading=19, spaceBefore=14, spaceAfter=10, keepWithNext=True)
    flow = []
    def readable(value):
        if isinstance(value, dict):
            return "; ".join(f"{k}: {readable(v)}" for k, v in value.items())
        if isinstance(value, list):
            return "\n".join(readable(v) for v in value)
        return str(value) if value is not None else "Нет сохранённых данных."
    for label, value in sections:
        if value is None or value == [] or value == {} or value == "":
            continue
        flow.append(Paragraph(escape(label), heading))
        for line in readable(value).split("\n"):
            if line.strip():
                flow.append(Paragraph(escape(line), normal))
    def decorate(page, doc):
        page.saveState()
        _header(page, title, identifier, doc.page)
        page.restoreState()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=125, bottomMargin=55, title=title)
    doc.build(flow, onFirstPage=decorate, onLaterPages=decorate)
    return output.getvalue()


def render_report_pdf(*, report: dict, session: object, holder: str) -> bytes:
    identifier = report_id("RPT", {"id": session.id, "report": report})
    metrics = getattr(session, "metrics", None) or report.get("metrics") or {}
    metrics = json.loads(metrics) if isinstance(metrics, str) else metrics
    metrics = metrics.get("values", metrics) if isinstance(metrics, dict) else {}
    labels = {"trust": "Доверие", "goal": "Продвижение к цели", "control": "Управление разговором", "eq": "Эмоциональная регуляция"}
    scores = []
    for key, label in labels.items():
        value = metrics.get(key)
        scores.append(f"{label}: {value} / 100" if isinstance(value, (int, float)) and 0 <= value <= 100 else f"{label}: нет сохранённой оценки")
    narrative = report.get("narrative") or {}
    sections = [
        ("Участник", holder),
        ("Практика", report.get("scenario_title") or session.role),
        ("Результат встречи", report.get("verdict") or report.get("outcome") or report.get("summary") or "Итог не указан в сохранённом отчёте."),
        ("На чём основан отчёт", report.get("evidence_note") or "Данные этой игровой сессии: сохранённые действия, текстовые ответы и рассчитанные платформой показатели. Это описание практики, а не оценка личности. Сведения, которых нет в записи сессии, не восстанавливались."),
        ("Итоговые показатели", scores),
        ("Как читать показатели", "Шкала от 0 до 100 отражает игровые условия и правила расчёта. Она не является психологическим тестом и не позволяет сравнивать людей вне контекста этой игры."),
        ("Краткий итог", narrative.get("lead") or report.get("summary")),
        ("Сильные стороны", report.get("strengths")),
        ("Что стоит пересмотреть", report.get("weaknesses") or report.get("risks")),
        ("Примеры из разговора", report.get("episodes") or report.get("evidence")),
        ("Рекомендации", report.get("recommendations")),
        ("Следующая практика", narrative.get("next_step")),
    ]
    if report.get("hiring_result"):
        hiring = report["hiring_result"]
        sections = [(label, hiring["decision"] if label == "Результат встречи" else value)
                    for label, value in sections if label not in {"Итоговые показатели", "Как читать показатели"}]
        details = [hiring["vacancy"], hiring["decision"]]
        for row in hiring.get("criteria", []):
            details.append(row["criterion"])
            details.extend(f"{item['name']}: {item['score']} / 4. «{item['quote']}»" for item in row["candidates"])
        sections.insert(2, ("Итог трудоустройства с ИИ · 1×1", details))
        moments = []
        for item in narrative.get("sections", []):
            moments.extend(filter(None, [item.get("title"), item.get("body"),
                f"{'Ответ' if item['context'].get('position') == 'after' else 'Вопрос'} интервьюера: {item['context']['text']}" if item.get("context", {}).get("text") else None,
                f"Ваш ответ: «{item['evidence']['quote']}»" if item.get("evidence", {}).get("quote") else None,
                f"Попробуйте иначе: {item['alternative']}" if item.get("alternative") else None]))
        feedback = report.get("competition_feedback") or {}
        sections += [("Подробный разбор ответов", moments),
                     ("Сильная сторона", feedback.get("strength")), ("Пример из вашего ответа", feedback.get("evidence")),
                     ("Что улучшить", feedback.get("improvement")), ("Пример более сильного ответа", feedback.get("better_answer")),
                     ("Сохранённое собеседование", ["\n".join(filter(None, [
                         f"Интервьюер: {row['context']}" if row.get("context") else None,
                         f"Вы: {row.get('text') or ''}",
                         f"Интервьюер: {row['reply']}" if row.get("reply") else None])) for row in report.get("transcript", [])])]
    return _document("ЛИЧНЫЙ ОТЧЁТ О ПРАКТИКЕ", identifier, sections)


def render_insight_pdf(kind: str, payload: dict, holder: str) -> bytes:
    data = payload["data"]
    sections = [("Участник", holder), ("Границы выводов", "Отчёт описывает сохранённые игровые результаты. Это не прогноз и не оценка личности.")]
    if kind == "PROGRESS":
        sections += [("Динамика", [f"Первый устойчивый результат: {data['baseline_score']} / 100", f"Текущий результат: {data['current_score']} / 100"]), ("Изменения показателей", data.get("changes"))]
    else:
        sections += [("Сохранённые результаты", [f"Сейчас: {data['current_score']} / 100", f"Лучший собранный результат: {data['potential_score']} / 100", f"Разница: {data['gap_percent']}%"]), ("Источники и свидетельства", data.get("evidence"))]
    return _document("ОТЧЁТ О РАЗВИТИИ" if kind == "PROGRESS" else "ЛУЧШИЕ РЕЗУЛЬТАТЫ ПРАКТИКИ", report_id(kind, payload), sections)
