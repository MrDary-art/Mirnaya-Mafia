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
    page.setFillColor(HexColor("#e7f1ec")); page.rect(0, 0, W, H, fill=1, stroke=0)
    page.setFillColor(HexColor("#022e24")); page.rect(0, H-74, W, 74, fill=1, stroke=0)
    page.drawImage(str(ASSETS / "arena-owl-logo.png"), 36, H-61, 34, 34, mask="auto")
    page.setFillColor(HexColor("#e7f1ec")); page.setFont("ArenaPdfBold", 12); page.drawString(80, H-42, "АРЕНА ПЕРЕГОВОРОВ")
    page.setFillColor(HexColor("#9fc3b2")); page.setFont("ArenaPdf", 8); page.drawRightString(W-36, H-42, identifier)
    page.setFillColor(HexColor("#022e24")); page.setFont("ArenaPdfBold", 16); page.drawString(40, H-104, title)
    page.setFillColor(HexColor("#1f4d3a")); page.setFont("ArenaPdf", 7); page.drawRightString(W-40, 24, f"Страница {number} · Внутренняя отметка платформы, не является ЭП")

def _line(page, text, y, *, bold=False, size=10):
    page.setFont("ArenaPdfBold" if bold else "ArenaPdf", size); page.setFillColor(HexColor("#022e24"))
    words, line = str(text or "—").split(), ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(candidate, "ArenaPdfBold" if bold else "ArenaPdf", size) > W-80:
            page.drawString(40, y, line); y -= size * 1.5; line = word
        else: line = candidate
    if line: page.drawString(40, y, line); y -= size * 1.5
    return y

def _seal(page, y):
    page.setStrokeColor(HexColor("#4f8f75")); page.circle(W-86, y+22, 30, stroke=1, fill=0)
    page.setFont("ArenaPdfBold", 6); page.setFillColor(HexColor("#1f4d3a")); page.drawCentredString(W-86, y+28, "МИРНАЯ МАФИЯ")
    page.drawCentredString(W-86, y+18, "ОТЧЁТ СФОРМИРОВАН")
    page.setFont("ArenaPdf", 6); page.drawCentredString(W-86, y+8, "ARENA NEGOTIATION LAB")


def _document(title, identifier, sections):
    """Flowables wrap long text and carry sections across pages."""
    from html import escape
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
    from reportlab.lib.styles import ParagraphStyle
    _fonts()
    output = BytesIO()
    normal = ParagraphStyle("ArenaBody", fontName="ArenaPdf", fontSize=10, leading=16, textColor=HexColor("#022e24"), spaceAfter=9, splitLongWords=True)
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
    from app.detailed_report_pdf import render_detailed_report
    _fonts()
    return render_detailed_report(report=report, session=session, holder=holder, assets=ASSETS,
                                  identifier=report_id("RPT", {"id": session.id, "report": report}))


def render_insight_pdf(kind: str, payload: dict, holder: str) -> bytes:
    from app.longitudinal_report import LABELS
    data = payload["data"]
    development = data.get("development") or {}
    sections = [("Участник", holder), ("Основание документа", f"Завершённых отчётов: {payload['source_count']}. Версия: {payload['methodology_version']}. Отпечаток источников: {payload['source_hash']}."),
        ("Главное о вашем пути", development.get("summary"))]
    for period in development.get("periods", []):
        sections.append((period["title"], f"С {period['from'][:10]} по {period['to'][:10]}. Отчёты: " + ", ".join(f"№{sid}" for sid in period["source_ids"])))
    for dimension in development.get("dimensions", []):
        sections.append((dimension["title"] + ": с чего начали и к чему пришли", dimension["text"]))
    if kind != "PROGRESS":
        sections += [("Ваш подтверждённый потенциал", f"Текущий средний уровень: {data['current_score']}/100. Профиль сильнейших результатов: {data['potential_score']}/100. Резерв относительно последних пяти: {data['gap']} п. Эти достижения уже встречались в вашей истории, а не предсказаны моделью."),
            ("Как понимать идеальный профиль", data["disclaimer"] + " По каждой метрике берётся среднее трёх лучших результатов. Вместе эти уровни могли ещё не достигаться; двойник не является точной копией человека.")]
        for item in data.get("evidence", []):
            sections.append(("Подтверждение: " + LABELS[item["metric"]], f"Среднее трёх лучших: {item['score']}/100. Источники: " + ", ".join(f"отчёт №{sid}" for sid in item["source_ids"])))
    sections.append(("Что действительно видно по репликам", development.get("evidence_note")))
    for example in development.get("examples", []):
        sections.append((f"{example['period']} - отчёт №{example['source_id']}: {example['title']}",
            [f"Дата: {example['date'][:10]}. Тип наблюдения: {'удачный ход' if example['kind']=='strength' else 'точка роста'}.",
            f"Сохранённая цитата: «{example['quote']}»", example["analysis"],
            f"Основание в исходном разборе: {example['principle']}. {example['explanation']}" if example["principle"] else "Теоретическое пояснение в исходном отчёте не сохранено."]))
    for index, priority in enumerate(development.get("priorities", []), 1):
        sections.append((f"План развития {index}: {priority['title']}", [priority["reason"], priority["exercise"], priority["check"]]))
    sections += [("В каких ситуациях вы практиковались", [f"{topic['title']} - отчётов: {topic['count']}" for topic in development.get("topics", [])]),
        ("Полный перечень источников", [f"Отчёт №{row['source_id']} | {row['date'][:10]} | {row['title']} | средний игровой результат {row['score']}/100" for row in data.get("sources", [])]),
        ("Как проверять выводы и ограничения", development.get("limitations"))]
    return _document("ОТЧЁТ О РАЗВИТИИ" if kind == "PROGRESS" else "ЛУЧШИЕ РЕЗУЛЬТАТЫ ПРАКТИКИ", report_id(kind, payload), sections)
