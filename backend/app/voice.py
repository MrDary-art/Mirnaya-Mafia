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
    def __init__(self):
        self._model = None
        self._model_name = None
        self._lock = Lock()

    def _get_model(self):
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as exc:
                    raise SpeechUnavailable("Локальное распознавание не установлено") from exc
                try:
                    bundled = ROOT / "models" / "whisper-base"
                    model_name = str(bundled) if settings.stt_model == "base" else settings.stt_model
                    try:
                        self._model = WhisperModel(
                            model_name,
                            device=settings.stt_device,
                            compute_type=settings.stt_compute_type,
                            cpu_threads=settings.stt_cpu_threads,
                            num_workers=settings.stt_workers,
                            download_root=str(ROOT / ".cache" / "huggingface" / "hub"),
                            local_files_only=settings.stt_model == "base" or not settings.stt_allow_download,
                        )
                        self._model_name = settings.stt_model
                    except Exception as exc:
                        if settings.stt_model == "base":
                            raise
                        logger.warning(
                            "Whisper %s is unavailable; using bundled base model: %s",
                            settings.stt_model,
                            type(exc).__name__,
                        )
                        self._model = WhisperModel(
                            str(bundled),
                            device=settings.stt_device,
                            compute_type=settings.stt_compute_type,
                            cpu_threads=settings.stt_cpu_threads,
                            num_workers=settings.stt_workers,
                            local_files_only=True,
                        )
                        self._model_name = "base"
                except Exception as exc:
                    raise SpeechUnavailable("Локальная модель речи недоступна") from exc
            return self._model

    async def warm(self) -> None:
        await asyncio.to_thread(self._get_model)

    def _segments(self, pcm: bytes):
        try:
            import numpy as np
        except ImportError as exc:
            raise SpeechUnavailable("Локальное распознавание не установлено") from exc
        model = self._get_model()
        audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        segments, _ = model.transcribe(audio, language=settings.stt_language, beam_size=1, vad_filter=True)
        return segments

    def _transcribe(self, pcm: bytes) -> str:
        try:
            return " ".join(segment.text.strip() for segment in self._segments(pcm)).strip()
        except Exception as exc:
            raise SpeechUnavailable("Не удалось распознать речь") from exc

    async def transcribe(self, pcm: bytes) -> str:
        return await asyncio.to_thread(self._transcribe, pcm)

    async def stream_transcribe(self, pcm: bytes):
        """Yield Whisper segments as soon as decoding produces them."""
        loop = asyncio.get_running_loop()
        events = asyncio.Queue()

        def work():
            try:
                for segment in self._segments(pcm):
                    part = segment.text.strip()
                    if part:
                        loop.call_soon_threadsafe(events.put_nowait, ("text", part))
            except Exception:
                loop.call_soon_threadsafe(events.put_nowait, ("error", SpeechUnavailable("Не удалось распознать речь")))
            finally:
                loop.call_soon_threadsafe(events.put_nowait, ("done", None))

        worker = asyncio.create_task(asyncio.to_thread(work))
        try:
            while True:
                kind, value = await events.get()
                if kind == "done":
                    break
                if kind == "error":
                    raise value
                yield value
        finally:
            await worker


local_stt = LocalSTT()


class LocalTTS:
    def __init__(self):
        self._voice = None
        self._lock = Lock()
        self._espeak_copy = None

    def _get_voice(self):
        path = ROOT / "models" / "piper" / "ru_RU-dmitri-medium.onnx"
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
                        temp_root = Path(tempfile.gettempdir())
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
