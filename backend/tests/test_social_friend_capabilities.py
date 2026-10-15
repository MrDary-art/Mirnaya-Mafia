"""Per-viewer messaging capabilities preserve the existing friendship/chat policy."""
import pytest
from sqlalchemy import select

from app.auth import create_token
from app.models import Friendship, User
from tests.test_social_message_shares import shared_chat


def authorization(user_id):
    return {"Authorization": "Bearer " + create_token(user_id, f"share-{user_id}", "")}


@pytest.mark.parametrize("friends,visibility,allowed", [
    (True, "all", True), (True, "friends", True), (True, "none", False),
    (False, "all", True), (False, "friends", False), (False, "none", False),
])
async def test_capabilities_match_write_policy_without_disclosing_settings(shared_chat, friends, visibility, allowed):
    async with shared_chat.factory() as db:
        recipient = await db.get(User, 2)
        recipient.messages_visibility = visibility
        if friends:
            db.add(Friendship(user_id=2, friend_id=3, status="FRIENDS"))
        await db.commit()
    client = shared_chat.client
    profile = (await client.get("/api/social/people/share-2")).json()
    search = (await client.get("/api/social/people", params={"q": "share-2"})).json()
    dialogs = (await client.get("/api/social/dialogs")).json()
    people = (await client.get("/api/social/friends")).json()
    assert profile["can_message"] is allowed
    assert search[0]["can_message"] is allowed
    assert dialogs[0]["can_message"] is allowed
    if friends:
        assert people[0]["can_message"] is allowed
    else:
        assert people == []
    for dto in [profile, *search, *dialogs, *people]:
        assert "messages_visibility" not in dto
        assert "profile_visibility" not in dto
        assert "email" not in dto
    # The capability depends on the viewer, not a cached property of the recipient.
    stranger = await client.get("/api/social/people/share-2", headers=authorization(1))
    assert stranger.json()["can_message"] is (visibility == "all")
    own = await client.get("/api/social/people/share-3")
    assert own.json()["can_message"] is False
    # Existing history stays readable when new contact is disallowed.
    history = await client.get("/api/social/messages/2?mark_read=false")
    assert history.status_code == 200
    assert [row["type"] for row in history.json()] == ["POST_SHARE", "TEXT", "ROOM_INVITATION"]
    assert history.json()[0]["payload"]["post"]["body"] == "Исходный текст публикации"
    assert history.json()[1]["text"] == "Обычное сообщение"
    assert history.json()[2]["payload"] == {"room_id": 999}
    sent = await client.post("/api/social/messages/2", json={"text": "Проверка доступности сообщения"})
    assert sent.status_code == (200 if allowed else 403)
    invitation = await client.post("/api/social/invitations/2", json={
        "kind": "negotiation", "display_name": "Тест встречи", "problem": "Согласовать бюджет проекта", "goal": "Сохранить объём работ",
    })
    assert invitation.status_code == (200 if allowed else 403)
    if allowed:
        assert sent.json()["type"] == "TEXT"
        assert invitation.json()["type"] == "ONLINE_INVITE"


async def test_friend_request_accept_decline_block_and_private_fields(shared_chat):
    client = shared_chat.client
    async with shared_chat.factory() as db:
        recipient = await db.get(User, 2)
        recipient.profile_visibility = "private"
        recipient.messages_visibility = "friends"
        recipient.first_name = "ЗакрытоеИмя"
        recipient.about = "Закрытое описание"
        await db.commit()
    sent = await client.post("/api/social/friends/2/request")
    assert sent.json() == {"status": "REQUEST_SENT"}
    pending = (await client.get("/api/social/friends")).json()[0]
    assert pending["relationship"] == "REQUEST_SENT" and pending["can_message"] is False
    assert pending["display_name"] is None and pending["about"] is None
    assert (await client.get("/api/social/people/share-2")).status_code == 403
    incoming = (await client.get("/api/social/friends", headers=authorization(2))).json()[0]
    assert incoming["relationship"] == "REQUEST_RECEIVED"
    assert (await client.post("/api/social/friends/2/accept")).status_code == 400
    assert (await client.post("/api/social/friends/3/decline", headers=authorization(2))).status_code == 200
    assert (await client.get("/api/social/friends")).json() == []
    await client.post("/api/social/friends/2/request")
    assert (await client.post("/api/social/friends/3/accept", headers=authorization(2))).status_code == 200
    accepted = (await client.get("/api/social/people/share-2")).json()
    assert accepted["relationship"] == "FRIENDS" and accepted["can_message"] is True
    assert accepted["about"] == "Закрытое описание"
    assert (await client.post("/api/social/friends/2/block")).status_code == 200
    assert (await client.get("/api/social/friends")).json() == []
    assert (await client.get("/api/social/dialogs")).json() == []
    assert (await client.get("/api/social/people", params={"q": "share-2"})).json() == []
    assert (await client.get("/api/social/people/share-2")).status_code == 404
    assert (await client.get("/api/social/messages/2?mark_read=false")).status_code == 403
    assert (await client.post("/api/social/messages/2", json={"text": "Недопустимое сообщение"})).status_code == 403
    assert (await client.post("/api/social/friends/3/unblock", headers=authorization(2))).status_code == 400
    assert (await client.post("/api/social/friends/2/unblock")).status_code == 200
    assert (await client.get("/api/social/messages/2?mark_read=false")).status_code == 200
    assert (await client.get("/api/social/dialogs")).json()[0]["can_message"] is False


async def test_new_stranger_history_semantics_are_unchanged(shared_chat):
    response = await shared_chat.client.get("/api/social/messages/1?mark_read=false")
    assert response.status_code == 403
    own = await shared_chat.client.post("/api/social/messages/3", json={"text": "Себе"})
    assert own.status_code == 400


async def test_mutual_legacy_rows_are_deduplicated_and_block_wins_before_private_dto(shared_chat):
    async with shared_chat.factory() as db:
        recipient = await db.get(User, 2)
        recipient.profile_visibility = "private"
        recipient.first_name = "Не раскрывать имя"
        recipient.about = "Не раскрывать описание"
        db.add_all([Friendship(user_id=3, friend_id=2, status="FRIENDS"),
                    Friendship(user_id=2, friend_id=3, status="FRIENDS")])
        await db.commit()
    before = (await shared_chat.client.get("/api/social/friends")).json()
    assert len(before) == 1 and before[0]["relationship"] == "FRIENDS"
    async with shared_chat.factory() as db:
        reverse = await db.scalar(select(Friendship).where(Friendship.user_id == 2, Friendship.friend_id == 3))
        reverse.status = "BLOCKED"
        await db.commit()
    for viewer in (2, 3):
        response = await shared_chat.client.get("/api/social/friends", headers=authorization(viewer))
        assert response.status_code == 200 and response.json() == []
        assert "Не раскрывать" not in response.text
    assert (await shared_chat.client.get("/api/social/dialogs")).json() == []
    assert (await shared_chat.client.get("/api/social/people/share-2")).status_code == 404
    assert (await shared_chat.client.get("/api/social/messages/2?mark_read=false")).status_code == 403
