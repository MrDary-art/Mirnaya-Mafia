"""Strict API boundary for the public, short-lived corporate demonstration."""
from datetime import datetime, timezone
import json
import re

from fastapi import HTTPException
from sqlalchemy import select, func

from app.company_models import Company, CompanyMembership, CompanyAssignment
from app.models import Session
from app.deployment_security import rate_limit

# Each verb has an explicit list. Adding a future company endpoint does not grant demo access.
GET_COMPANY = re.compile(r"(?:departments|employees(?:/\d+/overview)?|directory|cohorts|assignments(?:/(?:catalog|\d+))?|scenarios|kpis|programs(?:/enrolments/me|/\d+/enrolments)?|certificates(?:/\d+/pdf)?|calendar|notification-settings|analytics(?:/export\.csv)?|audit|ratings|online-1x1|competitions(?:/\d+/bracket)?|team-goals|achievements|surveys(?:/\d+/results)?|attempts(?:/\d+/(?:comments|report))?|materials|benchmark/me|integrations|catalog(?:/specialties)?|career-tracks|product-requests|episodes(?:/\d+)?|my-arena|meetings(?:/\d+(?:/transcript)?)?|pilot/overview)")
POST_COMPANY = re.compile(r"(?:assignments(?:/\d+/(?:start|release-results))?|scenarios(?:/draft|/\d+/status)?|kpis|programs(?:/\d+/(?:enroll|status)|/\d+/enrolments/\d+/unlock)?|cohorts|achievements|surveys(?:/\d+/responses)?|attempts/\d+/comments|certificates/\d+/revoke|competitions(?:/\d+/matches/\d+/result)?|team-goals|inbox/\d+/read|product-requests|catalog/(?:professions|competencies|specialties)|catalog/professions/\d+/competencies|career-tracks(?:/\d+/steps)?|episodes(?:/\d+/(?:participants|status))?|meetings(?:/\d+/(?:consent|finish|transcript|analyze|protocol/items|protocol/approve|protocol/publish))?)")
PUT_COMPANY = re.compile(r"(?:departments/\d+|employees/\d+|cohorts/\d+(?:/members)?|assignments/\d+|scenarios/\d+|programs/\d+/steps|notification-settings|personalization|pilot|episodes/\d+|meetings/\d+/protocol)")
PATCH_COMPANY = re.compile(r"(?:product-requests/\d+|episodes/\d+/commitments/\d+)")
DELETE_COMPANY = re.compile(r"(?:departments/\d+|employees/\d+|cohorts/\d+)")


async def enforce_demo_access(db, user, payload, connection):
    raw_company_id = payload.get("business_demo_company_id")
    # Legacy development demo accounts are unaffected; public sandbox users cannot use an unrestricted token.
    if raw_company_id is None:
        if user.is_demo and user.username.startswith("business-demo-"):
            raise HTTPException(403, "Для демонстрации нужен временный доступ")
        return
    try:
        company_id = int(raw_company_id)
    except (TypeError, ValueError):
        raise HTTPException(403, "Некорректный демонстрационный доступ") from None
    company = await db.get(Company, company_id)
    membership = await db.scalar(select(CompanyMembership.id).where(CompanyMembership.company_id == company_id,
        CompanyMembership.user_id == user.id, CompanyMembership.status == "ACTIVE"))
    try:
        demo = json.loads(company.settings or "{}").get("_demo", {}) if company else {}
        expires = datetime.fromisoformat(demo["expires_at"])
        if expires.tzinfo:
            expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
    except (KeyError, TypeError, ValueError):
        expires = datetime.min
    if not user.is_demo or not company or company.status != "DEMO" or not membership or expires <= datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(403, "Время демонстрации истекло. Откройте новый пример")
    if connection is None:
        raise HTTPException(403, "Демонстрационный доступ требует HTTP-запрос")
    path = connection.url.path.rstrip("/")
    method = connection.scope.get("method", "GET").upper()
    if path == "/api/auth/me" and method == "GET":
        return
    if path == "/api/company/context" and method == "GET":
        requested = connection.query_params.get("company_id")
        if requested is not None and requested != str(company_id):
            raise HTTPException(403, "Доступна только демонстрационная компания")
        return
    prefix = f"/api/company/{company_id}/"
    if path.startswith(prefix):
        suffix = path[len(prefix):]
        pattern = {"GET": GET_COMPANY, "POST": POST_COMPANY, "PUT": PUT_COMPANY, "PATCH": PATCH_COMPANY, "DELETE": DELETE_COMPANY}.get(method)
        if pattern and pattern.fullmatch(suffix):
            if method != "GET":
                rate_limit("business-demo-action", str(user.id), 60, 60)
            if method == "POST" and re.fullmatch(r"assignments/\d+/start", suffix):
                assignment = await db.get(CompanyAssignment, int(suffix.split("/")[1]))
                if assignment and assignment.content_type not in {"ARENA_SCENARIO", "SCENARIO"}:
                    raise HTTPException(403, "В демонстрации доступны офлайн-сценарии без внешнего ИИ")
                count = await db.scalar(select(func.count()).select_from(Session).where(Session.user_id == user.id))
                if count >= 20:
                    raise HTTPException(429, "В демонстрации доступны 20 учебных попыток")
            return
    session_match = re.fullmatch(r"/api/sessions/(\d+)(?:/(choice|chaos-response|stop|finish|guess|report|ideal-dialogue))?", path)
    if session_match:
        action = session_match.group(2)
        allowed = method == "GET" and action in {None, "report", "ideal-dialogue"} or method == "POST" and action in {"choice", "chaos-response", "stop", "finish", "guess"}
        session = await db.get(Session, int(session_match.group(1))) if allowed else None
        try:
            corporate_id = json.loads(session.settings or "{}").get("corporate", {}).get("company_id") if session else None
        except (TypeError, ValueError):
            corporate_id = None
        if session and session.user_id == user.id and session.mode == "scenario" and corporate_id == company_id:
            return
    raise HTTPException(403, "Это действие недоступно в демонстрации. Перейдите в свой личный аккаунт")
