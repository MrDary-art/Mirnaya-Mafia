# Мастер переговоров

# 🌐 [Открыть работающий сайт — 24projects.ru](https://24projects.ru/)

[Установить сайт на Ubuntu](#ubuntu-site) · [Подключить удалённый Whisper](#remote-whisper) · [Windows](#windows-site) · [Проверка и обновление](#after-install) · [Удаление](#uninstall)

Попробуйте сценарии и посмотрите интерфейс без установки. Ниже — инструкции для своей машины.

«Мастер переговоров» помогает подготовиться к важному разговору: изучить теорию, пройти готовый сценарий, потренироваться с ИИ или провести встречу 1×1. Результаты и разборы сохраняются в профиле.

## Что и где устанавливать

| Что устанавливаете | Модели | Где устанавливать |
| --- | --- | --- |
| [Сайт](#ubuntu-site) | Whisper Tiny для резерва, Piper — голос Дмитрия | Ubuntu 22.04/24.04/26.04 LTS x86-64 или Windows 10 22H2/11 x64; от 2 ГБ RAM и 8 ГБ свободного места |
| [Удалённый Whisper](#remote-whisper) | faster-whisper large-v3-turbo | Отдельная машина с NVIDIA GPU; Ubuntu 22.04/24.04/26.04 LTS или Windows 10 22H2/11 x64 |

Для обычного голосового ответа используется распознавание браузера. Whisper на сервере предназначен для записи встречи 1×1 и резервной расшифровки. Внешняя машина сама подключается к сайту по исходящему HTTPS; открывать входящий порт для неё не нужно. При недоступности внешней машины сайт может переключиться на локальный Tiny.

<a id="ubuntu-site"></a>

## Установить сайт на Ubuntu — одна команда

1. Подключитесь по SSH и проверьте версию: `cat /etc/os-release`. Нужна одна из трёх версий Ubuntu из таблицы выше.
2. Укажите A-запись своего домена на публичный IP сервера. Откройте TCP 80 и 443 в панели хостинга и брандмауэре.
3. Вставьте команду в терминал сервера (нужны `curl` и права `sudo`):

```bash
bash -c 'f=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/MrDary-art/Mirnaya-Mafia/main/install/install-ubuntu.sh -o "$f" && sudo bash "$f"; rc=$?; rm -f -- "$f"; exit "$rc"'
```

Команда сама скачает последний опубликованный установочный комплект и проверит его контрольную сумму. Мастер попросит адрес сайта, логин и новый пароль администратора. Ключ GigaChat можно добавить сразу или позже в админке. Установщик поставит Python, зависимости, Whisper Tiny, голос Дмитрия и службы автозапуска. После установки покажет адрес сайта и `/admin`.

Отдельно скачивать архивы или собирать frontend не нужно. Если `curl` отсутствует: `sudo apt-get update && sudo apt-get install -y curl ca-certificates`, затем повторите команду.

Проверка после установки:

```bash
sudo /opt/master-negotiations/arena status
sudo /opt/master-negotiations/arena doctor --speech
sudo /opt/master-negotiations/arena logs
```

Откройте `https://ВАШ-ДОМЕН/` и `https://ВАШ-ДОМЕН/admin`. Caddy получает и продлевает публичный HTTPS сертификат сам. Для доступа по IP мастер создаёт тестовый сертификат; чтобы браузер не предупреждал, его корневой сертификат нужно вручную добавить в доверенные **на каждом устройстве**. Обычным посетителям нужен домен с публичным сертификатом.

<a id="windows-site"></a>

## Установка основного сервера на Windows

Откройте PowerShell **от имени администратора**, скачайте из того же [релиза](https://github.com/MrDary-art/Mirnaya-Mafia/releases) архив, файл `.sha256` и `install-windows.ps1`, затем в этой папке выполните:

```powershell
$sha = ((Get-Content -Raw .\arena-*.zip.sha256).Trim() -split '\s+')[0]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Bundle (Resolve-Path .\arena-*.zip).Path -BundleSha256 $sha
```

Мастер задаст те же вопросы. После установки меню управления: `C:\ProgramData\MasterNegotiations\arena.cmd`. На отдельном компьютере для микрофона используйте HTTPS; `http://localhost` подходит только на самой машине.

<a id="remote-whisper"></a>

## Подключить удалённый Whisper — одна команда

Сначала установите основной сайт и войдите в `/admin`. Откройте **Настройки → Внешний Whisper → Создать код**. Код действует ограниченное время и показывается один раз.

На внешней машине заранее проверьте `nvidia-smi` и установите драйвер NVIDIA. Для Windows дополнительно нужны доступные системе библиотеки [CUDA 12 и cuDNN 9](https://github.com/SYSTRAN/faster-whisper#gpu). Установщик не меняет драйвер видеокарты.

**Ubuntu:** на отдельной машине с GPU вставьте:

```bash
bash -c 'f=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/MrDary-art/Mirnaya-Mafia/main/install/install-ubuntu.sh -o "$f" && sudo bash "$f" --role whisper-worker; rc=$?; rm -f -- "$f"; exit "$rc"'
```

**Windows:** откройте PowerShell от имени администратора в папке комплекта:

```powershell
$sha = ((Get-Content -Raw .\arena-*.zip.sha256).Trim() -split '\s+')[0]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Role whisper-worker -Bundle (Resolve-Path .\arena-*.zip).Path -BundleSha256 $sha
C:\ProgramData\MasterNegotiationsWorker\arena-worker.cmd doctor
```

Мастер предложит выбрать GPU, затем запросит `https://` адрес основного сайта и одноразовый код. Он загрузит модель large-v3-turbo (около 1,6 ГБ), выполнит тест записи и включит службу. На Ubuntu worker устанавливается в `/opt/arena-whisper`; проверка после установки: `sudo /opt/arena-whisper/arena-worker doctor`. В админке дождитесь статуса «Готов к работе» и выберите автоматический режим с локальным резервом. Не передавайте на внешнюю машину ключ GigaChat или базу пользователей.

Если GPU нет, оставьте локальный Whisper на основном сервере. Windows worker требует отдельной проверки на реальном компьютере с NVIDIA GPU; проверка только исходного кода не подтверждает работу CUDA.

## Сборка своего комплекта из текущего main

Это путь, если нужна версия новее опубликованного релиза. На компьютере разработчика нужны Git, Python 3.12 и Node.js 22:

```bash
git clone --depth 1 -b main https://github.com/MrDary-art/Mirnaya-Mafia.git
cd Mirnaya-Mafia
git lfs pull --include="frontend/**" --exclude="models/**"
npm ci --prefix frontend
npm run build --prefix frontend
python install/build_release.py --version local-20260929
```

Полученный `release-artifacts/arena-local-20260929.zip` и файл `.sha256` перенесите на сервер вместе с `install/install-ubuntu.sh` или `install/install-windows.ps1`. Дальше используйте команды выше. Сборка включает интерфейс и код, а модели скачивает установщик с проверкой контрольных сумм.

<a id="after-install"></a>

## После установки

- Меню: `arena status`, `arena logs`, `arena doctor --speech`, `arena backup` (на Ubuntu — полный путь из команды выше).
- Админка: `/admin`; первый пароль задаёте сами. Стандартные `admin/admin` на публичной установке не создаются.
- GigaChat: добавьте Authorization Key в мастере или в админке. Ключи, база и записи хранятся только на сервере, не в Git.
- Обновление: сначала `arena backup`, затем `arena update --bundle ПУТЬ_К_НОВОМУ_АРХИВУ --sha256 SHA256`. Не удаляйте `data`, `private` и `backups`, если сохраняете данные.
- Проблемы: `arena status` и `arena logs`; подробности в [инструкции по установке](docs/INSTALLATION.md).

<a id="uninstall"></a>

## Как удалить с сервера

Команды ниже предназначены для установки нашим мастером в стандартные папки. **Полное удаление стирает пользователей, отчёты, записи, ключи, модели и резервные копии внутри папки установки.** Если данные нужны, сначала выполните `arena backup` и скачайте полученный архив на свой компьютер.

### Удалить сайт с Ubuntu

Сначала проверьте, откуда запущены службы:

```bash
sudo systemctl show arena-api.service arena-web.service -p ExecStart -p WorkingDirectory
```

Если пути относятся к `/opt/master-negotiations`, выполните команды по порядку. Если остановка служб закончилась ошибкой, сначала разберитесь с ней и не переходите к удалению папки.

```bash
# Остановить сайт и выключить автозапуск
sudo systemctl disable --now arena-api.service arena-web.service

# Удалить службы
sudo rm -f -- /etc/systemd/system/arena-api.service /etc/systemd/system/arena-web.service
sudo systemctl daemon-reload

# Полностью удалить установку и её данные
sudo rm -rf --one-file-system -- /opt/master-negotiations

# Убедиться, что службы удалены: ожидается not-found
systemctl show arena-api.service arena-web.service -p LoadState
```

Если требуется только временно выключить сайт, достаточно `sudo systemctl stop arena-api arena-web`. Включить обратно: `sudo systemctl start arena-api arena-web`.

### Удалить отдельный Whisper с Ubuntu

Выполняйте это **на машине внешнего Whisper**. В админке сайта заранее переключите распознавание на локальное и отзовите подключение удаляемого worker.

```bash
sudo systemctl show arena-whisper-worker.service -p ExecStart
```

Если служба относится к `/opt/arena-whisper`, выполните по порядку:

```bash
sudo systemctl disable --now arena-whisper-worker.service
sudo rm -f -- /etc/systemd/system/arena-whisper-worker.service
sudo systemctl daemon-reload
sudo rm -rf --one-file-system -- /opt/arena-whisper
systemctl show arena-whisper-worker.service -p LoadState
```

Драйвер NVIDIA и системная CUDA остаются установленными. Служебные Linux-пользователи `arena` и `arena-worker` также остаются; повторной установке они не мешают.

При своём пути установки (`--home`) сначала проверьте его в выводе `systemctl show`: стандартные команды не удалят другую папку. Архивы, скачанные отдельно в домашнюю папку, можно удалить отдельно после проверки их имён. Для старой установки через Docker, вручную запущенный Python или другой установщик эти команды не подходят.

**Windows:** команды удаления сайта и внешнего Whisper — в [инструкции по обслуживанию](docs/INSTALLATION_DETAILS.md#удаление-на-windows).

Источник актуальных версий Ubuntu: [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).
