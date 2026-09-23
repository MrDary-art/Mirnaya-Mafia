"""Private, owner-scoped storage for 1x1 microphone recordings."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from app.config import settings

MAX_CHUNK_BYTES = 5_000_000
MAX_CHUNKS = 1000


class RecordingConflict(Exception):
    pass


class RecordingStorage:
    def __init__(self) -> None:
        self.root = Path(settings.room_recordings_path)

    def _dir(self, room_id: int, recording_id: int, segment_id: str) -> Path:
        safe_segment = "".join(ch for ch in segment_id if ch.isalnum() or ch in "-_")[:64]
        if not safe_segment or safe_segment != segment_id:
            raise RecordingConflict("Некорректный segment_id")
        path = self.root / str(room_id) / str(recording_id) / safe_segment
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, room_id: int, recording_id: int, segment_id: str, index: int, data: bytes, checksum: str) -> str:
        if index < 0 or index >= MAX_CHUNKS or not data or len(data) > MAX_CHUNK_BYTES:
            raise RecordingConflict("Недопустимый фрагмент записи")
        actual = hashlib.sha256(data).hexdigest()
        if actual != checksum.lower():
            raise RecordingConflict("Контрольная сумма не совпадает")
        target = self._dir(room_id, recording_id, segment_id) / f"{index:05d}.chunk"
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != actual:
                raise RecordingConflict("Фрагмент с этим номером уже отличается")
            return str(target.relative_to(self.root))
        temp = target.with_suffix(".part")
        temp.write_bytes(data)
        temp.replace(target)
        return str(target.relative_to(self.root))

    def resolve(self, storage_key: str) -> Path:
        target = (self.root / storage_key).resolve()
        root = self.root.resolve()
        if root not in target.parents:
            raise RecordingConflict("Некорректный путь записи")
        return target

    def assemble(self, room_id: int, recording_id: int, manifest: dict) -> Path:
        output_dir = self.root / str(room_id) / str(recording_id)
        output_dir.mkdir(parents=True, exist_ok=True)
        segments = manifest.get("segments") or []
        if len(segments) != 1:
            output = output_dir / "recording-segments.zip"
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
                for segment in segments:
                    segment_id = str(segment["id"])
                    for index in segment.get("chunks", []):
                        source = self._dir(room_id, recording_id, segment_id) / f"{int(index):05d}.chunk"
                        archive.write(source, f"{segment_id}/{int(index):05d}.webm")
            return output
        segment_id = str(segments[0]["id"])
        output = output_dir / "recording.media"
        with output.open("wb") as destination:
            for index in segments[0].get("chunks", []):
                destination.write((self._dir(room_id, recording_id, segment_id) / f"{int(index):05d}.chunk").read_bytes())
        return output


recording_storage = RecordingStorage()
