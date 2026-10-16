"""Evidence-bound council feedback. Never infer personality or use private chats."""
import re

PRINCIPLES = [
    ("question", "Уточнение интересов", r"\?|уточн|выясн|како|сколько|почему", "Открытый вопрос помогает получить информацию, которой нет в вашей карточке."),
    ("constraint", "Проверка ограничений", r"не можем|невозмож|не успе|огранич|не более|не меньше|только при", "Явное ограничение помогает команде проверить обещания до подписания."),
    ("proposal", "Условное предложение", r"если|предлага|при услов|в обмен", "Связывайте уступку с условием: это позволяет собрать взаимовыгодный пакет."),
    ("commitment", "Фиксация обязательств", r"отвечаю|подтвержд|обязую|беру на себя|ответствен", "Названное обязательство стоит перенести в соглашение вместе со сроком и ответственным."),
]
TOPICS = [("Объём первой партии", r"40\s*%|сорок|перв\w* парти"),
          ("Сроки поставок", r"14|30\s*(?:дн|день)|срок|график"),
          ("Источник финансирования", r"предоплат|аванс|финанс"),
          ("Расходы на ускорение", r"20\s*000|25\s*000|ускорен|расход")]


def build_council_report(outcome, messages, members, names):
    public = [row for row in messages if row.recipient_id is None]
    episodes = []
    contributions = {}
    for member in members:
        if member.status != "confirmed":
            continue
        rows = [row for row in public if row.author_id == member.user_id]
        evidence = []
        for key, title, pattern, lesson in PRINCIPLES:
            match = next((row for row in rows if (key == "proposal" and row.kind == "proposal") or re.search(pattern, row.text, re.I)), None)
            if match:
                item = {"message_id": match.id, "author": names[member.user_id], "title": title,
                        "quote": match.text, "lesson": lesson}
                evidence.append(item)
                episodes.append(item)
        missing = [title for key, title, _, _ in PRINCIPLES if not any(item["title"] == title for item in evidence)]
        contributions[str(member.user_id)] = {
            "name": names[member.user_id], "evidence": evidence,
            "public_messages": len(rows), "proposals": sum(row.kind == "proposal" for row in rows),
            "recommendation": f"В следующей игре попробуйте: {missing[0].lower()}." if missing else "Сохраните связку: вопрос → ограничение → предложение → обязательство.",
        }
    joined = " ".join(row.text for row in public)
    discussed = [title for title, pattern in TOPICS if re.search(pattern, joined, re.I)]
    unobserved = [title for title, pattern in TOPICS if not re.search(pattern, joined, re.I)]
    return {**outcome, "episodes": episodes[:12], "contributions": contributions,
            "discussed": discussed, "unobserved": unobserved,
            "evidence_note": "Разбор основан только на публичных текстовых репликах и предложениях. Голос не записывается; отсутствие факта в чате не означает, что его не обсуждали устно."}
