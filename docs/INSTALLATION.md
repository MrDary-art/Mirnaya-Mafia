# Установка «Мастера переговоров»

## 1. Запустите установку

Войдите на сервер по SSH. Скопируйте команду целиком и нажмите Enter:

```bash
curl -fL https://github.com/MrDary-art/Mirnaya-Mafia/releases/download/install-v2026.09.28.3/install-ubuntu.sh -o arena-install.sh && sudo bash ./arena-install.sh
```

Нужны **Ubuntu 24.04, x86_64, минимум 2 ГБ ОЗУ и 8 ГБ свободного места**.
Если нет curl: `sudo apt-get update && sudo apt-get install -y curl ca-certificates`.
Python, зависимости, Whisper Tiny и голос Дмитрия установщик скачает сам.
Не закрывайте терминал до окончания установки.

## 2. Ответьте на вопросы мастера

1. **Как открыть сайт?** Выберите **2 — Домен** для обычного сайта, **3 — IP** для проверки без домена. Пункт **1** открывает сайт только на самом сервере.
2. **Адрес.** Введите домен без `https://` либо IP, доступный с вашего компьютера. Внешний IP возьмите в панели облачного сервера.
3. **Администратор.** Придумайте логин и пароль от 12 символов. При вводе пароля символов не видно — это нормально.
4. **GigaChat.** Вставьте полный Authorization Key. Scope обычно `GIGACHAT_API_PERS`. Можно пропустить и добавить ключ позже в админке.
5. **Дождитесь проверки.** В конце появятся адрес сайта, адрес `/admin` и логин. Пароль — тот, который вы задали.

После успешной установки терминал можно закрыть. Службы работают сами и запускаются после перезагрузки.

## 3. Выберите правильный HTTPS

### Домен: для всех посетителей

Сертификат заранее не нужен. **Caddy сам получает бесплатный сертификат и продлевает его.**
Настройте A-запись домена на внешний IP сервера. Если есть AAAA-запись, IPv6 тоже должен вести на этот сервер.
В панели облака и брандмауэре разрешите входящие **TCP 80 и 443**.

Мастер проверит HTTPS после запуска. Если сертификат пока не выдан, можно дождаться следующей попытки Caddy или выбрать предложенный тестовый сертификат.

### IP: для вашего тестирования

В пункте **3** сертификат создаётся автоматически. **Чтобы браузер не предупреждал, его нужно один раз добавить в доверенные на каждом вашем устройстве.** Сайт не может сделать это за браузер. Для обычных посетителей используйте домен.

На сервере:

```bash
sudo /opt/master-negotiations/arena certificate
sha256sum /opt/master-negotiations/certificates/arena-root.crt
```

Затем **на своём Windows-компьютере**, в PowerShell (замените `ВНЕШНИЙ_IP`):

```powershell
scp root@ВНЕШНИЙ_IP:/opt/master-negotiations/certificates/arena-root.crt .
certutil -hashfile .\arena-root.crt SHA256
```

Сравните хеш файла с результатом `sha256sum` на сервере. Если совпадает, добавьте ваш сертификат в доверенные текущего пользователя:

```powershell
certutil -user -addstore Root .\arena-root.crt
```

Полностью перезапустите Edge/Chrome и откройте адрес из мастера. На другом компьютере или телефоне доверие добавляется отдельно. Firefox может использовать отдельное хранилище. Передавайте только `arena-root.crt`, никогда не копируйте закрытые файлы `.key`.

Переключение собственного и публичного сертификата на том же домене: `sudo /opt/master-negotiations/arena https`.
Проверка сертификатов остаётся включённой. Для внешнего GPU Whisper используйте публичный доменный HTTPS: доверие на вашем ПК не передаётся на GPU-сервер.

## Ошибка `Name or service not known`

Это ошибка DNS. В вашем журнале сервер не смог найти `24projects.ru`; до создания аккаунта и базы дело ещё не дошло.

1. Проверьте написание домена и его **A-запись → внешний IP сервера**. Неверную AAAA-запись тоже исправьте.
2. Дождитесь обновления DNS. На сервере проверьте: `getent ahosts 24projects.ru`.
3. Снова выполните команду установки выше. Новый мастер объясняет ошибку и позволяет выбрать адрес повторно.

`10.130.0.34` из журнала — внутренний адрес облака. Для посетителей из интернета нужен внешний IP из панели сервера. Свой сертификат не исправляет DNS.

**Ничего удалять из `/opt/master-negotiations` не нужно.** Уже установленный Python используется повторно. Если установка ранее завершилась полностью, используйте `arena update` по [подробной инструкции](INSTALLATION_DETAILS.md#обслуживание).
Сообщение Ubuntu о перезагрузке ядра само по себе не является причиной ошибки DNS.

## Меню управления

```bash
sudo /opt/master-negotiations/arena
```

В меню: адрес админки, состояние, запуск, остановка, перезапуск, проверка, журнал и сертификаты.
Можно сразу вызвать нужное действие:

```bash
sudo /opt/master-negotiations/arena status
sudo /opt/master-negotiations/arena logs
sudo /opt/master-negotiations/arena doctor --speech
```

Если сайт не открылся, сначала выполните `status` и `logs`. Пришлите последние строки ошибки без ключей и паролей.
Резервная копия: `arena backup`. Новый пароль администратора: `arena reset-admin-password` (с тем же полным путём).

## Локальный режим через SSH

Если выбрали пункт 1, на своём ПК откройте туннель (замените порт на показанный мастером):

```bash
ssh -L 8080:127.0.0.1:8080 root@ВНЕШНИЙ_IP
```

Пока SSH открыт, сайт доступен по `http://localhost:8080`. Микрофон на localhost не требует своего сертификата.

## Windows

Откройте PowerShell от имени администратора и выполните:

```powershell
$ErrorActionPreference = 'Stop'
$release = 'https://github.com/MrDary-art/Mirnaya-Mafia/releases/download/install-v2026.09.28.3'
$zip = 'arena-install-v2026.09.28.3.zip'
Invoke-WebRequest -UseBasicParsing "$release/install-windows.ps1" -OutFile "$env:TEMP/arena-install.ps1"
Invoke-WebRequest -UseBasicParsing "$release/$zip.sha256" -OutFile "$env:TEMP/arena-install.sha256"
$sha = ((Get-Content -Raw "$env:TEMP/arena-install.sha256").Trim() -split '\s+')[0]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP/arena-install.ps1" -BundleUrl "$release/$zip" -BundleSha256 $sha
```

Меню после установки: `C:\ProgramData\MasterNegotiations\arena.cmd`.

## Внешний Whisper на NVIDIA GPU

Сначала запустите сайт на публичном HTTPS-домене. На отдельной Ubuntu VM с выделенной GPU проверьте `nvidia-smi`, затем:

```bash
curl -fL https://github.com/MrDary-art/Mirnaya-Mafia/releases/download/install-v2026.09.28.3/install-ubuntu.sh -o arena-install.sh && sudo bash ./arena-install.sh --role whisper-worker --home /opt/arena-whisper
```

Когда мастер запросит код, откройте на сайте **Админка → Настройки → Внешний Whisper → Создать код**. Введите HTTPS-адрес сайта и код в терминале. Дождитесь статуса «Готов к работе». Включите внешний Whisper с локальным запасным распознаванием.

[Подробности, резервные копии и диагностика GPU](INSTALLATION_DETAILS.md#мирэа-подробный-порядок-подключения).

## Границы проверки

Тесты проверяют DNS-ошибки, выбор режима, доверие к сертификату и сохранность настроек. Выпуск настоящего сертификата, доступность портов и GPU проверяются на вашем сервере. Установщик не меняет DNS у регистратора и правила облачного брандмауэра.

[Файлы релиза](https://github.com/MrDary-art/Mirnaya-Mafia/releases/tag/install-v2026.09.28.3) · [Официальная документация HTTPS в Caddy](https://caddyserver.com/docs/automatic-https).
