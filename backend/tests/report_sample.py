"""Fictional, explicit QA example for detailed report layout and long Cyrillic text."""
from datetime import datetime
from types import SimpleNamespace
from app.engine.narrative_report import online_narrative
from app.engine.report_detail import detailed_report
from app.engine.mentor import support_summary


def detailed_sample():
    settings={"problem":"Заказчик добавил требования, но оставил прежнюю дату сдачи", "goal":"Согласовать дополнительную неделю на полный объём", "role":"Руководитель проекта", "opponent_role":"Заказчик", "constraints":"Не увеличивать бюджет без согласования"}
    dialogue=[
        ("Какие новые требования обязательны к прежней дате?", "Все нужны, но запуск нельзя переносить.", "Вы уточнили приоритеты", "Вместо спора о дате вы попросили разделить требования по важности. Заказчик пока не уступил. Теперь полезно выяснить, что именно должно работать на запуске.", "interests"),
        ("Новый объём требует ещё недели. Почему именно эта дата критична?", "В этот день у нас презентация.", "Срок связан с событием", "Вопрос выявил причину ограничения. Презентация объясняет дату, но сама по себе не доказывает, что весь новый функционал необходим к ней. Это нужно уточнить.", "interests"),
        ("Предлагаю сдать всё позже.", "Презентацию я не перенесу.", "Предложение не учитывает интерес клиента", "Вы назвали желаемый перенос до того, как согласовали состав результата для презентации. Возражение относится к дате события; оно не исключает поэтапную сдачу.", "options"),
        ("Для презентации подготовим исходный объём в срок. Новые функции — через неделю.", "Так можно обсуждать. Как проверим готовность?", "Появились два этапа", "Предложение разделяет запуск и новый объём, сохраняя событие клиента. Однако «можно обсуждать» ещё не означает принятия графика: ИИ запросил критерии готовности.", "options"),
        ("Проведём совместную проверку исходного объёма до презентации и зафиксируем список новых функций.", "Согласен проверить исходный объём. Дату новых функций ещё нужно подтвердить.", "Согласие относится только к проверке", "Клиент принял проверку, но явно оставил срок новых функций открытым. Нельзя объявлять всю цель достигнутой. Нужна отдельная фиксация даты и владельца согласования.", "criteria"),
        ("Подтверждаю проверку. После неё направлю график новых функций на согласование.", "Подтверждаю: сначала совместная проверка, затем согласование отдельного графика.", "Зафиксирован следующий шаг", "Стороны подтвердили порядок дальнейших действий. Это рабочий результат, но не согласованная дополнительная неделя. В следующем письме укажите дату проверки и кто принимает решение по новому графику.", "criteria"),
    ]
    history=[];sections=[]
    for index,(player,reply,title,body,principle) in enumerate(dialogue,1):
        history.append({"text":player,"context":history[-1]["reply"] if history else "Дата сдачи остаётся прежней. Как выполните новый объём?", "reply":reply,"metrics_after":{"trust":50+index*2,"goal":40+index,"control":50+index*3,"eq":50},"scoring":[],"evidence":[]})
        sections.append({"turn":index,"quote":player,"kind":"improve" if index==3 else "sequence" if index==6 else "strength","title":title,"body":body,"principle":principle,"alternative":"Какие функции обязательны для презентации, а какие можно сдать отдельным этапом?" if index==3 else ""})
    state={"history":history,"mentor":{"first_turn":2,"messages":[{"role":"assistant","text":"Сначала выясните, что нужно для презентации."}]},"completion_reason":"user_finished"}
    report={"scenario_title":"Учебный пример: новые требования и прежний срок", "ending_id":"online_partial","outcome":"online_partial", "summary":"Согласован порядок проверки. Полный перенос срока ещё не подтверждён.","metrics":{"values":history[-1]["metrics_after"]},"metrics_chart":[{"turn":0,"trust":50,"goal":40,"control":50,"eq":50}]+[{"turn":i,**row["metrics_after"]} for i,row in enumerate(history,1)],"recommendations":["Уточните минимальный результат для презентации до предложения переноса.","Разделите согласованный следующий шаг и пока не согласованный срок.","Закрепите дату, владельца и порядок подтверждения нового объёма."],"scoring_explanation":{"description":"Показатели показывают подтверждённые действия в этой учебной попытке.","turns":[]}}
    report["narrative"]=online_narrative(report,state,settings,{"sections":sections,"next_step":"Проведите короткую повторную беседу: согласуйте не только этапы, но и точную дату и ответственного за новый объём.","terms":[{"label":"Проверка исходного объёма","proposal_turn":5,"proposal_quote":history[4]["text"],"confirmation_turn":5,"confirmation_speaker":"opponent","confirmation_quote":"Согласен проверить исходный объём."}]})
    report["learning_support"]=support_summary(state)
    report=detailed_report(report,state,settings)
    session=SimpleNamespace(id=44,role=settings["role"],settings=settings,metrics=report["metrics"]["values"],finished_at=datetime(2026,10,18,21,0),created_at=datetime(2026,10,18,20,40))
    return report,state,settings,session
