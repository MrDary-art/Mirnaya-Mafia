"""Download the local speech models used by this version. Run from any directory."""

import argparse
import hashlib
from pathlib import Path
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/"
FILES = {
    "ru_RU-dmitri-medium.onnx": "f073356ebc4bd0f80c5af58df2953a5988bd5bdab1eb38635ce960b071fbefcb",
    "ru_RU-dmitri-medium.onnx.json": "667ef3117bc642c2892dff7690d8bdc8ca4228aeaa783b2dc1416df632855e0d",
}


def digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def prepare(check_only: bool = False) -> None:
    voices = ROOT / ".cache" / "voices"
    voices.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        target = voices / name
        if not target.is_file() or digest(target) != expected:
            if check_only:
                raise RuntimeError(f"Missing or invalid voice file: {name}")
            temporary = target.with_name(name + ".download")
            try:
                with urllib.request.urlopen(VOICE_URL + name, timeout=120) as source, temporary.open("wb") as output:
                    shutil.copyfileobj(source, output)
                if digest(temporary) != expected:
                    raise RuntimeError(f"Unexpected model checksum: {name}")
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
        print(f"Verified: {name}")

    from faster_whisper import WhisperModel

    WhisperModel(
        "base", device="cpu", compute_type="int8",
        download_root=str(ROOT / ".cache" / "huggingface" / "hub"),
        local_files_only=check_only,
    )
    print("Whisper base ready. Local speech models are installed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Verify local files without downloading")
    prepare(parser.parse_args().check_only)
