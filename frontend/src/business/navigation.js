// The business product has one calm information architecture for every member.
// Permissions change actions inside a section, never the employee's wayfinding.
export const primaryNavigation = [
  ["overview", "Главная", "layout-grid", "Рабочее пространство"],
  ["learning", "Обучение", "book-open", "Развитие"],
  ["team", "Команда", "users", "Рабочее пространство"],
  ["community", "Сообщество", "message-circle", "Общение"],
  ["meetings", "Встречи", "calendar-days", "Общение"],
  ["profile", "Профиль", "circle-user-round", "Развитие"],
];

export const sectionAliases = {
  teams: "team", structure: "team", employees: "team", cohorts: "team", applications: "team", directory: "team",
  news: "community", messenger: "community", surveys: "community", notifications: "community", activities: "meetings",
  assignments: "learning", scenarios: "learning", content: "learning", library: "learning", programs: "learning",
  "program-builder": "learning", practice: "learning", goals: "learning", onboarding: "overview", calendar: "overview",
  growth: "profile", results: "profile", analytics: "profile", ratings: "profile", achievements: "profile", tournaments: "profile",
  certificates: "profile", privacy: "profile",
  policies: "settings", access: "settings", integrations: "settings",
};

export function canonicalBusinessSection(section = "overview") {
  return sectionAliases[section] || section;
}

export function isCompanyAdmin(data) {
  return Boolean(data?.permissions?.manage_company);
}

export function navigationFor(data) {
  return data?.has_company ? primaryNavigation : [];
}

export function secondaryNavigationFor() {
  return [];
}

export function canAccessBusinessSection(data, section) {
  const canonical = canonicalBusinessSection(section);
  if (["profile", "me"].includes(canonical)) return Boolean(data?.has_company);
  if (canonical === "settings") return isCompanyAdmin(data);
  return navigationFor(data).some(([key]) => key === canonical);
}

export function businessSectionLabel(data, section) {
  const canonical = canonicalBusinessSection(section);
  if (canonical === "settings" && isCompanyAdmin(data)) return "Настройки";
  if (canonical === "profile") return "Личный кабинет";
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
