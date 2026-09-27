"""At-most-once delivery of a recognized utterance to gameplay.

If a process stops between gameplay commit and receipt commit, we keep the
receipt pending. We never repeat the paid/model/gameplay operation blindly.
The recognized text and any committed message remain in their normal storage.
"""
import asyncio
import json
import time
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, update
from app.db import SessionLocal
from app.deployment_models import SpeechJob
from app.speech_service import speech_context


async def begin_delivery():
    context = speech_context.get()
    if not context:
        return None, None
    owner, path, key = context
    if not key:
        return None, None
    until = time.monotonic() + 90
    while True:
        async with SessionLocal() as db:
            job = await db.scalar(select(SpeechJob).where(SpeechJob.owner_id == owner,
                SpeechJob.context == path, SpeechJob.request_key == key, SpeechJob.state == "ready"))
            if not job:
                return None, None
            if job.delivery_state == "done":
                return job.id, json.loads(job.delivery_result)
            if job.delivery_state is None:
                result = await db.execute(update(SpeechJob).where(SpeechJob.id == job.id, SpeechJob.delivery_state.is_(None)).values(delivery_state="started"))
                await db.commit()
                if result.rowcount == 1:
                    return job.id, None
        if time.monotonic() >= until:
            raise HTTPException(409, "Запись уже принята. Откройте сохранённый разговор; повторная отправка не выполнена.")
        await asyncio.sleep(0.25)


async def finish_delivery(job_id, result):
    if not job_id:
        return
    async with SessionLocal() as db:
        await db.execute(update(SpeechJob).where(SpeechJob.id == job_id, SpeechJob.delivery_state == "started").values(
            delivery_state="done", delivery_result=json.dumps(jsonable_encoder(result), ensure_ascii=False)))
        await db.commit()
