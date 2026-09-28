#!/usr/bin/env bash
set -euo pipefail
umask 077
INSTALL_DIR=/opt/master-negotiations
CUSTOM_HOME=false
ROLE=site
BUNDLE=''
URL=''
SHA=''
while (($#)); do
  case "$1" in
    --home) INSTALL_DIR="$2"; CUSTOM_HOME=true; shift 2;;
    --role) ROLE="$2"; shift 2;;
    --bundle) BUNDLE="$2"; shift 2;;
    --bundle-url) URL="$2"; shift 2;;
    --sha256) SHA="$2"; shift 2;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2;;
  esac
done
[[ "$ROLE" == site || "$ROLE" == whisper-worker ]] || { echo 'Invalid role'; exit 2; }
if [[ "$ROLE" == whisper-worker && "$CUSTOM_HOME" == false ]]; then INSTALL_DIR=/opt/arena-whisper; fi
if [[ -n "$BUNDLE" || -n "$URL" ]]; then
  [[ "$SHA" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Pass --sha256 with --bundle or --bundle-url'; exit 2; }
fi
[[ "$(uname -m)" == x86_64 ]] || { echo 'x86_64 is required'; exit 1; }
[[ $EUID -eq 0 ]] || { echo 'Run this installer with sudo'; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu && ( "$VERSION_ID" == 22.04 || "$VERSION_ID" == 24.04 || "$VERSION_ID" == 26.04 ) ]] || { echo 'Ubuntu 22.04, 24.04 or 26.04 LTS is required'; exit 1; }
INSTALL_DIR="$(realpath -m -- "$INSTALL_DIR")"
if [[ -f "$INSTALL_DIR/installation.json" ]]; then
  printf 'Existing installation preserved: %s\n' "$INSTALL_DIR"
  exit 0
fi
SERVICES=(arena-api arena-web)
[[ "$ROLE" == whisper-worker ]] && SERVICES=(arena-whisper-worker)
for SERVICE in "${SERVICES[@]}"; do
  if [[ -f "/etc/systemd/system/$SERVICE.service" && ! -f "$INSTALL_DIR/installation-plan.json" && ! -f "$INSTALL_DIR/private/worker.json" ]]; then echo "Service $SERVICE already exists; not replacing it"; exit 1; fi
done
mkdir -p "$INSTALL_DIR/tools"
(( $(df -Pk "$INSTALL_DIR" | awk 'NR==2 {print $4}') >= 8388608 )) || { echo '8 GB free disk space is required'; exit 1; }
for COMMAND in curl tar sha256sum unzip; do
  if ! command -v "$COMMAND" >/dev/null; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar unzip
    break
  fi
done
STAGE="$(mktemp -d "$INSTALL_DIR/staging-XXXXXXXX")"
curl --fail --location --retry 3 --connect-timeout 20 --max-time 300 --proto '=https' --proto-redir '=https' https://github.com/astral-sh/uv/releases/download/0.12.19/uv-x86_64-unknown-linux-gnu.tar.gz -o "$STAGE/uv.tar.gz"
printf '%s  %s\n' 23bf5552d220e0842b65c862097b2ebaeba0064b74eda5e565e77fd25969d8c8 "$STAGE/uv.tar.gz" | sha256sum -c -
tar -xzf "$STAGE/uv.tar.gz" -C "$STAGE"
cp "$STAGE/uv-x86_64-unknown-linux-gnu/uv" "$INSTALL_DIR/tools/uv"
chmod 755 "$INSTALL_DIR/tools/uv"
export UV_PYTHON_INSTALL_DIR="$INSTALL_DIR/python" UV_CACHE_DIR="$INSTALL_DIR/cache"
UV="$INSTALL_DIR/tools/uv"
"$UV" python install 3.12.12 --no-bin
[[ -x "$INSTALL_DIR/runtime/bin/python" ]] || "$UV" venv --managed-python --python 3.12.12 "$INSTALL_DIR/runtime"
PYTHON="$INSTALL_DIR/runtime/bin/python"
if [[ -z "$BUNDLE" && -z "$URL" ]]; then
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 60 --proto '=https' --proto-redir '=https' https://api.github.com/repos/MrDary-art/Mirnaya-Mafia/releases/latest -o "$STAGE/latest.json"
  URL="$("$PYTHON" - "$STAGE/latest.json" <<'PY'
import json,re,sys
from pathlib import Path
release=json.loads(Path(sys.argv[1]).read_text())
tag=release.get('tag_name','')
if not re.fullmatch(r'install-v[a-zA-Z0-9._-]+',tag) or release.get('draft') or release.get('prerelease'):
 raise SystemExit('No published installation release is available. See GitHub Releases.')
name='arena-'+tag+'.zip'
assets={asset['name'] for asset in release.get('assets',[])}
if not {name,name+'.sha256'}.issubset(assets):
 raise SystemExit('The release is incomplete. Retry after publication finishes.')
print('https://github.com/MrDary-art/Mirnaya-Mafia/releases/download/'+tag+'/'+name)
PY
)"
  SHA="$(curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 60 --proto '=https' --proto-redir '=https' "$URL.sha256" | awk 'NR==1 {print $1}')"
fi
[[ "$SHA" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Checksum unavailable. Check GitHub access and retry.'; exit 2; }
if [[ -n "$BUNDLE" ]]; then
  cp -- "$BUNDLE" "$STAGE/release.zip"
else
  [[ "$URL" == https://* ]] || { echo 'HTTPS bundle URL is required'; exit 2; }
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 1800 --proto '=https' --proto-redir '=https' "$URL" -o "$STAGE/release.zip"
fi
printf '%s  %s\n' "$SHA" "$STAGE/release.zip" | sha256sum -c -
"$PYTHON" - "$STAGE/release.zip" "$STAGE/payload" <<'PY'
import sys,zipfile
from pathlib import Path
root=Path(sys.argv[2]).resolve()
with zipfile.ZipFile(sys.argv[1]) as z:
 for item in z.infolist():
  if not (root/item.filename).resolve().is_relative_to(root) or '\\' in item.filename:
   raise SystemExit('Unsafe archive')
 z.extractall(root)
PY
LOCK=requirements.lock
[[ "$ROLE" == whisper-worker ]] && LOCK=worker-requirements.lock
"$UV" pip sync --python "$PYTHON" --require-hashes "$STAGE/payload/install/$LOCK"
RELEASE="$(PYTHONPATH="$STAGE/payload" "$PYTHON" - "$STAGE/release.zip" "$INSTALL_DIR" <<'PY'
import sys
from pathlib import Path
from install.setup import unpack_release
print(unpack_release(Path(sys.argv[1]),Path(sys.argv[2])))
PY
)"
# This script must be downloaded to a file, not piped into bash: wizard keeps stdin.
exec "$PYTHON" "$RELEASE/install/setup.py" --home "$INSTALL_DIR" --role "$ROLE"
