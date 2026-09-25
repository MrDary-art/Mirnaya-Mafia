# Asset register

| Семейство | Файлы | Происхождение и статус |
| --- | --- | --- |
| Пейзажи | `frontend/assets/forest2d-source/{hero,ai,rooms,scenarios,learning,history,friends,profile}.png`; экспорт `frontend/public/assets/forest2d/*.webp` | Существующие отдельные сцены v6, 1672×941 desktop плюс mobile crop. Не единый master v8; композиция и свет не согласованы для полного day/night. |
| Небесные окна | `sky-mask-{scene}.png`, `sky-mask-{scene}-mobile.png` | Прототип, **не загружается в runtime** после отключения смены суток. Ручная чистка краёв ещё нужна. |
| Облака | `frontend/assets/living-v8-source/sky-cloud-far.png`, `sky-cloud-near.png`; WebP в `public/assets/forest2d` | Прототип, **не загружается в runtime**. Сгенерированные прозрачные bitmap-слои; экспорт `frontend/scripts/export-living-clouds.py`. |
| Сова и пенёк | `frontend/public/assets/owl/*.glb` | Унаследованные защищённые модели, не менялись в v8. |
| Лёгкая сова | `frontend/public/assets/owl-rig-static-{desktop,mobile}.webp` | Статичные прозрачные кадры из существующего 3D-рига; ~27 KB/~11 KB. Показываются только когда аппаратный WebGL непригоден либо рендер устойчиво слишком медленный. Модель/риг не менялись. |

Маски: PNG с alpha; облака: WebP с alpha. Геометрия локальных эффектов живёт в `sceneDefinitions.js`, но пока недостаточно точна для финальной воды/веток. Источником прав на исходные v6-постеры остаётся существующий проект; новый cloud raster создан инструментом OpenAI ImageGen по описаниям «distant soft cloud bank, transparent background» и «wispy foreground atmospheric clouds, transparent background» в стиле текущих иллюстраций. Нейтральный тестовый вариант Hero отвергнут: 1672×941 и несовпадение скал/деревьев с масками.
