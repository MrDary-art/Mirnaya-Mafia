"""Admin-only audit, security signals and out-of-band password confirmation."""
import hmac, json, secrets, time, uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field, StrictBool
from sqlalchemy import select, update, func
from app.auth import get_admin, verify_password, hash_password
from app.db import get_db
from app.deployment_models import AdminAudit, AdminChallenge, SecurityAlert
from app.models import AppSetting, User
from app.installation import read_config, save_config, config_lock
from app.registration_policy import registration_status, SETTING
from app.mail_service import enqueue, normalized_email, mail_transport, mail_enabled, security_smtp_ready
from app.deployment_security import rate_limit
from app.admin_security import audit, fingerprint, code_digest
from app.security_explanations import alert_item, evidence

router=APIRouter(prefix="/admin",tags=["admin-settings"])
CONTACT="admin_confirmation_recipient"

class RegistrationPolicyIn(BaseModel):
    enabled: StrictBool
    revision: int = Field(ge=0)


@router.get("/registration")
async def get_registration_policy(admin=Depends(get_admin), db=Depends(get_db)):
    return await registration_status(db)


@router.put("/registration")
async def set_registration_policy(body: RegistrationPolicyIn, admin=Depends(get_admin), db=Depends(get_db)):
    async with config_lock:
        result = await save_config(db, body.revision, {SETTING: body.enabled}, admin.id,
            "admin.registration.enabled" if body.enabled else "admin.registration.disabled")
    return {"enabled": body.enabled, "revision": result["revision"]}


class DiagnosticMessage(BaseModel):
    message:str=Field(min_length=1,max_length=2000)

@router.post("/ai/chat")
async def diagnostic_chat(body:DiagnosticMessage,admin=Depends(get_admin)):
    from app.ai_diagnostics import generate
    rate_limit("admin-ai-chat",admin.id,10,60)
    return await generate(body.message)

@router.get("/ai/modes")
async def ai_modes(admin=Depends(get_admin)):
    from app.ai_diagnostics import MODES
    return [{"id":m["id"],"title":m["title"],"ai":m["ai"]} for m in MODES]

@router.post("/ai/modes/{mode}/check")
async def check_mode(mode:str,admin=Depends(get_admin)):
    from app.ai_diagnostics import MODES,generate
    item=next((m for m in MODES if m["id"]==mode),None)
    if not item:raise HTTPException(404,"Режим не найден")
    if not item["ai"]:return {"status":"not_required","detail":"ИИ для работы режима не требуется"}
    rate_limit("admin-ai-modes",admin.id,14,60)
    result=await generate(item["task"])
    return {"status":"ready","provider":result["provider"],"model":result["model"],"seconds":result["seconds"],"detail":"Пробный запрос к провайдеру выполнен"}

async def contact(db):
    row=await db.get(AppSetting,CONTACT)
    return row.value if row else None

async def require_smtp(db):
    _,value=await read_config(db)
    if not security_smtp_ready(value):
        raise HTTPException(409,"Для подтверждения кодом подключите реальную почту SMTP во вкладке «Почта». Локальный ящик для кодов администратора не используется.")

class Navigation(BaseModel):
    path: str=Field(pattern=r"^/admin(?:/[a-z-]+)?$",max_length=160)
    view: str=Field(default="",pattern=r"^[a-z_-]{0,40}$")

@router.post("/activity")
async def navigation(body:Navigation,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    rate_limit("admin-navigation",admin.id,120,60)
    audit(db,admin.id,"admin.logout" if body.view=="logout" else "admin.page_open",request,page=body.path,view=body.view)
    await db.commit();return {"ok":True}

@router.get("/audit")
async def audit_list(page:int=Query(default=1,ge=1),action:str=Query(default="",max_length=80),admin=Depends(get_admin),db=Depends(get_db)):
    query=select(AdminAudit)
    if action:query=query.where(AdminAudit.action==action)
    total=await db.scalar(select(func.count()).select_from(query.subquery()))
    rows=(await db.scalars(query.order_by(AdminAudit.id.desc()).offset((page-1)*50).limit(50))).all()
    ids={r.actor_id for r in rows if r.actor_id}
    names={u.id:u.username for u in (await db.scalars(select(User).where(User.id.in_(ids)))).all()}
    return {"total":total,"items":[{"id":r.id,"actor":names.get(r.actor_id,"Без входа"),"action":r.action,"created":r.created,"detail":json.loads(r.detail)} for r in rows]}

@router.get("/security/alerts")
async def alerts(request:Request,archive:bool=False,page:int=Query(default=1,ge=1),admin=Depends(get_admin),db=Depends(get_db)):
    query=select(SecurityAlert).where(SecurityAlert.acknowledged_at.is_not(None) if archive else SecurityAlert.acknowledged_at.is_(None))
    count=await db.scalar(select(func.count()).select_from(query.subquery()))
    rows=(await db.scalars(query.order_by(SecurityAlert.last_seen.desc()).offset((page-1)*25).limit(25))).all()
    routes=set(request.app.openapi()["paths"])
    return {"total":count,"items":[alert_item(r,routes) for r in rows]}

@router.get("/security/alerts/{alert_id}/evidence")
async def alert_evidence(alert_id:int,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    row=await db.get(SecurityAlert,alert_id)
    if not row:raise HTTPException(404,"Сигнал не найден")
    return await evidence(db,row,set(request.app.openapi()["paths"]))

@router.post("/security/alerts/{alert_id}/acknowledge")
async def acknowledge(alert_id:int,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    row=await db.get(SecurityAlert,alert_id)
    if not row:raise HTTPException(404,"Сигнал не найден")
    row.acknowledged_by=admin.id;row.acknowledged_at=time.time()
    audit(db,admin.id,"security.acknowledged",request,alert_id=alert_id)
    await db.commit();return {"ok":True}

@router.get("/password-confirmation")
async def confirmation_status(admin=Depends(get_admin),db=Depends(get_db)):
    _,value=await read_config(db)
    return {"recipient":await contact(db),"smtp_ready":security_smtp_ready(value)}

class RecipientRequest(BaseModel):
    current:str=Field(max_length=512,repr=False)
    email:str=Field(max_length=254)

class PasswordRequest(BaseModel):
    current:str=Field(max_length=512,repr=False)
    password:str=Field(min_length=12,max_length=512,repr=False)

class ConfirmCode(BaseModel):
    challenge_id:str=Field(max_length=36)
    code:str=Field(pattern=r"^\d{6}$",repr=False)
    previous_code:str=Field(default="",max_length=6,repr=False)

async def issue(db,admin,purpose,target,recipient,previous=None):
    await require_smtp(db)
    rate_limit("admin-code",admin.id,3,600)
    await db.execute(update(AdminChallenge).where(AdminChallenge.actor_id==admin.id,AdminChallenge.purpose==purpose,AdminChallenge.consumed==0).values(consumed=1))
    challenge_id=str(uuid.uuid4());code=f"{secrets.randbelow(1000000):06d}"
    old_code=f"{secrets.randbelow(1000000):06d}" if previous else None
    db.add(AdminChallenge(id=challenge_id,actor_id=admin.id,purpose=purpose,code_hash=code_digest(challenge_id,code),previous_code_hash=code_digest(challenge_id+":previous",old_code) if old_code else None,credential_version=fingerprint(admin.password_hash),target=json.dumps(target),expires=time.time()+600))
    action={"password":"смена пароля","recipient":"подключение адреса разработчика","mail":"изменение отправки SMTP"}[purpose]
    await enqueue(db,dedupe_key=f"admin-code:{challenge_id}",recipient=recipient,security_mail=True,subject="Подтверждение действия администратора",body=f"Код подтверждения: {code}\n\nАккаунт: {admin.username}. Действие: {action}.\nКод действует 10 минут и используется один раз. Если запрос сделали не вы, не передавайте код.")
    if previous:
        await enqueue(db,dedupe_key=f"admin-code:{challenge_id}:previous",recipient=previous,security_mail=True,subject="Подтверждение замены адреса разработчика",body=f"Код подтверждения замены: {old_code}\nНовый адрес: {recipient}\nАккаунт: {admin.username}. Срок: 10 минут.")
    await db.commit()
    return {"challenge_id":challenge_id,"recipient":recipient,"previous_required":bool(previous),"expires_seconds":600,"detail":"Письмо с кодом поставлено в очередь SMTP."}

@router.post("/password-confirmation/recipient/request")
async def recipient_request(body:RecipientRequest,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    rate_limit("admin-confirm-attempt",admin.id,10,60)
    if not verify_password(body.current,admin.password_hash):raise HTTPException(403,"Текущий пароль неверен")
    try:address=normalized_email(body.email)
    except ValueError as exc:raise HTTPException(422,str(exc)) from None
    previous=await contact(db)
    result=await issue(db,admin,"recipient",{"email":address,"previous":previous},address,previous if previous and previous!=address else None)
    audit(db,admin.id,"security.recipient_requested",request);await db.commit();return result

async def consume(db,admin,challenge_id,code,purpose,previous_code="",password=None,target_hash=None):
    row=await db.get(AdminChallenge,challenge_id)
    if not row or row.actor_id!=admin.id or row.purpose!=purpose or row.consumed or row.expires<time.time() or row.attempts>=5 or row.credential_version!=fingerprint(admin.password_hash):
        raise HTTPException(400,"Код недействителен или истёк. Запросите новый.")
    target=json.loads(row.target)
    valid=hmac.compare_digest(row.code_hash,code_digest(row.id,code))
    if row.previous_code_hash:valid=valid and hmac.compare_digest(row.previous_code_hash,code_digest(row.id+":previous",previous_code))
    if purpose=="password":valid=valid and bool(password and verify_password(password,target["password_hash"])) and target["recipient"]==await contact(db)
    if purpose=="recipient":valid=valid and target.get("previous")==await contact(db)
    if purpose=="mail":valid=valid and target.get("hash")==target_hash and target.get("recipient")==await contact(db)
    claimed=await db.execute(update(AdminChallenge).where(AdminChallenge.id==row.id,AdminChallenge.consumed==0,AdminChallenge.attempts==row.attempts,AdminChallenge.expires>time.time()).values(attempts=row.attempts+1,consumed=int(valid)))
    if not valid or claimed.rowcount!=1:
        await db.commit()
        raise HTTPException(400,"Неверный код. После пяти попыток запросите новый.")
    return target

@router.post("/password-confirmation/recipient/confirm")
async def recipient_confirm(body:ConfirmCode,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    target=await consume(db,admin,body.challenge_id,body.code,"recipient",body.previous_code)
    await db.merge(AppSetting(key=CONTACT,value=target["email"]))
    audit(db,admin.id,"security.recipient_updated",request)
    await db.commit();return {"ok":True,"recipient":target["email"]}

@router.post("/password-confirmation/request")
async def password_request(body:PasswordRequest,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    rate_limit("admin-confirm-attempt",admin.id,10,60)
    if not verify_password(body.current,admin.password_hash):raise HTTPException(403,"Текущий пароль неверен")
    recipient=await contact(db)
    if not recipient:raise HTTPException(409,"Сначала подтвердите адрес разработчика для получения кодов")
    result=await issue(db,admin,"password",{"password_hash":hash_password(body.password),"recipient":recipient},recipient)
    audit(db,admin.id,"security.password_code_requested",request);await db.commit();return result


class MailConfirmationRequest(BaseModel):
    current:str=Field(max_length=512,repr=False)
    config:dict=Field(default_factory=dict)
    disable:bool=False

@router.post("/password-confirmation/mail/request")
async def mail_confirmation_request(body:MailConfirmationRequest,request:Request,admin=Depends(get_admin),db=Depends(get_db)):
    rate_limit("admin-confirm-attempt",admin.id,10,60)
    if not verify_password(body.current,admin.password_hash):raise HTTPException(403,"Текущий пароль неверен")
    recipient=await contact(db)
    if not recipient:raise HTTPException(409,"Адрес разработчика не настроен")
    if body.disable:target_hash="disable"
    else:
        from app.routers.mail import MailConfig,candidate
        from pydantic import ValidationError
        try:config=MailConfig.model_validate(body.config)
        except ValidationError:raise HTTPException(422,"Проверьте поля SMTP") from None
        proposed=await candidate(config,db)
        target_hash=fingerprint(json.dumps(proposed,sort_keys=True))
    result=await issue(db,admin,"mail",{"hash":target_hash,"recipient":recipient},recipient)
    audit(db,admin.id,"security.mail_code_requested",request);await db.commit();return result
