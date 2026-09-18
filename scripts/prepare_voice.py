"""Fetch this repository's speech weights through Git LFS and verify every file."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def prepare(check_only: bool = False) -> None:
    manifest = json.loads((ROOT / "models" / "manifest.json").read_text(encoding="utf-8"))
    if not check_only:
        subprocess.run(
            ["git", "lfs", "pull", "--include=models/**", "--exclude="],
            cwd=ROOT, check=True,
        )
    for name, expected in manifest.items():
        path = ROOT / "models" / name
        if not path.is_file() or path.stat().st_size != expected["size"]:
            raise RuntimeError(f"Missing model or LFS pointer: {name}. Run git lfs install and git lfs pull.")
        with path.open("rb") as source:
            actual = hashlib.file_digest(source, "sha256").hexdigest()
        if actual != expected["sha256"]:
            raise RuntimeError(f"Model checksum mismatch: {name}")
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
