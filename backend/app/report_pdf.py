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

def render_report_pdf(*, report: dict, session: object, holder: str) -> bytes:
    _fonts(); output = BytesIO(); identifier = report_id("RPT", {"id": session.id, "report": report})
    page = canvas.Canvas(output, pagesize=A4, pageCompression=1); page.setTitle(f"Личный аналитический отчёт — {identifier}")
    _header(page, "ЛИЧНЫЙ АНАЛИТИЧЕСКИЙ ОТЧЁТ", identifier, 1); y = H-142
    for label, value in (("Участник", holder), ("Практика", report.get("scenario_title") or session.role), ("Статус", report.get("verdict") or report.get("outcome") or "Результат сохранён")):
        page.setFont("ArenaPdfBold", 9); page.drawString(40, y, label.upper()); y = _line(page, value, y-15, bold=True, size=14) - 10
    metrics = getattr(session, "metrics", None) or report.get("metrics") or {}; metrics = json.loads(metrics) if isinstance(metrics, str) else metrics; metrics = metrics.get("values", metrics) if isinstance(metrics, dict) else {}
    page.setFont("ArenaPdfBold", 11); page.drawString(40, y, "ИТОГОВЫЕ МЕТРИКИ"); y -= 20
    for key in ("trust", "goal", "control", "eq"):
        score = metrics.get(key, "—"); page.setFillColor(HexColor("#DDE8D9")); page.rect(40, y-8, 280, 10, fill=1, stroke=0); page.setFillColor(HexColor("#759A67")); page.rect(40, y-8, 2.8 * float(score or 0), 10, fill=1, stroke=0); page.setFillColor(HexColor("#24362a")); page.setFont("ArenaPdf", 9); page.drawString(330, y-6, f"{key.title()}: {score}"); y -= 22
    narrative = report.get("narrative") or {}; y -= 6
    for title, value in (("Краткий итог", narrative.get("lead") or report.get("summary")), ("Следующая практика", narrative.get("next_step") or (report.get("recommendations") or [None])[0])):
        page.setFont("ArenaPdfBold", 11); page.drawString(40, y, title); y = _line(page, value, y-17) - 12
    _seal(page, 58); page.showPage(); page.save(); return output.getvalue()

def render_insight_pdf(kind: str, payload: dict, holder: str) -> bytes:
    _fonts(); output = BytesIO(); identifier = report_id(kind, payload); page = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    title = "ОТЧЁТ О РАЗВИТИИ" if kind == "PROGRESS" else "ВАШ ЛУЧШИЙ СОБРАННЫЙ ПРОФИЛЬ"
    _header(page, title, identifier, 1); y = H-142; data = payload["data"]
    y = _line(page, holder, y, bold=True, size=16) - 14
    if kind == "PROGRESS":
        y = _line(page, f"Первый устойчивый профиль: {data['baseline_score']} / 100", y, bold=True); y = _line(page, f"Текущий профиль: {data['current_score']} / 100", y, bold=True)
        for item in data["changes"]: y = _line(page, f"{item['id'].title()}: {item['baseline']} → {item['current']} ({item['delta']:+d})", y)
    else:
        y = _line(page, "Это не прогноз и не оценка личности.", y, bold=True); y = _line(page, f"Сейчас: {data['current_score']} / 100", y, bold=True); y = _line(page, f"Лучший собранный профиль: {data['potential_score']} / 100", y, bold=True); y = _line(page, f"До уже продемонстрированного потенциала: {data['gap_percent']}%", y)
        for item in data["evidence"]: y = _line(page, f"{item['label']}: {item['score']} · источники: {', '.join(map(str, item['source_ids']))}", y)
    _seal(page, 58); page.showPage(); page.save(); return output.getvalue()
