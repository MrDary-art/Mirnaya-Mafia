"""The authored game has real trade-offs, private rounds and shared transitions."""
from datetime import timedelta

import pytest

from app.engine import council_social as social
from tests.test_council import council_client, request


def deal(**changes):
    return {"version": 0, "execution_plan": "overtime", "decision": "Две поставки по согласованному графику",
            "first_batch_percent": 40, "first_batch_days": 14, "balance_days": 30,
            "extra_cost": 25000, "prepayment_percent": 30, "owner": "Руководитель проекта", "open_issues": "", **changes}


def test_different_feasible_deals_have_different_winners():
    economical = social.evaluate(deal())
    early = social.evaluate(deal(execution_plan="partner", first_batch_percent=50, first_batch_days=12, extra_cost=35000, prepayment_percent=40))
    assert economical["feasible"] and early["feasible"]
    assert economical["role_outcomes"]["finance"]["achieved"]
    assert not economical["role_outcomes"]["production"]["achieved"]
    assert early["role_outcomes"]["production"]["achieved"]
    assert early["role_outcomes"]["client"]["achieved"]
    assert not early["role_outcomes"]["finance"]["achieved"]
    assert economical["consequences"] != early["consequences"]


def test_event_invalidates_old_price_without_invalidating_partner():
    old = deal(extra_cost=20000)
    assert social.evaluate(old, event=False)["feasible"]
    assert not social.evaluate(old, event=True)["feasible"]
    partner = deal(execution_plan="partner", extra_cost=32000, prepayment_percent=40)
    assert social.evaluate(partner, event=False)["feasible"]
    assert social.evaluate(partner, event=True)["feasible"]


@pytest.mark.parametrize("changes", [{"first_batch_percent":39}, {"first_batch_percent":61}, {"first_batch_days":12},
    {"balance_days":29}, {"balance_days":31}, {"extra_cost":35001}, {"prepayment_percent":29},
    {"prepayment_percent":51}, {"extra_cost":32000,"prepayment_percent":30}, {"owner":" "}, {"decision":" "}])
def test_unworkable_promises_fail(changes):
    outcome = social.evaluate(deal(**changes))
    assert not outcome["feasible"] and outcome["issues"]
    assert not any(r["achieved"] for r in outcome["role_outcomes"].values())


def test_private_projection_does_not_leak_later_information():
    initial = social.packet("project", 0)
    assert "later_facts" not in initial and initial["new_facts"] == []
    assert "32 000" not in str(initial)
    assert "32 000" in str(social.packet("project", 1))
    assert social.state({})["event"] is None
    assert social.state({"social_stage":2})["event"]


def test_complete_social_council(council_client):
    client, headers, clock = council_client
    start = clock["now"] + timedelta(days=5)
    mid = request(client,"POST","/api/council",headers[9701],{
        "scheduled_at":start.isoformat()+"Z", "visibility":"private", "game_mode":social.MODE})["id"]
    path = f"/api/council/{mid}"
    players = [9701,9702,9703,9704]
    for uid in players[1:]:
        request(client,"POST",path+"/invite",headers[9701],{"username":f"council-{uid}"})
        request(client,"POST",path+"/join",headers[uid],{"role":None})
    clock["now"] = start - timedelta(hours=47)
    for uid in players:
        request(client,"POST",path+"/confirm",headers[uid])
    clock["now"] = start - timedelta(minutes=10)
    for uid in players:
        request(client,"POST",path+"/role-read",headers[uid])
        request(client,"POST",path+"/ready",headers[uid])
    clock["now"] = start
    request(client,"POST",path+"/start",headers[9701])
    before = request(client,"GET",path,headers[9702])
    assert before["game"]["stage"] == 0
    assert before["my_role"]["sealed"]
    assert "later_facts" not in str(before)
    assert before["managed_members"] == []
    owner = request(client,"GET",path,headers[9701])
    assert owner["facilitator_roles"] is None
    assert all(member["packet"] is None for member in owner["managed_members"])
    assert "32 000" not in str(owner)
    call = request(client,"GET",f"/api/council-runtime/{mid}",headers[9702])
    assert call["game"]["stage"] == 0 and call["myRole"]["sealed"]
    request(client,"POST",f"/api/council-runtime/{mid}/gameadvance",headers[9702],{"stage":3},status=422)
    request(client,"POST",path+"/game/advance",headers[9705],{"stage":0},status=404)
    request(client,"PUT",path+"/agreement",headers[9701],deal())
    request(client,"POST",path+"/vote",headers[9701],{"version":1,"approve":True},status=409)
    # The organizer can stop a pending unanimous vote, and force a round both ways.
    request(client,"POST",path+"/game/advance",headers[9702],{"stage":0})
    request(client,"POST",f"/api/council-runtime/{mid}/stagepolicy",headers[9701],{"enabled":False})
    blocked = request(client,"GET",path,headers[9702])
    assert blocked["game"]["approvals"] == []
    assert blocked["game"]["allow_advancement"] is False
    request(client,"POST",path+"/game/advance",headers[9702],{"stage":0},status=403)
    request(client,"POST",f"/api/council-runtime/{mid}/gameadvance",headers[9702],{"stage":0},status=403)
    request(client,"POST",path+"/game/stage",headers[9702],{"stage":1},status=403)
    request(client,"POST",path+"/game/stage",headers[9701],{"stage":1})
    assert request(client,"GET",path,headers[9702])["game"]["stage"] == 1
    request(client,"POST",f"/api/council-runtime/{mid}/gamestage",headers[9701],{"stage":0})
    request(client,"POST",f"/api/council-runtime/{mid}/stagepolicy",headers[9701],{"enabled":True})
    for stage in range(3):
        request(client,"POST",path+"/game/advance",headers[9702],{"stage":stage+1},status=409 if stage<2 else 422)
        for uid in players[:-1]:
            request(client,"POST",path+"/game/advance",headers[uid],{"stage":stage})
        halfway = request(client,"GET",path,headers[9702])
        assert halfway["game"]["stage"] == stage
        request(client,"POST",path+"/game/advance",headers[players[-1]],{"stage":stage})
        after = request(client,"GET",path,headers[9702])
        assert after["game"]["stage"] == stage+1
        assert after["game"]["approvals"] == []
        assert after["my_role"]["new_facts"]
        request(client,"POST",path+"/game/advance",headers[9702],{"stage":stage},status=409)
    for uid in players:
        request(client,"POST",path+"/vote",headers[uid],{"version":1,"approve":True})
    final = request(client,"GET",path,headers[9702])
    assert final["status"] == "finished"
    request(client,"POST",path+"/game/stage",headers[9701],{"stage":0},status=409)
    assert final["report"]["feasible"]
    assert len(final["report"]["role_outcomes"]) == 4
    assert final["report"]["consequences"]
    assert "contributions" not in final["game_outcome"]
    assert set(final["report"]["contributions"]) == {"9702"}


def test_public_demo_and_real_game_use_same_rules(council_client):
    client, _, _ = council_client
    before = client.get("/api/council/demo/social?role=project&stage=0").json()
    assert before["role"]["new_facts"] == []
    assert "later_facts" not in str(before)
    assert client.get("/api/council/demo/social?role=unknown").status_code == 404
    assert client.get("/api/council/demo/social?stage=4").status_code == 422
    response = client.post("/api/council/demo/social/check",json=deal())
    assert response.status_code == 200
    assert response.json() == social.evaluate(deal())
