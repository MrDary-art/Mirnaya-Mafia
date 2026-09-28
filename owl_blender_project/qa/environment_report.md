# Проверка среды — 28 сентября 2026

- ОС: Microsoft Windows 10.0.26200 (вывод RuntimeInformation ОС).
- Рабочая папка: `C:\Users\mrdar\OneDrive\Рабочий стол\Mirnaya-Mafia`; отдельный проект: `owl_blender_project/`.
- Установленный Blender: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, версия 5.2.2 LTS, подтверждена запуском `--version` и ответом живого MCP.
- `uvx`: команда не найдена в PATH; проверенные стандартные пути `C:\Users\mrdar\.local\bin\uvx.exe` и `C:\Users\mrdar\AppData\Local\Programs\uv\uvx.exe` отсутствуют. Для текущей работы `uvx` не требуется, поскольку MCP уже подключён.
- `game-dev`: команда не найдена в PATH; нормализация и сборка пакета через этот CLI не выполнялись.
- MCP for Blender: аддон 1.7, протокол 11, статус `up_to_date: true`; связь подтверждена `get_scene_info`, `get_viewport_screenshot` и чтением через `execute_blender_code`. Safe Mode включён (это подтверждено отклонением попытки прочитать `bpy.app.binary_path`); согласие на телеметрию выключено.
- Открытая сцена до работы: `Scene`, объекты `Cube` (mesh), `Light`, `Camera`; файл был несохранён. Перед импортом сохранена копия `work/open_scene_before_owl.blend`.
- В `owl_blender_start.zip` только `START_IN_CODEX_RU.txt` и `mcp_config.example.toml`; моделей в архиве нет.
- Источник Meshy: отдельный GLB в Downloads, 59 641 624 байта. Копия `work/original_meshy_working.glb`; SHA-256 обоих: `38BB04EB817C99F90992090D8F6BD1DE427FA62682C53CCE93DDF6963713DFD0`.
- v4: `frontend/public/assets/owl/owl-v4.glb`, 22 682 628 байт. Копия `work/owl_v4_reference.glb`; SHA-256 обоих: `15E1A769D71593E988168F5B5FAAFF507E584DDE99AC3DA8F61BEB3B2FFADBC6`.

Никакие программы, дополнения и пользовательские настройки не устанавливались и не менялись. Исходные GLB не перезаписывались. На момент первоначального аудита файлы сайта не изменялись; позже пользователь отдельно разрешил интеграцию совы на сайт.

## Продолжение: новая голова и корпус

Пересборка, проверка вершин по всем кадрам и рендеры выполнены фоновыми
процессами этого же установленного Blender 5.2.2 LTS. Открытая пользовательская
сцена при фоновой работе не заменялась. Встроенный кодек FFmpeg доступен через
Blender; установка отдельного конвертера для видео не требуется.

На этом этапе результатом был `work/owl_animation_refined.blend`; последняя редактируемая версия — `work/owl_rebuild_v10.blend`.
Текстуры созданы встроенным image_gen и сохранены в `work/`; происхождение
и точные prompts записаны в `qa/texture_provenance.md`. Текстуры упакованы в последнюю сцену. Внешние ключи или
новые сервисные подключения для этого не настраивались.
