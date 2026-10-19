"""Persisted report queue in the existing session state; survives browser/server restarts."""
import asyncio
import json
import logging
from collections import defaultdict

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Session, User

logger = logging.getLogger(__name__)
session_locks = defaultdict(asyncio.Lock)


def report_status(session):
    state = json.loads(session.state or "{}")
    job = state.get("report_job") or {}
    return {"report_status": job.get("status", "queued"),
            "message": "Разговор сохранён. Можно повторить анализ." if job.get("status") == "failed" else "Разговор сохранён. Готовим разбор по вашим репликам."}


async def queue_report(db, session, *, retry=False):
    refresh = bool(retry and session.report and session.mode == "online")
    if refresh and json.loads(session.report).get("extended_analysis_requested"):
        job = json.loads(session.state or "{}").get("report_job") or {}
        if job.get("status") != "failed":
            return report_status(session) if session.status == "processing" else json.loads(session.report)
    if session.report and not refresh:
        return json.loads(session.report)
    state = json.loads(session.state or "{}")
    if session.status == "processing" and not retry:
        return report_status(session)
    state.setdefault("completion_reason", "user_finished")
    state["report_job"] = {"status": "queued", "attempts": 0, "refresh": refresh}
    if refresh:
        saved = json.loads(session.report)
        saved["extended_analysis_requested"] = True
        session.report = json.dumps(saved, ensure_ascii=False)
    session.state = json.dumps(state, ensure_ascii=False)
    session.status = "processing"
    await db.commit()
    return report_status(session)


async def process_report(session_id):
    from app.services import finish_session
    async with session_locks[session_id]:
        async with SessionLocal() as db:
            session = await db.get(Session, session_id)
            if not session or session.status != "processing":
                return
            state = json.loads(session.state or "{}")
            job = state.get("report_job") or {}
            if session.report and not job.get("refresh"):
                return
            if job.get("status") == "failed":
                return
            job.update(status="processing", attempts=int(job.get("attempts", 0)) + 1)
            state["report_job"] = job
            session.state = json.dumps(state, ensure_ascii=False)
            await db.commit()
            try:
                if job.get("refresh"):
                    from app.engine.online_report import enrich_online_report
                    previous_report = json.loads(session.report)
                    report = await enrich_online_report(json.loads(session.report), state, json.loads(session.settings))
                    from app.engine.llm import call_with_fallback_detailed
                    from app.engine.parser import extract_json
                    from app.engine.narrative_report import transcript_for_prompt
                    prompt = (
                        "Подготовь дополнительный подробный тренерский разбор сохранённой учебной беседы. "
                        "Верни JSON {\"items\":[{\"title\":\"заголовок\",\"analysis\":\"подробное объяснение\","
                        "\"example\":\"пример улучшенной реплики\",\"preparation\":\"конкретное упражнение перед следующей игрой\"}]}. "
                        "Дай 4–6 содержательных разделов: сильные решения, упущенные возможности, альтернативные формулировки, "
                        "план подготовки и упражнение для повторной попытки. Опирайся на реальные реплики, не выдумывай факты, "
                        "не меняй итог игры и оценки. Примеры обозначай как предлагаемые варианты. "
                        + "Условия: " + session.settings + "\nСтенограмма: " + transcript_for_prompt(state.get("history") or [])
                    )
                    raw, _ = await call_with_fallback_detailed(prompt, max_tokens=6500, timeout_seconds=70)
                    payload = extract_json(raw)
                    items = payload.get("items") if isinstance(payload, dict) else None
                    if not isinstance(items, list) or not items:
                        raise ValueError("Invalid extended analysis")
                    report["extended_analysis"] = [
                        {key: item[key].strip()[:6000] for key in ("title", "analysis", "example", "preparation")}
                        for item in items[:6] if isinstance(item, dict)
                        and all(isinstance(item.get(key), str) and item[key].strip() for key in ("title", "analysis", "example", "preparation"))
                    ]
                    if not report["extended_analysis"]:
                        raise ValueError("Empty extended analysis")
                    report["extended_analysis_requested"] = True
                    if (previous_report.get("narrative") or {}).get("source") == "ai" and (report.get("narrative") or {}).get("source") != "ai":
                        extended = report["extended_analysis"]
                        report = previous_report
                        report["extended_analysis"] = extended
                        report["analysis_refresh_warning"] = "Сохранён прежний разбор с проверенными цитатами. Дополнительные рекомендации приведены выше."
                    else:
                        report.pop("analysis_refresh_warning", None)
                    session.report = json.dumps(report, ensure_ascii=False)
                    session.status = "finished"
                    job["status"] = "ready"
                    state["report_job"] = job
                    session.state = json.dumps(state, ensure_ascii=False)
                    await db.commit()
                else:
                    user = await db.get(User, session.user_id)
                    await finish_session(db, session, user, background_worker=True)
            except Exception as exc:
                await db.rollback()
                session = await db.get(Session, session_id)
                state = json.loads(session.state or "{}")
                job["status"] = "failed"
                state["report_job"] = job
                session.state = json.dumps(state, ensure_ascii=False)
                await db.commit()
                logger.warning("Report %s failed: %s", session_id, type(exc).__name__)


async def report_worker_loop():
    while True:
        try:
            async with SessionLocal() as db:
                ids = (await db.scalars(select(Session.id).where(Session.status == "processing").order_by(Session.id))).all()
            for session_id in ids:
                await process_report(session_id)
        except Exception as exc:
            logger.warning("Report queue: %s", type(exc).__name__)
        await asyncio.sleep(2)
