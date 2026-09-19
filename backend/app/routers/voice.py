"""Voice input uses the existing authenticated online turn service."""

import base64
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import SessionLocal, get_db
from app.engine.llm import stream_online_turn
from app.models import Message, Session, User
from app.services import apply_free_text, prepare_online_turn
from app.voice import SpeechUnavailable, local_stt, local_tts

router = APIRouter(tags=["voice"])
MAX_AUDIO_BYTES = 1_280_000  # 40 seconds of mono 16 kHz PCM16
MIN_AUDIO_BYTES = 9_600  # 0.3 seconds


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class StreamTextIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


def _event(kind: str, **payload) -> bytes:
    return (json.dumps({"type": kind, **jsonable_encoder(payload)}, ensure_ascii=False) + "\n").encode("utf-8")


def _speech_hotwords(session: Session) -> str | None:
    try:
        settings = json.loads(session.settings)
    except (AttributeError, TypeError, ValueError):
        return None
    terms = [str(settings.get(key) or "").strip()[:80] for key in ("target_position", "target_company")]
    return ", ".join(term for term in terms if term) or None


async def _stream_turn(session_id: int, user_id: int, text: str, speak: bool):
    async with SessionLocal() as db:
        session = await db.get(Session, session_id)
        user = await db.get(User, user_id)
        if not session or not user or session.user_id != user_id or session.mode != "online":
            yield _event("error", message="Сессия не найдена")
            return
        try:
            sess_settings, state, history = await prepare_online_turn(db, session, user, text)
            state["voice_transcript"] = speak
            yield _event("accepted", text=text)
            sentence_buffer = ""
            turn = None
            async for kind, value in stream_online_turn(sess_settings, state, text, history):
                if kind == "turn":
                    turn = value
                    continue
                chunk = str(value)
                yield _event("reply_delta", text=chunk)
                if not speak:
                    continue
                sentence_buffer += chunk
                while match := re.search(r'[.!?…]["»)]*(?=\s|$)', sentence_buffer):
                    sentence = sentence_buffer[:match.end()].strip()
                    sentence_buffer = sentence_buffer[match.end():]
                    if sentence:
                        try:
                            wav = await local_tts.synthesize(sentence)
                            yield _event("sentence_audio", text=sentence, wav=base64.b64encode(wav).decode("ascii"))
                        except SpeechUnavailable as exc:
                            yield _event("audio_error", message=str(exc))
            if not turn:
                raise ValueError("ИИ не вернул ответ")
            if speak and sentence_buffer.strip():
                sentence = sentence_buffer.strip()
                try:
                    wav = await local_tts.synthesize(sentence)
                    yield _event("sentence_audio", text=sentence, wav=base64.b64encode(wav).decode("ascii"))
                except SpeechUnavailable as exc:
                    yield _event("audio_error", message=str(exc))
            result = await apply_free_text(db, session, user, text, False, prepared_turn=turn)
            yield _event("done", result=result)
        except ValueError as exc:
            yield _event("error", message=str(exc))


def _stream_response(events) -> StreamingResponse:
    return StreamingResponse(events, media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


async def _require_online_session(session_id: int, db: AsyncSession, user: User) -> Session:
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id or session.mode != "online":
        raise HTTPException(404, "Сессия не найдена")
    if session.status != "active":
        raise HTTPException(400, "Сессия уже завершена")
    return session


@router.post("/sessions/{session_id}/turn-stream")
async def text_turn_stream(session_id: int, body: StreamTextIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await _require_online_session(session_id, db, user)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Введите реплику")
    return _stream_response(_stream_turn(session_id, user.id, text, False))


@router.post("/sessions/{session_id}/voice-stream")
async def voice_turn_stream(session_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = await _require_online_session(session_id, db, user)
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/octet-stream":
        raise HTTPException(415, "Требуется бинарное аудио")
    if request.headers.get("x-audio-format") != "pcm_s16le" or request.headers.get("x-audio-rate") != "16000":
        raise HTTPException(400, "Поддерживается только mono PCM16, 16 кГц")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Аудиореплика слишком длинная")
        data.extend(chunk)
    if len(data) < MIN_AUDIO_BYTES or len(data) % 2:
        raise HTTPException(400, "Аудиореплика слишком короткая или повреждена")

    async def events():
        transcript = []
        try:
            async for part in local_stt.stream_transcribe(bytes(data), _speech_hotwords(session)):
                transcript.append(part)
                yield _event("transcript_delta", text=part)
        except SpeechUnavailable as exc:
            yield _event("error", message=str(exc))
            return
        text = " ".join(transcript).strip()[:2000]
        if not text:
            yield _event("silence")
            return
        yield _event("transcript_done", text=text)
        async for event in _stream_turn(session_id, user.id, text, True):
            yield event

    return _stream_response(events())


@router.post("/sessions/{session_id}/speak")
async def speak_reply(
    session_id: int,
    body: SpeakIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id or session.mode != "online":
        raise HTTPException(404, "Сессия не найдена")
    spoken = await db.scalar(select(Message.id).where(Message.session_id == session_id, Message.sender == "opponent", Message.text == body.text))
    if not spoken:
        raise HTTPException(400, "Можно озвучить только реплику оппонента")
    try:
        wav = await local_tts.synthesize(body.text)
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    return Response(wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.post("/sessions/{session_id}/voice")
async def voice_turn(
    session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(Session, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Сессия не найдена")
    if session.mode != "online" or session.status != "active":
        raise HTTPException(400, "Голос доступен только в активной онлайн-сессии")
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/octet-stream":
        raise HTTPException(415, "Требуется бинарное аудио")
    if request.headers.get("x-audio-format") != "pcm_s16le" or request.headers.get("x-audio-rate") != "16000":
        raise HTTPException(400, "Поддерживается только mono PCM16, 16 кГц")

    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Аудиореплика слишком длинная")
        data.extend(chunk)
    if len(data) < MIN_AUDIO_BYTES or len(data) % 2:
        raise HTTPException(400, "Аудиореплика слишком короткая или повреждена")
    try:
        transcript = await local_stt.transcribe(bytes(data), _speech_hotwords(session))
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    if not transcript:
        return {"transcript": "", "silence": True}
    try:
        result = await apply_free_text(db, session, user, transcript[:2000], False, voice_transcript=True)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"transcript": transcript[:2000], "silence": False, "result": result}
