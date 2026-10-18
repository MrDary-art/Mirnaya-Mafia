"""Safe audit metadata and bounded, explainable security signals."""
import hashlib, hmac, json, time
from sqlalchemy import select, func
from sqlalchemy.dialects.sqlite import insert
from app.config import settings
from app.deployment_models import AdminAudit, SecurityAlert

def fingerprint(value):
    return hashlib.sha256(value.encode()).hexdigest()

def code_digest(challenge_id, code):
    return hmac.new(settings.secret_key.encode(), f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()

def metadata(request):
    route = getattr(request.scope.get("route"), "path", request.url.path)
    return {"ip": (request.client.host if request.client else "unknown")[:64], "route": route[:200], "method": request.method}

def audit(db, actor, action, request=None, **detail):
    db.add(AdminAudit(actor_id=actor, action=action, detail=json.dumps({**(metadata(request) if request else {}), **detail}, ensure_ascii=False), created=time.time()))

async def record_request(db, request, status):
    actor = getattr(request.state, "admin_actor_id", None)
    data = metadata(request)
    if actor and request.method in {"POST","PUT","PATCH","DELETE"} and request.url.path != "/api/admin/activity":
        audit(db, actor, "admin.request", request, status=status)
    confirmation_failure=status==400 and request.url.path in {"/api/auth/password","/api/admin/password-confirmation/recipient/confirm"}
    if not request.url.path.startswith("/api/") or status not in {401,403,404,429} and not confirmation_failure:
        return
    kind = "confirmation_failures" if confirmation_failure else "login_failures" if request.url.path == "/api/auth/login" and status in {401,429} else {401:"unauthorized",403:"forbidden",404:"not_found",429:"rate_limit"}[status]
    audit(db, actor, "security."+kind, request, status=status)
    await db.flush()
    now=time.time(); cutoff=now-300
    # Match a canonical serialized IP field; no request body, query, credential or code is stored.
    rows=(await db.scalars(select(AdminAudit.detail).where(AdminAudit.action=="security."+kind,AdminAudit.created>=cutoff).order_by(AdminAudit.id.desc()).limit(2000))).all()
    count=sum(json.loads(row).get("ip")==data["ip"] for row in rows)
    threshold={"confirmation_failures":5,"login_failures":5,"unauthorized":10,"forbidden":10,"not_found":20,"rate_limit":3}[kind]
    if count < threshold:return
    bucket=f"{kind}:{data['ip']}:{int(now//300)}"
    stmt=insert(SecurityAlert).values(bucket=bucket,kind=kind,ip=data["ip"],route=data["route"],severity="high" if kind in {"login_failures","confirmation_failures"} else "warning",count=count,first_seen=now,last_seen=now)
    await db.execute(stmt.on_conflict_do_update(index_elements=["bucket"],set_={"count":count,"last_seen":now,"route":data["route"]}))
