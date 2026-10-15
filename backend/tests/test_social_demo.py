"""The demo CLI is explicit, real-service based and repeatable on isolated SQLite."""
import importlib.util
from collections import OrderedDict
from pathlib import Path
import shutil
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import db as database, deployment_security
from app.auth import hash_password
from app.config import settings
from app.db import Base
from app.models import User
from app.routers.social_feed import router  # Register existing application models.
from app.social_models import SocialMedia, SocialPost, SocialPostLike

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/create_social_demo.py"
spec = importlib.util.spec_from_file_location("arena_social_demo", SCRIPT)
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


async def test_publish_requires_explicit_author_and_backup(tmp_path):
    args = SimpleNamespace(author=None, confirm_backup=None)
    with pytest.raises(ValueError, match="--author"):
        await demo.publish(args, Path("unused"), Path("unused"))
    args.author, args.confirm_backup = "unknown", tmp_path / "missing"
    with pytest.raises(ValueError, match="не найдена"):
        await demo.publish(args, Path("unused"), Path("unused"))


@pytest.mark.parametrize("legacy", [False, True])
async def test_publish_real_video_idempotence_and_demo_account_guard(tmp_path, monkeypatch, legacy):
    try:
        ffmpeg, ffprobe = demo.executable(None, "ffmpeg"), demo.executable(None, "ffprobe")
    except ValueError:
        pytest.skip("Local FFmpeg/FFprobe are optional; no tool download in tests")
    path = tmp_path / "demo-test.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{path.as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(database, "SessionLocal", factory)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(settings, "db_path", str(path))
    monkeypatch.setattr(settings, "social_media_path", str(tmp_path / "private/social-media"))
    monkeypatch.setattr(settings, "social_media_ffmpeg_path", str(ffmpeg))
    monkeypatch.setattr(settings, "social_media_ffprobe_path", str(ffprobe))
    monkeypatch.setattr(deployment_security, "_limits", OrderedDict())
    monkeypatch.chdir(SCRIPT.parents[1])
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        db.add_all([User(username="demo" if legacy else "demo-test", password_hash=hash_password("demo"), is_demo=0 if legacy else 1),
                    User(username="ordinary-test", password_hash=hash_password("demo"), is_demo=0)])
        await db.commit()
    output = tmp_path / "generated"
    output.mkdir()
    # Synthetic colour fixture, not shipped or presented as the authored clips.
    video = output / "fixture.mp4"
    demo.run([str(ffmpeg), "-v", "error", "-f", "lavfi", "-i", "color=c=green:s=180x320:d=1",
              "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", str(video)])
    for clip in demo.CLIPS:
        shutil.copyfile(video, output / f"{clip['slug']}.mp4")
    backup = tmp_path / "fixture-backup"
    backup.mkdir()
    shutil.copyfile(path, backup / "demo-test.sqlite")
    args = SimpleNamespace(author="ordinary-test", confirm_backup=backup, output=output, allow_legacy_demo=legacy)
    with pytest.raises(ValueError, match="is_demo=1"):
        await demo.publish(args, ffmpeg, ffprobe)
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(SocialPost)) == 0
        assert await db.scalar(select(func.count()).select_from(SocialMedia)) == 0
    args.author = "demo" if legacy else "demo-test"
    if legacy:
        args.allow_legacy_demo = False
        with pytest.raises(ValueError, match="is_demo=1"):
            await demo.publish(args, ffmpeg, ffprobe)
        args.allow_legacy_demo = True
    await demo.publish(args, ffmpeg, ffprobe)
    async with factory() as db:
        posts = (await db.scalars(select(SocialPost).order_by(SocialPost.id))).all()
        timestamps = [(post.id, post.published_at) for post in posts]
        assert len(posts) == 3
        assert all(post.body.startswith("[ДЕМО]") and "#видеопрактика" in post.body for post in posts)
        assert await db.scalar(select(func.count()).select_from(SocialMedia)) == 3
        assert await db.scalar(select(func.count()).select_from(SocialPostLike)) == 0
        posts[0].status = "DELETED"
        await db.commit()
    await demo.publish(args, ffmpeg, ffprobe)
    async with factory() as db:
        posts = (await db.scalars(select(SocialPost).order_by(SocialPost.id))).all()
        assert [(post.id, post.published_at) for post in posts] == timestamps
        assert posts[0].status == "DELETED"
        assert await db.scalar(select(func.count()).select_from(SocialMedia)) == 3
        author = await db.scalar(select(User).where(User.username == args.author))
        assert author.is_demo == (0 if legacy else 1)
        assert await db.scalar(select(func.count()).select_from(User)) == 2
    await engine.dispose()


@pytest.mark.parametrize("username,is_admin,password,allowed", [
    ("demo", 0, "demo", True), ("Demo", 0, "demo", False),
    ("other", 0, "demo", False), ("demo", 1, "demo", False),
    ("demo", 0, "changed", False),
])
def test_legacy_guard_exact_account_only(username, is_admin, password, allowed):
    author = SimpleNamespace(username=username, is_demo=0, is_admin=is_admin, password_hash=hash_password(password))
    if allowed:
        demo.require_demo_author(author, allow_legacy=True)
        assert author.is_demo == 0
    else:
        with pytest.raises(ValueError, match="is_demo=1"):
            demo.require_demo_author(author, allow_legacy=True)
