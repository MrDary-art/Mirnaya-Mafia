import { communityHref, communitySection } from "../components/social/communityNavigation.js";

const rules = [
  [/^\/registration\/company-request$/, ["company-request", "prepare", "Компания · Заявка отправлена"]],
  [/^\/lab\/echo\/play\//, ["lab-echo-player", "work", "Игровая лаборатория · Эхо"]],
  [/^\/lab\/echo$/, ["lab-echo", "explore", "Игровая лаборатория · Эхо"]],
  [/^\/lab\/red-zone\/play\//, ["lab-player", "work", "Игровая лаборатория · Красная зона"]],
  [/^\/lab\/red-zone$/, ["lab-red-zone", "explore", "Игровая лаборатория · Красная зона"]],
  [/^\/lab$/, ["lab", "explore", "Игровая лаборатория"]],
  [/^\/serials\/play\//, ["serial-player", "work", "Игровая лаборатория · После слов · Ваша история"]],
  [/^\/serials\/[^/]+$/, ["serial-story", "prepare", "Игровая лаборатория · После слов · Сезон"]],
  [/^\/serials$/, ["serials", "explore", "Игровая лаборатория · После слов"]],
  [/^\/feed\/post\/[^/]+$/, ["post", "work", "Сообщество · Публикация"]],
  [/^\/feed\/notifications$/, ["social-notifications", "work", "Сообщество · Уведомления"]],
  [/^\/feed$/, ["feed", "explore", "Сообщество"]],
  [/^\/saved$/, ["saved", "reflect", "Сообщество · Сохранённое"]],
  [/^\/collections\/[^/]+$/, ["collection", "explore", "Сообщество · Подборка"]],
  [/^\/collections$/, ["collections", "explore", "Сообщество · Подборки"]],
  [/^\/stories\/new$/, ["story-studio", "work", "Истории · Создание"]],
  [/^\/stories\/[^/]+\/edit$/, ["story-edit", "work", "Истории · Редактор"]],
  [/^\/stories(?:\/[^/]+)?$/, ["stories", "explore", "Сообщество · Истории"]],
  [/^\/ai\/demo$/, ["ai-demo", "work", "Демонстрация · ИИ-диалог"]],
  [/^\/ai\/prepare$/, ["ai-prepare", "prepare", "Подготовка · ИИ-диалог"]],
  [/^\/ai\/guide$/, ["ai-guide", "work", "Обзор · ИИ-диалог"]],
  [/^\/ai$/, ["ai", "explore", "Формат · ИИ-диалог"]],
  [/^\/setup$/, ["setup", "prepare", "Подготовка · Переговоры"]],
  [/^\/practice$/, ["practice", "work", "Практика · ИИ-диалог"]],
  [/^\/scenarios$/, ["scenarios", "explore", "Сценарии"]],
  [/^\/scenarios\/demo$/, ["scenarios-demo", "work", "Демонстрация · Сценарии"]],
  [/^\/play\//, ["play", "work", "Практика · Сценарий"]],
  [/^\/report\//, ["report", "reflect", "Разбор · Переговоры"]],
  [/^\/rooms\/demo$/, ["demo", "work", "Демонстрация · 1×1"]],
  [/^\/rooms$/, ["rooms", "explore", "Формат · 1×1"]],
  [/^\/council\/[^/]+$/, ["council-meeting", "work", "Совет решений · Встреча"]],
  [/^\/council$/, ["council", "explore", "Формат · Совет решений"]],
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
  [/^\/business(?:\/.*)?$/, ["business", "work", "Арена бизнеса"]],
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
  [/^\/lab\/echo\/play\//, { to: "/lab/echo", label: "к траектории" }],
  [/^\/lab\/echo$/, { to: "/lab", label: "к лаборатории" }],
  [/^\/lab\/red-zone\/play\//, { to: "/lab/red-zone", label: "к кейсам" }],
  [/^\/lab\/red-zone$/, { to: "/lab", label: "к лаборатории" }],
  [/^\/lab$/, { to: "/app", label: "на главную" }],
  [/^\/serials\/play\//, { to: "/serials", label: "к историям" }],
  [/^\/serials\/[^/]+$/, { to: "/serials", label: "к историям" }],
  [/^\/serials$/, { to: "/app", label: "на главную" }],
  [/^\/feed\//, { to: "/feed", label: "к сообществу" }],
  [/^\/collections\//, { to: "/collections", label: "к подборкам" }],
  [/^\/(?:feed|saved|collections)$/, { to: "/app", label: "на главную" }],
  [/^\/stories\//, { to: "/stories", label: "к историям" }],
  [/^\/stories$/, { to: "/app", label: "на главную" }],
  [/^\/ai\/demo$/, { to: "/ai/prepare", label: "к настройке разговора" }],
  [/^\/ai\/prepare$/, { to: "/app", label: "к практике" }],
  [/^\/ai\/guide$/, { to: "/ai/prepare", label: "к настройке разговора" }],
  [/^\/practice$/, (_path, search) => {
    const sessionId = new URLSearchParams(search).get("session");
    return { to: sessionId ? `/ai/prepare?retry=${encodeURIComponent(sessionId)}` : "/ai/prepare", label: "к настройке разговора" };
  }],
  [/^\/setup$/, (_path, search) => new URLSearchParams(search).get("mode") === "online"
    ? { to: "/app", label: "к практике" }
    : { to: "/scenarios", label: "к сценариям" }],
  [/^\/scenarios\/demo$/, { to: "/scenarios", label: "к сценариям" }],
  [/^\/training\/demo$/, { to: "/training", label: "к обучению" }],
  [/^\/report\/[^/]+\/ideal-dialogue$/, (path) => ({ to: path.replace(/\/ideal-dialogue$/, ""), label: "к отчёту" })],
  [/^\/report\//, { to: "/scenarios", label: "к сценариям" }],
  [/^\/play\//, { to: "/scenarios", label: "к сценариям" }],
  [/^\/room\//, { to: "/rooms", label: "к встречам" }],
  [/^\/council\/[^/]+$/, { to: "/council", label: "к совету решений" }],
  [/^\/council$/, { to: "/app", label: "на главную" }],
  [/^\/rooms\/demo$/, { to: "/rooms", label: "к встречам" }],
  [/^\/people\//, { to: "/feed?section=friends", label: "к друзьям" }],
  [/^\/theory\//, { to: "/theory", label: "к урокам" }],
  [/^\/learn\/[^/]+\/errors$/, (path) => ({ to: path.replace(/\/errors$/, ""), label: "к программе" })],
  [/^\/learn\//, { to: "/learn", label: "к программам" }],
  [/^\/learn$/, { to: "/training", label: "к обучению" }],
  [/^\/training\/path\/chapter\/[^/]+\/summary$/, (path) => ({ to: path.replace(/\/summary$/, ""), label: "к главе" })],
  [/^\/training\/path\/attempt\/[^/]+\/review$/, (path) => ({ to: path.replace(/\/review$/, "/report"), label: "к результату" })],
  [/^\/training\/path\//, { to: "/training/path", label: "к программе" }],
  [/^\/training\/path$/, { to: "/training", label: "к обучению" }],
  [/^\/training\//, { to: "/training", label: "к обучению" }],
  [/^\/theory$/, { to: "/training", label: "к обучению" }],
  [/^\/rooms$/, { to: "/app#rooms", label: "на главную" }],
  [/^\/scenarios$/, { to: "/app#scenarios", label: "на главную" }],
  [/^\/people$/, { to: "/app", label: "на главную" }],
  [/^\/profile\/edit$/, { to: "/profile", label: "к профилю" }],
  [/^\/profile$/, { to: "/app", label: "на главную" }],
  [/^\/shop$/, { to: "/profile", label: "к профилю" }],
  [/^\/shop\/collection$/, { to: "/shop", label: "к магазину" }],
  [/^\/history$/, { to: "/app", label: "на главную" }],
  [/^\/ai$/, { to: "/app#ai", label: "на главную" }],
  [/^\/training$/, { to: "/app#learning", label: "на главную" }],
];

export function backTargetForRoute(pathname, search = "") {
  if (pathname === "/feed" || pathname === "/profile") {
    const section = communitySection(search);
    if (section === "messages" && new URLSearchParams(search).has("chat")) return { to: communityHref("messages", { base: pathname, search }), label: "к сообщениям" };
    if (section !== "posts") return { to: communityHref("posts", { base: pathname, search }), label: pathname === "/profile" ? "к стене профиля" : "к публикациям" };
  }
  const [, target] = backRoutes.find(([pattern]) => pattern.test(pathname)) || [];
  return typeof target === "function" ? target(pathname, search) : target || { to: "/app", label: "на главную" };
}
