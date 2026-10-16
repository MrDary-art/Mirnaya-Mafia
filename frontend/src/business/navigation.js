// The corporate workspace is a management tool. Employees use the main Arena
// application; this navigation intentionally exposes only the workflows an
// administrator needs to run learning for a team.
export const managerNavigation = [
  ["overview", "Обзор", "layout-grid", "Рабочее пространство"],
  ["team", "Команда", "users", "Рабочее пространство", "manage_team"],
  ["assignments", "Назначения", "check-check", "Практика", "manage_assignments"],
  ["results", "Результаты компании", "history", "Практика", "view_analytics"],
  ["news", "Сообщество", "message-circle", "Коммуникация"],
  ["meetings", "Встречи 1×1", "users", "Коммуникация"],
  ["settings", "Настройки", "shield-check", "Управление", "manage_company"],
];

// Previous URLs remain safe bookmarks. They are redirected to the new place
// where the workflow lives instead of exposing duplicate navigation items.
export const sectionAliases = {
  teams: "team", structure: "team", employees: "team", cohorts: "team", applications: "team", directory: "team",
  scenarios: "assignments", content: "assignments", library: "assignments", programs: "assignments", "program-builder": "assignments", learning: "assignments", practice: "assignments", goals: "assignments",
  analytics: "results", ratings: "results", certificates: "results", achievements: "results", tournaments: "results", privacy: "results",
  surveys: "news", messenger: "news", notifications: "news", calendar: "overview",
  policies: "settings", access: "settings", integrations: "settings", growth: "settings", profile: "settings",
  activities: "meetings", onboarding: "overview",
};

export function canonicalBusinessSection(section = "overview") {
  return sectionAliases[section] || section;
}

export function isCompanyAdmin(data) {
  // The corporate application is intentionally separate from personal Arena.
  // Granular learning permissions remain data permissions; only an assigned
  // company administrator opens this management workspace.
  return Boolean(data?.permissions?.manage_company);
}

export function navigationFor(data) {
  if (!isCompanyAdmin(data)) return [];
  return managerNavigation.filter((item) => !item[4] || data.permissions?.[item[4]]);
}

export function secondaryNavigationFor() {
  return [];
}

export function canAccessBusinessSection(data, section) {
  const canonical = canonicalBusinessSection(section);
  return navigationFor(data).some(([key]) => key === canonical);
}

export function businessSectionLabel(data, section) {
  const canonical = canonicalBusinessSection(section);
  return navigationFor(data).find(([key]) => key === canonical)?.[1] || null;
}

export function businessPath(companyId, section = "overview") {
  return `/business/${companyId}/${canonicalBusinessSection(section)}`;
}

export function safeBusinessNext(value, fallback = "/business/workspaces") {
  if (typeof value !== "string" || !value.startsWith("/business/") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  const path = value.split("?")[0];
  return ["/business/login", "/business/register"].includes(path) ? fallback : value;
}
