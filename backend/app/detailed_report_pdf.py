"""Typeset personal reports: searchable text, vector graphics and complete evidence."""
from html import escape
from io import BytesIO
import json

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable

INK = colors.HexColor("#022e24")
GREEN = colors.HexColor("#1f4d3a")
PALE = colors.HexColor("#e7f1ec")
MUTED = colors.HexColor("#1f4d3a")
LINE = colors.HexColor("#4f8f75")
WIDTH = A4[0] - 84
LABELS = {"trust": "Доверие", "goal": "Продвижение к цели", "control": "Управление разговором", "eq": "Эмоциональная регуляция"}


class MetricChart(Flowable):
    def __init__(self, rows):
        Flowable.__init__(self)
        self.width, self.height, self.rows = WIDTH, 132, rows

    def draw(self):
        c = self.canv
        shades = ["#022e24", "#1f4d3a", "#4f8f75", "#1f4d3a"]
        for i, (key, label) in enumerate(LABELS.items()):
            x, y, w = (i % 2) * (WIDTH / 2), 108 - (i // 2) * 66, WIDTH / 2 - 22
            c.setFont("ArenaPdf", 8)
            c.setFillColor(MUTED)
            c.drawString(x, y, label)
            c.setStrokeColor(LINE)
            c.line(x, y-43, x+w, y-43)
            points = [(x+j*w/max(1, len(self.rows)-1), y-43+max(0, min(100, row.get(key, 50)))*.34) for j, row in enumerate(self.rows) if isinstance(row.get(key), (int, float))]
            if len(points) > 1:
                c.setStrokeColor(colors.HexColor(shades[i]))
                c.setLineWidth(1.5)
                path = c.beginPath()
                path.moveTo(*points[0])
                for point in points[1:]:
                    path.lineTo(*point)
                c.drawPath(path)


def render_detailed_report(*, report, session, holder, assets, identifier):
    output, flow = BytesIO(), []
    body = ParagraphStyle("DetailedBody", fontName="ArenaPdf", fontSize=9.5, leading=15, textColor=INK, spaceAfter=9, splitLongWords=True)
    heading = ParagraphStyle("DetailedHeading", parent=body, fontName="ArenaPdfBold", fontSize=17, leading=23, spaceBefore=18, spaceAfter=13, keepWithNext=True)
    sub = ParagraphStyle("DetailedSub", parent=body, fontName="ArenaPdfBold", fontSize=11, leading=16, spaceBefore=12, keepWithNext=True)
    eyebrow = ParagraphStyle("DetailedLabel", parent=body, fontName="ArenaPdfBold", fontSize=8, leading=12, textColor=GREEN, spaceAfter=8, keepWithNext=True)
    quote = ParagraphStyle("DetailedQuote", parent=body, fontSize=9.5, leading=16, backColor=PALE, borderPadding=12, leftIndent=12, rightIndent=12, spaceBefore=12, spaceAfter=18)
    muted = ParagraphStyle("DetailedMuted", parent=body, fontSize=8, leading=12, textColor=MUTED)
    title = ParagraphStyle("DetailedTitle", parent=heading, fontSize=27, leading=34, spaceBefore=14, spaceAfter=20)

    def text(value, style=body):
        if value is not None and str(value).strip():
            flow.append(Paragraph(escape(str(value)).replace("\n", "<br/>"), style))

    def section(label, name):
        flow.append(Spacer(1, 10))
        text(label, eyebrow)
        text(name, heading)

    def grid(rows, widths, header=False):
        formatted = [[Paragraph(escape(str(cell or "—")).replace("\n", "<br/>"), body) for cell in row] for row in rows]
        table = Table(formatted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT", splitByRow=1, splitInRow=1)
        table.setStyle(TableStyle([("VALIGN", (0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),10),
            ("RIGHTPADDING",(0,0),(-1,-1),10), ("TOPPADDING",(0,0),(-1,-1),10), ("BOTTOMPADDING",(0,0),(-1,-1),8),
            ("LINEBELOW",(0,0),(-1,-1),.5,LINE), ("BACKGROUND",(0,0),(-1,0),PALE)]))
        flow.append(table)
        flow.append(Spacer(1, 12))

    note = report.get("narrative") or {}
    hiring = report.get("hiring_result") or {}
    opponent = (report.get("speakers") or {}).get("opponent", "ИИ")
    settings = getattr(session, "settings", {}) or {}
    if isinstance(settings, str):
        settings = json.loads(settings)
    context = report.get("practice_context") or settings
    finished = getattr(session,"finished_at",None) or getattr(session,"created_at",None)
    text("ЛИЧНЫЙ РАЗБОР / ТРУДОУСТРОЙСТВО" if hiring or report.get("report_kind") in {"hiring", "interview"} else "ЛИЧНЫЙ РАЗБОР / ПЕРЕГОВОРНАЯ ПРАКТИКА", eyebrow)
    text(note.get("headline") or report.get("scenario_title") or "Разбор вашей беседы", title)
    text(holder, sub)
    duel = report.get("twin_duel")
    if duel:
        text("БОЙ С ДВОЙНИКОМ", sub)
        text(duel["label"], sub)
        text(duel["rules"])
        text(f"{duel.get('topic_reason', '')} Всего источников: {duel['source_count']}. Профиль: {duel['source_hash']}.")
        text(f"Содержательных ходов: {duel['turns']}; подтверждена цель: {'да' if duel['goal_confirmed'] else 'нет'}.")
        for item in duel["comparison"]:
            text(f"{item['label']}: ваша практика {item['actual']}/100, цель двойника {item['target']}/100; разница {item['delta']} п.")
        text(duel["next_step"])
        text(duel["disclaimer"], muted)
    if finished:
        text(f"Дата практики: {finished.strftime('%d.%m.%Y')}", muted)
    text(hiring.get("label") or note.get("status") or report.get("verdict") or "Итог практики", sub)
    text(note.get("lead") or report.get("summary"))
    if note.get("completion_reason"):
        text(note["completion_reason"], muted)
    for key, label in (("problem","Ситуация"),("goal","Ваша цель"),("role","Ваша роль"),("constraints","Ограничения")):
        if context.get(key):
            text(label, sub)
            text(context[key])
    text(note.get("takeaway"))
    method = report.get("methodology") or {}
    if method:
        text("Основания разбора", sub)
        text(f"Выводов, прошедших проверку по правилу и записи: {method.get('verified_findings', 0)}.")
        text(method.get("limitations"), muted)
        for rule in method.get("rules") or []:
            text(rule.get("label"), sub)
            text(rule.get("criterion"))
            for source in rule.get("sources") or []:
                text(f"{source['title']}: {source['url']}", muted)
    flow.append(PageBreak())
    section("01 / ОБЗОР", "Результат собеседования" if hiring else "Результат и условия договорённости")
    if hiring:
        text("Итог трудоустройства с ИИ · 1×1", sub)
        text(hiring.get("vacancy"))
        text(hiring.get("decision"), sub)
        hiring_method = hiring.get("methodology") or {}
        if hiring_method:
            text(hiring_method.get("limitations"), muted)
            text((hiring_method.get("source") or {}).get("url"), muted)
        for criterion in hiring.get("criteria") or []:
            text(criterion.get("criterion"), sub)
            grid([[item.get("name"), f"{item.get('score')} / 4", item.get("quote")]
                  for item in criterion.get("candidates") or []], [WIDTH*.25, WIDTH*.15, WIDTH*.6])
    values = (report.get("metrics") or {}).get("values", report.get("metrics") or {})
    if not values:
        values = getattr(session,"metrics",{}) or {}
        if isinstance(values,str):
            values=json.loads(values)
        values=values.get("values",values)
    if any(isinstance(values.get(key),(int,float)) for key in LABELS):
        text("Итоговые показатели", sub)
        grid([[label, f"{values[key]} / 100" if isinstance(values.get(key),(int,float)) else "Нет оценки"] for key,label in LABELS.items()], [WIDTH*.72,WIDTH*.28])
        text("Это учебные индексы действий в этой беседе. Они не являются психологической оценкой и не означают процент достижения цели.", muted)
    text(report.get("summary"))
    if note.get("goal_evidence",{}):
        text("Основание итога", sub)
        text(note["goal_evidence"].get("quote"), quote)
    decision=report.get("final_decision")
    if decision:
        text("Согласованный следующий шаг" if decision.get("kind")=="next_step" else "Подтверждённый отказ от сделки", sub)
        text(decision.get("reason"))
        for key in ("proposal","confirmation"):
            text((decision.get(key) or {}).get("quote"),quote)
    if note.get("agreement_table"):
        grid([["Условие","Предложение","Подтверждение"]]+[[row.get("label"),row.get("proposed"),row.get("confirmed")] for row in note["agreement_table"]], [90,(WIDTH-90)/2,(WIDTH-90)/2], header=True)
    support=report.get("learning_support")
    if support:
        text("Работа с ментором" if support.get("used") else "Самостоятельная попытка", sub)
        text(support.get("summary"))
        if support.get("used"):
            text(f"Обращений: {support.get('exchanges',0)}. Ответов до помощи: {support.get('independent_answers',0)}; после активации: {support.get('answers_after_activation',0)}.")
    if len(report.get("metrics_chart") or [])>1:
        text("Динамика показателей", sub)
        flow.append(MetricChart(report["metrics_chart"]))
    if note.get("requirements"):
        text("Требования задания", sub)
        for row in note["requirements"]:
            text(f"{row.get('label','')}: {row.get('status','')}")
            text((row.get("evidence") or {}).get("quote"),quote)
    section("02 / ПОДРОБНЫЙ АНАЛИЗ", "Ваши решения и реакция другой стороны")
    sections=note.get("sections") or []
    for index,item in enumerate(sections,1):
        turn=(item.get("evidence") or {}).get("turn")
        text(f"{index:02d} / Ход {turn}" if turn else f"{index:02d} / Эпизод",eyebrow)
        text(item.get("title") or "Разбор эпизода", sub)
        text(item.get("body"))
        source=item.get("evidence") or {}
        if source.get("quote"):
            text(f"{source.get('speaker','Вы')}: «{source['quote']}»",quote)
        response=item.get("context") or {}
        if response.get("text"):
            text(f"Ответ · {opponent}" if response.get("position")=="after" else "Перед вашим ответом",sub)
            text(response["text"])
        if item.get("alternative"):
            text("Как можно сказать иначе",sub)
            text(item["alternative"],quote)
        principle=item.get("principle") or {}
        if principle.get("label"):
            text(principle["label"],sub)
            text(principle.get("explanation"))
            text(principle.get("url"),muted)
            for source in principle.get("sources") or []:
                text(f"{source['title']}: {source['url']}", muted)
    if not sections:
        text("В сохранённом отчёте нет подтверждённых аналитических эпизодов. Ниже приведена полная доступная запись; выводы за аналитика не восстановлены.")
    if report.get("mistakes") and not sections:
        for item in report["mistakes"]:
            text(item.get("what"),sub);text(item.get("chosen"),quote);text(item.get("alternative"))
    flow.append(PageBreak())
    section("03 / ПРАКТИКА", "Что попробовать в следующей попытке")
    feedback = report.get("competition_feedback") or {}
    for key, label in (("strength", "Сильная сторона"), ("evidence", "Пример из вашего ответа"),
                       ("improvement", "Что улучшить"), ("better_answer", "Пример более сильного ответа")):
        if feedback.get(key):
            text(label, sub)
            text(feedback[key], quote if key == "evidence" else body)
    for index,recommendation in enumerate(report.get("recommendations") or [],1):
        text(f"{index:02d}. {recommendation}")
    text(note.get("next_step") or "Выберите один разобранный эпизод и повторите беседу с другой формулировкой.")
    if report.get("scoring_explanation"):
        text("Как рассчитаны показатели",sub)
        text(report["scoring_explanation"].get("description"),muted)
    turns=report.get("turn_reviews") or [{"turn":i,"player":row.get("text"),"before":row.get("context"),"after":row.get("reply")} for i,row in enumerate(report.get("transcript") or [],1)]
    if turns:
        flow.append(PageBreak())
        section("04 / ДОКАЗАТЕЛЬСТВА", "Полная запись и основания оценки")
        coverage=report.get("analysis_coverage")
        if coverage:
            text(f"Сохранено ответов: {coverage.get('total',0)}. Ходов с проверенными выводами ИИ: {coverage.get('reviewed',0)}.",muted)
        for row in turns:
            text(f"ХОД {row['turn']:02d}",sub)
            if row.get("before"):
                text(f"{opponent} перед вашим ответом",eyebrow);text(row["before"])
            text("Вы",eyebrow);text(row.get("player"),quote)
            if row.get("after"):
                text(f"Ответ · {opponent}",eyebrow);text(row["after"])
            if row.get("techniques"):
                text("Подтверждённые приёмы: "+"; ".join(row["techniques"]),muted)
            for change in row.get("changes") or []:
                delta=change.get("actual_delta",change.get("delta",0))
                text(f"{change.get('label','Показатель')}: {delta:+g}. {change.get('reason','')}",muted)
            if row.get("source")=="record":
                text("Это запись хода; неподтверждённые выводы о его влиянии не добавлены.",muted)
    text(report.get("evidence_note") or "Разбор основан на сохранённых репликах и данных этой попытки. Неизвестные факты и мотивы не восстанавливались.",muted)

    def decorate(c,doc):
        c.saveState()
        c.setFillColor(PALE);c.rect(0,0,A4[0],A4[1],fill=1,stroke=0)
        c.setFillColor(INK);c.rect(0,A4[1]-68,A4[0],68,fill=1,stroke=0)
        c.drawImage(str(assets/"arena-owl-logo.png"),42,A4[1]-51,28,28,mask="auto")
        c.setFillColor(colors.HexColor("#e7f1ec"));c.setFont("ArenaPdfBold",10);c.drawString(82,A4[1]-36,"АРЕНА ПЕРЕГОВОРОВ")
        c.setFont("ArenaPdf",7);c.drawRightString(A4[0]-42,A4[1]-36,"ЛИЧНЫЙ РАЗБОР")
        c.setStrokeColor(LINE);c.line(42,42,A4[0]-42,42)
        c.setFillColor(MUTED);c.setFont("ArenaPdf",7);c.drawString(42,28,identifier)
        c.drawRightString(A4[0]-42,28,f"{doc.page:02d} / Разбор практики")
        c.restoreState()
    doc=SimpleDocTemplate(output,pagesize=A4,leftMargin=42,rightMargin=42,topMargin=92,bottomMargin=62,
                          title="Подробный разбор переговоров",author="Арена переговоров",subject=report.get("scenario_title") or "Личная практика")
    doc.build(flow,onFirstPage=decorate,onLaterPages=decorate)
    return output.getvalue()
