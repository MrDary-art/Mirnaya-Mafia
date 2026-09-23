"""CPU speech recognition and synthesis using the bundled Russian models."""

import asyncio
import io
import wave
from threading import Lock

from app.config import ROOT, settings


class SpeechUnavailable(Exception):
    pass


class LocalSTT:
    def __init__(self):
        self._model = None
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
                    self._model = WhisperModel(
                        str(bundled) if settings.stt_model == "base" else settings.stt_model,
                        device=settings.stt_device,
                        compute_type=settings.stt_compute_type,
                        cpu_threads=settings.stt_cpu_threads,
                        num_workers=settings.stt_workers,
                        download_root=str(ROOT / ".cache" / "huggingface" / "hub"),
                        local_files_only=settings.stt_model == "base",
                    )
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

    def _get_voice(self):
        path = ROOT / "models" / "piper" / "ru_RU-dmitri-medium.onnx"
        if not path.is_file():
            raise SpeechUnavailable("Локальный русский голос не загружен")
        with self._lock:
            if self._voice is None:
                try:
                    from piper import PiperVoice
                    self._voice = PiperVoice.load(str(path))
                except Exception as exc:
                    raise SpeechUnavailable("Не удалось загрузить локальный голос") from exc
            return self._voice

    async def warm(self) -> None:
        await asyncio.to_thread(self._get_voice)

    def _synthesize(self, text: str) -> bytes:
        voice = self._get_voice()
        with self._lock:
            output = io.BytesIO()
            try:
                with wave.open(output, "wb") as wav:
                    voice.synthesize_wav(text, wav)
                if output.getbuffer().nbytes <= 44:
                    raise SpeechUnavailable("Синтезатор не вернул звук")
            except SpeechUnavailable:
                raise
            except wave.Error as exc:
                raise SpeechUnavailable("Синтезатор не вернул звук") from exc
            except Exception as exc:
                raise SpeechUnavailable("Не удалось озвучить ответ") from exc
            return output.getvalue()

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize, text)


local_tts = LocalTTS()
