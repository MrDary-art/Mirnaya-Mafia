from __future__ import annotations

from typing import Any

from app.engine.parser import rule_based_analysis


PROFESSIONS = {
    "hr": {"title": "HR", "description": "Сложные разговоры с людьми"},
    "sales": {"title": "Sales", "description": "Переговоры с клиентами"},
}

SKILLS = {
    "hr_empathy": ("hr", "Эмпатия", "Распознавать эмоции и реагировать бережно"),
    "hr_difficult": ("hr", "Сложные разговоры", "Сообщать неприятные решения ясно"),
    "hr_conflict": ("hr", "Управление конфликтом", "Удерживать разговор в предмете"),
    "sales_interests": ("sales", "Выявление интересов", "Находить настоящую потребность"),
    "sales_objections": ("sales", "Работа с возражениями", "Слышать сомнение без давления"),
    "sales_bargaining": ("sales", "Торг", "Обменивать уступки на ценность"),
}

CONTENT: dict[str, list[dict[str, Any]]] = {
    "hr_empathy": [
        {"title": "Распознать эмоцию", "type": "find_mistake", "prompt": "Сотрудник: «Мои три года здесь ничего не значат?» HR отвечает: «Решение принято». Что упущено?", "options": [{"id":"a","text":"Эмоциональный сигнал сотрудника","correct":True,"tags":["emotion_ignored","эмпатия"]},{"id":"b","text":"Размер кабинета","correct":False,"tags":["avoidance"]}]},
        {"title": "Правильно отреагировать", "type": "guided_response", "prompt": "Сотрудник: «Почему мне раньше не сказали?»", "goal": "Признайте эмоцию и задайте открытый вопрос.", "required_tags":["эмпатия","вопросы"]},
    ],
    "hr_difficult": [
        {"title":"Начать сложный разговор","type":"choice","prompt":"Как открыть встречу?","options":[{"id":"a","text":"Есть сложный разговор: сначала объясню факты, затем обсудим вопросы.","correct":True,"tags":["структура"]},{"id":"b","text":"У вас проблемы, всё уже решено.","correct":False,"tags":["premature_argumentation"]}]},
        {"title":"Сообщить решение","type":"guided_response","prompt":"Нужно отказать в повышении.","goal":"Признайте вклад, назовите критерии и следующий шаг.","required_tags":["объективные критерии","структура"]},
    ],
    "hr_conflict": [
        {"title":"Не перейти к спору","type":"choice","prompt":"Сотрудник повышает голос. Что ответить?","options":[{"id":"a","text":"Вижу, что это вызывает злость. Давайте вернёмся к фактам и вариантам.","correct":True,"tags":["эмпатия","структура"]},{"id":"b","text":"Не повышайте голос на меня.","correct":False,"tags":["грубость"]}]},
        {"title":"Вернуть разговор к предмету","type":"free_response","prompt":"Собеседник обвиняет руководство во всём.","goal":"Признайте эмоцию и верните разговор к конкретному вопросу.","required_tags":["эмпатия","вопросы"]},
    ],
    "sales_interests": [
        {"title":"Открытые вопросы","type":"choice","prompt":"Клиент просит скидку. Первый вопрос?","options":[{"id":"a","text":"Что для вас важнее всего в этом решении помимо цены?","correct":True,"tags":["вопросы"]},{"id":"b","text":"Какую скидку вы хотите?","correct":False,"tags":["premature_argumentation"]}]},
        {"title":"Выявить потребность","type":"guided_response","prompt":"Клиент: «У конкурента дешевле».","goal":"Уточните критерии и интерес клиента открытым вопросом.","required_tags":["вопросы"]},
    ],
    "sales_objections": [
        {"title":"Услышать возражение","type":"find_mistake","prompt":"Клиент: «Сроки слишком рискованные». Менеджер: «Зато цена хорошая». Что не так?","options":[{"id":"a","text":"Возражение о риске проигнорировано","correct":True,"tags":["no_interest_exploration"]},{"id":"b","text":"Не назван цвет продукта","correct":False,"tags":["avoidance"]}]},
        {"title":"Ответить без давления","type":"free_response","prompt":"Клиент сомневается в надёжности поставки.","goal":"Признайте сомнение и предложите проверить критерии.","required_tags":["эмпатия","объективные критерии"]},
    ],
    "sales_bargaining": [
        {"title":"Якорение","type":"choice","prompt":"Клиент просит скидку 25%. Как ответить?","options":[{"id":"a","text":"Обсудим объём и срок: при них возможна взаимная уступка.","correct":True,"tags":["объективные критерии","структура"]},{"id":"b","text":"Ладно, дадим 25%, лишь бы закрыть сделку.","correct":False,"tags":["unreciprocated_concession"]}]},
        {"title":"Встречная уступка","type":"guided_response","prompt":"Клиент просит дополнительную скидку.","goal":"Предложите взаимную уступку и критерий решения.","required_tags":["объективные критерии","структура"]},
    ],
}

FINAL_SCENARIO = {"hr": "hr_firing_01", "sales": "sales_discount_01"}


def nodes() -> list[dict[str, Any]]:
    result = [{"id":"root","type":"root","title":"Арена навыков","parent_id":None,"xp_reward":0}]
    for profession_id, profession in PROFESSIONS.items():
        result.append({"id":profession_id,"type":"profession","title":profession["title"],"description":profession["description"],"parent_id":"root","xp_reward":0})
    for skill_id, (profession_id, title, description) in SKILLS.items():
        result.append({"id":skill_id,"type":"skill","title":title,"description":description,"parent_id":profession_id,"xp_reward":0})
        first, second = CONTENT[skill_id]
        for index, exercise in enumerate((first, second), 1):
            result.append({"id":f"{skill_id}_{index}","type":"training","title":exercise["title"],"description":exercise.get("goal") or exercise["prompt"],"parent_id":skill_id,"required_previous":[] if index == 1 else [f"{skill_id}_1"],"xp_reward":50,"exercise":exercise})
        result.append({"id":f"{skill_id}_final","type":"final","title":f"★ {title}: финальная сцена","description":"Пройдите полноценные переговоры с минимумом подсказок.","parent_id":skill_id,"required_previous":[f"{skill_id}_2"],"xp_reward":100,"scenario_id":FINAL_SCENARIO[profession_id]})
    return result


NODES = {node["id"]: node for node in nodes()}


def public_node(node: dict[str, Any]) -> dict[str, Any]:
    payload = {key: value for key, value in node.items() if key != "exercise"}
    if node.get("exercise"):
        exercise = node["exercise"]
        payload["exercise"] = {key: value for key, value in exercise.items() if key not in {"required_tags", "options"}}
        if exercise.get("options"):
            payload["exercise"]["options"] = [{"id": item["id"], "text": item["text"]} for item in exercise["options"]]
    return payload


def evaluate(node: dict[str, Any], option_id: str | None, answer: str | None) -> dict[str, Any]:
    exercise = node["exercise"]
    if exercise.get("options"):
        option = next((item for item in exercise["options"] if item["id"] == option_id), None)
        if not option:
            raise ValueError("Выберите вариант ответа")
        return {"ok":bool(option["correct"]),"tags":option.get("tags",[]),"feedback":"Сильный ход: продолжайте." if option["correct"] else "Здесь важнее заметить интерес или эмоцию, а затем вернуть структуру."}
    if not (answer or "").strip():
        raise ValueError("Введите ответ")
    techniques = set(rule_based_analysis(answer or "").get("techniques") or [])
    required = set(exercise.get("required_tags") or [])
    missing = sorted(required - techniques)
    return {"ok":not missing,"tags":list(techniques) + [f"missing_{tag}" for tag in missing],"feedback":"Все учебные техники распознаны." if not missing else f"Не хватает: {', '.join(missing)}."}
