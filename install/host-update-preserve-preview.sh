#!/usr/bin/env bash
# Rebuild application code and Python environment; keep encrypted settings and user data.
set -Eeuo pipefail
umask 077
A=/opt/master-negotiations
TARGET=238be7ee911d2c7707d2c69c143f0dd8ca5021d8
RESCUE=/root/arena-rescue-esrsdvgt
[[ $EUID == 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
exec 9>/run/arena-reinstall.lock
flock -n 9 || { echo 'Переустановка уже запущена'; exit 1; }
fail() { echo "ОСТАНОВКА: $*" >&2; exit 1; }
trap 'echo "ОСТАНОВКА в строке $LINENO. Данные не удалялись. Сохраните вывод; не запускайте обычный установщик поверх ошибки." >&2' ERR
for f in installation.json active.json private/arena.env private/installation.key; do
  [[ -f "$A/$f" ]] || fail "Нет $A/$f"
done
for f in arena.db arena.env installation.key; do
  [[ -s "$RESCUE/backup/$f" ]] || fail "Нет резервной копии $f"
done
[[ -f /etc/systemd/system/arena-web.service.d/preview.conf && -f "$A/private/preview.Caddyfile" ]] || fail 'Не найдена вчерашняя защита паролем'
[[ -x "$A/tools/uv" && -x "$A/runtime/bin/python" ]] || fail 'Не найдены uv/Python'
systemctl is-active --quiet arena-web || fail 'Служба заглушки остановлена'
[[ $(uname -m) == x86_64 ]] || fail 'Нужен x86_64'
(( $(df -Pk "$A" | awk 'NR==2 {print $4}') >= 8388608 )) || fail 'Нужно не менее 8 ГБ свободного места'
B=$(mktemp -d /opt/arena-reinstall-build-XXXXXXXX)
export UV_CACHE_DIR="$B/uv-cache"
PYTHON=$(readlink -f "$A/runtime/bin/python")
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y git git-lfs curl ca-certificates xz-utils
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --no-checkout https://github.com/MrDary-art/Mirnaya-Mafia.git "$B/source"
git -C "$B/source" fetch --depth 1 origin "$TARGET"
GIT_LFS_SKIP_SMUDGE=1 git -C "$B/source" -c advice.detachedHead=false checkout --detach "$TARGET"
[[ $(git -C "$B/source" rev-parse HEAD) == "$TARGET" ]] || fail 'Неверный коммит'
git -C "$B/source" lfs pull --include='frontend/**' --exclude='models/**'
curl -fsSL --retry 3 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$B/SHASUMS256.txt"
NODE=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "$B/SHASUMS256.txt")
[[ "$NODE" =~ ^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] || fail 'Не найден Node.js 22'
curl -fsSL --retry 3 "https://nodejs.org/dist/latest-v22.x/$NODE" -o "$B/$NODE"
(cd "$B"; awk -v n="$NODE" '$2==n' SHASUMS256.txt | sha256sum -c -)
mkdir "$B/node"
tar -xJf "$B/$NODE" -C "$B/node" --strip-components=1
export PATH="$B/node/bin:$PATH"
"$A/tools/uv" venv --python "$PYTHON" "$B/venv"
"$A/tools/uv" pip sync --python "$B/venv/bin/python" --require-hashes "$B/source/install/requirements.lock"
(cd "$B/source"; npm ci --prefix frontend; npm run build --prefix frontend)
VERSION="main-clean-${TARGET:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
(cd "$B/source"; PYTHONPATH="$B/source/backend" "$B/venv/bin/python" install/build_release.py --version "$VERSION")
BUNDLE="$B/source/release-artifacts/arena-$VERSION.zip"
(cd "$(dirname "$BUNDLE")"; sha256sum -c "$(basename "$BUNDLE").sha256")

# Test migrations on a separate SQLite copy and verify stored credentials without printing them.
cat > "$B/prepare.py" <<'PY'
import json, shutil, sqlite3, sys
from pathlib import Path
from dotenv import dotenv_values, set_key
from cryptography.fernet import Fernet

a, b = map(Path, sys.argv[1:])
env = dotenv_values(a/'private/arena.env')
assert Path(env['DB_PATH']).resolve() == a/'data/arena.db', 'Нестандартный DB_PATH'
assert Path(env['INSTALLATION_KEY_FILE']).resolve() == a/'private/installation.key', 'Нестандартный путь ключа'
key = Fernet((a/'private/installation.key').read_bytes().strip())
with sqlite3.connect(a/'data/arena.db', timeout=30) as db:
    assert db.execute('pragma quick_check').fetchone()[0] == 'ok', 'SQLite повреждена'
    row = db.execute('select value from installation_config where id=1').fetchone()
    assert row, 'Нет настроек установки'
    cfg = json.loads(row[0])
    assert (cfg.get('mail') or {}).get('password'), 'Сохранённый SMTP-пароль не найден; переустановка остановлена'
    secrets = [(cfg.get('mail') or {}).get('password'), cfg.get('credential')]
    secrets += [v.get('credential') for v in cfg.get('ai_profiles', {}).values()]
    for value in secrets:
        if value:
            assert key.decrypt(value.encode()), 'Пустой секрет'
    test = b/'migration-test'
    (test/'private').mkdir(parents=True)
    with sqlite3.connect(test/'arena.db') as dest:
        db.backup(dest)
shutil.copy2(a/'private/arena.env', test/'private/arena.env')
set_key(str(test/'private/arena.env'), 'DB_PATH', str(test/'arena.db'))
(b/'settings-before.json').write_text(json.dumps(cfg))
print('SMTP-пароль и сохранённые ключи расшифровываются. Значения не выводятся.')
PY
"$B/venv/bin/python" "$B/prepare.py" "$A" "$B"
PYTHONPATH="$B/source/backend" "$B/venv/bin/python" "$B/source/install/arena.py" --home "$B/migration-test" migrate
"$B/venv/bin/python" - "$B" <<'PY'
import json, sqlite3, sys
from pathlib import Path
b=Path(sys.argv[1])
with sqlite3.connect(b/'migration-test/arena.db') as db:
    after=json.loads(db.execute('select value from installation_config where id=1').fetchone()[0])
assert after==json.loads((b/'settings-before.json').read_text()), 'Миграция изменила настройки'
print('Пробная миграция прошла; настройки сохранены.')
PY

# Check the saved password against the live gate; never generate or replace either.
python3 - "$A" "$B" <<'PY'
import hashlib,re,sys
from pathlib import Path
a,b=map(Path,sys.argv[1:])
access=Path('/root/arena-preview-access.txt').read_text(encoding='utf-8')
password=access.split('Пароль: ',1)[1].removesuffix('\n')
assert len(password)==100, 'Ожидался сохранённый пароль из 100 символов'
config=(a/'private/preview.Caddyfile').read_text(encoding='utf-8')
digests=re.findall(r'__Host-arena_preview=([a-f0-9]{64})',config)
assert digests==[hashlib.sha256(password.encode('utf-8')).hexdigest()], 'Сохранённый пароль не соответствует заглушке'
(b/'gate-before').write_bytes((a/'private/preview.Caddyfile').read_bytes())
(b/'access-before').write_bytes(Path('/root/arena-preview-access.txt').read_bytes())
print('Действующий пароль проверен. При обновлении он останется прежним.')
PY

# Validate the existing gate before making changes. API remains loopback-only.
"$A/tools/caddy" validate --config "$A/private/preview.Caddyfile" --adapter caddyfile
python3 - "$A" <<'PY'
import json, subprocess, sys, urllib.request, urllib.error
from pathlib import Path
a=Path(sys.argv[1]); m=json.loads((a/'installation.json').read_text())
assert m.get('domain') and m.get('tls_mode','public')=='public', 'Нужен публичный HTTPS'
for line in subprocess.check_output(['ss','-Hlnpt','sport = :'+str(m['api_port'])],text=True).splitlines():
    assert line.split()[3] in ('127.0.0.1:'+str(m['api_port']),'[::1]:'+str(m['api_port'])), 'API доступен снаружи'
for path in ('/','/api'):
    try:
        urllib.request.urlopen('https://'+m['domain']+path,timeout=20)
        raise RuntimeError('Нет защиты паролем')
    except urllib.error.HTTPError as e:
        assert e.code==403, 'Заглушка должна возвращать 403'
PY

S=$(mktemp -d /root/arena-before-clean-XXXXXXXX)
echo "Новая сборка готова. Начинаю замену. Резервная копия: $S"
systemctl stop arena-api
# Snapshot includes SQLite WAL and media, with the application's writer stopped.
tar -czf "$S/state.tar.gz" -C "$A" data private active.json installation.json Caddyfile launcher.py arena
tar -tzf "$S/state.tar.gz" >/dev/null
cp -a /etc/systemd/system/arena-api.service /etc/systemd/system/arena-web.service "$S/"
if [[ -f /root/arena-preview-access.txt ]]; then cp -a /root/arena-preview-access.txt "$S/previous-preview-access.txt"; fi
mkdir "$S/code"
trap 'echo "ОСТАНОВКА в строке $LINENO. API оставлен остановленным. Копия данных: $S/state.tar.gz; старый код: $S/code. Ничего не удаляйте; пришлите последние строки ошибки." >&2; systemctl stop arena-api || true' ERR
mv "$A/runtime" "$S/code/runtime"
mv "$A/releases" "$S/code/releases"
"$A/tools/uv" venv --python "$PYTHON" "$A/runtime"
"$A/tools/uv" pip sync --offline --python "$A/runtime/bin/python" --require-hashes "$B/source/install/requirements.lock"

cat > "$B/activate.py" <<'PY'
import json, sys
from pathlib import Path
a, bundle, target = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
from install.setup import unpack_release
r=unpack_release(bundle,a)
meta=json.loads((r/'release.json').read_text())
assert meta['source_commit']==target and not meta['source_dirty'], 'Неверная версия архива'
print(r)
PY
RELEASE=$(PYTHONPATH="$B/source" "$A/runtime/bin/python" "$B/activate.py" "$A" "$BUNDLE" "$TARGET")
PYTHONPATH="$RELEASE/backend" "$A/runtime/bin/python" "$RELEASE/install/arena.py" --home "$A" migrate
# Regenerate canonical launchers, base services and Caddy config. Keep the preview drop-in.
rm /etc/systemd/system/arena-api.service /etc/systemd/system/arena-web.service
PYTHONPATH="$RELEASE:$RELEASE/backend" "$A/runtime/bin/python" - "$A" "$RELEASE" <<'PY'
import json,sys
from pathlib import Path
from install.arena import configure_environment
from install.setup import activate_release,caddy_config,install_services
a,r=map(Path,sys.argv[1:]); configure_environment(a)
m=json.loads((a/'installation.json').read_text()); m['release']=str(r)
(a/'installation.json').write_text(json.dumps(m))
activate_release(a,r)
caddy_config(a,r,m['domain'],m['port'],m['api_port'],m.get('tls_mode'))
install_services(a,r,m['api_port'])
PY
systemctl restart arena-api arena-web

"$A/runtime/bin/python" - "$A" "$B" "$TARGET" <<'PY'
import hashlib,json,re,sqlite3,sys,time,urllib.request,urllib.error
from pathlib import Path
from cryptography.fernet import Fernet
a,b=map(Path,sys.argv[1:3]); target=sys.argv[3]
assert (a/'private/preview.Caddyfile').read_bytes()==(b/'gate-before').read_bytes(), 'Конфигурация заглушки изменилась'
assert Path('/root/arena-preview-access.txt').read_bytes()==(b/'access-before').read_bytes(), 'Пароль заглушки изменился'
m=json.loads((a/'installation.json').read_text())
r=Path(json.loads((a/'active.json').read_text())['release'])
assert json.loads((r/'release.json').read_text())['source_commit']==target
with sqlite3.connect(a/'data/arena.db') as db:
    cfg=json.loads(db.execute('select value from installation_config where id=1').fetchone()[0])
assert cfg==json.loads((b/'settings-before.json').read_text()), 'Настройки изменились'
key=Fernet((a/'private/installation.key').read_bytes().strip())
assert key.decrypt(cfg['mail']['password'].encode())
if cfg.get('credential'): assert key.decrypt(cfg['credential'].encode())
digest=re.search(r'__Host-arena_preview=([a-f0-9]{64})',(a/'private/preview.Caddyfile').read_text()).group(1)
base='https://'+m['domain']
for attempt in range(60):
    try:
        req=urllib.request.Request(base+'/api',headers={'Cookie':'__Host-arena_preview='+digest})
        with urllib.request.urlopen(req,timeout=5) as response:
            assert json.load(response).get('name')
        req=urllib.request.Request(base+'/',headers={'Cookie':'__Host-arena_preview='+digest})
        with urllib.request.urlopen(req,timeout=5) as response:
            assert b'<html' in response.read().lower()
        break
    except (OSError,ValueError,AssertionError):
        if attempt==59: raise RuntimeError('Сайт не прошёл проверку запуска') from None
        time.sleep(2)
for path in ('/','/api'):
    try:
        urllib.request.urlopen(base+path,timeout=10)
        raise RuntimeError('Сайт доступен без пароля')
    except urllib.error.HTTPError as e: assert e.code==403
print('ГОТОВО: установлен main '+target)
print('Интерфейс и API отвечают; без общего пароля доступ закрыт.')
print('Настройки почты и GigaChat сохранены; SMTP-пароль расшифровывается.')
print('Адрес: '+base)
PY
systemctl is-active --quiet arena-api arena-web
echo "Старый код и свежая копия данных: $S"
echo "Исходная резервная копия: $RESCUE"
echo 'Обновление завершено. Действующий 100-символьный пароль сохранён без изменений.'
echo 'Посмотреть пароль повторно: sudo cat /root/arena-preview-access.txt'
