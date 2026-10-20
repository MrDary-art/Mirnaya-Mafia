#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
A=/opt/arena-whisper
R="$A/releases/install-v38804077774-1"
REF=3e4ba09efa84f110404abcc575bb3e52475efeb5
[[ -x "$A/runtime/bin/python" && -f "$R/install/setup.py" ]] || { echo 'Не найдена ожидаемая незавершённая установка'; exit 1; }
[[ ! -f "$A/installation.json" ]] || { echo 'Установка уже завершена. Используйте arena-worker status/doctor.'; exit 1; }
[[ $(systemctl show arena-whisper-worker -p ActiveState --value 2>/dev/null) != active ]] || { echo 'Worker уже запущен'; exit 1; }
STAGE=$(mktemp -d "$A/preview-fix-XXXXXXXX")
BACKUP=$(mktemp -d /root/arena-worker-code-before-preview-XXXXXXXX)
trap 'rm -rf -- "$STAGE"' EXIT
for path in worker/worker.py worker/preview_access.py install/worker_cli.py; do
  mkdir -p "$STAGE/$(dirname "$path")" "$BACKUP/$(dirname "$path")"
  curl -fsSL --connect-timeout 20 --max-time 120 --retry 3 "https://raw.githubusercontent.com/MrDary-art/Mirnaya-Mafia/$REF/$path?nocache=$(date +%s)" -o "$STAGE/$path"
done
(cd "$STAGE"; sha256sum -c <<'HASHES'
86ee31ff1fd348e1cf85b2af73870e99309c250cb63ec3c082bd71ef863dfed4  worker/worker.py
249d5fca4af4401f3564677d5ecb4ca72fc6e47b518cb53c22f1bbc1ed0c8fd1  worker/preview_access.py
790fe4a512d4df308b7445d10f78861b8626b688516f7752e324d189717e9951  install/worker_cli.py
HASHES
)
"$A/runtime/bin/python" -m py_compile "$STAGE/worker/worker.py" "$STAGE/worker/preview_access.py" "$STAGE/install/worker_cli.py"
for path in worker/worker.py worker/preview_access.py install/worker_cli.py; do
  if [[ -f "$R/$path" ]]; then cp -a "$R/$path" "$BACKUP/$path"; fi
  install -m 600 "$STAGE/$path" "$R/$path"
done
echo "Поддержка заглушки добавлена. Прежний код сохранён: $BACKUP"
echo 'При обнаружении заглушки мастер запросит её пароль скрытым вводом.'
echo 'Пароль сайта не изменяется; в конфигурации worker сохраняется только cookie.'
PYTHONPATH="$R:$R/backend" "$A/runtime/bin/python" "$R/install/setup.py" --home "$A" --role whisper-worker
"$A/arena-worker" doctor
