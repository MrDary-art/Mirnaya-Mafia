from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import AsyncMock

import numpy as np
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.routers import voice as voice_router
from app.voice import LocalSTT, LocalTTS, SpeechUnavailable


def test_local_stt_accepts_pcm_without_files():
    stt = LocalSTT()
    model = SimpleNamespace(transcribe=lambda audio, **kwargs: (
        [SimpleNamespace(text=" Здравствуйте. ")], None,
    ))
    stt._model = model
    assert stt._transcribe(np.zeros(16000, dtype="<i2").tobytes()) == "Здравствуйте."


def test_local_stt_handles_two_users_in_parallel():
    stt = LocalSTT()
    both_started = Barrier(2, timeout=3)

    def transcribe(_audio, **_kwargs):
        both_started.wait()
        return [SimpleNamespace(text="Готово")], None

    stt._model = SimpleNamespace(transcribe=transcribe)
    pcm = np.zeros(16000, dtype="<i2").tobytes()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(stt._transcribe, [pcm, pcm]))
    assert results == ["Готово", "Готово"]


async def _collect_transcript(stt, pcm):
    return [part async for part in stt.stream_transcribe(pcm)]


def test_local_stt_streams_whisper_segments():
    import asyncio

    stt = LocalSTT()
    stt._model = SimpleNamespace(transcribe=lambda _audio, **_kwargs: (
        iter([SimpleNamespace(text=" Первый "), SimpleNamespace(text=" второй. ")]), None,
    ))
    pcm = np.zeros(16000, dtype="<i2").tobytes()
    assert asyncio.run(_collect_transcript(stt, pcm)) == ["Первый", "второй."]


def test_local_tts_rejects_empty_audio():
    tts = LocalTTS()
    tts._voice = SimpleNamespace(synthesize_wav=lambda _text, _wav: None)
    import pytest
    with pytest.raises(SpeechUnavailable, match="не вернул звук"):
        tts._synthesize("Привет")


def test_voice_route_reuses_online_turn_and_ignores_silence(monkeypatch):
    session = SimpleNamespace(id=7, user_id=5, mode="online", status="active")
    user = SimpleNamespace(id=5)
    db = SimpleNamespace(get=AsyncMock(return_value=session))

    async def provide_db():
        yield db

    app.dependency_overrides[get_db] = provide_db
    app.dependency_overrides[get_current_user] = lambda: user
    stt = AsyncMock(return_value="Привет")
    turn = AsyncMock(return_value={"session": {"free_reply": "Здравствуйте"}})
    monkeypatch.setattr(voice_router.local_stt, "transcribe", stt)
    monkeypatch.setattr(voice_router, "apply_free_text", turn)
    headers = {"Content-Type": "application/octet-stream", "X-Audio-Format": "pcm_s16le", "X-Audio-Rate": "16000"}
    audio = bytes(9600)
    try:
        client = TestClient(app)
        response = client.post("/api/sessions/7/voice", content=audio, headers=headers)
        assert response.status_code == 200
        assert response.json()["transcript"] == "Привет"
        turn.assert_awaited_once_with(db, session, user, "Привет", False)
        turn.reset_mock()
        stt.return_value = ""
        response = client.post("/api/sessions/7/voice", content=audio, headers=headers)
        assert response.json() == {"transcript": "", "silence": True}
        turn.assert_not_awaited()
        response = client.post("/api/sessions/7/voice", content=audio[:4], headers=headers)
        assert response.status_code == 400
        response = client.post("/api/sessions/7/voice", content=bytes(voice_router.MAX_AUDIO_BYTES + 2), headers=headers)
        assert response.status_code == 413
        stt.assert_awaited()
        session.mode = "scenario"
        response = client.post("/api/sessions/7/voice", content=audio, headers=headers)
        assert response.status_code == 400
        session.mode = "online"
        session.user_id = 10
        response = client.post("/api/sessions/7/voice", content=audio, headers=headers)
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_local_tts_only_speaks_saved_opponent_lines(monkeypatch):
    session = SimpleNamespace(id=7, user_id=5, mode="online", status="active")
    user = SimpleNamespace(id=5)
    db = SimpleNamespace(get=AsyncMock(return_value=session), scalar=AsyncMock(return_value=1))

    async def provide_db():
        yield db

    app.dependency_overrides[get_db] = provide_db
    app.dependency_overrides[get_current_user] = lambda: user
    speak = AsyncMock(return_value=b"RIFFlocal-wav")
    monkeypatch.setattr(voice_router.local_tts, "synthesize", speak)
    try:
        client = TestClient(app)
        response = client.post("/api/sessions/7/speak", json={"text": "Здравствуйте"})
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert response.content == b"RIFFlocal-wav"
        speak.assert_awaited_once_with("Здравствуйте")
        db.scalar.return_value = None
        assert client.post("/api/sessions/7/speak", json={"text": "Чужая реплика"}).status_code == 400
        session.user_id = 10
        assert client.post("/api/sessions/7/speak", json={"text": "Здравствуйте"}).status_code == 404
    finally:
        app.dependency_overrides.clear()
