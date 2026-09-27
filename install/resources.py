"""Verified, atomic resource downloads. Never accept Git LFS pointer files."""
import argparse
import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path

MANIFEST = Path(__file__).with_name("resources.json")


def valid(path, item):
    if not path.is_file() or path.stat().st_size != item["bytes"]:
        return False
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(1024 * 1024):
            h.update(block)
    return h.hexdigest() == item["sha256"]


def download(item, target, progress=print):
    if valid(target, item):
        return
    if not item["url"].startswith("https://"):
        raise ValueError("Only HTTPS downloads are allowed")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".partial")
    for attempt in range(3):
        try:
            h, received, last = hashlib.sha256(), 0, 0
            with urllib.request.urlopen(item["url"], timeout=60) as response, partial.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    received += len(chunk)
                    if received > item["bytes"]:
                        raise ValueError("Unexpected resource size")
                    output.write(chunk); h.update(chunk)
                    if time.monotonic() - last >= 2:
                        progress(f"{target.name}: {received * 100 // item['bytes']}%")
                        last = time.monotonic()
                output.flush(); os.fsync(output.fileno())
            if received != item["bytes"] or h.hexdigest() != item["sha256"]:
                raise ValueError("Resource checksum mismatch")
            partial.replace(target)
            progress(f"{target.name}: 100% — файл проверен")
            return
        except Exception:
            partial.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def ensure(name, models, progress=print):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    resource = manifest["resources"][name]
    path = Path(models) / resource["directory"]
    for item in resource["files"]:
        download(item, path / item["path"], progress)
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("name", choices=["tiny", "base", "small", "large-v3-turbo", "piper"])
    parser.add_argument("--models", required=True, type=Path)
    args = parser.parse_args()
    ensure(args.name, args.models)
