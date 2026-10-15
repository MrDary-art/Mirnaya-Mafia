"""Bounded local media storage. Database references, never filenames, grant access."""
import asyncio
import json
import re
import secrets
import shutil
import subprocess
import tempfile
import warnings
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import and_, exists, func, or_, select, update
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.social_models import SocialHighlight, SocialHighlightItem, SocialMedia, SocialPost, SocialStory
from app.social_service import now

IMAGE_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
VIDEO_TYPES = {"video/mp4": ".mp4", "video/webm": ".webm"}
MAX_PIXELS = 24_000_000
_processing_slots = asyncio.Semaphore(2)


def storage_root() -> Path:
    configured = settings.social_media_path
    return (Path(configured) if configured else Path(settings.data_dir) / "private" / "social-media").resolve()


def media_path(key: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{32}(?:-thumb)?\.(?:webp|mp4|webm)", key):
        raise HTTPException(404, "Медиа недоступно")
    root = storage_root()
    target = (root / key).resolve()
    if target.parent != root:
        raise HTTPException(404, "Медиа недоступно")
    return target


def _binary(name):
    configured = getattr(settings, f"social_media_{name}_path", "")
    found = configured or shutil.which(name)
    if not found or not Path(found).is_file():
        raise HTTPException(503, "Загрузка видео недоступна: администратору нужно настроить ffmpeg и ffprobe")
    return str(found)


def _run(command, timeout=30):
    try:
        result = subprocess.run(command, capture_output=True, timeout=timeout, check=False,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(415, "Не удалось безопасно проверить медиафайл") from exc
    if result.returncode:
        raise HTTPException(415, "Видео повреждено или содержит неподдерживаемый поток")
    return result.stdout


def _image(source, output, thumb, expected=None):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(source) as probe:
                if expected and probe.format != expected:
                    raise HTTPException(415, "Содержимое изображения не соответствует MIME-типу")
                if probe.width * probe.height > MAX_PIXELS or max(probe.size) > 8192:
                    raise HTTPException(413, "Слишком большое разрешение изображения")
                if getattr(probe, "n_frames", 1) != 1:
                    raise HTTPException(415, "Для фотографии используйте статическое JPEG, PNG или WebP")
                probe.verify()
            with Image.open(source) as opened:
                opened.load()
                picture = ImageOps.exif_transpose(opened).convert("RGBA" if "A" in opened.getbands() else "RGB")
                picture.thumbnail((2560, 2560))
                picture.save(output, "WEBP", quality=88, method=4)
                width, height = picture.size
                picture.thumbnail((480, 480))
                picture.save(thumb, "WEBP", quality=80, method=4)
                return width, height
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(415, "Изображение повреждено или не поддерживается") from exc


def _prepare(source, directory, mime):
    if mime in IMAGE_TYPES:
        target, thumb = directory / "ready.webp", directory / "thumb.webp"
        width, height = _image(source, target, thumb, IMAGE_TYPES[mime])
        return target, thumb, {"kind": "IMAGE", "mime": "image/webp", "width": width, "height": height,
                               "duration_seconds": None}
    ffprobe, ffmpeg = _binary("ffprobe"), _binary("ffmpeg")
    with source.open("rb") as stream:
        signature = stream.read(16)
    if (mime == "video/mp4" and signature[4:8] != b"ftyp") or (mime == "video/webm" and signature[:4] != b"\x1aE\xdf\xa3"):
        raise HTTPException(415, "Содержимое видео не соответствует контейнеру")
    raw = _run([ffprobe, "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries",
                "format=format_name,duration:stream=index,codec_type,codec_name,width,height,duration", "-of", "json", str(source)])
    try:
        probe = json.loads(raw)
        streams = probe["streams"]
        videos = [value for value in streams if value["codec_type"] == "video"]
        if len(videos) != 1 or len(streams) > 2:
            raise ValueError()
        video = videos[0]
        duration = float(probe["format"]["duration"])
        width, height = int(video["width"]), int(video["height"])
        formats = probe["format"]["format_name"].split(",")
        if not 0 < duration <= settings.social_media_max_video_seconds or width * height > 8_294_400:
            raise HTTPException(413, "Видео слишком длинное или превышает разрешение 4K")
        permitted = {"h264", "aac", "mp3"} if mime == "video/mp4" else {"vp8", "vp9", "av1", "opus", "vorbis"}
        if (mime == "video/mp4" and "mp4" not in formats) or (mime == "video/webm" and "webm" not in formats):
            raise ValueError()
        if any(stream["codec_type"] not in {"audio", "video"} or stream["codec_name"] not in permitted for stream in streams):
            raise ValueError()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(415, "Поддерживаются MP4/H.264 и WebM/VP8/VP9/AV1 с обычной аудиодорожкой") from exc
    target = directory / ("ready" + VIDEO_TYPES[mime])
    command = [ffmpeg, "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", str(source),
               "-map", "0:v:0", "-map", "0:a?", "-map_metadata", "-1", "-map_chapters", "-1", "-c", "copy"]
    if mime == "video/mp4":
        command += ["-movflags", "+faststart"]
    _run(command + ["-y", str(target)])
    poster, thumb = directory / "poster.png", directory / "thumb.webp"
    _run([ffmpeg, "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", str(target),
          "-frames:v", "1", "-vf", "scale=640:-2", "-y", str(poster)])
    _image(poster, directory / "poster.webp", thumb, "PNG")
    return target, thumb, {"kind": "VIDEO", "mime": mime, "width": width, "height": height, "duration_seconds": duration}


async def acquire_media_write_lock(db):
    # SQLite write transaction also serializes snapshot backup and file cleanup.
    await db.execute(update(SocialMedia).where(SocialMedia.id == -1).values(bytes=SocialMedia.bytes))


async def ingest_upload(db, user, upload: UploadFile, alt_text=""):
    mime = (upload.content_type or "").lower().split(";", 1)[0].strip()
    if mime not in IMAGE_TYPES and mime not in VIDEO_TYPES:
        raise HTTPException(415, "Разрешены JPEG, PNG, WebP, MP4 и WebM")
    maximum = settings.social_media_max_image_bytes if mime in IMAGE_TYPES else settings.social_media_max_video_bytes
    with tempfile.TemporaryDirectory(prefix="arena-social-upload-") as temporary:
        directory = Path(temporary)
        raw = directory / "source"
        size = 0
        with raw.open("wb") as target:
            while chunk := await upload.read(256 * 1024):
                size += len(chunk)
                if size > maximum:
                    raise HTTPException(413, "Файл превышает допустимый размер")
                target.write(chunk)
        if not size:
            raise HTTPException(415, "Файл пуст")
        async with _processing_slots:
            source, thumbnail, metadata = await run_in_threadpool(_prepare, raw, directory, mime)
        await acquire_media_write_lock(db)
        used = await db.scalar(select(func.coalesce(func.sum(SocialMedia.bytes), 0)).where(SocialMedia.owner_user_id == user.id))
        # Include a bounded allowance for the thumbnail in quota accounting.
        stored_bytes = source.stat().st_size + thumbnail.stat().st_size
        if used + stored_bytes > settings.social_media_user_quota_bytes:
            raise HTTPException(413, "Лимит хранилища исчерпан. Удалите ненужные вложения")
        key = secrets.token_hex(16)
        final_key, thumb_key = key + source.suffix, key + "-thumb.webp"
        storage_root().mkdir(parents=True, exist_ok=True)
        final, thumb_final = media_path(final_key), media_path(thumb_key)
        try:
            shutil.copyfile(source, final)
            shutil.copyfile(thumbnail, thumb_final)
            row = SocialMedia(owner_user_id=user.id, storage_key=final_key, thumb_key=thumb_key,
                              bytes=stored_bytes, alt_text=alt_text, **metadata)
            db.add(row)
            await db.commit()
        except Exception:
            # The write transaction is still held before removing incomplete files.
            final.unlink(missing_ok=True)
            thumb_final.unlink(missing_ok=True)
            await db.rollback()
            raise
        await db.refresh(row)
        return row


async def cleanup_social_media(db, *, limit=100):
    """Persisted eligibility survives restart; highlighted content is never an orphan."""
    await acquire_media_write_lock(db)
    moment = now()
    retained = or_(exists(select(SocialHighlight.id).where(SocialHighlight.cover_media_id == SocialMedia.id)),
                   exists(select(SocialHighlightItem.story_id).where(SocialHighlightItem.story_id == SocialMedia.story_id)))
    old_story = exists(select(SocialStory.id).where(SocialStory.id == SocialMedia.story_id,
        or_(SocialStory.expires_at < moment - timedelta(days=7),
            and_(SocialStory.deleted_at.is_not(None), SocialStory.deleted_at < moment - timedelta(days=7)))))
    old_post = exists(select(SocialPost.id).where(SocialPost.id == SocialMedia.post_id,
        SocialPost.status == "DELETED", SocialPost.deleted_at < moment - timedelta(days=7)))
    orphan = and_(SocialMedia.post_id.is_(None), SocialMedia.story_id.is_(None), SocialMedia.created_at < moment - timedelta(hours=24))
    rows = (await db.scalars(select(SocialMedia).where(SocialMedia.bytes > 0, ~retained,
        or_(SocialMedia.deleted_at.is_not(None), orphan, old_story, old_post)).limit(limit))).all()
    # Tombstones are committed before physical deletion. A retry can finish safely.
    for row in rows:
        row.deleted_at = row.deleted_at or moment
    await db.commit()
    removed = 0
    for row in rows:
        await acquire_media_write_lock(db)
        current = await db.get(SocialMedia, row.id, populate_existing=True)
        if not current or current.deleted_at is None:
            await db.rollback()
            continue
        media_path(current.storage_key).unlink(missing_ok=True)
        if current.thumb_key:
            media_path(current.thumb_key).unlink(missing_ok=True)
        current.bytes = 0
        current.thumb_key = None
        await db.commit()
        removed += 1
    return removed
