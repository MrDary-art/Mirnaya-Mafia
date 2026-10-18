import asyncio
import json
from copy import deepcopy
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.engine import llm, practice_plan, mentor
from app.engine.negotiation import negotiation_opening, copied_mentor_message, dialogue_policy
from app.engine.grounding import grounded_analysis, validated_final_decision
from app.engine.report_detail import detailed_report
from app.report_pdf import render_report_pdf
from app import services, report_jobs
from app.db import Base
from app.models import User, Session
from tests.test_room_bookings import booking_env
from tests.report_sample import detailed_sample


def test_deadline_opening_defends_customer_position_without_fabricated_date():
    settings={"problem":"Заказчик добавил требования, а дата сдачи осталась прежней", "role":"Исполнитель заказа", "goal":"Перенести срок на неделю"}
    line=negotiation_opening(settings,"Здравствуйте. Давайте обсудим исходные требования.")
    assert "дата сдачи остаётся прежней" in line and "Как вы планируете" in line
    assert "перенести" not in line and not any(ch.isdigit() for ch in line)
    assert negotiation_opening({"problem":"Продажа","role":"Продавец"},"Цена выше нашего бюджета. Чем обоснована стоимость?")=="Цена выше нашего бюджета. Чем обоснована стоимость?"
    assert negotiation_opening({"problem":"Заказчик добавил требования и перенёс дату сдачи", "role":"Исполнитель"}, "Мы уже согласовали новую дату. Какой бюджет нужен?").startswith("Мы уже согласовали")
    settings["practice_plan"]={"opponent_role":"Заказчик"}
    prompt=llm._opponent_prompt(settings,{"metrics":{"trust":50,"goal":40}},"Какой объём обязателен?",[])
    assert prompt.startswith("Ты — Заказчик.")


@pytest.mark.asyncio
async def test_generated_opening_is_not_overwritten_for_other_negotiations(monkeypatch):
    provider=AsyncMock(return_value=(json.dumps({"opening":"Цена выше нашего бюджета. Чем обоснована стоимость?","questions":[],"opponent_position":"Проверить стоимость"}),"gigachat"))
    monkeypatch.setattr(practice_plan,"call_with_fallback_detailed",provider)
    plan=await practice_plan.prepare_practice({"problem":"Продажа лицензии", "role":"Продавец"})
    assert plan["opening"].startswith("Цена выше")


@pytest.mark.asyncio
async def test_mentor_activation_is_short_and_does_not_need_provider(monkeypatch):
    provider=AsyncMock()
    monkeypatch.setattr(mentor,"call_with_fallback_detailed",provider)
    answer,source=await mentor.mentor_reply({}, {}, [], "")
    assert "Сегодня я прилетела вам помочь!" in answer and len(answer)<200
    assert source=="script"
    provider.assert_not_called()


@pytest.mark.asyncio
async def test_copied_coaching_gets_explicit_response_in_both_transports(monkeypatch):
    note="Ваша цель — договориться о сроке. Сначала уточните приоритеты клиента. Пример реплики: предлагаю обсудить этапы. Почему это работает: разделяет запуск и новый объём."
    state={"mentor":{"messages":[{"role":"assistant","text":note}]},"history":[]}
    provider=AsyncMock()
    monkeypatch.setattr(llm,"call_with_fallback_detailed",provider)
    result=await llm.get_online_turn({},state,note,None,[])
    assert "заметки" in result["reply"] and result["outcome_signal"]=="continue"
    assert result["analysis"]["trust_delta"]==0
    events=[event async for event in llm.stream_online_turn({},state,note,[])]
    assert events[-1][1]["reply"]==result["reply"]
    assert not copied_mentor_message(state,"Предлагаю исходный объём к пятнице, новые функции через неделю.")
    provider.assert_not_called()


def test_closing_policy_only_after_ten_messages_and_not_for_interviews():
    assert "Пора двигаться" not in dialogue_policy({}, {"history":[{}]*4},"Уточните")
    assert "Пора двигаться" in dialogue_policy({}, {"history":[{}]*5},"Уточните")
    assert "Не объявляй встречу завершённой" in dialogue_policy({}, {"history":[{}]*9},"Уточните")
    assert dialogue_policy({"practice_kind":"job_interview"},{"history":[{}]*9},"Ответ")==""


@pytest.mark.asyncio
async def test_twelve_messages_do_not_finish_without_confirmed_decision(monkeypatch):
    monkeypatch.setattr(practice_plan,"prepare_practice",AsyncMock(return_value={"opening":"Дата остаётся прежней. Какое решение предлагаете?"}))
    finish=AsyncMock(return_value={"summary":"unused"})
    monkeypatch.setattr(services,"finish_session",finish)
    engine=create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine,expire_on_commit=False)() as db:
            user=User(username="closing-policy",password_hash="unused");db.add(user);await db.commit()
            session=await services.create_session(db,user,{"mode":"online","problem":"Согласовать новый объём работ","goal":"Сохранить дату запуска"})
            for _ in range(6):
                result=await services.apply_free_text(db,session,user,"Уточним список обязательных функций?",False,prepared_turn={"reply":"Нужно уточнить состав первой поставки.","analysis":grounded_analysis(None,""),"outcome_signal":"continue","provider":"script","error":None})
                assert result["finished"] is False
            finish.assert_not_called()
            assert services.loads(session.state,{})["turns"]==6
    finally:await engine.dispose()


def test_final_decision_requires_real_bilateral_confirmation():
    history=[{"text":"Предлагаю завтра вместе проверить исходный объём.","reply":"Подтверждаю: завтра вместе проверим исходный объём."}]
    decision={"kind":"next_step","proposal":{"turn":1,"speaker":"player","quote":history[0]["text"]},"confirmation":{"turn":1,"speaker":"opponent","quote":history[0]["reply"]},"reason":"Обе стороны подтвердили совместную проверку исходного объёма завтра."}
    assert validated_final_decision(decision,history)
    for field in ("speaker","quote"):
        bad=deepcopy(decision);bad["confirmation"][field]="player" if field=="speaker" else "Согласен на перенос всего проекта"
        assert validated_final_decision(bad,history) is None
    history[0]["reply"]="Возможно, подумаю над этим."
    decision["confirmation"]["quote"]=history[0]["reply"]
    assert validated_final_decision(decision,history) is None
    history[0]["reply"]="Не согласен, завтра проверку не проводим."
    decision["confirmation"]["quote"]=history[0]["reply"]
    assert validated_final_decision(decision,history) is None


def test_detailed_report_keeps_every_turn_and_does_not_claim_unanalysed_quotes():
    report,state,settings,_=detailed_sample()
    assert len(report["turn_reviews"])==6 and len(report["narrative"]["sections"])==6
    assert report["analysis_coverage"]["reviewed"]==6
    assert report["learning_support"]["used"]
    state["history"].append({"text":"Последняя реплика вне анализа","reply":"Нужно уточнить"})
    result=detailed_report(report,state,settings)
    assert result["turn_reviews"][-1]["source"]=="record"
    assert result["analysis_coverage"]["reviewed"]==6 and result["analysis_coverage"]["total"]==7
    assert report["analysis_coverage"]["total"]==6


def test_pdf_contains_all_analysis_and_searchable_cyrillic():
    pypdf=pytest.importorskip("pypdf")
    report,_,_,session=detailed_sample()
    content=render_report_pdf(report=report,session=session,holder="Учебный пример · Анна")
    reader=pypdf.PdfReader(BytesIO(content))
    text="\n".join(page.extract_text() for page in reader.pages)
    assert 4<=len(reader.pages)<=15
    assert "Подтверждённые приёмы" not in text or report["turn_reviews"][0]["techniques"]
    for section in report["narrative"]["sections"]:
        assert section["title"] in text
    assert "ХОД 06" in text and "Работа с ментором" in text
    assert "Полная запись и основания оценки" in text
    assert "Сегодня фиксируем" not in text
    assert b"/FontFile2" in content


def test_pdf_route_uses_complete_saved_report_and_checks_owner(booking_env):
    client, headers, factory = booking_env
    async def save():
        report,state,settings,sample=detailed_sample()
        async with factory() as db:
            row=Session(user_id=1,mode="online",status="finished",role=settings["role"],opponent_role="Заказчик",settings=json.dumps(settings),state=json.dumps(state),metrics=json.dumps(report["metrics"]),report=json.dumps(report),finished_at=sample.finished_at)
            db.add(row);await db.commit();await db.refresh(row)
            return row.id
    saved_id=asyncio.run(save())
    url=f"/api/sessions/{saved_id}/report"
    result=client.get(url,headers=headers[1])
    assert result.status_code==200 and len(result.json()["turn_reviews"])==6
    pdf=client.get(url+"/pdf",headers=headers[1])
    assert pdf.status_code==200 and pdf.content.startswith(b"%PDF")
    assert pdf.headers["content-type"]=="application/pdf"
    assert client.get(url+"/pdf",headers=headers[2]).status_code==404


@pytest.mark.asyncio
@pytest.mark.parametrize("confirmed", [False, True])
async def test_final_decision_finishes_only_after_independent_verification(monkeypatch, confirmed):
    monkeypatch.setattr(practice_plan,"prepare_practice",AsyncMock(return_value={"opening":"Когда проверим объём?"}))
    text="Предлагаю завтра вместе проверить исходный объём."
    reply="Подтверждаю: завтра вместе проверим исходный объём."
    decision={"kind":"next_step","proposal":{"turn":1,"speaker":"player","quote":text},"confirmation":{"turn":1,"speaker":"opponent","quote":reply},"reason":"Согласована совместная проверка."}
    judge=AsyncMock(return_value=decision if confirmed else None)
    monkeypatch.setattr(services,"assess_final_decision",judge)
    finish=AsyncMock(return_value={"summary":"Согласован следующий шаг"})
    monkeypatch.setattr(services,"finish_session",finish)
    engine=create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine,expire_on_commit=False)() as db:
            user=User(username="decision-check",password_hash="unused");db.add(user);await db.commit()
            session=await services.create_session(db,user,{"mode":"online","problem":"Согласовать объём заказа","goal":"Договориться о полном переносе срока"})
            result=await services.apply_free_text(db,session,user,text,False,prepared_turn={"reply":reply,"analysis":grounded_analysis(None,text),"provider":"script","error":None,"outcome_signal":"continue","final_decision":decision})
            assert result["finished"] is confirmed
            judge.assert_awaited_once()
            if confirmed:
                assert services.loads(session.state,{})["final_decision"]["kind"]=="next_step"
                finish.assert_awaited_once()
            else:finish.assert_not_called()
    finally:await engine.dispose()
