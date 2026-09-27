"""CPU speech recognition and synthesis using the bundled Russian models."""

import asyncio
import io
import logging
import shutil
import tempfile
from pathlib import Path
from threading import Lock

from app.config import ROOT, settings


logger = logging.getLogger(__name__)


class SpeechUnavailable(Exception):
    pass


class LocalSTT:
    """One real CPU job; cancellation never releases its compute slot early."""
    def __init__(self):
        self._model = None
        self._model_name = None
        self._lock = Lock()
        self._work_lock = Lock()
        self._tasks = set()
        self.last_error = None

    def _get_model(self):
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                    name = settings.stt_model
                    path = Path(settings.models_dir) / f"whisper-{name}"
                    if name not in {"tiny", "base", "small"} or not (path / "model.bin").is_file() or (path / "model.bin").stat().st_size < 1_000_000:
                        raise SpeechUnavailable("Модель не загружена. Откройте настройки распознавания.")
                    self._model = WhisperModel(str(path), device="cpu", compute_type="int8",
                        cpu_threads=min(2, max(1, settings.stt_cpu_threads)), num_workers=1, local_files_only=True)
                    self._model_name = name
                    self.last_error = None
                except Exception as exc:
                    self.last_error = type(exc).__name__
                    raise SpeechUnavailable("Локальная модель речи недоступна") from exc
            return self._model

    def _run(self, pcm=None):
        with self._work_lock:
            model = self._get_model()
            if pcm is None:
                return ""
            import numpy as np
            audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
            if np.max(np.abs(audio), initial=0) < 0.003:
                return ""
            segments, _ = model.transcribe(audio, language=settings.stt_language, beam_size=3,
                vad_filter=True, condition_on_previous_text=False)
            return " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.8).strip()

    async def _submit(self, pcm=None):
        if len(self._tasks) >= settings.stt_queue_limit + 1:
            raise SpeechUnavailable("Очередь распознавания заполнена. Повторите позже.")
        task = asyncio.create_task(asyncio.to_thread(self._run, pcm))
        self._tasks.add(task)
        def finished(done):
            self._tasks.discard(done)
            if not done.cancelled():
                done.exception()  # consume exceptions after disconnected callers
        task.add_done_callback(finished)
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            raise SpeechUnavailable("Не удалось распознать речь") from exc

    async def warm(self):
        await self._submit()

    async def transcribe(self, pcm):
        if not 9600 <= len(pcm) <= 1_280_000 or len(pcm) % 2:
            raise SpeechUnavailable("Нужна запись PCM 16 кГц, моно, от 0,3 до 40 секунд")
        return await self._submit(pcm)

    async def stream_transcribe(self, pcm):
        text = await self.transcribe(pcm)
        if text:
            yield text

    async def select_model(self, name):
        if self._tasks:
            raise SpeechUnavailable("Дождитесь окончания распознавания")
        previous = settings.stt_model
        self._model = None
        self._model_name = None
        settings.stt_model = name
        try:
            await self.warm()
        except Exception:
            settings.stt_model = previous
            self._model = None
            self._model_name = None
            raise


local_engine = LocalSTT()
from app.speech_service import SpeechService
local_stt = SpeechService(local_engine)


class LocalTTS:
    def __init__(self):
        self._voice = None
        self._lock = Lock()
        self._espeak_copy = None

    def _get_voice(self):
        path = Path(settings.models_dir) / "piper" / "ru_RU-dmitri-medium.onnx"
        if not path.is_file():
            raise SpeechUnavailable("Локальный русский голос не загружен")
        with self._lock:
            if self._voice is None:
                try:
                    from piper import PiperVoice
                    from piper.phonemize_espeak import ESPEAK_DATA_DIR

                    espeak_data_dir = Path(ESPEAK_DATA_DIR)
                    if not str(espeak_data_dir).isascii():
                        # The Windows eSpeak bridge cannot reliably read its data
                        # under a non-ASCII path, even though Python can.
                        temp_root = Path(settings.piper_temp_dir or tempfile.gettempdir())
                        if not str(temp_root).isascii():
                            raise SpeechUnavailable("Для локального голоса нужен временный путь без кириллицы")
                        self._espeak_copy = tempfile.TemporaryDirectory(prefix="arena-piper-", dir=temp_root)
                        espeak_data_dir = Path(self._espeak_copy.name) / "espeak-ng-data"
                        shutil.copytree(ESPEAK_DATA_DIR, espeak_data_dir)
                    self._voice = PiperVoice.load(str(path), espeak_data_dir=espeak_data_dir)
                except SpeechUnavailable:
                    raise
                except Exception as exc:
                    raise SpeechUnavailable("Не удалось загрузить локальный голос") from exc
            return self._voice

    async def warm(self) -> None:
        await asyncio.to_thread(self._get_voice)

    def _synthesize(self, text: str) -> bytes:
        voice = self._get_voice()
        with self._lock:
            output = io.BytesIO()
            import wave
            try:
                with wave.open(output, "wb") as wav:
                    voice.synthesize_wav(text, wav)
            except Exception as exc:
                raise SpeechUnavailable("Не удалось озвучить ответ") from exc
            return output.getvalue()

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize, text)


local_tts = LocalTTS()
