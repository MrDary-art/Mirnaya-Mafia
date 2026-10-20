#!/usr/bin/env bash
# Dedicated worker source installer: independent of the published site bundle.
set -Eeuo pipefail
umask 077
HOME_DIR=/opt/arena-whisper
PROFILE=realtime
MODEL=auto
GPU=''
# Replaced with the reviewed immutable code commit before publication.
SOURCE_REF=22c15dcdd1b008287154bb8bbb845ecb781ff611
while (($#)); do
  case "$1" in
    --home) HOME_DIR="$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --model) MODEL="$2"; shift 2;;
    --gpu) GPU="$2"; shift 2;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2;;
  esac
done
[[ $EUID == 0 ]] || { echo 'Запустите установщик через sudo bash'; exit 1; }
[[ "$PROFILE" == realtime || "$PROFILE" == quality ]] || { echo 'Профиль: realtime или quality'; exit 2; }
[[ "$MODEL" == auto || "$MODEL" == large-v3-turbo || "$MODEL" == large-v3 ]] || { echo 'Неизвестная модель'; exit 2; }
[[ -z "$GPU" || "$GPU" =~ ^GPU-[a-zA-Z0-9-]+$ ]] || { echo 'Передайте UUID GPU из nvidia-smi -L'; exit 2; }
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" =~ ^(22.04|24.04|26.04)$ && $(uname -m) == x86_64 ]] || { echo 'Нужна Ubuntu 22.04/24.04/26.04 x86_64'; exit 1; }
command -v nvidia-smi >/dev/null || { echo 'Сначала установите драйвер NVIDIA и проверьте nvidia-smi. Драйвер не изменялся.'; exit 1; }
nvidia-smi --query-gpu=uuid,name,memory.total,memory.free,compute_cap --format=csv,noheader,nounits
HOME_DIR=$(realpath -m -- "$HOME_DIR")
[[ "$HOME_DIR" == /opt/* && "$HOME_DIR" != /opt/ && "$HOME_DIR" != *$'\n'* ]] || { echo 'Путь установки должен быть внутри /opt'; exit 2; }
exec 9>/run/arena-auto-worker-install.lock
flock -n 9 || { echo 'Установка worker уже выполняется'; exit 1; }
if [[ -f "$HOME_DIR/installation.json" ]]; then
  python3 - "$HOME_DIR/installation.json" <<'PY'
import json,sys
assert json.load(open(sys.argv[1]))['role']=='whisper-worker', 'Этот путь принадлежит сайту'
PY
  echo "Worker уже установлен: $HOME_DIR. Подключение и модель сохранены. Проверка: sudo $HOME_DIR/arena-worker doctor"
  exit 0
fi
[[ $(systemctl show arena-whisper-worker -p LoadState --value 2>/dev/null) == not-found ]] || { echo 'Служба worker уже зарегистрирована. Используйте её doctor/logs; установка не перезаписывает чужую службу.'; exit 1; }
mkdir -p "$HOME_DIR/tools" "$HOME_DIR/releases"
(( $(df -Pk "$HOME_DIR" | awk 'NR==2 {print $4}') >= 8388608 )) || { echo 'Нужно не менее 8 ГБ свободного места'; exit 1; }
for name in curl git tar; do
  if ! command -v "$name" >/dev/null; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates git tar
    break
  fi
done
STAGE=$(mktemp -d "$HOME_DIR/auto-staging-XXXXXXXX")
trap 'rm -rf -- "$STAGE"' EXIT
RELEASE="$HOME_DIR/releases/worker-auto-${SOURCE_REF:0:12}"
if [[ ! -d "$RELEASE" ]]; then
  git init -q "$STAGE/source"
  git -C "$STAGE/source" remote add origin https://github.com/MrDary-art/Mirnaya-Mafia.git
  GIT_TERMINAL_PROMPT=0 git -C "$STAGE/source" fetch --depth 1 origin "$SOURCE_REF"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$STAGE/source" -c filter.lfs.required=false -c filter.lfs.process= -c filter.lfs.smudge= checkout --detach FETCH_HEAD
  [[ $(git -C "$STAGE/source" rev-parse HEAD) == "$SOURCE_REF" ]] || { echo 'Неверная версия исходников'; exit 1; }
  mv "$STAGE/source" "$RELEASE"
fi
[[ $(git -C "$RELEASE" rev-parse HEAD) == "$SOURCE_REF" ]] || { echo 'Неверная существующая версия исходников'; exit 1; }
git -C "$RELEASE" diff --quiet HEAD -- install worker || { echo 'Код существующей версии изменён; установка остановлена'; exit 1; }
# Evaluate GPU/model choices before registering a token or downloading a model.
ARENA_WORKER_PROFILE="$PROFILE" ARENA_WORKER_MODEL="$MODEL" ARENA_WORKER_GPU="$GPU" PYTHONPATH="$RELEASE" python3 - <<'PY'
import os
from install.worker_hardware import detect_gpus,choose_plan
p=choose_plan(detect_gpus(),os.environ['ARENA_WORKER_PROFILE'],os.environ['ARENA_WORKER_MODEL'],os.environ['ARENA_WORKER_GPU'] or None)
print(f'Рекомендация: {p.gpu.name}; {p.model}; {p.compute_type}. {p.reason}.')
PY
curl -fsSL --retry 3 --connect-timeout 20 --max-time 300 https://github.com/astral-sh/uv/releases/download/0.12.19/uv-x86_64-unknown-linux-gnu.tar.gz -o "$STAGE/uv.tar.gz"
echo "23bf5552d220e0842b65c862097b2ebaeba0064b74eda5e565e77fd25969d8c8  $STAGE/uv.tar.gz" | sha256sum -c -
tar -xzf "$STAGE/uv.tar.gz" -C "$STAGE"
install -m 755 "$STAGE/uv-x86_64-unknown-linux-gnu/uv" "$HOME_DIR/tools/uv"
export UV_PYTHON_INSTALL_DIR="$HOME_DIR/python" UV_CACHE_DIR="$HOME_DIR/cache"
"$HOME_DIR/tools/uv" python install 3.12.12 --no-bin
[[ -x "$HOME_DIR/runtime/bin/python" ]] || "$HOME_DIR/tools/uv" venv --managed-python --python 3.12.12 "$HOME_DIR/runtime"
"$HOME_DIR/tools/uv" pip sync --python "$HOME_DIR/runtime/bin/python" --require-hashes "$RELEASE/install/worker-requirements.lock"
ARENA_WORKER_AUTO=1 ARENA_WORKER_PROFILE="$PROFILE" ARENA_WORKER_MODEL="$MODEL" ARENA_WORKER_GPU="$GPU" \
  "$HOME_DIR/runtime/bin/python" "$RELEASE/install/setup.py" --home "$HOME_DIR" --role whisper-worker
echo "Установка завершена. Сайт проверяет готовность worker после реального GPU-теста. Диагностика: sudo $HOME_DIR/arena-worker doctor"
