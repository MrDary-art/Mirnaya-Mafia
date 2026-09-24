const HOME = { presence: 1, x: 3.45, y: 1, scale: 1.08, core: 0.62, state: "watch", perch: "stump", isHome: true };

const ROUTES = [
  [/^\/admin(?:\/|$)/, { presence: 0, x: 5, y: 0, scale: 0.4, core: 0, state: "hidden" }],
  [/^\/room\//, { presence: 0, x: 5, y: 0, scale: 0.4, core: 0, state: "hidden" }],
  [/^\/people(?:\/|$)/, { presence: 0, x: 5, y: 0, scale: 0.4, core: 0, state: "hidden" }],
  [/^\/(?:practice|play)(?:\/|$)/, { presence: 0.28, x: 4.9, y: 1.55, scale: 0.42, core: 0.2, state: "listen" }],
  [/^\/report(?:\/|$)/, { presence: 0.72, x: 4.55, y: 0.7, scale: 0.68, core: 0.42, state: "analyze", perch: "reflection" }],
  [/^\/(?:training|learn|theory)(?:\/|$)/, { presence: 0.8, x: 4.65, y: 0.45, scale: 0.7, core: 0.55, state: "guide", perch: "observatory" }],
  [/^\/(?:ai|setup)(?:\/|$)/, { presence: 0.56, x: 4.2, y: 2.6, scale: 0.43, core: 0.28, state: "focus", perch: "ai" }],
  [/^\/rooms(?:\/|$)/, { presence: 0.68, x: 4.5, y: 0.45, scale: 0.67, core: 0.46, state: "watch", perch: "bridge" }],
  [/^\/(?:scenarios|history)(?:\/|$)/, { presence: 0.72, x: 4.55, y: 0.65, scale: 0.64, core: 0.45, state: "watch", perch: "archive" }],
  [/^\/(?:profile|shop)(?:\/|$)/, { presence: 0.58, x: 4.65, y: 0.65, scale: 0.54, core: 0.32, state: "rest", perch: "vault" }],
];

export function visualForRoute(pathname, width) {
  const route = pathname === "/" ? HOME : ROUTES.find(([pattern]) => pattern.test(pathname))?.[1] || {
    presence: 0.35, x: 4.8, y: 0.7, scale: 0.48, core: 0.2, state: "rest",
  };
  if (width >= 768) return route;
  if (pathname === "/") return { ...route, x: 0.12, y: 2.05, scale: 0.7, core: 0.18 };
  return { ...route, x: 2, y: 1.4, scale: route.scale * 0.48, presence: route.presence * 0.5, core: 0 };
}
