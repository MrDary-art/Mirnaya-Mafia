import json
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.engine.narrative_report import online_narrative, scenario_narrative, transcript_for_prompt
from app.engine.progress_note import build_progress_note
from app.engine.scenario import build_report, get_scenario
from app.engine.metrics import empty_state
from app.company_scenario_engine import snapshot_from_company_scenario


def test_online_note_uses_exact_recorded_quote_and_rejects_invented_one():
    report = {"ending_id": "online_partial", "outcome": "online_partial", "scenario_title": "Продажа"}
    state = {"history": [
        {"text": "Какой бюджет у вас на этот квартал?", "reply": "Пока до 100 тысяч."},
        {"text": "Тогда предложу поэтапную оплату.", "reply": "Это интересно."},
    ]}
    generated = {"headline": "Проверили бюджет", "next_step": "Уточните срок оплаты.", "sections": [
        {"turn": 1, "quote": "Какой бюджет", "kind": "strength", "title": "Уточнили ограничение", "body": "Собеседник назвал предел бюджета.", "principle": "interests"},
        {"turn": 2, "quote": "Клиент точно подписал договор", "kind": "strength", "title": "Выдумка", "body": "Неверно"},
    ], "terms": [
        {"label": "Бюджет", "proposal_turn": 1, "proposal_quote": "Какой бюджет", "confirmation_turn": 1, "confirmation_quote": "Пока до 100 тысяч"},
        {"label": "Выдуманное соглашение", "proposal_turn": 2, "proposal_quote": "Подписываем контракт"},
    ]}
    note = online_narrative(report, state, {"goal": "Согласовать оплату"}, generated)
    assert note["status"] == "Результат не подтверждён"
    assert note["lead"].endswith("В записи нет подтверждённого итогового соглашения.")
    assert len(note["sections"]) == 1
    assert note["sections"][0]["evidence"]["quote"] == "Какой бюджет"
    assert note["sections"][0]["principle"]["url"].startswith("https://www.pon.harvard.edu/")
    assert len(note["agreement_table"]) == 1
    assert "Пока до 100 тысяч" in note["agreement_table"][0]["confirmed"]
    assert "Выдумка" not in str(note)


def test_online_goal_status_requires_recorded_evidence():
    report = {"ending_id": "online_partial", "outcome": "online_partial", "scenario_title": "Собеседование"}
    state = {"history": [{"text": "Когда я могу начать?", "reply": "Вы приняты, выходите в понедельник."}]}
    section = {"turn": 1, "quote": "Когда я могу начать?", "kind": "sequence", "title": "Уточнили срок", "body": "Ответ был явным."}
    generated = {"sections": [section], "goal_evaluation": {"status": "achieved", "turn": 1, "speaker": "opponent", "quote": "Вы приняты"}}
    note = online_narrative(report, state, {"goal": "Получить работу"}, generated)
    assert note["status"] == "Достигнута"
    assert note["goal_evidence"]["quote"] == "Вы приняты"
    generated["goal_evaluation"]["quote"] = "Мы точно наняли вас"
    invalid = online_narrative(report, state, {"goal": "Получить работу"}, generated)
    assert invalid["status"] == "Результат не подтверждён"


def test_scenario_note_does_not_invent_problem_when_every_choice_helped():
    report = {"outcome": "goal_achieved", "verdict": "Договорились", "goal": "Согласовать сроки"}
    history = [{"text": "Давайте обсудим сроки.", "delta": {"goal": 5}, "comment": "Вы уточнили предмет разговора."}]
    note = scenario_narrative(report, history)
    assert note["status"] == "Достигнута"
    assert all(section["kind"] != "improve" for section in note["sections"])
    assert note["sections"][0]["evidence"]["quote"] == history[0]["text"]


def test_company_good_ending_is_displayed_as_reached_goal():
    note = scenario_narrative({"outcome": "good", "verdict": "Основная цель достигнута"}, [])
    assert note["status"] == "Достигнута"


def test_scenario_note_keeps_opponent_line_before_chosen_option():
    scenario = get_scenario("sales_discount_01")
    first = scenario["steps"][0]
    option = first["options"][0]
    note = scenario_narrative({"outcome": "partial_success", "verdict": "Частичный итог"}, [
        {"step_id": first["id"], "text": option["text"], "delta": option["effects"]}
    ], scenario)
    assert note["sections"][0]["context"]["position"] == "before"
    assert note["sections"][0]["context"]["text"] == first["opponent_line"]


def test_long_transcript_keeps_first_and_last_turn():
    history = [{"text": f"Реплика {i} " + "текст " * 100, "reply": f"Ответ {i}"} for i in range(1, 61)]
    transcript = transcript_for_prompt(history)
    assert "1. Вы: Реплика 1" in transcript
    assert "60. Вы: Реплика 60" in transcript


def test_human_room_context_is_before_player_message():
    report = {"ending_id": "online_partial", "outcome": "online_partial", "scenario_title": "Переговоры людей"}
    state = {"history": [{"text": "Можем обсудить сроки?", "context": "Мне нужна скидка."}]}
    note = online_narrative(report, state, {"goal": "Согласовать условия"})
    assert "Перед этой репликой" in note["sections"][0]["body"]
    assert "До вашей реплики" in transcript_for_prompt(state["history"])


def test_other_scenario_does_not_inherit_hr_default_goal():
    scenario = get_scenario("sales_discount_01")
    report = build_report(scenario, empty_state(scenario), {"goal": "Уволить без конфликта"})
    assert report["goal"] == scenario["player_goal"]
    assert scenario["player_goal"] in report["narrative"]["lead"]


def test_corporate_criteria_show_evidence_or_unconfirmed_state():
    report = {"outcome": "partial", "verdict": "Частичный результат", "corporate_criteria": [
        "Выявлены интересы второй стороны", "Соблюдён лимит скидки",
    ]}
    history = [{"text": "Уточнить интересы клиента", "techniques": ["вопросы"], "delta": {"goal": 2}}]
    requirements = scenario_narrative(report, history)["requirements"]
    assert requirements[0]["evidence"]["quote"] == history[0]["text"]
    assert requirements[1]["status"] == "По записи не подтверждено"


def test_company_snapshot_keeps_authored_success_criteria():
    row = SimpleNamespace(id=1, revision=2, title="Скидка", description="", context="Клиент просит скидку",
                          employee_goal="Согласовать условия", employee_role="Продавец", opponent_role="Клиент",
                          difficulty="средняя", restrictions="Скидка не более 10%",
                          success_criteria=json.dumps(["Выявлены интересы второй стороны"]), scenario_steps="[]")
    snapshot = snapshot_from_company_scenario(row)
    assert snapshot["success_criteria"] == ["Выявлены интересы второй стороны"]
    assert snapshot["restrictions"] == "Скидка не более 10%"


def test_profile_comparison_requires_same_task_and_matching_evidence():
    def session(session_id, scenario, kind, quote):
        section = {"kind": kind, "title": "Уточнение интереса", "principle": {"label": "Интересы за позицией"},
                   "evidence": {"quote": quote}}
        return SimpleNamespace(id=session_id, scenario_id=scenario, mode="scenario", role="Продавец",
                               settings="{}", report=json.dumps({"scenario_title": "Продажа", "narrative": {
                                   "headline": "Разбор", "sections": [section], "next_step": "Уточните бюджет."}}),
                               created_at=datetime(2026, 9, 20) + timedelta(days=session_id),
                               finished_at=datetime(2026, 9, 20) + timedelta(days=session_id))

    note = build_progress_note([session(1, "sale", "improve", "Сразу дадим скидку"),
                                session(2, "other", "strength", "Какой бюджет?"),
                                session(3, "sale", "strength", "Какой бюджет у вас?")])
    assert len(note["improvements"]) == 1
    assert note["improvements"][0]["earlier_session_id"] == 1
    assert note["improvements"][0]["later_session_id"] == 3
    assert note["recent_reports"][0]["session_id"] == 3
