export const managerNavigation = [
  ["overview", "Обзор", "layout-grid", "Рабочее пространство"],
  ["news", "Лента компании", "message-circle", "Рабочее пространство"],
  ["structure", "Структура", "route", "Рабочее пространство", "manage_team"],
  ["employees", "Сотрудники", "users", "Рабочее пространство", "manage_team"],
  ["cohorts", "Команды", "users", "Рабочее пространство", "manage_team"],
  ["assignments", "Задания", "check-check", "Развитие", "manage_team"],
  ["scenarios", "Сценарии", "message-circle", "Развитие", "manage_learning"],
  ["program-builder", "Программы обучения", "book-open", "Развитие", "manage_learning"],
  ["practice", "Практика с ИИ", "sparkles", "Развитие"],
  ["results", "Мои результаты", "history", "Результаты"],
  ["learning", "Моё обучение", "book-open", "Развитие"],
  ["meetings", "Встречи 1×1", "users", "Совместная практика"],
  ["tournaments", "Турниры", "trophy", "Совместная практика"],
  ["goals", "Командные цели", "target", "Совместная практика"],
  ["ratings", "Рейтинги", "trophy", "Результаты"],
  ["analytics", "Аналитика", "history", "Результаты", "view_analytics"],
  ["certificates", "Сертификаты", "graduation-cap", "Результаты"],
  ["achievements", "Достижения", "star", "Результаты"],
  ["surveys", "Опросы", "message-circle", "Результаты"],
  ["library", "Библиотека", "book-open", "Материалы"],
  ["calendar", "Календарь", "calendar-days", "Материалы"],
  ["notifications", "Уведомления", "bell", "Материалы"],
  ["applications", "Заявки", "users", "Управление", "manage_company"],
  ["settings", "Настройки", "info", "Управление", "manage_company"],
  ["policies", "Правила и аудит", "shield-check", "Управление", "manage_company"],
  ["integrations", "Интеграции", "zap", "Управление", "manage_company"],
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
  ["profile", "Профиль", "circle-user-round", "Моё пространство"],
];
export function navigationFor(data) {
  const items = data.permissions.manage_team ? managerNavigation : employeeNavigation;
  return items.filter((item) => !item[4] || data.permissions[item[4]]);
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
