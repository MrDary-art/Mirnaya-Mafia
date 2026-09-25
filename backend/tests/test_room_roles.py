import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from app.engine.room_roles import available_roles, public_roles, select_role, validate_options
from app.routers import rooms


def choices():
    return [dict(title="Владелец поставщика", description="Обсуждает цену", goal="Сохранить маржу", brief="Минимальная цена 90"),
            dict(title="Менеджер продаж", description="Обсуждает объём", goal="Получить заказ", brief="Скидка до 5 процентов")]


def test_only_valid_distinct_choices_and_server_generated_ids():
    valid = choices()
    valid[0]["id"] = "host"
    assert validate_options(valid)[0]["id"] == "role_1"
    for invalid in [None, {}, valid[:1], valid * 3, [valid[0], valid[0]], [{**valid[0], "brief": []}, valid[1]]]:
        assert validate_options(invalid) == []


def test_public_preview_does_not_expose_private_goals_or_briefs():
    state = {"goal": "SECRET_HOST", "roles": {"guest_options": choices()}}
    public = public_roles(state, "human")
    assert set(public[0]) == {"id", "title", "description"}
    assert "90" not in json.dumps(public)
    assert "SECRET_HOST" not in json.dumps(public)
    assert select_role(state, "human", "role_2")["brief"] == "Скидка до 5 процентов"
    for role_id in [None, "host", "not-existing"]:
        with pytest.raises(ValueError):
            select_role(state, "human", role_id)


def test_legacy_and_duel_rooms_keep_valid_join_path():
    state = {"goal": "Пройти собеседование", "request_text": "Python", "roles": {"guest_role": "Заказчик"}}
    assert select_role(state, "human", None)["title"] == "Заказчик"
    assert select_role(state, "duel", None)["id"] == "candidate"
    assert len(available_roles(state, "duel")) == 1


def test_generation_validates_ai_and_falls_back_on_failure(monkeypatch):
    response = {key: "Описание" for key in ("host_role", "guest_role", "host_goal", "guest_goal", "host_brief", "guest_brief")}
    response["guest_options"] = choices()
    provider = AsyncMock(return_value=(json.dumps(response, ensure_ascii=False), "gigachat"))
    monkeypatch.setattr(rooms, "call_with_fallback_detailed", provider)
    roles = asyncio.run(rooms.generate_roles("Покупка фруктов", "Получить скидку"))
    assert len(roles["guest_options"]) == 2
    assert roles["source"] == "gigachat"
    assert "Покупка фруктов" in provider.call_args.args[0]
    provider.side_effect = TimeoutError()
    fallback = asyncio.run(rooms.generate_roles("Покупка фруктов", "Получить скидку"))
    assert fallback["host_goal"] == "Получить скидку"
    assert len(available_roles({"roles": fallback}, "human")) == 1
