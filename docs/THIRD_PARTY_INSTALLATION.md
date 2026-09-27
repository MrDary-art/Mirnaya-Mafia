# Компоненты установочной сборки

Манифесты `install/resources.json` и `install/tools.json` фиксируют версии,
размеры, исходные URL и SHA-256. Python-пакеты зафиксированы с хешами в
`install/requirements.lock` и `install/worker-requirements.lock`.

| Компонент | Источник и уведомления |
|---|---|
| faster-whisper / CTranslate2 | [SYSTRAN](https://github.com/SYSTRAN/faster-whisper), MIT; локальное преобразование речи |
| Whisper | [OpenAI Whisper](https://github.com/openai/whisper); конвертированные модели перечислены в манифесте |
| Piper | [OHF-Voice piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), GPL-3.0-or-later; устанавливается отдельным Python-пакетом |
| Дмитрий | [Карточка голоса](https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/dmitri/medium); MODEL_CARD скачивается вместе с голосом, источник датасета указан в нём |
| uv | [astral-sh/uv](https://github.com/astral-sh/uv); проверенный официальный бинарный архив |
| Caddy | [caddyserver/caddy](https://github.com/caddyserver/caddy); проверенный официальный бинарный архив |
| WinSW | [winsw/winsw](https://github.com/winsw/winsw); запуск службы Windows |
| NVIDIA runtime | Пакеты NVIDIA cuBLAS/cuDNN из PyPI; их лицензионные файлы входят в установленные пакеты. Системный драйвер не устанавливается |

Установочный ZIP содержит код приложения, готовый frontend, установщики и
манифесты. Python-пакеты и модели скачиваются из указанных источников.
Лицензии пакетов сохраняются в `runtime/.../site-packages/*.dist-info/`;
карточки моделей — рядом с весами. Не удаляйте эти уведомления при распространении.
Тестовая запись `worker/smoke.pcm` сгенерирована локально голосом Дмитрия:
«Здравствуйте. Это проверка голоса мастера переговоров».
