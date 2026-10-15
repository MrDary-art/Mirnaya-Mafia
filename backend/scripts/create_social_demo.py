"""Create original silent Arena clips; publish only with explicit operator consent.

Default execution never imports the application or opens a database. Pillow and
FFmpeg produce original typographic frames, not borrowed footage or fake people.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
WIDTH, HEIGHT, FPS, SCENE_SECONDS = 720, 1280, 24, 6
VERSION = "arena-social-demo-v1"
COLORS = {"deep": "#07110d", "forest": "#173b2c", "paper": "#f3f5ed", "muted": "#bec9be",
          "lime": "#c1f46a", "peach": "#e7c890", "ink": "#14291d"}
CLIPS = [
    {"slug": "pause", "title": "Пауза перед ответом", "accent": "lime",
     "description": "Пауза и вопрос об интересах помогают уточнить, что действительно важно собеседнику. Это учебный пример, а не обещание результата.",
     "scenes": [
         {"title": "Пауза —\nтоже ответ.", "speaker": "Клиент", "quote": "«Нужно дешевле.\nИ сегодня».", "note": "Уточните, что стоит за требованием."},
         {"title": "Что важнее\nсейчас?", "speaker": "Возможный ответ", "quote": "«Уложиться в бюджет\nили успеть к запуску?»", "note": "Один вопрос вместо поспешной скидки."},
         {"title": "Сначала —\nинтерес.", "speaker": "Следующая реплика", "quote": "«Сравним два варианта\nпо сроку и объёму».", "note": "Подход не гарантирует согласия.\nКонтекст важен."},
     ]},
    {"slug": "boundaries", "title": "Критерии и границы", "accent": "peach",
     "description": "Обсудите согласованный объём, прежде чем обещать дополнительную работу. Новые условия требуют отдельного согласования обеих сторон.",
     "scenes": [
         {"title": "Ещё одна\nправка?", "speaker": "Клиент", "quote": "«Добавьте этот блок.\nБюджет тот же».", "note": "Уточните, что уже входит\nв договорённость."},
         {"title": "Граница без\nультиматума.", "speaker": "Возможный ответ", "quote": "«Круг правок включён.\nНовый блок —\nотдельная задача».", "note": "Опирайтесь на согласованный объём."},
         {"title": "Предложите\nвыбор.", "speaker": "Следующая реплика", "quote": "«Меняем приоритеты\nили согласуем доплату?»", "note": "Стоимость и сроки\nобсуждаются отдельно."},
     ]},
    {"slug": "next-step", "title": "Конкретный следующий шаг", "accent": "lime",
     "description": "Проверьте, одинаково ли стороны понимают следующий шаг: кто действует, что делает и когда возвращается с ответом. Вежливое согласие не равно обязательству.",
     "scenes": [
         {"title": "«Мы\nподумаем».", "speaker": "После разговора", "quote": "Разговор завершён.\nСледующий шаг — нет.", "note": "Вежливый ответ ещё не обещание."},
         {"title": "Кто, что,\nкогда?", "speaker": "Возможный ответ", "quote": "«Пришлю варианты сегодня.\nКогда вернёмся\nк решению?»", "note": "Предложите срок,\nно оставьте право его обсудить."},
         {"title": "Проверьте\nпонимание.", "speaker": "Следующая реплика", "quote": "«Итак, я отправляю расчёт.\nВы отвечаете в пятницу.\nВсё верно?»", "note": "Фиксируйте только то,\nс чем согласились обе стороны."},
     ]},
]


def executable(value: str | None, name: str) -> Path:
    suffix = ".exe" if os.name == "nt" else ""
    portable = ROOT / ".cache/social-tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin" / f"{name}{suffix}"
    candidate = Path(value) if value else portable if portable.is_file() else Path(shutil.which(name) or "__missing__")
    if not candidate.is_file():
        raise ValueError(f"{name} не найден. Укажите --{name} /полный/путь/{name}{suffix}")
    return candidate.resolve()


def run(command: list[str], *, timeout: int = 180) -> str:
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                            timeout=timeout, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode:
        raise RuntimeError(f"{Path(command[0]).name}: {result.stderr[-1600:]}")
    return result.stdout


def fonts(regular: str | None, bold: str | None) -> tuple[Path, Path]:
    windows = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    candidates = [(Path(regular), Path(bold or regular))] if regular else [
        (windows / "segoeui.ttf", windows / "segoeuib.ttf"),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for pair in candidates:
        if all(path.is_file() for path in pair):
            return pair
    raise ValueError("Нужен локальный шрифт с кириллицей: --font-regular PATH --font-bold PATH")


def draw_block(draw, text, xy, font, fill, *, width=600, spacing=12):
    bounds = draw.multiline_textbbox(xy, text, font=font, spacing=spacing)
    if bounds[2] - bounds[0] > width or bounds[3] > HEIGHT - 55:
        raise ValueError(f"Текст не помещается в кадр: {text!r}")
    draw.multiline_text(xy, text, font=font, fill=fill, spacing=spacing)
    return bounds


def render_scene(clip: dict, scene: dict, index: int, font_paths, target: Path):
    regular, bold = font_paths
    font = lambda size, heavy=False: ImageFont.truetype(str(bold if heavy else regular), size)
    image = Image.new("RGB", (WIDTH, HEIGHT), COLORS["deep"])
    draw = ImageDraw.Draw(image)
    accent = COLORS[clip["accent"]]
    # Geometry serves reading: publication identity, dialogue surface, timeline.
    draw.text((58, 56), "Арена", font=font(35, True), fill=COLORS["paper"])
    draw.text((58, 100), "переговоров", font=font(21), fill=COLORS["muted"])
    draw.rounded_rectangle((514, 60, 662, 104), radius=22, fill=COLORS["forest"])
    draw.text((541, 65), "ДЕМО", font=font(22, True), fill=COLORS["paper"])
    draw_block(draw, scene["title"], (54, 212), font(70, True), COLORS["paper"], spacing=5)
    draw.rounded_rectangle((42, 505, 678, 890), radius=24, fill=accent)
    draw.text((72, 537), scene["speaker"], font=font(23, True), fill=COLORS["ink"])
    draw_block(draw, scene["quote"], (70, 610), font(35, True), COLORS["ink"], width=580, spacing=14)
    draw_block(draw, scene["note"], (58, 960), font(26), COLORS["muted"], spacing=10)
    for part in range(3):
        left = 58 + part * 204
        draw.rounded_rectangle((left, 1130, left + 186, 1134), radius=2,
                               fill=accent if part <= index else COLORS["forest"])
    draw.text((58, 1170), "Учебный пример · без звука", font=font(21), fill=COLORS["muted"])
    image.save(target, format="PNG")


def probe(path: Path, ffprobe: Path) -> dict:
    result = json.loads(run([str(ffprobe), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))
    streams = result.get("streams", [])
    if len(streams) != 1 or streams[0].get("codec_type") != "video":
        raise ValueError(f"{path.name}: ожидается один видеопоток без звука")
    stream = streams[0]
    duration = float(result["format"]["duration"])
    if (stream.get("codec_name"), stream.get("width"), stream.get("height"), stream.get("pix_fmt")) != ("h264", WIDTH, HEIGHT, "yuv420p"):
        raise ValueError(f"{path.name}: неожиданный формат видео")
    if not 17.9 <= duration <= 18.1:
        raise ValueError(f"{path.name}: длительность {duration}, ожидалось 18 секунд")
    return {"file": path.name, "codec": "h264", "width": WIDTH, "height": HEIGHT, "fps": stream["avg_frame_rate"],
            "duration_seconds": duration, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def generate(args, ffmpeg: Path, ffprobe: Path) -> list[dict]:
    folder = args.output.resolve()
    folder.mkdir(parents=True, exist_ok=True)
    recipe = hashlib.sha256(json.dumps(CLIPS, ensure_ascii=False, sort_keys=True).encode("utf-8") + VERSION.encode()).hexdigest()
    manifest_path = folder / "manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    paths = fonts(args.font_regular, args.font_bold)
    results = []
    for clip in CLIPS:
        target = folder / f"{clip['slug']}.mp4"
        if args.verify_only:
            if not target.is_file(): raise ValueError(f"Файл отсутствует: {target}")
        elif target.exists() and not args.regenerate:
            if previous.get("recipe_sha256") != recipe:
                raise ValueError(f"{target.name} уже существует с другой версией. Для замены используйте --regenerate")
            print(f"Уже создан: {target.name}", flush=True)
        else:
            inputs = []
            filters = []
            for index, scene in enumerate(clip["scenes"]):
                frame = folder / f"{clip['slug']}-scene-{index + 1}.png"
                render_scene(clip, scene, index, paths, frame)
                inputs.extend(["-loop", "1", "-framerate", str(FPS), "-t", str(SCENE_SECONDS), "-i", str(frame)])
                entrance = ",fade=t=in:st=0:d=0.20" if index else ""
                filters.append(f"[{index}:v]format=yuv420p{entrance},fade=t=out:st=5.8:d=0.20[v{index}]")
            filters.append("[v0][v1][v2]concat=n=3:v=1:a=0[out]")
            pending = folder / f"{clip['slug']}.pending.mp4"
            print(f"Создаём {target.name}: 3 сцены по 6 секунд…", flush=True)
            run([str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters),
                 "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2",
                 "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1", "-t", "18", str(pending)])
            probe(pending, ffprobe)
            pending.replace(target)
        result = probe(target, ffprobe)
        results.append({"slug": clip["slug"], "title": clip["title"], **result})
        print(f"Проверен {target.name}: {WIDTH}×{HEIGHT}, {result['duration_seconds']:.1f} с, {result['bytes']} байт", flush=True)
    manifest = {"version": VERSION, "recipe_sha256": recipe, "original_content": True, "audio": False,
                "font_regular": paths[0].name, "font_bold": paths[1].name, "clips": results}
    if not args.verify_only:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return results


def require_demo_author(author, *, allow_legacy=False):
    """Allow the legacy shipped demo only by an explicit, narrowly scoped switch."""
    if author and author.is_demo == 1:
        return
    if author and allow_legacy and author.username == "demo" and not author.is_admin:
        from app.auth import verify_password
        try:
            # This is the public legacy bootstrap credential, never an operator secret.
            if verify_password("demo", author.password_hash):
                return
        except Exception:
            pass  # An invalid/unrecognised hash cannot qualify as the legacy demo.
    raise ValueError("Автор должен существовать и иметь is_demo=1. Для исходного demo отдельно требуется --allow-legacy-demo; пользователей скрипт не изменяет")


async def publish(args, ffmpeg: Path, ffprobe: Path):
    if not args.author or not args.confirm_backup:
        raise ValueError("Публикация требует --author и --confirm-backup PATH после создания резервной копии БД и медиа")
    backup = args.confirm_backup.resolve()
    if not backup.exists() or (backup.is_dir() and not any(backup.iterdir())):
        raise ValueError("Указанная резервная копия не найдена или папка пуста")
    # Import the real application only after explicit publication has been requested.
    sys.path.insert(0, str(BACKEND))
    os.chdir(BACKEND)
    from app.config import settings
    if not Path(settings.db_path).is_file():
        raise ValueError("Рабочая БД не найдена. Скрипт не создаёт БД и не запускает миграции")
    if backup == Path(settings.db_path).resolve():
        raise ValueError("Путь резервной копии не должен совпадать с рабочей БД")
    settings.social_media_ffmpeg_path = str(ffmpeg)
    settings.social_media_ffprobe_path = str(ffprobe)
    from sqlalchemy import or_, select
    from starlette.datastructures import Headers, UploadFile
    from app.db import SessionLocal, engine
    from app.models import User
    from app.social_models import SocialMedia, SocialPost
    from app.social_media_storage import acquire_media_write_lock, ingest_upload
    from app.routers.social_feed import PostIn, create_post

    async def existing(db, author_id, marker):
        return await db.scalar(select(SocialPost).outerjoin(SocialMedia, SocialMedia.post_id == SocialPost.id).where(
            SocialPost.author_user_id == author_id,
            or_(SocialPost.body.contains(marker), SocialMedia.alt_text.contains(marker))).limit(1))

    try:
        async with SessionLocal() as db:
            author = await db.scalar(select(User).where(User.username == args.author))
            allow_legacy = bool(getattr(args, "allow_legacy_demo", False))
            require_demo_author(author, allow_legacy=allow_legacy)
            author_id = author.id
            print(f"Автор подтверждён: {author.username}, user_id={author.id}. Демопубликаций: не более 3.", flush=True)
            for clip in CLIPS:
                marker = f"[{VERSION}:{clip['slug']}]"
                found = await existing(db, author_id, marker)
                if found:
                    print(f"Пропуск {clip['slug']}: post_id={found.id}, status={found.status} (не изменён)", flush=True)
                    continue
                await db.rollback()
                author = await db.scalar(select(User).where(User.username == args.author))
                require_demo_author(author, allow_legacy=allow_legacy)
                # A failed earlier run may have uploaded but not attached the file.
                media = await db.scalar(select(SocialMedia).where(SocialMedia.owner_user_id == author.id,
                    SocialMedia.alt_text.contains(marker), SocialMedia.deleted_at.is_(None),
                    SocialMedia.post_id.is_(None), SocialMedia.story_id.is_(None)).limit(1))
                if media is None:
                    with (args.output / f"{clip['slug']}.mp4").open("rb") as handle:
                        upload = UploadFile(file=handle, filename=f"{clip['slug']}.mp4", headers=Headers({"content-type": "video/mp4"}))
                        media = await ingest_upload(db, author, upload, f"[ДЕМО] {clip['title']}. Оригинальный ролик Арены без звука. {marker}")
                # ingest_upload commits its own write before this independent guarded check.
                await acquire_media_write_lock(db)
                await db.refresh(author)
                require_demo_author(author, allow_legacy=allow_legacy)
                found = await existing(db, author_id, marker)
                if found:
                    await db.rollback()
                    print(f"Пропуск {clip['slug']}: уже опубликовано параллельным запуском", flush=True)
                    continue
                body = f"[ДЕМО] {clip['title']}\n\n{clip['description']}\n\nОригинальный учебный ролик Арены. Без звука; все реплики показаны на экране.\n#видеопрактика #ДемоАрены #Переговоры\n{marker}"
                post = await create_post(PostIn(body=body, audience="PUBLIC", status="PUBLISHED", media_ids=[media.id]), db=db, user=author)
                print(f"Опубликован {clip['slug']}: post_id={post['id']}, /feed/post/{post['id']}", flush=True)
    finally:
        await engine.dispose()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".cache/social-demo")
    parser.add_argument("--ffmpeg")
    parser.add_argument("--ffprobe")
    parser.add_argument("--font-regular")
    parser.add_argument("--font-bold")
    parser.add_argument("--regenerate", action="store_true", help="Заменить только три сгенерированных MP4")
    parser.add_argument("--verify-only", action="store_true", help="Проверить существующие видео без рендера")
    parser.add_argument("--publish", action="store_true", help="Явно опубликовать через существующие сервисы приложения")
    parser.add_argument("--author", help="Username существующего пользователя с is_demo=1")
    parser.add_argument("--allow-legacy-demo", action="store_true", help="Только исходный demo без прав администратора и со стандартным демовходом")
    parser.add_argument("--confirm-backup", type=Path, help="Существующая резервная копия БД и media, проверенная оператором")
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.confirm_backup: args.confirm_backup = args.confirm_backup.resolve()
    if args.verify_only and args.regenerate: parser.error("--verify-only и --regenerate несовместимы")
    if not args.publish and (args.author or args.confirm_backup or args.allow_legacy_demo): parser.error("--author, --confirm-backup и --allow-legacy-demo используются только вместе с --publish")
    try:
        ffmpeg, ffprobe = executable(args.ffmpeg, "ffmpeg"), executable(args.ffprobe, "ffprobe")
        generate(args, ffmpeg, ffprobe)
        if args.publish: asyncio.run(publish(args, ffmpeg, ffprobe))
        else: print("БД не открывалась. Ничего не опубликовано.", flush=True)
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"Ошибка: {error}\n")


if __name__ == "__main__":
    main()
