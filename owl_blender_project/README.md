# Последняя версия совы — v10

Редактируемая сцена: [`work/owl_rebuild_v10.blend`](work/owl_rebuild_v10.blend) для Blender 5.2.2. В ней сохранены скелет, отдельные маховые перья и пальцы, ключи анимации, упакованные текстуры и скрытая коллекция `_BACKUP_ORIGINAL` с предыдущей версией. Исходные файлы пользователя не перезаписывались.

На главной странице проекта используется [`frontend/public/assets/owl/owl-rebuild-v10-materialfix.glb`](../frontend/public/assets/owl/owl-rebuild-v10-materialfix.glb). Файл сжат Draco; декодер лежит рядом в `frontend/public/assets/owl/draco/`. Статическая замена: [`owl-rebuild-v10-poster.png`](../frontend/public/assets/owl/owl-rebuild-v10-poster.png). Старые GLB оставлены в проекте для сравнения.

Проверочные кадры сайта: [посадка](qa/latest_home_perched.png) и [полёт](qa/latest_home_flight.png). Текущая версия загружается и машет крыльями, но посадка ещё не прошла визуальную приёмку: в браузере когти выглядят приподнятыми над поверхностью пенька. Пользователь остановил дальнейшую доработку и попросил запустить и сохранить текущую версию.

GLB можно заново экспортировать из `.blend` без изменения исходной сцены:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python '.\owl_blender_project\scripts\export_web_glb.py' -- --draco --material-fix
```

Для проверки сайта из `frontend/`: `node scripts/verify-owl-rebuild.mjs`, затем `npm run build`. Проверка требует запущенного Vite на `127.0.0.1:5173` и установленного Chrome. Результаты проверки среды: [`qa/environment_report.md`](qa/environment_report.md).
