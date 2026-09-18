from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import seed_users
from app.config import settings
from app.db import SessionLocal, engine
from app.models import Base
from app.routers.auth import router as auth_router
from app.routers.game import router as game_router
from app.routers.meta import router as meta_router
from app.routers.learning import router as learning_router
from app.routers.training import router as training_router
from app.routers.learning_path import router as learning_path_router

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await seed_users(db)
    yield


app = FastAPI(title="Арена Переговоров", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix="/api")
app.include_router(game_router, prefix="/api")
app.include_router(meta_router, prefix="/api")
app.include_router(learning_router, prefix="/api")
app.include_router(training_router, prefix="/api")
app.include_router(learning_path_router, prefix="/api")


@app.get("/api")
async def root():
    return {"name": "Арена Переговоров", "offline": True}


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        target = FRONTEND_DIST / full_path
        if full_path and target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
