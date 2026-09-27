import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import seed_users
from app.config import settings
from app.db import SessionLocal, engine
from app.models import Base
from app import deployment_models
from app.installation import initialize_config, load_runtime
from app.routers.deployment import router as deployment_router
from app.routers.auth import router as auth_router
from app.routers.game import router as game_router
from app.routers.meta import router as meta_router
from app.routers.cosmetics import router as cosmetics_router
from app.routers.learning import router as learning_router
from app.routers.training import router as training_router
from app.routers.learning_path import router as learning_path_router
from app.routers.social import router as social_router
from app.routers.voice import router as voice_router
from app.routers.rooms import router as rooms_router
from app.routers.theory import router as theory_router
from app.routers.insights import router as insights_router
from app.routers.company import router as company_router, seed_company_demo, dispatch_company_reminders, dispatch_certificate_reminders, purge_company_retention
from app.routers.company_assignments import router as company_assignments_router
from app.routers.company_content import router as company_content_router
from app.routers.company_analytics import router as company_analytics_router
from app.routers.company_engagement import router as company_engagement_router
from app.routers.company_online import router as company_online_router
from app.routers.company_integrations import router as company_integrations_router
from app.routers.company_organization import router as company_organization_router
from app.routers.company_achievements import router as company_achievements_router
from app.routers.rooms import room_worker_loop
from app.engine.llm import keep_gigachat_authorized, warm_gigachat
from app.voice import local_stt, local_tts
from app.report_jobs import report_worker_loop

logger = logging.getLogger(__name__)

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    if settings.development_create_tables:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    await initialize_config()
    await load_runtime()
    async with SessionLocal() as db:
        await seed_users(db)
        if settings.seed_demo_accounts:
            await seed_company_demo(db)
    await warm_gigachat()
    voice_ready = await asyncio.gather(local_stt.warm(), local_tts.warm(), return_exceptions=True)
    for name, result in zip(("Whisper", "Piper"), voice_ready):
        if isinstance(result, Exception):
            logger.warning("%s preload failed: %s", name, type(result).__name__)
    refresh_task = asyncio.create_task(keep_gigachat_authorized())
    speech_task = asyncio.create_task(local_stt.run())
    room_task = asyncio.create_task(room_worker_loop())
    report_task = asyncio.create_task(report_worker_loop())
    async def company_reminder_loop():
        while True:
            try:
                async with SessionLocal() as reminder_db:
                    await dispatch_company_reminders(reminder_db)
                    await dispatch_certificate_reminders(reminder_db)
                    await purge_company_retention(reminder_db)
            except Exception as exc:  # scheduler must not stop the application
                logger.warning("Company reminder check failed: %s", type(exc).__name__)
            await asyncio.sleep(30 * 60)
    reminder_task = asyncio.create_task(company_reminder_loop())
    try:
        yield
    finally:
        speech_task.cancel()
        with suppress(asyncio.CancelledError):
            await speech_task
        report_task.cancel()
        with suppress(asyncio.CancelledError):
            await report_task
        if refresh_task:
            refresh_task.cancel()
            with suppress(asyncio.CancelledError):
                await refresh_task
        room_task.cancel()
        with suppress(asyncio.CancelledError):
            await room_task
        reminder_task.cancel()
        with suppress(asyncio.CancelledError):
            await reminder_task


app = FastAPI(title="Арена Переговоров", version="1.0.0", lifespan=lifespan)
@app.exception_handler(RequestValidationError)
async def safe_validation_error(request, exc):
    return JSONResponse(status_code=422, content={"detail": [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix="/api")
app.include_router(deployment_router, prefix="/api")
app.include_router(game_router, prefix="/api")
app.include_router(meta_router, prefix="/api")
app.include_router(cosmetics_router, prefix="/api")
app.include_router(learning_router, prefix="/api")
app.include_router(training_router, prefix="/api")
app.include_router(learning_path_router, prefix="/api")
app.include_router(social_router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(rooms_router, prefix="/api")
app.include_router(theory_router, prefix="/api")
app.include_router(insights_router, prefix="/api")
app.include_router(company_router, prefix="/api")
app.include_router(company_assignments_router, prefix="/api")
app.include_router(company_content_router, prefix="/api")
app.include_router(company_analytics_router, prefix="/api")
app.include_router(company_engagement_router, prefix="/api")
app.include_router(company_online_router, prefix="/api")
app.include_router(company_integrations_router, prefix="/api")
app.include_router(company_organization_router, prefix="/api")
app.include_router(company_achievements_router, prefix="/api")


@app.get("/api")
async def root():
    return {"name": "Арена Переговоров", "offline": True}


if (FRONTEND_DIST / "index.html").exists() and (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        target = (FRONTEND_DIST / full_path).resolve()
        if full_path and target.is_relative_to(FRONTEND_DIST.resolve()) and target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
