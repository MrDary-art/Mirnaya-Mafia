"""Printable company certificates, using the same artwork as the site preview."""

from datetime import datetime
from html import escape
from io import BytesIO
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ASSETS = Path(__file__).resolve().parent / "assets"
INK = "#F4F1E7"
MUTED = "#B1C2B5"
ACCENT = "#CAE6A0"
GOLD = "#D3BE8D"


def _register_fonts() -> None:
    for name, filename in (("ArenaDejaVu", "DejaVuSans.ttf"), ("ArenaDejaVuBold", "DejaVuSans-Bold.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(ASSETS / filename)))


def _fit_paragraph(text: str, width: float, height: float, size: float, *, bold: bool = False,
                   color: str = INK) -> tuple[Paragraph, float]:
    """Wrap complete field values before reducing type size; never crop a name."""
    content = escape(" ".join(str(text or "").split()))
    while True:
        style = ParagraphStyle("certificate", fontName="ArenaDejaVuBold" if bold else "ArenaDejaVu",
                               fontSize=size, leading=size * 1.3, alignment=TA_CENTER,
                               textColor=HexColor(color), splitLongWords=True)
        paragraph = Paragraph(content, style)
        _, measured = paragraph.wrap(width, height)
        if measured <= height:
            return paragraph, measured
        size *= 0.94


def render_certificate_pdf(*, holder: str, username: str, title: str, company_name: str,
                           job_title: str | None, score: int | float | None,
                           passing_score: int | None, completed_at: datetime,
                           issued_at: datetime, certificate_id: str,
                           expires_at: datetime | None = None) -> bytes:
    _register_fonts()
    output = BytesIO()
    width, height = landscape(A4)
    page = canvas.Canvas(output, pagesize=(width, height), pageCompression=1)
    page.setTitle(f"Сертификат — {holder} — {title}")
    page.setAuthor("Арена переговоров")
    page.setSubject(f"Корпоративное обучение · {certificate_id}")

    # Full-bleed artwork stays outside the quiet, readable document surface.
    page.drawImage(str(ASSETS / "certificate-arena-background.png"), 0, 0, width=width, height=height)
    page.saveState()
    page.setFillColor(HexColor("#03100B"))
    page.setFillAlpha(0.38)
    page.rect(0, 0, width, height, fill=1, stroke=0)
    page.setFillAlpha(0.92)
    page.setFillColor(HexColor("#0A1C14"))
    page.roundRect(36, 36, width - 72, height - 72, 16, fill=1, stroke=0)
    page.restoreState()
    page.setStrokeColor(HexColor("#667957"))
    page.setLineWidth(0.65)
    page.roundRect(36, 36, width - 72, height - 72, 16, fill=0, stroke=1)
    page.setStrokeColor(HexColor(GOLD))
    page.setLineWidth(1.5)
    for x, direction in ((54, 1), (width - 54, -1)):
        page.line(x, 54, x + direction * 28, 54)
        page.line(x, height - 48, x + direction * 28, height - 48)

    def tracked(text: str, x: float, y: float, size: float, spacing: float = 1.4,
                color: str = MUTED, align: str = "center") -> None:
        total = pdfmetrics.stringWidth(text, "ArenaDejaVuBold", size) + max(0, len(text) - 1) * spacing
        if align == "center":
            x -= total / 2
        elif align == "right":
            x -= total
        page.saveState()
        text_object = page.beginText(x, y)
        text_object.setFont("ArenaDejaVuBold", size)
        text_object.setCharSpace(spacing)
        text_object.setFillColor(HexColor(color))
        text_object.textOut(text)
        page.drawText(text_object)
        page.restoreState()

    def field(text: str, x: float, y: float, box_width: float, box_height: float,
              size: float, *, bold: bool = False, color: str = INK) -> None:
        paragraph, measured = _fit_paragraph(text, box_width, box_height, size, bold=bold, color=color)
        paragraph.drawOn(page, x, y + (box_height - measured) / 2)

    page.drawImage(str(ASSETS / "arena-owl-logo.png"), 63, 493, width=54, height=54, mask="auto")
    tracked("АРЕНА", 124, 527, 12, 2.2, INK, "left")
    tracked("ПЕРЕГОВОРОВ", 124, 511, 7.5, 1.7, GOLD, "left")
    tracked("КОРПОРАТИВНОЕ ОБУЧЕНИЕ", width - 66, 522, 7, 1.2, MUTED, "right")
    page.setStrokeColor(HexColor("#354D3C"))
    page.setLineWidth(0.6)
    page.line(66, 487, width - 66, 487)

    tracked("СЕРТИФИКАТ", width / 2, 440, 34, 4, INK)
    tracked("СЕРТИФИКАТ ВЫДАН", width / 2, 408, 7.5, 1.8, GOLD)
    field(holder, 74, 333, width - 148, 66, 28, bold=True)
    field("за успешное прохождение корпоративного задания", 86, 309, width - 172, 22, 10.5, color=MUTED)
    field(title, 88, 263, width - 176, 45, 18, bold=True, color=ACCENT)
    field(company_name, 86, 232, width - 172, 25, 11.5)
    if job_title:
        field(job_title, 86, 208, width - 172, 22, 9.5, color=MUTED)

    page.setStrokeColor(HexColor("#506842"))
    page.line(66, 191, width - 66, 191)
    column_width = (width - 132) / 4
    columns = (
        ("РЕЗУЛЬТАТ", f"{score:g} из 100" if score is not None else "Не указан"),
        ("ДАТА ПРОХОЖДЕНИЯ", completed_at.strftime("%d.%m.%Y")),
        ("НИК В АРЕНЕ", f"@{username}"),
        ("НОМЕР СЕРТИФИКАТА", certificate_id),
    )
    for index, (label, value) in enumerate(columns):
        x = 66 + index * column_width
        if index:
            page.setStrokeColor(HexColor("#354D3C"))
            page.line(x, 121, x, 171)
        tracked(label, x + column_width / 2, 166, 6.5, 0.9)
        field(value, x + 10, 128, column_width - 20, 30,
              17 if index == 0 else 11 if index < 3 else 9, bold=True,
              color=ACCENT if index == 0 else INK)
    if passing_score is not None:
        field(f"Проходной балл: {passing_score}", 66, 108, column_width, 15, 7.5, color=MUTED)

    page.setStrokeColor(HexColor("#354D3C"))
    page.line(66, 98, width - 66, 98)
    page.setFont("ArenaDejaVu", 8)
    page.setFillColor(HexColor(MUTED))
    page.drawString(66, 77, f"Выдан {issued_at:%d.%m.%Y}")
    page.drawRightString(width - 66, 77, f"Действует до {expires_at:%d.%m.%Y}" if expires_at else "Арена переговоров")
    page.showPage()
    page.save()
    return output.getvalue()
