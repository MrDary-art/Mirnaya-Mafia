"""Local QA only: real HTTP/DB lifecycle with deterministic AI and speech providers."""
import asyncio
import io
import json
import os
import sys
import wave
from contextlib import asynccontextmanager, suppress
from pathlib import Path

root = Path(__file__).resolve().parents[3]
qa_dir = root / ".cache" / "hiring-qa"
qa_dir.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(root / "backend"))
os.environ["DB_PATH"] = str(qa_dir / f"qa-{os.getpid()}.db")
os.environ["ARENA_ENV_FILE"] = str(qa_dir / "absent.env")

from app.main import app
from app.db import Base, engine, SessionLocal
from app.auth import hash_password
from app.models import User
from app.routers import rooms, voice
from app.engine import online_report, room_comparison
from app.report_jobs import report_worker_loop

QUESTIONS = ["Расскажите о себе и опыте разработки.", "Почему вы выбрали эту компанию?", "Опишите собственный вклад в проект.", "Как вы проверили результат работы?"]

async def questions(problem):
    return QUESTIONS

async def stream(settings, state, text, history):
    index = int(state.get("turns") or 0) + 1
    reply = QUESTIONS[index] if index < len(QUESTIONS) else "Спасибо, собеседование завершено."
    yield "reply", reply
    yield "turn", {"reply": reply, "analysis": {"comment": "Проверяемый пример опыта", "techniques": [], "tki_style": "", "trust_delta": 0, "goal_delta": 0, "control_delta": 0, "eq_delta": 0}, "provider": "gigachat", "error": None, "outcome_signal": "continue"}

async def narrative(prompt, *args, **kwargs):
    # Quotes are copied from the prompt, then checked by the real narrative validator.
    import re
    rows = re.findall(r"(?:^|\n)(\d+)\. Вы: (.*)", prompt)
    data = {"narrative": {"sections": [{"turn": int(n), "quote": text, "kind": "strength" if int(n) % 2 else "improve", "title": f"Разбор ответа {n}", "body": "Ответ описывает опыт кандидата. Уточните измеримый результат и личный вклад.", "alternative": "Назовите исходный показатель, своё действие и итог."} for n, text in rows], "next_step": "Подготовьте ещё один измеримый пример."}}
    return json.dumps(data, ensure_ascii=False), "gigachat"

async def compare(prompt, *args, **kwargs):
    data = json.loads(prompt[prompt.index('{"task":'):])
    quotes = {label: next(row["text"] for row in transcript if row["sender"] == "player") for label, transcript in data["transcripts"].items()}
    result = {"rubric": {key: {label: {"score": 4 if label == "A" else 2, "quote": quote} for label, quote in quotes.items()} for key in room_comparison.RUBRIC}, "candidates": {label: {"evidence": quote, "strength": "Описан конкретный опыт", "improvement": f"Личная рекомендация {label}: добавьте измерения", "better_answer": "Сократил число запросов на 30% и проверил тестами."} for label, quote in quotes.items()}}
    return json.dumps(result, ensure_ascii=False), "gigachat"

async def speech(text):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(b"\x00\x00" * 1600)
    return output.getvalue()

rooms.generate_interview_questions = questions
voice.stream_online_turn = stream
voice.local_tts.synthesize = speech
online_report.call_with_fallback_detailed = narrative
room_comparison.call_with_fallback_detailed = compare

@asynccontextmanager
async def lifespan(app):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        for uid, username, display_name in [(9101, "hiring_host", "Анна"), (9102, "hiring_guest", "Борис")]:
            if not await db.get(User, uid):
                db.add(User(id=uid, username=username, password_hash=hash_password("qa-password"), display_name=display_name))
        await db.commit()
    tasks = [asyncio.create_task(rooms.room_worker_loop()), asyncio.create_task(report_worker_loop())]
    yield
    for task in tasks:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

app.router.lifespan_context = lifespan
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8018, log_level="warning")
