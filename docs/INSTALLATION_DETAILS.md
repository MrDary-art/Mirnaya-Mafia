# Подробности установки и обслуживания

Начните с [короткой инструкции](INSTALLATION.md). [Работающий сайт](https://24projects.ru/) доступен без установки.

## Архитектура

Основной сервер хранит пользователей и отчёты, отдаёт сайт и API, озвучивает ответы голосом Дмитрия и держит локальный Whisper Tiny как резерв. Браузерное распознавание обычных голосовых сообщений использует Web Speech API браузера. Для встречи 1×1 записи поступают в серверную очередь распознавания.

Внешний worker на отдельной машине с NVIDIA GPU запрашивает задания у основного сайта по HTTPS и возвращает текст. Он не слушает входящий порт и не получает базу или ключ GigaChat. Режимы в админке: локальный, автоматический с локальным резервом, только внешний. Для Windows GPU нужны CUDA 12 и cuDNN 9, доступные службе worker; для Ubuntu установщик ставит Python-библиотеки CUDA, но системный драйвер NVIDIA должен быть готов заранее.

## Версии и ресурсы

Поддерживаемые версии установщика: Ubuntu **22.04, 24.04, 26.04 LTS x86-64** и Windows **10 22H2/11 x64**. Для сайта нужны минимум 2 ГБ RAM и 8 ГБ свободного места. Для внешнего worker потребуется NVIDIA GPU и место под модель large-v3-turbo (около 1,6 ГБ), окружение и запас для обновлений. На одном CPU сайте одновременные голосовые задания могут ждать в очереди.

Старый опубликованный релиз `install-v2026.09.28.3` не содержит расширенной поддержки Ubuntu 26.04 и Windows worker. Используйте комплект, собранный из текущего `main`, по [README](../README.md#сборка-своего-комплекта-из-текущего-main), либо более новый опубликованный релиз.

## Как работает мастер

1. Проверяет ОС, права, диск и существующие службы. Существующую установку не затирает.
2. Сверяет SHA-256 архива и каждый файл внутри него.
3. Устанавливает отдельный Python 3.12 и зафиксированные зависимости сайта. Для Windows worker прямые зависимости определены в `worker-requirements.in`; CUDA/cuDNN предоставляются системой.
4. Сайт: спрашивает адрес, создаёт учётную запись администратора, ставит Tiny, Piper и службы API/Caddy. Демо-пароль для публичной установки не создаётся.
5. Worker: просит выбрать GPU, адрес сайта и одноразовый код, ставит large-v3-turbo, запускает проверку реальной речи и службу.

Пароли и ключи вводятся в мастере, не в аргументах команд. Базы, модели и секреты не попадают в Git.

## HTTPS

Для домена установщик использует Caddy. A-запись должна указывать на публичный IP основного сервера; TCP 80/443 доступны извне. Проверка: `getent ahosts ВАШ-ДОМЕН` и открытие `https://ВАШ-ДОМЕН/` с другого устройства.

Доступ по IP возможен с внутренним тестовым сертификатом, которому браузер доверяет только после установки корневого сертификата на каждое устройство. Отключать проверку HTTPS нельзя. Для внешнего worker используйте домен с публичным сертификатом.

## Проверка сайта

Ubuntu:

```bash
sudo /opt/master-negotiations/arena status
sudo /opt/master-negotiations/arena doctor --speech
sudo /opt/master-negotiations/arena logs
```

Windows:

```powershell
C:\ProgramData\MasterNegotiations\arena.cmd status
C:\ProgramData\MasterNegotiations\arena.cmd doctor --speech
C:\ProgramData\MasterNegotiations\arena.cmd logs
```

Откройте главную страницу, зарегистрируйте тестового пользователя, затем `/admin` под администратором. В админке проверьте настройки ИИ, доступность Tiny/Piper и внешний worker. Браузерный голосовой ввод зависит от поддержки Web Speech API, разрешения микрофона и доступности службы браузера; без неё остаётся текстовый ввод. Проверка реального микрофона нужна в вашем браузере.

## Проверка внешнего worker

Ubuntu: `sudo /opt/arena-whisper/arena-worker doctor`, `status`, `logs`.

Windows: `C:\ProgramData\MasterNegotiationsWorker\arena-worker.cmd doctor`, `status`, `logs`.

Worker считается готовым только после загрузки модели и расшифровки тестовой записи на выбранной GPU. Проверьте статус в админке и одну настоящую встречу 1×1. Для Windows эти действия нужно выполнить на компьютере с NVIDIA GPU; локальный тест без GPU не подтверждает работу CUDA.

## Резервные копии и обновление

Перед обновлением сделайте `arena backup`. Команда `arena update --bundle ПУТЬ_К_АРХИВУ --sha256 SHA256` проверяет архив и миграции. Резервная копия содержит секреты; храните её с ограниченным доступом. Не удаляйте `data`, `private` и `backups`, если нужна история пользователей.

Для устранения ошибки сначала смотрите `status` и `logs`. Не публикуйте файлы `.env`, `private`, резервные копии и токен внешнего worker.

## Удаление на Windows

Для Ubuntu команды приведены в [README](../README.md#как-удалить-с-сервера). Ниже — Windows PowerShell **от имени администратора** и стандартные папки нашего установщика. Удаление стирает данные и резервные копии внутри папки; нужную копию заранее сохраните в другом месте.

Сначала проверьте пути служб:

```powershell
Get-CimInstance Win32_Service | Where-Object { $_.Name -in @('arena-api','arena-web','arena-whisper-worker') } | Select-Object Name, State, PathName
```

Для сайта оба пути должны вести в `C:\ProgramData\MasterNegotiations\services`. После проверки выполните:

```powershell
$ErrorActionPreference = 'Stop'
$arenaInstallPath = 'C:\ProgramData\MasterNegotiations'
if ((Resolve-Path -LiteralPath $arenaInstallPath).Path -ne $arenaInstallPath) { throw 'Проверьте путь установки' }
foreach ($serviceName in @('arena-api','arena-web')) {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) {
        Stop-Service -Name $serviceName -ErrorAction Stop
        & "$arenaInstallPath\services\$serviceName.exe" uninstall
        if ($LASTEXITCODE -ne 0) { throw "Не удалось удалить службу $serviceName" }
    }
}
Remove-Item -LiteralPath $arenaInstallPath -Recurse -Force
```

Для внешнего Whisper сначала переключите сайт на локальную модель и отзовите подключение worker в админке. На машине worker проверьте, что путь службы ведёт в `C:\ProgramData\MasterNegotiationsWorker\services`, затем выполните:

```powershell
$ErrorActionPreference = 'Stop'
$arenaWorkerPath = 'C:\ProgramData\MasterNegotiationsWorker'
if ((Resolve-Path -LiteralPath $arenaWorkerPath).Path -ne $arenaWorkerPath) { throw 'Проверьте путь установки' }
if (Get-Service -Name 'arena-whisper-worker' -ErrorAction SilentlyContinue) {
    Stop-Service -Name 'arena-whisper-worker' -ErrorAction Stop
    & "$arenaWorkerPath\services\arena-whisper-worker.exe" uninstall
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось удалить службу worker' }
}
Remove-Item -LiteralPath $arenaWorkerPath -Recurse -Force
```

Драйвер NVIDIA и CUDA не удаляются. Если вы задавали свой `-InstallDir`, используйте фактическую папку после проверки пути службы. При установке сайта в папку с кириллицей отдельный временный каталог Piper указан в `PIPER_TEMP_DIR` файла `private/arena.env`: до удаления установки запишите этот путь и затем удалите только соответствующую подпапку `ArenaSpeechCache`, если она больше не используется.
