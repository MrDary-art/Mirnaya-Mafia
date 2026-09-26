const rules = [
  [/^\/ai\/demo$/, ["ai-demo", "work", "Демонстрация · ИИ-диалог"]],
  [/^\/ai$/, ["ai", "explore", "Формат · ИИ-диалог"]],
  [/^\/ai\/job$/, ["job", "prepare", "Подготовка · Собеседование"]],
  [/^\/setup$/, ["setup", "prepare", "Подготовка · Переговоры"]],
  [/^\/practice$/, ["practice", "work", "Практика · ИИ-диалог"]],
  [/^\/scenarios$/, ["scenarios", "explore", "Библиотека · Сценарии"]],
  [/^\/scenarios\/demo$/, ["scenarios-demo", "work", "Демонстрация · Сценарии"]],
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
  [/^\/training\/demo$/, ["training-demo", "work", "Демонстрация · Обучение"]],
  [/^\/theory\/[^/]+$/, ["lesson", "work", "Знания · Урок"]],
  [/^\/theory$/, ["theory", "explore", "Знания · Теория"]],
  [/^\/learn\/[^/]+\/errors$/, ["legacy-errors", "work", "Знания · Ошибки"]],
  [/^\/learn\/[^/]+$/, ["legacy-program", "work", "Знания · Программа"]],
  [/^\/learn$/, ["legacy", "explore", "Знания · Программы"]],
  [/^\/training\/errors$/, ["training-errors", "work", "Обучение · Ошибки"]],
  [/^\/people\/[^/]+$/, ["public-profile", "reflect", "Сообщество · Профиль"]],
  [/^\/people$/, ["people", "work", "Сообщество · Сообщения"]],
  [/^\/company$/, ["company", "work", "Компания · Пространство"]],
  [/^\/analytics$/, ["analytics", "reflect", "Личное · Аналитика"]],
  [/^\/profile\/edit$/, ["profile-edit", "reflect", "Личное · Оформление"]],
  [/^\/profile$/, ["profile", "reflect", "Личное · Профиль"]],
  [/^\/shop\/collection$/, ["profile-edit", "reflect", "Личное · Оформление"]],
  [/^\/shop$/, ["shop", "explore", "Личное · Магазин"]],
  [/^\/history$/, ["history", "work", "Личное · История"]],
  [/^\/admin$/, ["admin", "work", "Система · Управление"]],
];

export function pageForRoute(pathname) {
  const [, meta] = rules.find(([pattern]) => pattern.test(pathname)) || [];
  const [id, profile, label] = meta || ["unknown", "reflect", "Система · Навигация"];
  return { id, profile, label };
}

const backRoutes = [
  [/^\/ai\/demo$/, { to: "/ai", label: "к ИИ-диалогу" }],
  [/^\/scenarios\/demo$/, { to: "/scenarios", label: "к сценариям" }],
  [/^\/training\/demo$/, { to: "/training", label: "к обучению" }],
  [/^\/report\/[^/]+\/ideal-dialogue$/, (path) => ({ to: path.replace(/\/ideal-dialogue$/, ""), label: "к отчёту" })],
  [/^\/report\//, { to: "/history", label: "к истории" }],
  [/^\/play\//, { to: "/scenarios", label: "к сценариям" }],
  [/^\/room\//, { to: "/rooms", label: "к встречам" }],
  [/^\/rooms\/demo$/, { to: "/rooms", label: "к встречам" }],
  [/^\/people\//, { to: "/people", label: "к друзьям" }],
  [/^\/theory\//, { to: "/theory", label: "к урокам" }],
  [/^\/learn\/[^/]+\/errors$/, (path) => ({ to: path.replace(/\/errors$/, ""), label: "к программе" })],
  [/^\/learn\//, { to: "/learn", label: "к программам" }],
  [/^\/training\/path\/chapter\/[^/]+\/summary$/, (path) => ({ to: path.replace(/\/summary$/, ""), label: "к главе" })],
  [/^\/training\/path\/attempt\/[^/]+\/review$/, (path) => ({ to: path.replace(/\/review$/, "/report"), label: "к результату" })],
  [/^\/training\/path\//, { to: "/training/path", label: "к программе" }],
  [/^\/training\/path$/, { to: "/training", label: "к обучению" }],
  [/^\/training\//, { to: "/training", label: "к обучению" }],
  [/^\/theory$/, { to: "/training", label: "к обучению" }],
  [/^\/ai\/job$/, { to: "/ai", label: "к ИИ-диалогу" }],
  [/^\/rooms$/, { to: "/app#rooms", label: "на главную" }],
  [/^\/scenarios$/, { to: "/app#scenarios", label: "на главную" }],
  [/^\/people$/, { to: "/app#friends", label: "на главную" }],
  [/^\/profile\/edit$/, { to: "/profile", label: "к профилю" }],
  [/^\/profile$/, { to: "/app#profile", label: "на главную" }],
  [/^\/shop\/collection$/, { to: "/shop", label: "к магазину" }],
  [/^\/history$/, { to: "/app#history", label: "на главную" }],
  [/^\/ai$/, { to: "/app#ai", label: "на главную" }],
  [/^\/training$/, { to: "/app#learning", label: "на главную" }],
];

export function backTargetForRoute(pathname) {
  const [, target] = backRoutes.find(([pattern]) => pattern.test(pathname)) || [];
  return typeof target === "function" ? target(pathname) : target || { to: "/app", label: "на главную" };
}
