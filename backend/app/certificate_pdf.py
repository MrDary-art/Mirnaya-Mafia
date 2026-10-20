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
INK = "#173827"
MUTED = "#355d49"
PAPER = "#f2efe2"
GOLD = "#d8d0a2"


def _register_fonts() -> None:
    for name, filename in (("ArenaDejaVu", "DejaVuSans.ttf"), ("ArenaDejaVuBold", "DejaVuSans-Bold.ttf"),
                           ("ArenaDejaVuSerif", "DejaVuSerif.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(ASSETS / filename)))


def _fit_paragraph(text: str, width: float, height: float, size: float, *, bold: bool = False,
                   serif: bool = False, color: str = INK) -> tuple[Paragraph, float]:
    """Wrap complete field values before reducing type size; never crop a name."""
    content = escape(" ".join(str(text or "").split()))
    while True:
        font_name = "ArenaDejaVuSerif" if serif else "ArenaDejaVuBold" if bold else "ArenaDejaVu"
        style = ParagraphStyle("certificate", fontName=font_name,
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

    # The generated artwork contains only the forest, owl and border. All text
    # and the exact product logo remain vector/image layers in the PDF.
    page.drawImage(str(ASSETS / "certificate-arena-background.png"), 0, 0, width=width, height=height)

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
              size: float, *, bold: bool = False, serif: bool = False, color: str = INK) -> None:
        paragraph, measured = _fit_paragraph(text, box_width, box_height, size, bold=bold, serif=serif, color=color)
        paragraph.drawOn(page, x, y + (box_height - measured) / 2)

    logo_size = 54
    page.drawImage(str(ASSETS / "arena-owl-logo.png"), width / 2 - logo_size / 2, height - 119,
                   width=logo_size, height=logo_size, mask="auto", preserveAspectRatio=True)
    tracked("АРЕНА ПЕРЕГОВОРОВ", width / 2, height - 139, 9.5, 3.2, INK)
    field("СЕРТИФИКАТ", 92, height - 220, width - 184, 55, 42, serif=True)
    tracked("ПОДТВЕРЖДАЕТ УСПЕШНОЕ ПРОХОЖДЕНИЕ", width / 2, height - 235, 7.5, 2.6, INK)

    page.setStrokeColor(HexColor(MUTED))
    page.setLineWidth(0.6)
    page.line(width * .245, height - 303, width * .755, height - 303)
    tracked("ФИО", width / 2, height - 321, 6.8, 2.4, INK)
    field(holder, width * .245, height - 365, width * .51, 39, 21, serif=True)

    tracked("ЗАДАНИЕ", width / 2, height - 378, 6.8, 2.4, INK)
    page.saveState()
    page.setFillColor(HexColor(PAPER))
    page.setFillAlpha(.88)
    page.setStrokeColor(HexColor("#8f9b7d"))
    page.setLineWidth(.7)
    page.roundRect(width * .23, height - 447, width * .54, 52, 7, fill=1, stroke=1)
    page.restoreState()
    field(title, width * .25, height - 441, width * .50, 40, 15, bold=True)

    page.setStrokeColor(HexColor(GOLD))
    page.setLineWidth(.7)
    page.line(width * .19, 145, width * .47, 145)
    page.line(width * .53, 145, width * .81, 145)
    page.saveState()
    page.translate(width / 2, 145)
    page.rotate(45)
    page.rect(-5, -5, 10, 10, fill=0, stroke=1)
    page.restoreState()

    left = 53
    column_width = (width - left * 2) / 4
    columns = (
        ("РЕЗУЛЬТАТ", f"{score:g} ИЗ 100" if score is not None else "НЕ УКАЗАН"),
        ("ДАТА ПРОХОЖДЕНИЯ", completed_at.strftime("%d.%m.%Y")),
        ("НИК В АРЕНЕ", f"@{username}"),
        ("НОМЕР СЕРТИФИКАТА", certificate_id),
    )
    for index, (label, value) in enumerate(columns):
        x = left + index * column_width
        if index:
            page.setStrokeColor(HexColor("#a6a487"))
            page.line(x, 52, x, 119)
        tracked(label, x + column_width / 2, 110, 6.1, 1.2, PAPER)
        page.saveState()
        page.setFillColor(HexColor(PAPER))
        page.setFillAlpha(.90)
        page.setStrokeColor(HexColor("#a6a487"))
        page.roundRect(x + 10, 57, column_width - 20, 35, 5, fill=1, stroke=1)
        page.restoreState()
        field(value, x + 15, 61, column_width - 30, 27,
              12 if index == 0 else 9.5 if index < 3 else 8, bold=True, color=INK)
    if passing_score is not None:
        field(f"Проходной балл: {passing_score}", left + 10, 40, column_width - 20, 12, 6.5, color=PAPER)
    page.showPage()
    page.save()
    return output.getvalue()
