"""Explain saved results without turning four game metrics into a personality diagnosis."""
from collections import Counter

LABELS = {"trust": "Доверие", "goal": "Достижение цели", "control": "Управление разговором", "eq": "Эмоциональное взаимодействие"}
GUIDANCE = {
    "trust": ("Как итог игры отражает рабочий контакт сторон, а не доверчивость человека.", "Перед возражением перескажите позицию собеседника и спросите, верно ли вы поняли. Проверка: собеседник подтвердил или уточнил вашу формулировку."),
    "goal": ("Насколько решения в тренировке приблизили к заданной цели, а не профессиональная успешность в целом.", "В начале назовите желаемый результат, а в конце проверьте конкретные условия: кто, что и к какому сроку делает. Проверка: итог согласован обеими сторонами."),
    "control": ("Как в тренировке сохранялись структура, повестка и продвижение к решению; это не доминирование над человеком.", "Разделите разговор на интересы, варианты и решение. После каждого этапа подведите краткий итог и согласуйте следующий вопрос. Проверка: нет необсуждённых разногласий в финале."),
    "eq": ("Как игровые правила учитывали эмоциональный контакт, а не измерение эмоционального интеллекта или личности.", "Назовите замеченную обеспокоенность как предположение, уточните её и предложите паузу или проверяемый следующий шаг. Проверка: вы опираетесь на ответ, а не угадываете эмоции."),
}


def theme(row):
    settings = row.get("settings") or {}
    return str(settings.get("problem") or row.get("title") or "Переговорная практика")[:700]


def describe_development(rows, baseline, current):
    first, last = rows[:5], rows[-5:]
    initial_best = max(baseline, key=baseline.get)
    initial_low = min(baseline, key=baseline.get)
    current_best = max(current, key=current.get)
    changes = []
    for key, label in LABELS.items():
        delta = current[key] - baseline[key]
        values = [row["metrics"][key] for row in last]
        direction = "выше" if delta > 0 else "ниже" if delta < 0 else "не изменился"
        changes.append({"id": key, "title": label,
            "text": f"Первые пять: {baseline[key]}/100; последние пять: {current[key]}/100. Средний результат {direction}; разница {delta:+d} п. В последних пяти разброс от {min(values)} до {max(values)}. {GUIDANCE[key][0]}",
            "baseline_source_ids": [r["source_id"] for r in first], "current_source_ids": [r["source_id"] for r in last]})
    examples = []
    for period, group in (("Начало", first), ("Последние практики", last)):
        found = 0
        for row in group:
            report = row.get("report") or {}
            narrative = report.get("narrative")
            sections = narrative.get("sections", []) if isinstance(narrative, dict) else []
            for section in sections if isinstance(sections, list) else []:
                if not isinstance(section, dict): continue
                evidence = section.get("evidence")
                quote = evidence.get("quote") if isinstance(evidence, dict) else None
                if not quote or section.get("kind") not in {"strength", "improve"}:
                    continue
                principle = section.get("principle")
                principle = principle if isinstance(principle, dict) else {}
                examples.append({"period": period, "source_id": row["source_id"], "date": row["date"],
                    "kind": section["kind"], "title": str(section.get("title") or "Наблюдение из отчёта")[:250],
                    "quote": str(quote)[:1200], "analysis": str(section.get("body") or "")[:1800],
                    "principle": str(principle.get("label") or ""), "explanation": str(principle.get("explanation") or "")[:1200]})
                found += 1
                if found >= 4: break
            if found >= 4: break
    priorities = sorted(current, key=lambda key: (current[key], current[key] - baseline[key]))[:2]
    topics = Counter(theme(row) for row in rows)
    return {"summary": f"В расчёте {len(rows)} завершённых отчётов. На старте самый высокий средний показатель - «{LABELS[initial_best]}» ({baseline[initial_best]}/100), самый низкий - «{LABELS[initial_low]}» ({baseline[initial_low]}/100). В последних пяти ведущий показатель - «{LABELS[current_best]}» ({current[current_best]}/100). Это относительное сравнение ваших игровых результатов, не ярлык «хороший» или «плохой» навык.",
        "periods": [{"title": "Первые пять отчётов", "from": first[0]["date"], "to": first[-1]["date"], "source_ids": [r["source_id"] for r in first]},
                    {"title": "Последние пять отчётов", "from": last[0]["date"], "to": last[-1]["date"], "source_ids": [r["source_id"] for r in last]}],
        "dimensions": changes, "examples": examples,
        "priorities": [{"title": LABELS[key], "reason": f"Текущий средний результат {current[key]}/100; изменение к первым пяти {current[key]-baseline[key]:+d} п. Это один из двух минимальных текущих показателей.",
            "exercise": GUIDANCE[key][1], "check": "Повторите ту же ситуацию с теми же ролями и сложностью без подсказок. Сравните реплики, а затем показатели; одна удачная попытка ещё не означает устойчивого улучшения."} for key in priorities],
        "topics": [{"title": title, "count": count} for title, count in topics.most_common(8)],
        "limitations": "Сравниваются средние первых пяти и последних пяти отчётов без пересечения. Остальные отчёты отражены в источниках и тематике. Разные темы, роли, сложность и подсказки могут менять баллы; разница не доказывает рост навыка или причину изменения. Метрики - учебные показатели тренажёра, не психометрический тест. Теоретические пояснения в примерах взяты из сохранённых разборов и не создаются заново.",
        "evidence_note": "Примеры - выдержки из сохранённых отчётов с номерами источников. Если в старом отчёте нет цитат, они не восстанавливаются по баллам и не выдумываются." if examples else "В этих отчётах нет подходящих сохранённых цитат. По одним баллам нельзя восстановить, что именно вы говорили: примеры и теоретические объяснения конкретных реплик здесь не выдумываются."}
