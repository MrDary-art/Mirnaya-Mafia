"""One bounded model download, outside inference and outside the HTTP event loop."""
import asyncio
from pathlib import Path
from app.config import settings

state = {"status": "idle", "model": None, "progress": "", "error": None}
task = None


async def start(name):
    global task
    if task and not task.done():
        return False
    state.update(status="downloading", model=name, progress="Подготовка загрузки", error=None)
    loop = asyncio.get_running_loop()
    def progress(message):
        loop.call_soon_threadsafe(state.update, {"progress": message})
    async def run():
        try:
            # Shared verified downloader used by both installers and admin.
            import sys
            root = Path(__file__).resolve().parents[2]
            if str(root) not in sys.path:
                sys.path.insert(0, str(root))
            from install.resources import ensure
            await asyncio.to_thread(ensure, name, settings.models_dir, progress)
            state.update(status="ready", progress="Файлы загружены и проверены. Теперь модель можно выбрать.")
        except Exception:
            state.update(status="failed", error="Загрузка не завершена. Проверьте сеть и свободное место; можно повторить.")
    task = asyncio.create_task(run())
    return True
