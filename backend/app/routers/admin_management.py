"""Audited installation-level account and company administration."""
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, update, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin, hash_password
from app.db import get_db
from app.models import User, AppSetting
from app.company_models import Company, CompanyMembership, CompanyDepartment
from app.company_access import ROLE_LABELS, ensure_license_capacity
from app.deployment_models import AdminAudit
from app.features.progression import record_star_transaction
from app.admin_activity import activity_index, MODE_LABELS

router = APIRouter(prefix="/admin/management", tags=["admin-management"])


@router.get("/activity")
async def activity(q: str = "", mode: str = "", sort: Literal["newest", "oldest"] = "newest",
                   page: int = Query(1, ge=1), limit: int = Query(20, ge=20, le=200),
                   admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    index = activity_index()
    if limit not in (20, 50, 100, 200):
        raise HTTPException(422, "Выберите 20, 50, 100 или 200 записей")
    statement = select(index)
    if mode:
        statement = statement.where(index.c.mode == mode)
    if q.strip():
        matching = select(User.id).where(or_(User.username.ilike(f"%{q.strip()}%"), User.display_name.ilike(f"%{q.strip()}%"),
            User.first_name.ilike(f"%{q.strip()}%"), User.last_name.ilike(f"%{q.strip()}%")))
        from app.models import ArenaRoom
        from app.council_models import CouncilMember
        statement = statement.where(or_(index.c.user_id.in_(matching),
            (index.c.kind == "room") & index.c.id.in_(select(cast(ArenaRoom.id, String)).where(ArenaRoom.guest_id.in_(matching))),
            (index.c.kind == "council") & index.c.id.in_(select(cast(CouncilMember.meeting_id, String)).where(CouncilMember.user_id.in_(matching)))))
    total = await db.scalar(select(func.count()).select_from(statement.subquery()))
    ordering = [index.c.created_at.asc(), index.c.kind, index.c.id] if sort == "oldest" else [index.c.created_at.desc(), index.c.kind, index.c.id]
    rows = (await db.execute(statement.order_by(*ordering).offset((page-1)*limit).limit(limit))).mappings().all()
    items = [dict(row) for row in rows]
    room_ids = [int(row["id"]) for row in items if row["kind"] == "room"]
    from app.models import ArenaRoom
    guests = {str(room_id): user for room_id, user in (await db.execute(select(ArenaRoom.id, User)
        .join(User, User.id == ArenaRoom.guest_id).where(ArenaRoom.id.in_(room_ids)))).all()} if room_ids else {}
    from app.council_models import CouncilMember
    council_ids = [int(row["id"]) for row in items if row["kind"] == "council"]
    council_people = {}
    if council_ids:
        for meeting_id, person in (await db.execute(select(CouncilMember.meeting_id, User)
                .join(User, User.id == CouncilMember.user_id).where(CouncilMember.meeting_id.in_(council_ids)))).all():
            council_people.setdefault(str(meeting_id), []).append(person)
    for row in items:
        row["participants"] = [{"name": row["name"], "username": row["username"]}]
        if row["kind"] == "room" and row["id"] in guests:
            guest = guests[row["id"]]
            row["participants"].append({"name": guest.display_name or guest.username, "username": guest.username})
        if row["kind"] == "council":
            for person in council_people.get(row["id"], []):
                if person.username != row["username"]:
                    row["participants"].append({"name": person.display_name or person.username, "username": person.username})
    return {"items": items, "total": total, "modes": await mode_options(db)}


async def mode_options(db):
    index = activity_index()
    keys = list(MODE_LABELS)
    keys += [key for key in (await db.scalars(select(index.c.mode).distinct())).all() if key not in keys]
    return {key: MODE_LABELS.get(key, key) for key in keys}


@router.get("/overview")
async def overview(days: int = Query(0, ge=0, le=366), admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.models import Session
    from app.routers.deployment import session_report_status
    index = activity_index()
    begin = None
    if days:
        from zoneinfo import ZoneInfo
        local_today = datetime.now(ZoneInfo("Europe/Moscow")).replace(hour=0, minute=0, second=0, microsecond=0)
        begin = (local_today-timedelta(days=days-1)).astimezone(timezone.utc).replace(tzinfo=None)
        index = select(index).where(index.c.created_at >= begin).subquery()
    counts = (await db.execute(select(index.c.mode, func.sum(index.c.started), func.sum(index.c.finished)).group_by(index.c.mode))).all()
    values = {key: {"started": int(started or 0), "finished": int(finished or 0)} for key, started, finished in counts}
    labels = await mode_options(db)
    reports = {key: 0 for key in ("ready", "pending", "error", "not_requested")}
    report_query = select(Session.report, Session.state).join(User, User.id == Session.user_id).where(User.is_admin == 0, User.is_demo == 0)
    if begin:
        report_query = report_query.where(Session.created_at >= begin)
    report_rows = (await db.execute(report_query)).all()
    for row in report_rows:
        reports[session_report_status(row)] += 1
    moscow_day = func.date(index.c.created_at, "+3 hours")
    daily = (await db.execute(select(moscow_day, func.sum(index.c.started))
        .where(index.c.created_at >= datetime.now(timezone.utc).replace(tzinfo=None)-timedelta(days=30)).group_by(moscow_day))).all()
    return {"modes": [{"id": key, "label": label, **values.get(key, {"started": 0, "finished": 0})} for key, label in labels.items()],
            "reports": reports, "daily": dict(daily),
            "registered": await db.scalar(select(func.count()).select_from(User).where(User.is_admin == 0, User.is_demo == 0)),
            "started": sum(v["started"] for v in values.values()), "finished": sum(v["finished"] for v in values.values())}


@router.get("/activity/{kind}/{item_id}")
async def activity_detail(kind: str, item_id: str, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    from app.models import LearningAttempt
    from app.story_models import StoryAttempt
    from app.serial_models import SerialRun
    from app.lab_models import LabRun
    from app.council_models import CouncilMeeting
    models = {"learning": LearningAttempt, "story": StoryAttempt, "serial": SerialRun, "lab": LabRun, "council": CouncilMeeting}
    model = models.get(kind)
    if model is None:
        raise HTTPException(404, "Неизвестный формат")
    try:
        identifier = item_id if kind in ("serial", "lab") else int(item_id)
    except ValueError as exc:
        raise HTTPException(404, "Запись не найдена") from exc
    row = await db.get(model, identifier)
    if not row:
        raise HTTPException(404, "Запись не найдена")
    # Return saved results only; private notes and draft role information are excluded.
    state = unpack(getattr(row, "state", None))
    return {"id": item_id, "status": row.status, "report": unpack(getattr(row, "report", None) or getattr(row, "result", None)),
            "score": getattr(row, "score", None), "outcome": {key: state[key] for key in ("ending", "ending_id", "score", "metrics", "phase", "summary") if key in state}}


def unpack(value):
    try:
        return json.loads(value or "{}")
    except (ValueError, TypeError):
        return {}


def audit(db, actor, action, **detail):
    db.add(AdminAudit(actor_id=actor.id, action=action, detail=json.dumps(detail, ensure_ascii=False), created=time.time()))


async def put_setting(db, key, value):
    row = await db.get(AppSetting, key)
    if value is None:
        if row:
            await db.delete(row)
    elif row:
        row.value = json.dumps(value, ensure_ascii=False)
    else:
        db.add(AppSetting(key=key, value=json.dumps(value, ensure_ascii=False)))


async def detach_member(db, member):
    member.status = "LEFT"
    member.is_primary = 0
    await db.execute(update(CompanyMembership).where(CompanyMembership.manager_membership_id == member.id).values(manager_membership_id=None))
    await db.execute(update(CompanyMembership).where(CompanyMembership.mentor_membership_id == member.id).values(mentor_membership_id=None))
    await db.execute(update(CompanyDepartment).where(CompanyDepartment.company_id == member.company_id,
        CompanyDepartment.manager_membership_id == member.id).values(manager_membership_id=None))


def user_payload(user, markers):
    ban = unpack(markers.get(f"moderation_ban:{user.id}"))
    return {"id": user.id, "username": user.username,
            "name": user.display_name or " ".join(filter(None, [user.last_name, user.first_name, user.middle_name])) or user.username,
            "stars": user.stars, "created_at": user.created_at, "is_admin": bool(user.is_admin),
            "deleted": f"account_deleted:{user.id}" in markers,
            "ban": ban if ban.get("until", "") > datetime.now(timezone.utc).isoformat() else None}


@router.get("/users")
async def users(q: str = "", page: int = Query(1, ge=1), limit: int = Query(20, ge=20, le=200),
                deleted: bool = False, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    if limit not in (20, 50, 100, 200):
        raise HTTPException(422, "Выберите 20, 50, 100 или 200 человек")
    markers = dict((await db.execute(select(AppSetting.key, AppSetting.value).where(or_(
        AppSetting.key.like("account_deleted:%"), AppSetting.key.like("moderation_ban:%"))))).all())
    deleted_ids = [int(key.split(":")[1]) for key in markers if key.startswith("account_deleted:")]
    statement = select(User).where(User.id.in_(deleted_ids) if deleted else User.id.not_in(deleted_ids))
    if q.strip():
        term = f"%{q.strip()}%"
        statement = statement.where(or_(User.username.ilike(term), User.display_name.ilike(term),
            User.first_name.ilike(term), User.last_name.ilike(term), User.email.ilike(term)))
    total = await db.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (await db.scalars(statement.order_by(User.created_at.desc(), User.id.desc()).offset((page-1)*limit).limit(limit))).all()
    return {"items": [user_payload(u, markers) for u in rows], "total": total, "page": page, "limit": limit}


class AccountAction(BaseModel):
    action: Literal["password", "stars", "ban", "unban", "delete", "restore"]
    reason: str = Field(min_length=5, max_length=1500)
    password: str | None = Field(default=None, min_length=12, max_length=128)
    amount: int = Field(default=0, ge=-1000000, le=1000000)
    operation_id: str = Field(default="", max_length=80)
    hours: int = Field(default=24, ge=1, le=720)
    confirmation: str = ""


@router.post("/users/{user_id}")
async def account_action(user_id: int, body: AccountAction, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    # Serialize privileged writes in SQLite before checking membership/balance invariants.
    await db.execute(update(User).where(User.id == user_id).values(stars=User.stars))
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Аккаунт не найден")
    if user.is_admin or user.id == admin.id:
        raise HTTPException(409, "Администраторы защищены. Свой пароль меняйте в настройках безопасности.")
    removed = await db.get(AppSetting, f"account_deleted:{user_id}")
    if removed and body.action != "restore":
        raise HTTPException(409, "Сначала восстановите аккаунт")
    if body.action == "password":
        if not body.password:
            raise HTTPException(422, "Укажите новый пароль от 12 символов")
        user.password_hash = hash_password(body.password)
        await put_setting(db, f"account_password_version:{user_id}", True)
    elif body.action == "stars":
        if not body.amount or not body.operation_id:
            raise HTTPException(422, "Укажите ненулевую сумму и идентификатор операции")
        try:
            await record_star_transaction(db, user, amount=body.amount, transaction_type="ADMIN",
                source="admin", source_id=body.operation_id, description=body.reason)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
    elif body.action == "ban":
        await put_setting(db, f"moderation_ban:{user_id}", {
            "until": (datetime.now(timezone.utc)+timedelta(hours=body.hours)).isoformat(), "reason": body.reason})
    elif body.action == "unban":
        await put_setting(db, f"moderation_ban:{user_id}", None)
    elif body.action == "delete":
        if body.confirmation != user.username:
            raise HTTPException(409, "Для удаления введите точный логин")
        owner = await db.scalar(select(CompanyMembership.id).where(CompanyMembership.user_id == user_id,
            CompanyMembership.status == "ACTIVE", CompanyMembership.corporate_role == "COMPANY_OWNER"))
        if owner:
            raise HTTPException(409, "Сначала передайте руководство компаниями другому участнику")
        await put_setting(db, f"account_deleted:{user_id}", {"reason": body.reason, "at": datetime.now(timezone.utc).isoformat()})
        user.password_hash = hash_password(secrets.token_urlsafe(32))
        await put_setting(db, f"account_password_version:{user_id}", True)
        for member in (await db.scalars(select(CompanyMembership).where(CompanyMembership.user_id == user_id))).all():
            await detach_member(db, member)
    elif body.action == "restore":
        await put_setting(db, f"account_deleted:{user_id}", None)
    audit(db, admin, "ACCOUNT_"+body.action.upper(), user_id=user_id, reason=body.reason,
          **({"amount": body.amount, "operation_id": body.operation_id} if body.action == "stars" else {}))
    await db.commit()
    return {"ok": True}


@router.get("/companies")
async def companies(q: str = "", admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Company, func.count(CompanyMembership.id)).outerjoin(CompanyMembership,
        (CompanyMembership.company_id == Company.id) & (CompanyMembership.status == "ACTIVE"))
        .where(Company.name.ilike(f"%{q.strip()}%")).group_by(Company.id).order_by(Company.id.desc()))).all()
    return [{"id": c.id, "name": c.name, "status": c.status, "members": count} for c, count in rows]


@router.get("/companies/{company_id}")
async def company_detail(company_id: int, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Компания не найдена")
    lock = await db.get(AppSetting, f"company_name_lock:{company_id}")
    members = (await db.execute(select(CompanyMembership, User).join(User, User.id == CompanyMembership.user_id)
        .where(CompanyMembership.company_id == company_id, CompanyMembership.status.in_(["ACTIVE", "INVITED"])))).all()
    return {"id": company.id, "name": company.name, "short_name": company.short_name, "status": company.status,
            "name_lock": unpack(lock.value) if lock else None, "roles": ROLE_LABELS,
            "members": [{"id": m.id, "user_id": u.id, "username": u.username, "name": u.display_name or u.username,
                         "role": m.corporate_role, "status": m.status} for m, u in members]}


class CompanyAction(BaseModel):
    action: Literal["rename", "unlock_name", "member", "remove_member", "archive", "restore"]
    reason: str = Field(min_length=5, max_length=1500)
    name: str = Field(default="", max_length=180)
    username: str = ""
    role: str = "EMPLOYEE"


@router.post("/companies/{company_id}")
async def company_action(company_id: int, body: CompanyAction, admin=Depends(get_admin), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Company).where(Company.id == company_id).values(status=Company.status))
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Компания не найдена")
    if body.action == "rename":
        if len(body.name.strip()) < 2:
            raise HTTPException(422, "Название должно содержать хотя бы 2 символа")
        company.name = body.name.strip()
        company.short_name = None
        await put_setting(db, f"company_name_lock:{company_id}", {"reason": body.reason, "at": datetime.now(timezone.utc).isoformat()})
    elif body.action == "unlock_name":
        await put_setting(db, f"company_name_lock:{company_id}", None)
    elif body.action in ("archive", "restore"):
        config = unpack(company.settings)
        if body.action == "archive" and company.status != "ARCHIVED":
            config["moderation_archive"] = {"previous_status": company.status, "reason": body.reason}
            company.status = "ARCHIVED"
        elif body.action == "restore" and company.status == "ARCHIVED":
            company.status = config.pop("moderation_archive", {}).get("previous_status", "ACTIVE")
        company.settings = json.dumps(config, ensure_ascii=False)
    else:
        user = await db.scalar(select(User).where(User.username == body.username))
        if not user or user.is_admin or await db.get(AppSetting, f"account_deleted:{user.id}"):
            raise HTTPException(404, "Выберите существующий аккаунт участника")
        member = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id, CompanyMembership.user_id == user.id))
        if body.role not in ROLE_LABELS:
            raise HTTPException(422, "Неизвестная роль")
        removing_owner = member and member.status == "ACTIVE" and member.corporate_role == "COMPANY_OWNER" and (body.action == "remove_member" or body.role != "COMPANY_OWNER")
        if removing_owner:
            successor = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == company_id,
                CompanyMembership.status == "ACTIVE", CompanyMembership.corporate_role == "COMPANY_OWNER", CompanyMembership.id != member.id))
            if not successor:
                raise HTTPException(409, "Сначала назначьте другого генерального директора")
            if company.created_by == user.id:
                company.created_by = successor.user_id
        if body.action == "remove_member":
            if not member:
                raise HTTPException(404, "Участник не найден")
            await detach_member(db, member)
        else:
            if not member or member.status not in ("ACTIVE", "INVITED"):
                await ensure_license_capacity(db, company_id)
            if not member:
                member = CompanyMembership(company_id=company_id, user_id=user.id)
                db.add(member)
            member.status = "ACTIVE"
            member.corporate_role = body.role
            member.custom_role_id = None
            member.capability_overrides = "{}"
            member.joined_at = member.joined_at or datetime.now(timezone.utc).replace(tzinfo=None)
            member.verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    audit(db, admin, "COMPANY_ADMIN_"+body.action.upper(), company_id=company_id, reason=body.reason,
          username=body.username, role=body.role, name=body.name)
    await db.commit()
    return {"ok": True}
