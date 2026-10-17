#!/usr/bin/env bash
# Audited against Mirnaya-Mafia main 3bdc205, 2026-10-17.
# Usage: sudo bash arena-main-preview.sh check|gate|update|all
set -Eeuo pipefail
umask 077
ARENA=/opt/master-negotiations
REPO=https://github.com/MrDary-art/Mirnaya-Mafia.git
REVIEWED=3bdc205ee0cf1befdb03aa245b8195db3780840e
MODE=${1:-check}
[[ $EUID == 0 ]] || { echo 'Запустите через sudo bash.'; exit 1; }
[[ "$MODE" =~ ^(check|gate|update|all)$ ]] || exit 2
fail() { echo "ОСТАНОВКА: $*" >&2; exit 1; }
trap 'echo "Ошибка в строке $LINENO. Не удаляйте данные. Журнал: journalctl -u arena-api -u arena-web -n 80 --no-pager" >&2' ERR

preflight() {
  . /etc/os-release
  [[ "$ID" == ubuntu && "$VERSION_ID" =~ ^(22.04|24.04|26.04)$ ]] || fail 'Нужна Ubuntu 22.04/24.04/26.04.'
  [[ $(uname -m) == x86_64 ]] || fail 'Нужна архитектура x86_64.'
  for f in installation.json active.json private/arena.env private/installation.key; do
    [[ -f "$ARENA/$f" ]] || fail "Нет $ARENA/$f. Это другая схема установки; нужны её параметры."
  done
  [[ -x "$ARENA/runtime/bin/python" && -x "$ARENA/tools/uv" && -x "$ARENA/tools/caddy" ]] || fail 'Не найден изолированный runtime/uv/Caddy.'
  [[ -x "$ARENA/arena" ]] || fail 'Не найден arena CLI.'
  python3 - "$ARENA" <<'PY'
import json,re,sys,subprocess
from pathlib import Path
p=Path(sys.argv[1]); m=json.loads((p/'installation.json').read_text())
d=m.get('domain','')
assert re.fullmatch(r'[a-zA-Z0-9.-]+',d) and '.' in d, 'Нужен установленный домен HTTPS'
assert m.get('tls_mode','public') == 'public', 'Сначала настройте публичный HTTPS'
assert 1024 <= int(m['api_port']) <= 65535
lines=subprocess.check_output(['ss','-Hlnpt','sport = :'+str(m['api_port'])],text=True).splitlines()
for line in lines:
 assert line.split()[3] in ('127.0.0.1:'+str(m['api_port']),'[::1]:'+str(m['api_port'])), 'API слушает публичный адрес: '+line
a=json.loads((p/'active.json').read_text())
print('Домен:',d, '| API:',m['api_port'], '| Активный код:',a['release'])
r=Path(a['release'])/'release.json'
if r.exists():
 v=json.loads(r.read_text()); print('Версия:',v.get('version'),'| Commit:',v.get('source_commit'))
PY
  systemctl is-active --quiet arena-web || fail 'arena-web сейчас не запущен; сначала выясните, кто обслуживает заглушку.'
  local webpid listeners
  webpid=$(systemctl show arena-web -p MainPID --value)
  listeners=$(ss -Hlnpt 'sport = :443')
  [[ "$listeners" == *"pid=$webpid,"* ]] || fail 'Порт 443 обслуживается не arena-web. Не меняю чужой nginx/Caddy.'
  systemctl show arena-api arena-web -p ExecStart -p FragmentPath --no-pager
  df -h "$ARENA"
  echo 'Проверка стандартной установки пройдена.'
}

gate() {
  # A separate Caddy config survives arena update, which rewrites Caddyfile.
  python3 - "$ARENA" <<'PY'
import hashlib,json,os,secrets,sys
from pathlib import Path
p=Path(sys.argv[1]); m=json.loads((p/'installation.json').read_text())
password=secrets.token_urlsafe(24)
digest=hashlib.sha256(password.encode()).hexdigest()
page='''<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Закрытое тестирование</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10231e;color:#edf4ed;font:18px system-ui}main{max-width:420px;padding:32px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:14px;font:inherit;border-radius:10px;border:0}button{background:#c6e5b1;cursor:pointer}p{line-height:1.5;color:#bacdc2}</style>
<main><h1>Сайт готовится к запуску</h1><p>Сейчас доступ открыт только участникам закрытого тестирования.</p>
<form id="form"><label for="password">Пароль доступа</label><input id="password" type="password" autocomplete="current-password" required><button>Открыть сайт</button></form>
<p>Если эта страница появилась снова, проверьте пароль.</p></main>
<script>document.getElementById('form').addEventListener('submit',async e=>{e.preventDefault();
const data=new TextEncoder().encode(document.getElementById('password').value);
const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
document.cookie='__Host-arena_preview='+hash+'; Path=/; Secure; SameSite=Strict; Max-Age=604800';location.replace('/');});</script></html>'''
config='''{
    admin off
    skip_install_trust
    storage file_system {
        root "STORAGE"
    }
}
https://DOMAIN {
    encode gzip
    header X-Content-Type-Options nosniff
    header X-Robots-Tag "noindex, nofollow"
    header Cache-Control "private, no-store"
    @allowed header_regexp Cookie "(^|;[ ]*)__Host-arena_preview=DIGEST(;|$)"
    handle @allowed {
        reverse_proxy 127.0.0.1:PORT {
            flush_interval -1
        }
    }
    handle {
        header Content-Type "text/html; charset=utf-8"
        respond <<HTML
PAGE
HTML 403
    }
}
'''.replace('STORAGE',str(p/'data/caddy')).replace('DOMAIN',m['domain']).replace('DIGEST',digest).replace('PORT',str(m['api_port'])).replace('PAGE',page)
target=p/'private/preview.Caddyfile'; target.write_text(config); target.chmod(0o600)
import pwd
os.chown(target,pwd.getpwnam('arena').pw_uid,pwd.getpwnam('arena').pw_gid)
access=Path('/root/arena-preview-access.txt')
access.write_text('Сайт: https://'+m['domain']+'\nПароль: '+password+'\n')
access.chmod(0o600)
PY
  "$ARENA/tools/caddy" adapt --config "$ARENA/private/preview.Caddyfile" --adapter caddyfile >/dev/null
  mkdir -p /etc/systemd/system/arena-web.service.d
  cat > /etc/systemd/system/arena-web.service.d/preview.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/opt/master-negotiations/tools/caddy run --config /opt/master-negotiations/private/preview.Caddyfile --adapter caddyfile
UNIT
  systemctl daemon-reload
  systemctl restart arena-web
  systemctl is-active --quiet arena-web
  python3 - "$ARENA" <<'PY'
import hashlib,json,re,sys,urllib.request,urllib.error
from pathlib import Path
p=Path(sys.argv[1]); m=json.loads((p/'installation.json').read_text()); base='https://'+m['domain']
for path in ('/','/api','/api/meta','/docs','/openapi.json'):
 try:
  urllib.request.urlopen(base+path,timeout=20)
  raise RuntimeError('Не закрыт путь: '+path)
 except urllib.error.HTTPError as e:
  assert e.code==403,(path,e.code)
print('Без пароля: страницы и API закрыты (403).')
PY
  cat /root/arena-preview-access.txt
  echo 'Пароль сохранён в /root/arena-preview-access.txt. Смена: повторите режим gate.'
}

update() {
  [[ -f /etc/systemd/system/arena-web.service.d/preview.conf && -f "$ARENA/private/preview.Caddyfile" ]] || fail 'Сначала выполните режим gate.'
  (( $(df -Pk "$ARENA" | awk 'NR==2 {print $4}') >= 8388608 )) || fail 'Нужно 8 ГБ свободного места.'
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y git git-lfs curl ca-certificates xz-utils
  local build commit nodefile version bundle sha snapshot
  build=$(mktemp -d /opt/arena-main-build-XXXXXXXX)
  chmod 700 "$build"
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch main "$REPO" "$build/source"
  commit=$(git -C "$build/source" rev-parse HEAD)
  [[ "$commit" == "$REVIEWED" ]] || fail "main изменился: $commit. Скрипт проверен для $REVIEWED; нужна повторная сверка."
  git -C "$build/source" lfs pull --include='frontend/**' --exclude='models/**'
  curl --fail --location --retry 3 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$build/SHASUMS256.txt"
  nodefile=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "$build/SHASUMS256.txt")
  [[ "$nodefile" =~ ^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] || fail 'Не удалось определить Node.js 22.'
  curl --fail --location --retry 3 "https://nodejs.org/dist/latest-v22.x/$nodefile" -o "$build/$nodefile"
  (cd "$build"; awk -v n="$nodefile" '$2==n' SHASUMS256.txt | sha256sum -c -)
  mkdir "$build/node"
  tar -xJf "$build/$nodefile" -C "$build/node" --strip-components=1
  export PATH="$build/node/bin:$PATH"
  export UV_CACHE_DIR="$build/uv-cache"
  "$ARENA/tools/uv" venv --python "$ARENA/runtime/bin/python" "$build/venv"
  "$ARENA/tools/uv" pip sync --python "$build/venv/bin/python" --require-hashes "$build/source/install/requirements.lock"
  (cd "$build/source"; npm ci --prefix frontend; npm run build --prefix frontend)
  version="main-${commit:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
  (cd "$build/source"; "$build/venv/bin/python" install/build_release.py --version "$version")
  bundle="$build/source/release-artifacts/arena-$version.zip"
  sha=$(awk 'NR==1 {print $1}' "$bundle.sha256")
  snapshot="/root/arena-before-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  # Stop SQLite writers for a consistent snapshot, including WAL and encryption keys.
  systemctl stop arena-api
  trap 'systemctl start arena-api || true; echo "Ошибка: старая установка сохранена, смотрите журнал." >&2' ERR
  tar -czf "$snapshot" -C "$ARENA" data private active.json installation.json Caddyfile launcher.py
  chmod 600 "$snapshot"
  systemctl start arena-api
  echo "Полная копия данных и ключей: $snapshot"
  trap 'echo "Обновление прервалось. Не запускайте службы вслепую; сохраните журнал и резервную копию." >&2' ERR
  # Use the NEW updater while keeping the old live runtime untouched until now.
  "$build/venv/bin/python" "$build/source/install/arena.py" --home "$ARENA" update --bundle "$bundle" --sha256 "$sha"
  trap 'echo "Обновление прервалось. Не удаляйте данные; смотрите журнал." >&2' ERR
  systemctl is-active --quiet arena-api arena-web
  "$ARENA/runtime/bin/python" - "$ARENA" "$commit" <<'PY'
import hashlib,json,re,sys,time,urllib.request,urllib.error
from pathlib import Path
p=Path(sys.argv[1]); m=json.loads((p/'installation.json').read_text()); a=json.loads((p/'active.json').read_text())
v=json.loads((Path(a['release'])/'release.json').read_text())
assert v['source_commit']==sys.argv[2] and not v['source_dirty'],v
digest=re.search(r'__Host-arena_preview=([a-f0-9]{64})', (p/'private/preview.Caddyfile').read_text()).group(1)
url='https://'+m['domain']+'/api'
for attempt in range(30):
 try:
  req=urllib.request.Request(url,headers={'Cookie':'__Host-arena_preview='+digest})
  with urllib.request.urlopen(req,timeout=10) as r:
   payload=json.load(r); assert payload.get('name'),payload
  break
 except (OSError,ValueError):
  if attempt==29: raise
  time.sleep(2)
try:
 urllib.request.urlopen(url,timeout=10)
 raise RuntimeError('API доступен без пароля!')
except urllib.error.HTTPError as e:
 assert e.code==403,e.code
print('Проверено: нужный commit, API работает с доступом; без пароля закрыт.')
PY
  echo "Установлен main: $commit"
  echo "Резервная копия: $snapshot"
  echo "Сборка оставлена в: $build"
  cat /root/arena-preview-access.txt
}

preflight
case "$MODE" in
  check) ss -lntp; systemctl status arena-api arena-web --no-pager || true;;
  gate) gate;;
  update) update;;
  all) gate; update;;
esac
