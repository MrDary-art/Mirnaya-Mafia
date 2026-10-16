export const managerNavigation = [
  ["overview", "Обзор", "layout-grid", "Рабочее пространство"],
  ["news", "Лента компании", "message-circle", "Рабочее пространство"],
  ["structure", "Структура", "route", "Рабочее пространство", "manage_team"],
  ["employees", "Сотрудники", "users", "Рабочее пространство", "manage_team"],
  ["cohorts", "Команды", "users", "Рабочее пространство", "manage_team"],
  ["assignments", "Задания", "check-check", "Развитие", "manage_assignments"],
  ["scenarios", "Сценарии", "message-circle", "Развитие", "manage_learning"],
  ["program-builder", "Программы обучения", "book-open", "Развитие", "manage_learning"],
  ["practice", "Практика с ИИ", "sparkles", "Развитие"],
  ["results", "Мои результаты", "history", "Результаты"],
  ["learning", "Моё обучение", "book-open", "Развитие"],
  ["meetings", "Встречи 1×1", "users", "Совместная практика"],
  ["tournaments", "Турниры", "trophy", "Совместная практика"],
  ["goals", "Командные цели", "target", "Совместная практика"],
  ["ratings", "Рейтинги", "trophy", "Результаты"],
  ["privacy", "Архив и профиль", "shield-check", "Результаты"],
  ["messenger", "Мессенджер", "message-circle", "Рабочее пространство"],
  ["analytics", "Аналитика", "history", "Результаты", "view_analytics"],
  ["certificates", "Сертификаты", "graduation-cap", "Результаты"],
  ["achievements", "Достижения", "star", "Результаты"],
  ["surveys", "Опросы", "message-circle", "Результаты"],
  ["library", "Библиотека", "book-open", "Материалы"],
  ["calendar", "Календарь", "calendar-days", "Материалы"],
  ["notifications", "Уведомления", "bell", "Материалы"],
  ["applications", "Заявки", "users", "Управление", "manage_company"],
  ["access", "Доступ и лицензии", "shield-check", "Управление", "manage_company"],
  ["settings", "Настройки", "info", "Управление", "manage_company"],
  ["policies", "Правила и аудит", "shield-check", "Управление", "manage_company"],
  ["integrations", "Интеграции", "zap", "Управление", "manage_company"],
  ["growth", "Автоматизация и лиги", "trophy", "Управление", "manage_learning"],
];
export const employeeNavigation = [
  ["overview", "Моя главная", "house", "Моё пространство"],
  ["news", "Лента компании", "message-circle", "Моё пространство"],
  ["assignments", "Мои задания", "check-check", "Моё пространство"],
  ["practice", "Практика", "sparkles", "Моё пространство"],
  ["directory", "Команда", "users", "Моё пространство"],
  ["results", "Мой прогресс", "history", "Моё пространство"],
  ["learning", "Обучение", "book-open", "Моё пространство"],
  ["certificates", "Сертификаты", "graduation-cap", "Моё пространство"],
  ["calendar", "Календарь", "calendar-days", "Моё пространство"],
  ["notifications", "Уведомления", "bell", "Моё пространство"],
  ["privacy", "Архив и профиль", "shield-check", "Моё пространство"],
  ["messenger", "Мессенджер", "message-circle", "Моё пространство"],
  ["profile", "Профиль", "circle-user-round", "Моё пространство"],
];

// The employee sidebar intentionally stays compact. These routes preserve the
// capabilities that were available in the established /company workspace and
// surface them as contextual tabs inside the relevant primary section.
export const employeeSecondaryNavigation = {
  progress: [
    ["results", "Мой прогресс"],
    ["ratings", "Рейтинг"],
    ["achievements", "Достижения"],
  ],
  team: [
    ["directory", "Сотрудники"],
    ["meetings", "Встречи 1×1"],
    ["tournaments", "Турниры"],
    ["goals", "Цели команды"],
  ],
  learning: [
    ["learning", "Обучение"],
    ["surveys", "Опросы"],
  ],
};

export function navigationFor(data) {
  const items = data.permissions.manage_team || data.permissions.view_analytics ? managerNavigation : employeeNavigation;
  return items.filter((item) => !item[4] || data.permissions[item[4]]);
}

export function secondaryNavigationFor(data, section) {
  if (data.permissions.manage_team) return [];
  return Object.values(employeeSecondaryNavigation).find((items) => items.some(([key]) => key === section)) || [];
}

export function canAccessBusinessSection(data, section) {
  if (navigationFor(data).some(([key]) => key === section)) return true;
  return secondaryNavigationFor(data, section).some(([key]) => key === section);
}

export function businessSectionLabel(data, section) {
  return navigationFor(data).find(([key]) => key === section)?.[1]
    || secondaryNavigationFor(data, section).find(([key]) => key === section)?.[1]
    || null;
}
export const sectionAliases = { teams: "structure", content: "scenarios", activities: "meetings", programs: "program-builder" };
export function businessPath(companyId, section = "overview") {
  return `/business/${companyId}/${sectionAliases[section] || section}`;
}
export function safeBusinessNext(value, fallback = "/business/workspaces") {
  if (typeof value !== "string" || !value.startsWith("/business/") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  const path = value.split("?")[0];
  return ["/business/login", "/business/register"].includes(path) ? fallback : value;
}
