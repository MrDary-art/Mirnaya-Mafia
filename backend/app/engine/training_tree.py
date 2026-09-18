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

EMPATHY_LESSONS = [
    [{"title":"Распознайте сигнал","type":"choice","prompt":"«Значит, три года моей работы ничего не стоят?» Что слышно за словами?","options":[{"id":"a","text":"Обида и ощущение несправедливости.","correct":True,"tags":["эмпатия"]},{"id":"b","text":"Только просьба назвать сумму компенсации.","correct":False,"tags":["emotion_ignored"]}]},{"title":"Найдите ошибку","type":"find_mistake","prompt":"HR: «Решение принято, обсуждать нечего». Что произошло?","options":[{"id":"a","text":"HR проигнорировал эмоциональный сигнал.","correct":True,"tags":["emotion_ignored"]},{"id":"b","text":"HR слишком подробно объяснил решение.","correct":False,"tags":["avoidance"]}]},{"title":"Выберите реакцию","type":"choice","prompt":"Сотрудник: «Я чувствую себя ненужным». Как ответить?","options":[{"id":"a","text":"Понимаю, почему это так звучит. Что в этой ситуации задело вас сильнее всего?","correct":True,"tags":["эмпатия","вопросы"]},{"id":"b","text":"Не принимайте это на свой счёт.","correct":False,"tags":["emotion_ignored"]}]},{"title":"Примените навык","type":"guided_response","prompt":"Сотрудник замолчал после новости.","goal":"Признайте реакцию и откройте пространство для вопроса.","required_tags":["эмпатия","вопросы"]}],
    [{"title":"Несправедливость","type":"choice","prompt":"«Почему мне не сказали раньше?» Как не потерять предмет разговора?","options":[{"id":"a","text":"Понимаю ваше разочарование. Давайте разберём, какие сигналы вы не получили и что важно прояснить сейчас.","correct":True,"tags":["эмпатия","структура"]},{"id":"b","text":"Сейчас уже поздно это обсуждать.","correct":False,"tags":["emotion_ignored"]}]},{"title":"Защитная реакция","type":"find_mistake","prompt":"HR: «Не надо спорить, показатели говорят сами за себя». В чём риск?","options":[{"id":"a","text":"Ответ усиливает защиту вместо признания реакции.","correct":True,"tags":["premature_argumentation"]},{"id":"b","text":"HR задал слишком много вопросов.","correct":False,"tags":["avoidance"]}]},{"title":"Верните фокус","type":"choice","prompt":"Сотрудник раздражён: «Вы всё решили без меня».","options":[{"id":"a","text":"Понимаю, почему это вызывает злость. Сначала отвечу, как принималось решение, затем обсудим переход.","correct":True,"tags":["эмпатия","структура"]},{"id":"b","text":"Решение не обязано вам нравиться.","correct":False,"tags":["грубость"]}]},{"title":"Короткий ответ","type":"guided_response","prompt":"«Мне кажется, меня просто списали».","goal":"Признайте эмоцию, назовите предмет разговора и задайте вопрос.","required_tags":["эмпатия","вопросы"]}]
]

FINAL_SCENARIO = {"hr": "hr_firing_01", "sales": "sales_discount_01"}


def nodes() -> list[dict[str, Any]]:
    result = [{"id":"root","type":"root","title":"Арена навыков","parent_id":None,"xp_reward":0}]
    for profession_id, profession in PROFESSIONS.items():
        result.append({"id":profession_id,"type":"profession","title":profession["title"],"description":profession["description"],"parent_id":"root","xp_reward":0})
    for skill_id, (profession_id, title, description) in SKILLS.items():
        result.append({"id":skill_id,"type":"skill","title":title,"description":description,"parent_id":profession_id,"xp_reward":0})
        first, second = CONTENT[skill_id]
        for index, exercise in enumerate((first, second), 1):
            rounds = EMPATHY_LESSONS[index - 1] if skill_id == "hr_empathy" else [exercise]
            result.append({"id":f"{skill_id}_{index}","type":"training","title":exercise["title"],"description":exercise.get("goal") or exercise["prompt"],"parent_id":skill_id,"required_previous":[] if index == 1 else [f"{skill_id}_1"],"xp_reward":50,"exercise":exercise | {"rounds":rounds}})
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
        payload["exercise"]["rounds"] = [{k:v for k,v in round_item.items() if k not in {"options","required_tags"}} | {"options":[{"id":o["id"],"text":o["text"]} for o in round_item.get("options",[])]} for round_item in exercise.get("rounds",[exercise])]
    return payload


def evaluate(node: dict[str, Any], option_id: str | None, answer: str | None, round_index: int = 0) -> dict[str, Any]:
    exercise = node["exercise"].get("rounds", [node["exercise"]])[round_index]
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
