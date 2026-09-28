# Установка «Мастера переговоров»

[Работающий сайт](https://24projects.ru/) · [Главная инструкция и требования](../README.md) · [Подробности обслуживания](INSTALLATION_DETAILS.md)

## Быстрый выбор

| Что устанавливаете | Где | Команда |
| --- | --- | --- |
| Сайт | Ubuntu 22.04, 24.04 или 26.04 LTS | [Одна команда](../README.md#ubuntu-site) |
| Сайт | Windows 10 22H2/11 x64 | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Bundle ПУТЬ_К_ZIP -BundleSha256 SHA256` |
| Внешний Whisper | Ubuntu с NVIDIA GPU | [Одна команда](../README.md#remote-whisper) |
| Внешний Whisper | Windows с NVIDIA GPU | Та же команда с `-Role whisper-worker` |

На Ubuntu команда сама скачивает опубликованный комплект. Для Windows или ручной установки скачайте **три файла одного релиза** из [Releases](https://github.com/MrDary-art/Mirnaya-Mafia/releases/latest): установщик, `arena-*.zip` и `arena-*.zip.sha256`. Автоматический GitHub «Source code (zip)» здесь не подходит.

## Ubuntu: сайт

1. Войдите по SSH. Проверьте `cat /etc/os-release` и свободное место: `df -h /`.
2. Настройте A-запись домена и входящие TCP 80/443, если сайт будет открыт в интернете.
3. Вставьте команду (нужны `curl` и права `sudo`):

```bash
bash -c 'f=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/MrDary-art/Mirnaya-Mafia/main/install/install-ubuntu.sh -o "$f" && sudo bash "$f"; rc=$?; rm -f -- "$f"; exit "$rc"'
```

4. Выберите доступ по домену, IP или локально. Задайте логин и новый пароль администратора. GigaChat можно подключить позже. Дождитесь адреса сайта и результатов проверки.
5. Проверьте:

```bash
sudo /opt/master-negotiations/arena status
sudo /opt/master-negotiations/arena doctor --speech
```

При выборе домена Caddy сам получает публичный HTTPS сертификат. Если используется тестовый сертификат по IP, браузеру потребуется ручное добавление доверия на каждом устройстве. Установщик не может сделать свой сертификат общедоверенным.

## Windows: сайт

Откройте PowerShell от имени администратора в папке с комплектом:

```powershell
$sha = ((Get-Content -Raw .\arena-*.zip.sha256).Trim() -split '\s+')[0]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Bundle (Resolve-Path .\arena-*.zip).Path -BundleSha256 $sha
C:\ProgramData\MasterNegotiations\arena.cmd status
```

Установщик создаёт службы и папку `C:\ProgramData\MasterNegotiations`. Для доступа с другого устройства настройте домен и HTTPS.

## Внешний Whisper

Основной сайт уже должен работать по публичному HTTPS. В `/admin` откройте **Настройки → Внешний Whisper → Создать код**. Код действует ограниченное время. На внешней машине проверьте `nvidia-smi`; Windows также нужны CUDA 12 и cuDNN 9 в системном `PATH`.

Ubuntu:

```bash
bash -c 'f=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/MrDary-art/Mirnaya-Mafia/main/install/install-ubuntu.sh -o "$f" && sudo bash "$f" --role whisper-worker; rc=$?; rm -f -- "$f"; exit "$rc"'
```

Windows, PowerShell от имени администратора:

```powershell
$sha = ((Get-Content -Raw .\arena-*.zip.sha256).Trim() -split '\s+')[0]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Role whisper-worker -Bundle (Resolve-Path .\arena-*.zip).Path -BundleSha256 $sha
C:\ProgramData\MasterNegotiationsWorker\arena-worker.cmd doctor
```

На запрос мастера введите адрес сайта `https://...` и код из админки. Входящий порт на внешней машине не требуется. Установщик сам загрузит large-v3-turbo и проверит реальную тестовую запись. Если worker не готов, используйте локальный Tiny на основном сервере.

## Если установка остановилась

- **`Name or service not known`** — проверьте A-запись домена: `getent ahosts ВАШ-ДОМЕН`.
- **HTTPS не готов** — проверьте DNS, входящие TCP 80/443 и `arena logs`. Публичный сертификат нельзя выпустить только по IP.
- **Worker не готов** — `nvidia-smi`, `arena-worker doctor`, `arena-worker logs`; на Windows проверьте CUDA/cuDNN.
- **Сайт не открылся** — `arena status`, `arena logs`, `arena doctor --speech`.
- **Повторная установка** сохраняет уже созданные данные. Не удаляйте `data`, `private`, `backups`, если хотите сохранить пользователей.

Не отправляйте в переписку Authorization Key, пароль администратора и содержимое `private`.
