"""Build a self-contained source/runtime manifest with prebuilt frontend (no secrets)."""
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = {"node_modules", ".venv", "__pycache__", ".pytest_cache", "data", "tests"}


def build(version, destination):
    if not re.fullmatch(r"[a-zA-Z0-9._-]{1,80}", version):
        raise ValueError("Invalid release version")
    required = ["frontend/dist/index.html", "install/requirements.lock", "install/worker-requirements.lock",
                "install/resources.json", "install/tools.json", "worker/smoke.pcm"]
    for name in required:
        if not (ROOT / name).is_file():
            raise RuntimeError("Build prerequisite missing: " + name)
    selected = {}
    for folder in ("backend", "frontend/dist", "install", "worker", "docs"):
        for path in (ROOT / folder).rglob("*"):
            if not path.is_file() or any(p in SKIP for p in path.relative_to(ROOT / folder).parts):
                continue
            if path.name.startswith(".env") or path.suffix in {".log", ".db", ".pyc", ".key", ".partial"}:
                continue
            relative = path.relative_to(ROOT).as_posix()
            blob = path.read_bytes()
            if blob.startswith(b"version https://git-lfs.github.com/spec/v1"):
                raise RuntimeError("Release contains an LFS pointer: " + relative)
            selected[relative] = blob
    # Scenarios and learning data are shipped; runtime/private data are not.
    for path in (ROOT / "backend/app/data").rglob("*"):
        if path.is_file():
            selected[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "-c", "filter.lfs.process=", "-c", "filter.lfs.required=false", "diff", "--name-only", "HEAD", "--", ".", ":(exclude)frontend/dist/**"], cwd=ROOT, text=True).strip())
    manifest = {"version": version, "source_commit": commit, "source_dirty": dirty, "worker_protocol": 1, "schema_revision": "0031",
                "files": {k: hashlib.sha256(v).hexdigest() for k, v in sorted(selected.items())}}
    selected["release.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / ("arena-" + version + ".zip")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, content in sorted(selected.items()):
            archive.writestr(name, content)
    sha = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".zip.sha256").write_text(sha + "  " + output.name + "\n", encoding="ascii")
    print(output)
    print(sha)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "release-artifacts")
    args = parser.parse_args()
    build(args.version, args.output)
