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


def build_council_report(outcome, messages, members, names, packets=None, agreement=None):
    public = [row for row in messages if row.recipient_id is None]
    episodes = []
    contributions = {}
    from app.engine.council import ROLES
    packets = packets or {}
    agreement = agreement or {}
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
        packet = packets.get(member.user_id) or ROLES.get(getattr(member, "role_key", None), {})
        chronology = []
        for row in rows[:80]:
            techniques = [title for _,title,pattern,_ in PRINCIPLES if re.search(pattern, row.text, re.I)]
            chronology.append({"message_id":row.id,"text":row.text,"source":"voice" if row.kind == "transcript" else "chat", "techniques":techniques,
                "observation": "В реплике наблюдаются: " + ", ".join(techniques) + ". Это наблюдение за этой встречей, а не оценка личности." if techniques else "Реплика зафиксирована. Её влияние на решение нельзя определить автоматически без контекста ответа команды."})
        strengths = [{"title":item["title"],"quote":item["quote"],"message_id":item["message_id"],"explanation":item["lesson"]} for item in evidence]
        next_steps = [{"focus":title,"action":lesson,"basis": "В доступной записи ваших реплик этот приём не обнаружен. Это не доказывает, что вы его не использовали."} for _,title,_,lesson in PRINCIPLES if title in missing]
        contribution_text = "Вы внесли " + str(len(rows)) + " зафиксированных реплик, из них предложений: " + str(sum(row.kind == "proposal" for row in rows)) + "."
        personal = {"role":packet.get("name", "Роль не назначена"),"goal":packet.get("goal", "Цель не сохранена"),
            "constraints":packet.get("limits", []), "known_facts":packet.get("private_facts", []), "contribution_summary":contribution_text,
            "chronology":chronology,"strengths":strengths,"next_steps":next_steps,
            "agreement_review":{"decision":agreement.get("decision", ""),"owner":agreement.get("owner", ""),"open_issues":agreement.get("open_issues", ""),
                "guidance":"Сопоставьте свою цель и границы с зафиксированным решением. Сам факт подписи не доказывает, что все ваши интересы удовлетворены."},
            "reflection":["Как ваша реплика изменила предложение другой стороны?", "Какое ограничение вашей роли вошло в подписанное соглашение?", "Какую уступку вы обменяли на обязательство и где оно зафиксировано?"],
            "limitations": "Анализ использует только ваши сохранённые публичные реплики; личные переписки и догадки не учитываются. Для устной речи возможны ошибки распознавания." if rows else "В доступных материалах нет ваших реплик. Содержательный разбор вклада невозможен; нет оснований оценивать вас по репликам коллег."}
        contributions[str(member.user_id)] = {
            "name": names[member.user_id], "evidence": evidence, "personal_report": personal,
            "public_messages": len(rows), "proposals": sum(row.kind == "proposal" for row in rows),
            "recommendation": f"В следующей игре попробуйте: {missing[0].lower()}." if missing else "Сохраните связку: вопрос → ограничение → предложение → обязательство.",
        }
    joined = " ".join(row.text for row in public)
    discussed = [title for title, pattern in TOPICS if re.search(pattern, joined, re.I)]
    unobserved = [title for title, pattern in TOPICS if not re.search(pattern, joined, re.I)]
    return {**outcome, "episodes": episodes[:12], "contributions": contributions,
            "discussed": discussed, "unobserved": unobserved,
            "evidence_note": "Разбор основан на сохранённых публичных репликах и расшифровках с указанием источника. Голосовая часть включена только при наличии расшифровки; отсутствие факта в материалах не доказывает, что он не обсуждался."}
