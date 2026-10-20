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
    from app.engine.report_methodology import VERSION
    refresh = bool(retry and session.report and session.mode == "online")
    if refresh and json.loads(session.report).get("extended_analysis_requested") and json.loads(session.report).get("extended_analysis_version") == VERSION:
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
                    from app.engine.report_methodology import RULES, VERSION
                    # Expansion uses the same reviewed evidence as the main note;
                    # a second free-form generation must not bypass that contract.
                    items = (report.get("narrative") or {}).get("sections") or []
                    report["extended_analysis"] = [
                        {"title": item["title"], "analysis": item["body"], "example": "",
                         "preparation": RULES[item["rule_id"]]["practice"],
                         "evidence": item["evidence"], "principle": item["principle"], "theory_review": item["theory_review"]}
                        for item in items if item.get("rule_id") in RULES
                        and item.get("theory_review", {}).get("supported") is True
                    ]
                    if (previous_report.get("narrative") or {}).get("source") == "ai" and (report.get("narrative") or {}).get("source") != "ai":
                        extended = report["extended_analysis"]
                        report = previous_report
                        report["extended_analysis"] = extended
                        report["analysis_refresh_warning"] = "Сохранён прежний разбор. Новых выводов, прошедших проверку по теории и записи, получить не удалось."
                    else:
                        report.pop("analysis_refresh_warning", None)
                    report["extended_analysis_requested"] = bool(report["extended_analysis"])
                    report["extended_analysis_version"] = VERSION
                    if not report["extended_analysis"]:
                        report["analysis_refresh_warning"] = "Проверенных новых выводов получить не удалось. Запись сохранена; можно повторить анализ."
                        report.pop("extended_analysis")
                    from app.twin_duel import attach_duel_result
                    attach_duel_result(report, state, json.loads(session.settings))
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
