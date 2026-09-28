"""The bootstrap must select a complete public release before downloading it."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = (ROOT / "install/install-ubuntu.sh").read_text(encoding="utf-8")
SELECTOR = BOOTSTRAP.split('"$STAGE/latest.json" <<\'PY\'\n', 1)[1].split('\nPY\n', 1)[0]


@pytest.mark.parametrize("case", ["valid", "missing_checksum", "draft", "prerelease", "unsafe_tag"])
def test_latest_release_selection(tmp_path, case):
    manifest = {"tag_name": "install-v123-1", "draft": False, "prerelease": False,
                "assets": [{"name": "arena-install-v123-1.zip"}, {"name": "arena-install-v123-1.zip.sha256"}]}
    if case == "missing_checksum":
        manifest["assets"].pop()
    elif case in {"draft", "prerelease"}:
        manifest[case] = True
    elif case == "unsafe_tag":
        manifest["tag_name"] = "install-v../other"
    path = tmp_path / "release.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    result = subprocess.run([sys.executable, "-c", SELECTOR, str(path)], capture_output=True, text=True)
    if case == "valid":
        assert result.returncode == 0
        assert result.stdout.strip() == "https://github.com/MrDary-art/Mirnaya-Mafia/releases/download/install-v123-1/arena-install-v123-1.zip"
    else:
        assert result.returncode != 0
        assert not result.stdout.strip()
