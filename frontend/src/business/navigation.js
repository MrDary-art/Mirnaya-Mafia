// The business product has one calm information architecture for every member.
// Permissions change actions inside a section, never the employee's wayfinding.
export const primaryNavigation = [
  ["overview", "Главная", "layout-grid", "Рабочее пространство"],
  ["episodes", "Рабочие ситуации", "target", "Рабочее пространство"],
  ["learning", "Практика", "book-open", "Развитие"],
  ["meetings", "Встречи", "message-circle", "Рабочее пространство"],
  ["team", "Команда", "users", "Рабочее пространство"],
  ["community", "Сообщество", "message-circle", "Рабочее пространство"],
  ["analytics", "Аналитика", "brain", "Развитие"],
  ["calendar", "Календарь", "calendar-days", "Рабочее пространство"],
];

export const sectionAliases = {
  teams: "team", structure: "team", employees: "team", cohorts: "team", applications: "team", directory: "team",
  news: "community", messenger: "community", surveys: "community", notifications: "community", activities: "calendar",
  assignments: "learning", scenarios: "learning", content: "learning", library: "learning", programs: "learning",
  "program-builder": "learning", practice: "learning", goals: "learning",
  growth: "profile", results: "analytics", ratings: "analytics", achievements: "analytics", tournaments: "analytics",
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
  if (!data?.has_company) return [];
  // Every colleague keeps the same map of the product.  The Analytics screen
  // becomes personal results for an employee; management data remains gated
  // inside the screen by the existing capabilities.
  return primaryNavigation;
}

export function secondaryNavigationFor() {
  return [];
}

export function canAccessBusinessSection(data, section) {
  const canonical = canonicalBusinessSection(section);
  if (["profile", "me"].includes(canonical)) return Boolean(data?.has_company);
  if (canonical === "settings") return isCompanyAdmin(data) || Boolean(data?.permissions?.manage_learning);
  return navigationFor(data).some(([key]) => key === canonical);
}

export function businessSectionLabel(data, section) {
  const canonical = canonicalBusinessSection(section);
  if (canonical === "settings" && canAccessBusinessSection(data, "settings")) return "Настройки";
  if (canonical === "profile") return "Личный кабинет";
  return navigationFor(data).find(([key]) => key === canonical)?.[1] || null;
}

export function businessPath(companyId, section = "overview") {
  return `/business/${companyId}/${canonicalBusinessSection(section)}`;
}

// Keep the back action inside the chosen company, including on direct links.
export function businessBackTarget(companyId, pathname) {
  const base = `/business/${companyId}`;
  const overview = businessPath(companyId);
  if (pathname === base || pathname === overview) return "/business/workspaces?choose=1";
  if (!pathname.startsWith(`${base}/`)) return overview;
  const section = pathname.slice(base.length + 1);
  if (section.startsWith("learning/serials/play/")) return businessPath(companyId, "learning/serials");
  if (section.startsWith("learning/scenarios/") || section.startsWith("learning/ai/") || section.startsWith("learning/rooms/")) {
    return businessPath(companyId, section.split("/").slice(0, 2).join("/"));
  }
  if (section.startsWith("learning/")) return businessPath(companyId, "learning");
  if (section === "council" || section.startsWith("council/")) return businessPath(companyId, "meetings");
  if (["play/", "dialogue/", "report/", "room/"].some(prefix => section.startsWith(prefix))) return businessPath(companyId, "learning");
  return overview;
}

export function businessPracticePath(companyId, mode, suffix = "") {
  const base = `${businessPath(companyId, "learning")}/${mode}`;
  const normalizedSuffix = String(suffix || "").replace(/^\/+/, "");
  return normalizedSuffix ? `${base}/${normalizedSuffix}` : base;
}

export function safeBusinessNext(value, fallback = "/business/workspaces") {
  if (typeof value !== "string" || !value.startsWith("/business/") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  const path = value.split("?")[0];
  return ["/business/login", "/business/register"].includes(path) ? fallback : value;
}
