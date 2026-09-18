"""CPU speech recognition and synthesis using the bundled Russian models."""

import asyncio
import io
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

    def _transcribe(self, pcm: bytes) -> str:
        try:
            import numpy as np
        except ImportError as exc:
            raise SpeechUnavailable("Локальное распознавание не установлено") from exc
        model = self._get_model()
        audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        try:
            segments, _ = model.transcribe(
                audio,
                language=settings.stt_language,
                beam_size=1,
                vad_filter=True,
            )
            return " ".join(segment.text.strip() for segment in segments).strip()
        except Exception as exc:
            raise SpeechUnavailable("Не удалось распознать речь") from exc

    async def transcribe(self, pcm: bytes) -> str:
        return await asyncio.to_thread(self._transcribe, pcm)


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
