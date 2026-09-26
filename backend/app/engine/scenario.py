from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path
from typing import Any

from app.engine.metrics import START_METRICS, pick_ending, snapshot

SCENARIO_DIR = Path(__file__).resolve().parent.parent / "data" / "scenarios"

PROFILE_BY_TKI = {
    "сотрудничество": "Интегратор — ищете взаимную выгоду и держите контакт.",
    "конкуренция": "Напористый переговорщик — давите на результат, рискуя отношениями.",
    "компромисс": "Практик обмена — быстро закрываете сделку ценой части интересов.",
    "избегание": "Осторожный стратег — откладываете конфликт, теряя темп.",
    "приспособление": "Хранитель отношений — уступаете, чтобы сохранить мир.",
}

CHAOS_EVENTS = [
    {
        "id": "interruption",
        "text": "Оппонент перебивает вас: «Позвольте, я не закончил!»",
        "effect": {"trust": 0, "goal": -1, "control": -2, "eq": -1},
        "response_options": [
            {"text": "Извиниться и дать договорить", "delta": {"trust": +2, "control": -1, "eq": +2}},
            {"text": "Вежливо продолжить: «Я услышал, позвольте завершить мысль»", "delta": {"trust": +1, "control": +2, "eq": +1}},
            {"text": "Перебить в ответ", "delta": {"trust": -4, "control": -1, "eq": -3}},
        ],
    },
    {
        "id": "phone_call",
        "text": "Звонит телефон. Оппонент смотрит на вас.",
        "effect": {"trust": 0, "goal": 0, "control": -1, "eq": 0},
        "response_options": [
            {"text": "Извиниться и проигнорировать звонок", "delta": {"trust": +2, "control": +1, "eq": +1}},
            {"text": "Быстро ответить: «Коротко»", "delta": {"trust": -1, "control": -2, "eq": -1}},
            {"text": "Отклонить вызов", "delta": {"trust": +1, "control": +1, "eq": 0}},
        ],
    },
    {
        "id": "visitor",
        "text": "В комнату заходит коллега оппонента.",
        "effect": {"trust": 0, "goal": 0, "control": 0, "eq": 0},
        "response_options": [
            {"text": "Сделать паузу, подождать", "delta": {"trust": +1, "control": +1, "eq": +1}},
            {"text": "Продолжить говорить", "delta": {"trust": -1, "control": 0, "eq": -1}},
            {"text": "Предложить продолжить позже", "delta": {"trust": +1, "control": -1, "eq": 0}},
        ],
    },
    {
        "id": "connection_loss",
        "text": "Связь прерывается. Вы слышите: «...пропадает...»",
        "effect": {"trust": 0, "goal": -1, "control": -1, "eq": 0},
        "response_options": [
            {"text": "Говорить короче и чётче", "delta": {"trust": +1, "control": +2, "eq": +1}},
            {"text": "Повторять последнее предложение", "delta": {"trust": 0, "control": -1, "eq": 0}},
            {"text": "Предложить перезвонить", "delta": {"trust": +1, "control": 0, "eq": +1}},
        ],
    },
    {
        "id": "topic_change",
        "text": "Оппонент резко меняет тему: «Кстати, а что насчёт...»",
        "effect": {"trust": 0, "goal": -2, "control": -2, "eq": 0},
        "response_options": [
            {"text": "Вернуть к теме: «Давайте сначала закроем текущий вопрос»", "delta": {"trust": +1, "control": +3, "eq": +1}},
            {"text": "Поддержать новую тему", "delta": {"trust": +1, "control": -2, "goal": -2}},
            {"text": "Игнорировать и продолжить", "delta": {"trust": -2, "control": 0, "eq": -1}},
        ],
    },
]


def load_scenarios() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
            entries = data if isinstance(data, list) else [data]
            for entry in entries:
                scenario = _ensure_long_dialogue(_expand_library_scenario(entry))
                out[scenario["id"]] = scenario
    return out


def _expand_library_scenario(source: dict[str, Any]) -> dict[str, Any]:
    """Expand compact authored entries into a six-turn offline dialogue tree."""
    if source.get("template") != "three_turn_business":
        return source
    scenario = dict(source)
    scenario.pop("template", None)
    opening = scenario.pop("opening")
    constructive = scenario.pop("constructive")
    defensive = scenario.pop("defensive")
    close = scenario.pop("close")
    prefix = scenario["id"]

    def option(key, text, tki, techniques, effects, nxt, comment):
        return {"id": key, "text": text, "tki": tki, "techniques": techniques, "effects": effects, "next": nxt, "comment": comment}

    def step(name: str, line: str, choices: list[dict[str, Any]]) -> dict[str, Any]:
        return {"id": f"{prefix}_{name}", "opponent_line": line, "options": choices}

    def choice(name: str, text: str, tki: str, techniques: list[str], effects: dict[str, int], nxt: str, comment: str) -> dict[str, Any]:
        return option(f"{name}", text, tki, techniques, effects, f"{prefix}_{nxt}" if not nxt.startswith("end:") else nxt, comment)

    player_goal = scenario["player_goal"]
    opponent_goal = scenario["opponent_goal"]
    scenario["minutes"] = max(int(scenario.get("minutes", 7)), 12)
    scenario["steps"] = [
        step("start", opening, [
            choice("start_listen", source["listen"], "сотрудничество", ["эмпатия", "вопросы"], {"trust": 5, "goal": 3, "control": 2, "eq": 4}, "open_positive", "Вы признали позицию собеседника и открыли обсуждение интересов."),
            choice("start_push", source["push"], "конкуренция", ["давление"], {"trust": -5, "goal": 2, "control": 2, "eq": -3}, "open_tense", "Давление ускорило разговор, но усилило сопротивление."),
            choice("start_yield", source["yield"], "избегание", ["уступка без выгоды"], {"trust": 1, "goal": -5, "control": -4, "eq": 0}, "open_tense", "Уступка без обмена оставила вашу цель без защиты."),
        ]),
        step("open_positive", constructive, [
            choice("positive_criteria", source["criteria"], "сотрудничество", ["объективные критерии", "структура"], {"trust": 4, "goal": 6, "control": 4, "eq": 2}, "align", "Критерии сделали разговор проверяемым."),
            choice("positive_trade", source["trade"], "компромисс", ["поиск вариантов"], {"trust": 3, "goal": 3, "control": 2, "eq": 2}, "design", "Вы нашли обмен, сохранив пространство для соглашения."),
            choice("positive_ultimatum", source["ultimatum"], "конкуренция", ["давление"], {"trust": -4, "goal": 1, "control": 1, "eq": -3}, "tension", "Ультиматум разрушил часть накопленного доверия."),
        ]),
        step("open_tense", defensive, [
            choice("tense_repair", source["repair"], "сотрудничество", ["отражение эмоций", "вопросы"], {"trust": 4, "goal": 3, "control": 2, "eq": 5}, "align", "Вы снизили накал и вернули разговор к задаче."),
            choice("tense_boundary", source["boundary"], "компромисс", ["структура"], {"trust": 1, "goal": 3, "control": 4, "eq": 1}, "design", "Граница была обозначена спокойно и ясно."),
            choice("tense_escalate", source["escalate"], "конкуренция", ["агрессия"], {"trust": -7, "goal": -4, "control": -2, "eq": -6}, "tension", "Эскалация закрыла путь к совместному решению."),
        ]),
        step("align", f"Хорошо, давайте говорить предметно. Для меня важно {opponent_goal.lower()}", [
            choice("align_interests", f"Сверим интересы: моя задача — {player_goal.lower()} Что для вас будет приемлемым результатом?", "сотрудничество", ["интересы", "вопросы"], {"trust": 4, "goal": 4, "control": 2, "eq": 4}, "proposal", "Вы перевели позиции в интересы обеих сторон."),
            choice("align_options", "Предложу два варианта и сравним их по рискам, сроку и ценности для обеих сторон.", "компромисс", ["варианты", "объективные критерии"], {"trust": 3, "goal": 4, "control": 4, "eq": 2}, "proposal", "Несколько вариантов снизили давление одного решения."),
            choice("align_rush", "Нам уже всё понятно, давайте сразу закрепим мой вариант.", "конкуренция", ["давление"], {"trust": -3, "goal": 1, "control": 2, "eq": -2}, "proposal", "Спешка вернула разговор к позиционному торгу."),
        ]),
        step("design", f"Варианты возможны, но мне нужно понимать границы и цену каждого решения. Какой план вы предлагаете?", [
            choice("design_plan", f"Разобьём решение на этапы: сначала минимальный шаг к цели «{player_goal}», затем контрольная точка и следующий объём.", "сотрудничество", ["структура", "план действий"], {"trust": 4, "goal": 5, "control": 5, "eq": 2}, "proposal", "План сделал обязательства управляемыми."),
            choice("design_trade", "Сделаем обмен: я беру конкретное обязательство, а вы подтверждаете встречное условие и срок.", "компромисс", ["обмен", "вопросы"], {"trust": 3, "goal": 4, "control": 3, "eq": 2}, "proposal", "Обмен помог сбалансировать вклад сторон."),
            choice("design_concede", "Согласен на ваш вариант без дополнительных условий, лишь бы быстрее закрыть вопрос.", "приспособление", ["уступка без выгоды"], {"trust": 1, "goal": -4, "control": -4, "eq": 0}, "proposal", "Вы потеряли возможность защитить свою цель."),
        ]),
        step("tension", f"Сейчас мне сложно вам доверять. Почему я должен считать, что предложенное решение учитывает {opponent_goal.lower()}?", [
            choice("tension_reset", "Справедливый вопрос. Вернёмся к фактам, назовём риски и проверим, что получит каждая сторона.", "сотрудничество", ["отражение эмоций", "объективные критерии"], {"trust": 4, "goal": 3, "control": 3, "eq": 5}, "proposal", "Вы восстановили рабочий тон через факты."),
            choice("tension_boundary", "Готов обсуждать решение, но без взаимных угроз: зафиксируем факты и один следующий шаг.", "компромисс", ["границы", "структура"], {"trust": 1, "goal": 3, "control": 5, "eq": 2}, "proposal", "Вы удержали рамку без дополнительной эскалации."),
            choice("tension_attack", "Потому что альтернативы для вас будут хуже, и вы это знаете.", "конкуренция", ["давление"], {"trust": -6, "goal": 1, "control": 1, "eq": -5}, "proposal", "Давление усилило сопротивление и риск срыва."),
        ]),
        step("proposal", "Я готов рассмотреть это. Какие условия, сроки и критерии покажут, что договорённость действительно работает?", [
            choice("proposal_measure", "Зафиксируем результат, владельцев, дату проверки и измеримый критерий успеха в одном письме сегодня.", "сотрудничество", ["объективные критерии", "фиксация"], {"trust": 4, "goal": 5, "control": 5, "eq": 2}, "safeguards", "Вы превратили намерение в проверяемую договорённость."),
            choice("proposal_pilot", "Начнём с обратимого пилота, заранее определим порог успеха и решение по следующему этапу.", "компромисс", ["пилот", "управление риском"], {"trust": 3, "goal": 4, "control": 4, "eq": 3}, "safeguards", "Пилот снизил риски и сохранил движение к цели."),
            choice("proposal_vague", "Давайте просто договоримся по ходу дела — детали сейчас только мешают.", "избегание", ["неопределённость"], {"trust": -2, "goal": -3, "control": -4, "eq": -1}, "safeguards", "Неясность оставила риск нового конфликта."),
        ]),
        step("safeguards", "Перед финальным решением хочу убедиться: что мы сделаем, если условия изменятся или одна из сторон не выполнит обязательство?", [
            choice("safeguards_review", "Добавим контрольную встречу и правило пересмотра: изменение условий обсуждаем до действия, а не после срыва.", "сотрудничество", ["профилактика конфликта", "структура"], {"trust": 4, "goal": 4, "control": 5, "eq": 3}, "commit", "Вы предусмотрели безопасный способ адаптировать договорённость."),
            choice("safeguards_owner", "Назначим владельца с каждой стороны и канал, куда сразу поднимать риск без поиска виноватых.", "компромисс", ["ответственность", "коммуникация"], {"trust": 3, "goal": 3, "control": 4, "eq": 3}, "commit", "Ясные владельцы снизили риск потери договорённостей."),
            choice("safeguards_ignore", "Разберёмся, если проблема появится; сейчас не будем усложнять.", "избегание", ["уход от риска"], {"trust": -1, "goal": -2, "control": -3, "eq": -1}, "commit", "Риск остался без механизма решения."),
        ]),
        step("commit", f"Тогда резюмирую: мы движемся к результату «{player_goal}». Подтверждаете финальную договорённость?", [
            choice("commit_confirm", f"Подтверждаю. Сегодня фиксируем договорённость письменно, выполняем первый шаг и встречаемся в согласованную дату проверки.", "сотрудничество", ["резюме", "фиксация"], {"trust": 5, "goal": 6, "control": 4, "eq": 3}, "end:eval", "Вы ясно закрепили взаимный коммит."),
            choice("commit_pause", "Мне нужно подумать, вернусь без конкретной даты.", "избегание", ["пауза"], {"trust": -2, "goal": -2, "control": -2, "eq": 0}, "end:eval", "Пауза без рамки ослабила достигнутый прогресс."),
            choice("commit_pressure", "Подтверждайте сейчас, иначе я выбираю другой путь.", "конкуренция", ["ультиматум"], {"trust": -4, "goal": 1, "control": 1, "eq": -3}, "end:eval", "Финальное давление поставило отношения под угрозу."),
        ]),
    ]
    scenario["endings"] = [
        {"id": "excellent", "condition": "goal >= 49 && trust >= 57 && eq >= 55", "verdict": close + " Договорённость достигнута без потери рабочих отношений.", "outcome": "excellent"},
        {"id": "good", "condition": "goal >= 43 && trust >= 45", "verdict": close + " Основная цель достигнута через рабочий компромисс.", "outcome": "good"},
        {"id": "partial", "condition": "goal >= 35", "verdict": "Результат частичный: следующий шаг нужно закрепить письменно и вернуться к спорным условиям.", "outcome": "partial"},
        {"id": "failure", "condition": "true", "verdict": "Договорённость не достигнута: давление и неясные условия усилили сопротивление.", "outcome": "failure"},
    ]
    return scenario


def _ensure_long_dialogue(scenario: dict[str, Any], minimum_turns: int = 20) -> dict[str, Any]:
    """Extend every authored route to a full 40-message practice dialogue.

    Each continuation turn keeps the same three-choice scoring contract. The
    authored opening tree remains intact; the continuation makes the agreement
    concrete instead of ending immediately after the first proposal.
    """

    steps = scenario["steps"]
    by_id = {step["id"]: step for step in steps}

    def shortest_route(step_id: str, seen: frozenset[str] = frozenset()) -> int:
        if step_id in seen:
            return 0
        step = by_id[step_id]
        lengths = []
        for option in step["options"]:
            nxt = str(option.get("next") or "end:eval")
            lengths.append(1 if nxt.startswith("end:") else 1 + shortest_route(nxt, seen | {step_id}))
        return min(lengths) if lengths else 0

    existing_turns = shortest_route(steps[0]["id"])
    extension_turns = max(0, minimum_turns - existing_turns)
    if not extension_turns:
        return scenario

    prefix = scenario["id"]
    first_extension = f"{prefix}_deep_01"
    for step in steps:
        for option in step["options"]:
            if str(option.get("next") or "").startswith("end:"):
                option["next"] = first_extension

    player_goal = scenario.get("player_goal") or scenario.get("goal") or "достичь договорённости"
    opponent_goal = scenario.get("opponent_goal") or "защитить свои интересы"
    phases = [
        ("Факты понятны, но какие детали ещё могут изменить решение?", "Сверю подтверждённые факты, источники и допущения, чтобы мы не спорили о предположениях.", "Отмечу, какие данные нужно проверить до следующего шага, и зафиксирую ответственных.", "Детали не важны: давайте просто примем решение сейчас."),
        ("Теперь назовите, что для вашей стороны действительно критично, помимо заявленной позиции.", f"С моей стороны цель — {player_goal.lower()}; что поможет вам {opponent_goal.lower()}?", "Составим список интересов обеих сторон и отметим, где они совпадают.", "Моя позиция уже ясна, обсуждать ваши интересы не вижу смысла."),
        ("Какие ограничения по сроку, бюджету или полномочиям мы обязаны учесть?", "Разделим жёсткие ограничения и те, которые можно пересмотреть при взаимной выгоде.", "Сначала определим границы, затем выберем вариант, который в них укладывается.", "Ограничения — ваша проблема, я не готов менять свои условия."),
        ("Вижу несколько путей. Какой из них даёт наибольшую ценность обеим сторонам?", "Предложу два сопоставимых варианта с последствиями по сроку, риску и результату.", "Соберём варианты без обязательств, а затем оценим их по общим критериям.", "Есть только один приемлемый вариант — мой."),
        ("По каким объективным критериям мы сравним эти варианты?", "Опираемся на измеримый результат, подтверждённые данные и заранее согласованный порог успеха.", "Зафиксируем критерии в таблице, чтобы решение не зависело от настроения в моменте.", "Критерии только затянут разговор; достаточно моего опыта."),
        ("Что каждая сторона готова вложить, чтобы выбранный вариант сработал?", "Назову наше обязательство и попрошу встречное действие с понятным сроком.", "Соберём взаимный обмен так, чтобы ни одна сторона не несла весь риск одна.", "Пусть ваша сторона сделает всё первой, а потом посмотрим."),
        ("Какой риск может сорвать договорённость и как мы заметим его заранее?", "Определим ранний сигнал риска и действие, которое запускаем до того, как проблема станет критичной.", "Добавим короткую контрольную точку, где можно безопасно скорректировать план.", "Не будем заранее думать о проблемах — это только создаёт лишнюю тревогу."),
        ("Кого ещё нужно вовлечь, чтобы решение не было отменено после нашей встречи?", "Согласуем заинтересованных лиц и передадим им единое резюме без потери контекста.", "Назначим одного согласующего от каждой стороны, чтобы избежать параллельных трактовок.", "Не нужно никого вовлекать, пусть потом разбираются сами."),
        ("Какие ресурсы нужны для первого шага и кто их подтверждает?", "Разобьём первый шаг на реалистичный объём и закрепим владельца каждого ресурса.", "Выберем минимальный запуск, который проверит гипотезу без лишних затрат.", "Начнём без ресурсов и плана, а дальше как-нибудь справимся."),
        ("Какой срок будет честным и что считаем выполнением первого этапа?", "Назовём дату, измеримый результат и условие, при котором срок нужно пересмотреть заранее.", "Зафиксируем промежуточный результат раньше финальной даты, чтобы не узнать о риске слишком поздно.", "Срок поставим формально, а детали определим потом."),
        ("Если мнения снова разойдутся, как будем решать спор без эскалации?", "Сначала возвращаемся к фактам и критериям, затем подключаем согласованного нейтрального участника.", "Определим канал для разногласий и правило ответа, чтобы конфликт не копился молча.", "Если возникнет спор, решит тот, у кого больше влияния."),
        ("Что нужно протестировать до окончательного обязательства?", "Запустим небольшой проверяемый этап и заранее определим, какой результат позволит двигаться дальше.", "Сделаем пилот с ограниченным риском и общей ретроспективой после него.", "Тесты не нужны — либо принимаем всё, либо прекращаем разговор."),
        ("Как убедимся, что договорённость понятна одинаково обеим сторонам?", "Сейчас кратко резюмирую условия, а вы поправите любую неточность до фиксации.", "Оформим один документ с результатом, сроками, владельцами и правилом пересмотра.", "Каждый и так понял по-своему, не стоит тратить время на резюме."),
        ("Остался финальный вопрос: что подтверждаем сегодня и когда сверяем результат?", "Подтверждаю: сегодня фиксируем договорённость письменно и встречаемся в согласованную дату проверки.", "Подтверждаю первый шаг и отправляю резюме с владельцами сразу после встречи.", "Подтверждаю только на словах, письменная фиксация пока не нужна."),
    ]
    phases = phases[:extension_turns]
    cooperative_effect = {"trust": 3, "goal": 3, "control": 3, "eq": 3}
    structured_effect = {"trust": 2, "goal": 3, "control": 4, "eq": 2}
    poor_effect = {"trust": -3, "goal": -2, "control": -2, "eq": -3}

    for index, (line, collaborative, structured, pressure) in enumerate(phases, start=1):
        nxt = "end:eval" if index == len(phases) else f"{prefix}_deep_{index + 1:02d}"
        steps.append(
            {
                "id": f"{prefix}_deep_{index:02d}",
                "opponent_line": line,
                "options": [
                    {"id": f"deep_{index:02d}_collaborate", "text": collaborative, "tki": "сотрудничество", "techniques": ["интересы", "вопросы"], "effects": cooperative_effect, "next": nxt, "comment": "Вы усилили ясность и совместную ответственность."},
                    {"id": f"deep_{index:02d}_structure", "text": structured, "tki": "компромисс", "techniques": ["структура", "объективные критерии"], "effects": structured_effect, "next": nxt, "comment": "Вы сохранили управляемый процесс и конкретику."},
                    {"id": f"deep_{index:02d}_pressure", "text": pressure, "tki": "конкуренция", "techniques": ["давление"], "effects": poor_effect, "next": nxt, "comment": "Давление или уход от деталей повысили риск срыва."},
                ],
            }
        )
    # Estimate time from the actual playable route, rather than giving every
    # extended scenario the same 25-minute label. A turn takes roughly 48
    # seconds to read, consider the options, and answer; harder negotiations
    # need additional reflection time.
    route_turns = existing_turns + extension_turns
    reflection_minutes = {"easy": 0, "medium": 1, "hard": 2, "expert": 3, "brutal": 4}.get(
        scenario.get("difficulty"), 1
    )
    estimated_minutes = (route_turns * 4 + 4) // 5 + reflection_minutes
    scenario["minutes"] = max(int(scenario.get("minutes", 7)), estimated_minutes)
    return scenario


SCENARIOS = load_scenarios()


def get_chaos_event(turns: int, difficulty: str) -> dict[str, Any] | None:
    """Вернуть событие хаоса если оно должно произойти на этом ходу."""
    # Частота зависит от сложности
    frequencies = {"лёгкий": 0.05, "средний": 0.1, "сложный": 0.15, "жёсткий": 0.2}
    freq = frequencies.get(difficulty, 0.1)
    
    # Не чаще чем раз в 3 хода
    if turns % 3 != 0:
        return None
    
    if random.random() > freq:
        return None
    
    return random.choice(CHAOS_EVENTS)


def get_scenario(scenario_id: str) -> dict[str, Any]:
    if scenario_id not in SCENARIOS:
        raise KeyError(scenario_id)
    return SCENARIOS[scenario_id]


def dialogue_stats(scenario: dict[str, Any]) -> dict[str, int]:
    """Expose the shortest complete route and authored answer count for the catalog."""

    steps = {step["id"]: step for step in scenario["steps"]}
    route_cache: dict[tuple[str, frozenset[str]], int] = {}

    def turns_to_end(step_id: str, seen: frozenset[str] = frozenset()) -> int:
        if step_id in seen:
            return 0
        cache_key = (step_id, seen)
        if cache_key in route_cache:
            return route_cache[cache_key]
        step = steps[step_id]
        lengths = []
        for option in step["options"]:
            nxt = str(option.get("next") or "end:eval")
            lengths.append(1 if nxt.startswith("end:") else 1 + turns_to_end(nxt, seen | {step_id}))
        route_cache[cache_key] = min(lengths) if lengths else 0
        return route_cache[cache_key]

    return {
        "turns": turns_to_end(scenario["steps"][0]["id"]),
        "choice_count": sum(len(step.get("options") or []) for step in scenario["steps"]),
    }


def list_scenarios() -> list[dict[str, Any]]:
    items = []
    for sc in SCENARIOS.values():
        stats = dialogue_stats(sc)
        items.append(
            {
                "id": sc["id"],
                "title": sc["title"],
                "context": sc["context"],
                "roles": sc["roles"],
                "goal": sc.get("player_goal") or sc["goal"],
                "difficulty": sc.get("difficulty", "medium"),
                "problem": sc.get("problem"),
                "steps": len(sc.get("steps", [])),
                **stats,
                "category": sc.get("category", "Другое"),
                "skills": sc.get("skills", []),
                "minutes": sc.get("minutes", 7),
                "features": sc.get("features", []),
                "opponent": sc["roles"].get("opponent"),
                "description": sc.get("description") or sc["context"],
            }
        )
    return items


def match_scenario(settings: dict[str, Any]) -> dict[str, Any]:
    preset = settings.get("preset") or settings.get("scenario_id")
    if preset and preset in SCENARIOS:
        return SCENARIOS[preset]
    problem = (settings.get("problem") or "").lower()
    role = (settings.get("role") or "").lower()
    for sc in SCENARIOS.values():
        blob = " ".join(
            [
                sc["id"],
                sc["title"],
                sc.get("problem") or "",
                sc["roles"].get("player", ""),
                sc.get("player_goal") or sc["goal"],
            ]
        ).lower()
        if problem and problem in blob:
            return sc
        if "hr" in role and "hr" in blob:
            return sc
        if "продаж" in role and "скидк" in blob:
            return sc
    return next(iter(SCENARIOS.values()))


def step_by_id(scenario: dict[str, Any], step_id: str) -> dict[str, Any]:
    for step in scenario["steps"]:
        if step["id"] == step_id:
            return step
    raise KeyError(step_id)


def build_ideal_dialogue(scenario: dict[str, Any]) -> dict[str, Any]:
    """Return the highest-value complete path through an offline scenario.

    The path is calculated from authored option effects, rather than copied to the
    client. This keeps the exemplar aligned with the same deterministic scoring
    contract used in Scenario Mode.
    """

    metric_keys = ("trust", "goal", "control", "eq")

    def option_score(option: dict[str, Any]) -> int:
        effects = option.get("effects") or {}
        return sum(int(effects.get(metric, 0)) for metric in metric_keys)

    memo: dict[tuple[str, frozenset[str]], tuple[int, list[tuple[dict[str, Any], dict[str, Any]]]]] = {}

    def best_path(step_id: str, seen: frozenset[str] = frozenset()) -> tuple[int, list[tuple[dict[str, Any], dict[str, Any]]]]:
        if step_id in seen:
            return -10_000, []
        cache_key = (step_id, seen)
        if cache_key in memo:
            return memo[cache_key]
        step = step_by_id(scenario, step_id)
        candidates: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any]]]]] = []
        for option in step.get("options") or []:
            next_step = str(option.get("next") or "end:eval")
            future_score, future_path = (0, []) if next_step.startswith("end:") else best_path(next_step, seen | {step_id})
            candidates.append((option_score(option) + future_score, str(option.get("id", "")), [(step, option), *future_path]))
        if not candidates:
            return -10_000, []
        score, _, path = max(candidates, key=lambda item: (item[0], item[1]))
        memo[cache_key] = (score, path)
        return memo[cache_key]

    start_metrics = dict(scenario.get("initial_metrics") or START_METRICS)
    _, path = best_path(scenario["steps"][0]["id"])
    messages: list[dict[str, Any]] = []
    metrics = dict(start_metrics)

    for step, option in path:
        messages.append({"speaker": "opponent", "text": step["opponent_line"]})
        effects = option.get("effects") or {}
        for metric in metric_keys:
            metrics[metric] = max(0, min(100, metrics[metric] + int(effects.get(metric, 0))))
        messages.append(
            {
                "speaker": "player",
                "text": option["text"],
                "choice_id": option.get("id"),
                "techniques": option.get("techniques") or [],
                "reason": option.get("comment"),
                "effects": effects,
            }
        )

    ending = pick_ending(scenario.get("endings") or [], metrics)
    return {
        "scenario_title": scenario.get("title"),
        "goal": scenario.get("player_goal") or scenario.get("goal"),
        "messages": messages,
        "metrics": metrics,
        "ending": {"id": ending.get("id"), "verdict": ending.get("verdict")},
    }


def build_report(scenario: dict[str, Any], state: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    metrics = state["metrics"]
    ending = pick_ending(scenario.get("endings") or [], metrics, state.get("ending_hint"))
    history = state.get("history") or []
    tki_counts = Counter(h.get("tki") for h in history if h.get("tki"))
    total = sum(tki_counts.values()) or 1
    tki_map = {k: round(100 * v / total) for k, v in tki_counts.items()}
    dominant = tki_counts.most_common(1)[0][0] if tki_counts else "сотрудничество"

    mistakes = []
    for h in history:
        d = h.get("delta") or {}
        if d.get("trust", 0) < 0 or d.get("goal", 0) < 0 or d.get("eq", 0) < -1:
            alt = h.get("alternative") or "Сформулируйте интерес, а не позицию."
            mistakes.append(
                {
                    "step": h.get("step_id"),
                    "what": h.get("comment") or "Реплика ухудшила метрики.",
                    "alternative": alt,
                    "chosen": h.get("text"),
                }
            )
    mistakes = mistakes[:3]

    recs = []
    if metrics["trust"] < 60:
        recs.append("Вернитесь к эмпатии и отделению человека от проблемы — доверие ниже рабочего уровня.")
    if metrics["goal"] < 60:
        recs.append("Опирайтесь на BATNA и объективные критерии, а не на уступки без обмена.")
    if metrics["control"] < 50:
        recs.append("Задавайте открытые вопросы и держите структуру встречи.")
    if metrics["eq"] < 55:
        recs.append("Отражайте эмоции оппонента до перехода к условиям.")
    if not recs:
        recs.append("Зафиксируйте договорённости письменно и назначьте следующий шаг.")
        recs.append("Повторите сценарий на сложности выше, сохраняя тот же каркас.")
    recs = recs[:2]

    techniques = Counter()
    harvard = {"batna": False, "objective_criteria": False, "interests": False}
    for h in history:
        for t in h.get("techniques") or []:
            techniques[t] += 1
            low = t.lower()
            if low == "batna":
                harvard["batna"] = True
            if low == "объективные критерии":
                harvard["objective_criteria"] = True
            if low in {"эмпатия", "сотрудничество", "вопросы"}:
                harvard["interests"] = True

    batna_text = (
        "BATNA использована: вы озвучили альтернативу и усилили позицию."
        if harvard["batna"]
        else "BATNA не прозвучала. В этом сценарии запасной вариант — процедура, дата и пакет, а не спор о личности."
    )

    initial_metrics = scenario.get("initial_metrics") or START_METRICS
    chart = [{"turn": 0, **initial_metrics}]
    running = dict(initial_metrics)
    # chart from stored metrics_after if present
    for i, h in enumerate(history, start=1):
        after = h.get("metrics_after") or running
        chart.append({"turn": i, **after})

    hidden = scenario.get("hidden_goal") or {}
    guess = state.get("hidden_guess")
    hidden_result = None
    if settings.get("hidden_goal") and hidden:
        hidden_result = {
            "guessed": guess,
            "correct": hidden.get("correct"),
            "correct_text": (hidden.get("options") or [None])[hidden.get("correct", 0)]
            if hidden.get("options")
            else hidden.get("text"),
            "ok": guess == hidden.get("correct"),
        }

    return {
        "verdict": ending.get("verdict"),
        "ending_id": ending.get("id"),
        "outcome": ending.get("outcome") or ending.get("id"),
        "metrics": snapshot(metrics, history),
        "metrics_chart": chart,
        "tki_map": tki_map,
        "mistakes": mistakes,
        "recommendations": recs,
        "batna_assessment": batna_text,
        "harvard": harvard,
        "techniques": dict(techniques),
        "profile": PROFILE_BY_TKI.get(dominant, PROFILE_BY_TKI["сотрудничество"]),
        "dominant_tki": dominant,
        "hidden_goal": hidden_result,
        "goal": settings.get("goal") or scenario.get("player_goal") or scenario.get("goal"),
        "scenario_title": scenario.get("title"),
        "chaos_events": state.get("chaos_history") or [],
    }
