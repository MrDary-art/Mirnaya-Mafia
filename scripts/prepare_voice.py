"""Fetch this repository's speech weights through Git LFS and verify every file."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MODEL_URLS = {
    "whisper-base/model.bin": "https://huggingface.co/Systran/faster-whisper-base/resolve/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66/model.bin?download=true",
    "piper/ru_RU-dmitri-medium.onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx?download=true",
}


def valid_file(path: Path, expected: dict) -> bool:
    if not path.is_file() or path.stat().st_size != expected["size"]:
        return False
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest() == expected["sha256"]


def download_model(name: str, expected: dict) -> None:
    path = ROOT / "models" / name
    temporary = path.with_name(path.name + ".download")
    print(f"Downloading {name} from the official model repository...", flush=True)
    try:
        with urlopen(Request(MODEL_URLS[name], headers={"User-Agent": "ArenaNegotiations/1.0"}), timeout=60) as response, temporary.open("wb") as target:
            digest = hashlib.sha256()
            size = 0
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        if size != expected["size"] or digest.hexdigest() != expected["sha256"]:
            raise RuntimeError(f"Downloaded model failed checksum validation: {name}")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def prepare(check_only: bool = False) -> None:
    manifest = json.loads((ROOT / "models" / "manifest.json").read_text(encoding="utf-8"))
    if not check_only:
        if (ROOT / ".git").exists():
            try:
                result = subprocess.run(
                    ["git", "lfs", "pull", "--include=models/**", "--exclude="],
                    cwd=ROOT, capture_output=True, text=True,
                )
                if result.returncode:
                    print("Git LFS unavailable; downloading missing weights from source repositories.", flush=True)
            except OSError:
                print("Git LFS unavailable; downloading missing weights from source repositories.", flush=True)
        for name, expected in manifest.items():
            if name in MODEL_URLS and not valid_file(ROOT / "models" / name, expected):
                download_model(name, expected)
    for name, expected in manifest.items():
        path = ROOT / "models" / name
        if not valid_file(path, expected):
            raise RuntimeError(f"Missing or invalid model file: {name}. Run scripts/prepare_voice.py to download verified weights.")
        print(f"Verified: {name}")
    from faster_whisper import WhisperModel
    from piper import PiperVoice

    WhisperModel(str(ROOT / "models" / "whisper-base"), device="cpu", compute_type="int8", local_files_only=True)
    PiperVoice.load(str(ROOT / "models" / "piper" / "ru_RU-dmitri-medium.onnx"))
    print("Whisper and Piper loaded from repository files. No external model cache required.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Verify repository files without network access")
    prepare(parser.parse_args().check_only)
