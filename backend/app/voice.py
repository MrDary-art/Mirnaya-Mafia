"""Local transcription of one completed 16 kHz PCM utterance."""

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

    def _transcribe(self, pcm: bytes) -> str:
        try:
            import numpy as np
        except ImportError as exc:
            raise SpeechUnavailable("Локальное распознавание не установлено") from exc
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as exc:
                    raise SpeechUnavailable("Локальное распознавание не установлено") from exc
                try:
                    self._model = WhisperModel(
                        settings.stt_model,
                        device=settings.stt_device,
                        compute_type=settings.stt_compute_type,
                        download_root=str(ROOT / ".cache" / "huggingface" / "hub"),
                    )
                except Exception as exc:
                    raise SpeechUnavailable("Локальная модель речи недоступна") from exc
            audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
            try:
                segments, _ = self._model.transcribe(
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

    def _synthesize(self, text: str) -> bytes:
        path = ROOT / ".cache" / "voices" / "ru_RU-dmitri-medium.onnx"
        if not path.is_file():
            raise SpeechUnavailable("Локальный русский голос не загружен")
        with self._lock:
            if self._voice is None:
                try:
                    from piper import PiperVoice
                    self._voice = PiperVoice.load(str(path))
                except Exception as exc:
                    raise SpeechUnavailable("Не удалось загрузить локальный голос") from exc
            output = io.BytesIO()
            import wave
            try:
                with wave.open(output, "wb") as wav:
                    self._voice.synthesize_wav(text, wav)
            except Exception as exc:
                raise SpeechUnavailable("Не удалось озвучить ответ") from exc
            return output.getvalue()

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize, text)


local_tts = LocalTTS()
