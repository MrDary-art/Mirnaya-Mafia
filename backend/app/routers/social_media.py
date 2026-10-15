"""Authenticated image/video upload and current-ACL byte/range delivery."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.deployment_security import rate_limit
from app.models import User
from app.social_access import AccessContext, get_post
from app.config import settings
from app.social_media_storage import _binary, acquire_media_write_lock, ingest_upload, media_path
from app.social_models import SocialMedia
from app.social_service import media_payload, now
from app.social_stories_service import visible_story

class BoundedMediaRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def bounded(request: Request):
            if request.method == "POST":
                maximum = max(settings.social_media_max_image_bytes, settings.social_media_max_video_bytes) + 65_536
                declared = request.headers.get("content-length")
                if declared:
                    try:
                        if int(declared) < 0:
                            raise ValueError()
                        if int(declared) > maximum:
                            raise HTTPException(413, "Запрос с медиа превышает допустимый размер")
                    except ValueError as exc:
                        raise HTTPException(400, "Некорректный размер запроса") from exc
                receive, consumed = request._receive, 0

                async def limited_receive():
                    nonlocal consumed
                    message = await receive()
                    consumed += len(message.get("body", b""))
                    if consumed > maximum:
                        raise HTTPException(413, "Запрос с медиа превышает допустимый размер")
                    return message

                request._receive = limited_receive
            return await handler(request)
        return bounded


router = APIRouter(prefix="/social/media", tags=["social-media"], route_class=BoundedMediaRoute)


@router.get("/capabilities")
async def media_capabilities(user: User = Depends(get_current_user)):
    try:
        _binary("ffmpeg")
        _binary("ffprobe")
        video_enabled = True
    except HTTPException:
        video_enabled = False
    return {"image_types": ["image/jpeg", "image/png", "image/webp"],
            "max_image_bytes": settings.social_media_max_image_bytes,
            "video_enabled": video_enabled, "video_types": ["video/mp4", "video/webm"] if video_enabled else [],
            "max_video_bytes": settings.social_media_max_video_bytes,
            "max_video_seconds": settings.social_media_max_video_seconds,
            "max_story_video_seconds": settings.social_media_story_video_seconds,
            "video_unavailable_reason": None if video_enabled else "Администратору нужно настроить ffmpeg и ffprobe"}


@router.post("/upload")
async def upload_media(file: UploadFile = File(...), alt_text: str = Form(default="", max_length=300),
                       db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rate_limit("social-media-upload", user.id, 20, 3600)
    try:
        row = await ingest_upload(db, user, file, alt_text.strip())
        return media_payload(row)
    finally:
        await file.close()


@router.get("/{media_id}")
async def read_media(media_id: int, thumbnail: bool = Query(False),
                     db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(SocialMedia, media_id)
    if not row or row.deleted_at:
        raise HTTPException(404, "Медиа недоступно")
    context = await AccessContext.load(db, user)
    if row.post_id is not None:
        await get_post(db, user, row.post_id, context=context)
    elif row.story_id is not None:
        await visible_story(db, user, row.story_id, context=context, allow_highlight=True)
    elif row.owner_user_id != user.id:
        raise HTTPException(404, "Медиа недоступно")
    key = row.thumb_key if thumbnail else row.storage_key
    if not key:
        raise HTTPException(404, "Миниатюра недоступна")
    path = media_path(key)
    if not path.is_file():
        raise HTTPException(404, "Медиа недоступно")
    # Starlette FileResponse implements bounded Range/If-Range requests after ACL.
    return FileResponse(path, media_type="image/webp" if thumbnail else row.mime,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                                 "Content-Disposition": "inline"})


@router.delete("/{media_id}")
async def delete_media(media_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await acquire_media_write_lock(db)
    row = await db.get(SocialMedia, media_id)
    if not row or row.owner_user_id != user.id:
        raise HTTPException(404, "Медиа недоступно")
    if row.post_id is not None or row.story_id is not None:
        raise HTTPException(409, "Сначала удалите вложение из публикации или удалите историю")
    row.deleted_at = row.deleted_at or now()
    await db.commit()
    return {"ok": True}
