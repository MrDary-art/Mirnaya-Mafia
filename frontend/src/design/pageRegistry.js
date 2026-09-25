const rules = [
  [/^\/ai$/, ["ai", "explore", "Формат · ИИ-диалог"]],
  [/^\/ai\/job$/, ["job", "prepare", "Подготовка · Собеседование"]],
  [/^\/setup$/, ["setup", "prepare", "Подготовка · Переговоры"]],
  [/^\/practice$/, ["practice", "work", "Практика · ИИ-диалог"]],
  [/^\/scenarios$/, ["scenarios", "explore", "Библиотека · Сценарии"]],
  [/^\/play\//, ["play", "work", "Практика · Сценарий"]],
  [/^\/report\//, ["report", "reflect", "Разбор · Переговоры"]],
  [/^\/rooms\/demo$/, ["demo", "work", "Демонстрация · 1×1"]],
  [/^\/rooms$/, ["rooms", "explore", "Формат · 1×1"]],
  [/^\/room\//, ["room", "work", "Встреча · 1×1"]],
  [/^\/training\/path\/attempt\/[^/]+\/review$/, ["path-review", "reflect", "Обучение · Разбор"]],
  [/^\/training\/path\/attempt\/[^/]+\/report$/, ["path-report", "reflect", "Обучение · Результат"]],
  [/^\/training\/path\/attempt\//, ["path-attempt", "work", "Обучение · Упражнение"]],
  [/^\/training\/path\/chapter\/[^/]+\/summary$/, ["chapter-summary", "reflect", "Обучение · Глава"]],
  [/^\/training\/path\/chapter\//, ["chapter", "explore", "Обучение · Глава"]],
  [/^\/training\/path\/level\//, ["level", "prepare", "Обучение · Брифинг"]],
  [/^\/training\/path$/, ["path", "explore", "Обучение · Программа"]],
  [/^\/training$/, ["training", "explore", "Обучение · Практика"]],
  [/^\/theory\/[^/]+$/, ["lesson", "work", "Знания · Урок"]],
  [/^\/theory$/, ["theory", "explore", "Знания · Теория"]],
  [/^\/learn\/[^/]+\/errors$/, ["legacy-errors", "work", "Знания · Ошибки"]],
  [/^\/learn\/[^/]+$/, ["legacy-program", "work", "Знания · Программа"]],
  [/^\/learn$/, ["legacy", "explore", "Знания · Программы"]],
  [/^\/training\/errors$/, ["training-errors", "work", "Обучение · Ошибки"]],
  [/^\/people\/[^/]+$/, ["public-profile", "reflect", "Сообщество · Профиль"]],
  [/^\/people$/, ["people", "work", "Сообщество · Сообщения"]],
  [/^\/profile$/, ["profile", "reflect", "Личное · Профиль"]],
  [/^\/shop$/, ["shop", "explore", "Личное · Коллекция"]],
  [/^\/history$/, ["history", "work", "Личное · История"]],
  [/^\/admin$/, ["admin", "work", "Система · Управление"]],
];

export function pageForRoute(pathname) {
  const [, meta] = rules.find(([pattern]) => pattern.test(pathname)) || [];
  const [id, profile, label] = meta || ["unknown", "reflect", "Система · Навигация"];
  return { id, profile, label };
}
