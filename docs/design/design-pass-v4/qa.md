# QA и передача PRODUCT DESIGN PASS v4

Дата: 25.09.2026. Рабочая ветка `feature/arena-visual-redesign`; исходный HEAD `2e944772d74b31d93e2990290295f1769599b7e7`. До работы были изменены `frontend/dist/index.html` и неотслеживаемые `data/arena-v2.db{,-shm,-wal}`; их не очищали. Серверы проверки: frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8001`. Демо-аккаунт `demo` использовался только для локальной QA. Browser — установленный Chrome с `--use-angle=swiftshader`, то есть software render; результаты нельзя выдавать за FPS ноутбука пользователя.

## Что реально прошло

| Проверка | Результат |
|---|---|
| `node scripts/verify-owl-lock-v4.mjs` | 33 защищённых пути; 32 без изменений; только разрешённый renderer bridge `ExperienceCanvas.jsx` отличается; неожиданных изменений 0 |
| `node --test src/experience/routeVisuals.test.mjs src/experience/owl/*.test.mjs src/experience/product-world/productWorldState.test.mjs` | 24/24 теста |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 68 passed, 1 существующее предупреждение Starlette/httpx после timezone-теста и теста Windows Piper |
| `npm.cmd run build -- --outDir <уникальный %TEMP%/arena-v4-build-…>` | Успешно, `frontend/dist` не перезаписан; warning: app chunk 992.72 kB и Three chunk 746.95 kB > 500 kB |
| `node scripts/capture-route-matrix-v4.mjs` | 17 верхнеуровневых route-состояний × desktop/mobile = 34 снимка; `pageerror=[]`, document overflow=0 для всех |
| `node scripts/verify-design-pass-v4.mjs` | Реальный login error/retry → AI → Setup → scenario detail → offline play → report → правильный retry → 404; 14 снимков, 5 фаз T03, ошибок JS нет, mobile overflow=0 |
| `node scripts/verify-learning-v4.mjs` | Глава → 4 серверных ответа/feedback → report → review; оба новых экрана scrollY=0; JS errors нет |
| `node scripts/verify-room-booking-v4.mjs` | После установки `tzdata` реальная бронь по календарю, подтверждённый код, clipboard и переход в лобби; JS errors нет |
| `node scripts/verify-social-v4.mjs` | Два локальных пользователя: регистрация, заявка в друзья, принятие, сообщение туда/обратно, приглашение, принятие, human lobby; JS errors нет |
| `node scripts/verify-room-lifecycle-v4.mjs` | Immediate duel через реальный API (календарь UI даёт только 09:00–22:00), далее UI preview/join→готовность двоих→active→feedback→processing→finished; командный результат и `data-room-team-complete=true` |
| `node scripts/verify-extended-v4.mjs` | Отдельный QA-пользователь: профиль сохранён и пережил reload; инъецированный HTTP 500 показал inline error; 4 категории магазина и реальная ошибка недостатка звёзд; live practice start→текст→offline fallback→report. Контраст 3 chat bubbles проверен по computed style; JS errors нет |
| `node scripts/verify-admin-v4.mjs` | Admin account: 15 контекстов, реальный PUT неизменённой конфигурации и success, затем инъецированный HTTP 500 и закрытие inline error; JS errors нет |
| `node scripts/capture-dynamic-v4.mjs` | Theory intro, chapter, attempt, все 6 шагов room demo, admin forbidden, People search, dev gallery; 15 снимков и видео, JS errors нет; gallery Escape закрывает окно. `/demo/turn`, `/demo/analyze`, две `/demo/speak` вернули 200 |
| `node scripts/verify-navigation-v4.mjs` | Home вниз/вверх, rail→AI top=0, прямой `/#learning` top=0, POP вернул Home section top=0, Forward `/training` scrollY=0; off/reduced-live/context-loss fallback сработали; 320 px для setup/rooms/scenarios/shop/people без overflow; JS errors нет |
| `node scripts/verify-product-fallback-v4.mjs` | off, reduced и no-WebGL показали статичный PNG и доступный DOM |
| `node scripts/verify-product-world-resources-v4.mjs` | После 20 смен мотивов счётчик geometries не рос линейно (4–12); после dispose=0. Это только счётчик тестового world, не точная GPU-память всего приложения |
| `git diff --check` | Код 0, только предупреждения Git о LF→CRLF в текущем Windows worktree |

Последняя production-сборка: `%TEMP%/arena-v4-build-20260925-final2`. Никакого commit, push или deploy не сделано.

## Браузерные артефакты

- До изменений: [baseline](baseline/), после: [34 desktop/mobile route-снимка](route-matrix/) и [вложенные состояния](dynamic-states/).
- Ключевые экраны: [Home](route-matrix/home-desktop.png), [Setup mobile](route-matrix/setup-mobile.png), [Rooms mobile](route-matrix/rooms-mobile.png), [созданная комната](qa-browser/room-created.png), [active duel](qa-browser/room-duel-active.png), [feedback](qa-browser/room-feedback.png), [командный результат M11](qa-browser/room-duel-result.png), [социальное приглашение](qa-browser/social-invite-dialog.png), [профиль сохранён](qa-browser/profile-saved.png), [магазин: ошибка покупки](qa-browser/shop-purchase-error.png), [live practice](qa-browser/practice-after-turn.png), [Theory lesson](dynamic-states/theory-lesson-intro.png), [Learning feedback](qa-browser/learning-answer-feedback.png), [Report](qa-browser/report-summary.png), [Admin forbidden](dynamic-states/admin-access.png).
- Переход T03: [0%](qa-browser/t03-ai-setup-0.png), [25%](qa-browser/t03-ai-setup-25.png), [50%](qa-browser/t03-ai-setup-50.png), [75%](qa-browser/t03-ai-setup-75.png), [100%](qa-browser/t03-ai-setup-100.png).
- Видео: [сквозной сценарий и T03](qa-browser/videos/v4-core-flow-final.webm), [учебный flow](qa-browser/videos/v4-learning-flow-final.webm), [Home/Back-Forward/fallback](qa-browser/videos/v4-navigation-and-fallback.webm), [бронь/код/лобби](qa-browser/videos/v4-room-booking.webm), [двухпользовательская комната](qa-browser/videos/v4-room-lifecycle.webm), [друзья/чат/приглашение](qa-browser/videos/v4-social-flow.webm), [все шаги демо](qa-browser/videos/v4-dynamic-demo-flow.webm), [профиль/магазин/практика](qa-browser/videos/v4-extended-forms.webm), [admin save/error](qa-browser/videos/v4-admin-settings.webm).
- Особые состояния: [ошибка входа](qa-browser/login-error.png), [исходный диагностический сбой брони до tzdata](qa-browser/room-booking-environment-error.png), [no WebGL](qa-browser/shop-no-webgl.png), [reduced motion](qa-browser/theory-reduced-mobile.png), [context lost](qa-browser/shop-context-lost.png), [dev gallery error](dynamic-states/design-gallery-error.png) и [dialog](dynamic-states/design-gallery-dialog.png).

## Открытые проблемы и ограничения

1. **ТЗ не завершено полностью.** [coverage.md](coverage.md) отмечает непроверенные live/legacy маршруты; [motion-registry.md](motion-registry.md) — частичные/отсутствующие T03–T20. Пять фаз и видео есть только у T03; этого недостаточно для заявленной визуальной приёмки всех transition families.
2. **Timezone и Windows Piper-блокеры устранены, но media-ветка не завершена.** По разрешению пользователя `tzdata>=2026.4` добавлена в backend requirements и локальное venv. Piper/eSpeak падал в нативном коде при запуске из пути с кириллицей; `backend/app/voice.py` переносит только данные eSpeak во временный ASCII-путь. Синтез и два реальных `/demo/speak` проверены с кодом 200. Бронь, live duel и социальный human lobby доказаны. Камера/микрофон/WebRTC, запись и human active→report пока не пройдены. В duel не отправлялись AI-реплики; проверена смена фаз и отчёт без реплик, не качество online AI.
3. **Остаются непроверенные системные ветки.** Admin account/save/error проверены, но не правка каждого scenario override и разный тип серверной ошибки. В `/practice` доказаны start, текстовый turn и report, но не voice/cancel/долгий scrollback/network failure. Profile save доказан; error проверен через инъекцию HTTP 500, не через реальный сбой backend. В магазине доказан отказ за нехваткой звёзд, но не успешная покупка/equip. Микрофон в демо не проверен (его текстовый путь 1–6 и голосовой ответ Piper проверены). Социальный чат с длинной историей/scrollback не проверен; проверен один реальный обмен и принятие приглашения.
4. **Новые предметы пока не финальный 3D art pass.** Это 12 процедурных объектов с экспортированными PNG; 1716–6040 tris/предмет вместо стартового ориентира 15–50k. Отдельных low/high LOD и полноценной предметной хореографии нет. Не скрывать низкую детализацию за числом созданных файлов.
5. **Производительность и доступность проверены частично.** Frame-time distribution, transfer-size delta vs baseline, long tasks, layout shifts, 20 переходов полного приложения, actual-client hardware FPS, 200% zoom, mobile keyboard, быстрые повторные клики, hidden-tab timer и все keyboard flows не измерены. Software Chrome не является аппаратной приёмкой.
6. **Условия осмотра:** nested dialogs и старые live-страницы частично унаследовали старый layout; возможны визуальные расхождения вне снятых кадров. Production build предупреждает о крупных chunks. Этот результат нельзя назвать «идеальным» или полностью соответствующим v4 без оставшейся QA и постановки motion.

## Следующее действие для продолжения

Пройти human media с двумя устройствами/аккаунтами, затем каждую `G`-строку coverage, реализовать отсутствующие переходы по motion-registry, проверить 320/390/desktop/200% zoom и клавиатуру, измерить frame-time на целевом устройстве. Перед любой дальнейшей правкой совы повторить owl-lock; сейчас сову изменять не требуется.
