"""Voice input uses the existing authenticated online turn service."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Message, Session, User
from app.services import apply_free_text
from app.voice import SpeechUnavailable, local_stt, local_tts

router = APIRouter(tags=["voice"])
MAX_AUDIO_BYTES = 1_280_000  # 40 seconds of mono 16 kHz PCM16
MIN_AUDIO_BYTES = 9_600  # 0.3 seconds


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


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
        transcript = await local_stt.transcribe(bytes(data))
    except SpeechUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    if not transcript:
        return {"transcript": "", "silence": True}
    try:
        result = await apply_free_text(db, session, user, transcript[:2000], False)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"transcript": transcript[:2000], "silence": False, "result": result}
