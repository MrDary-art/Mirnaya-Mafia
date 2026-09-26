const HOME = { presence: 1, x: 3, y: .6, scale: 1.52, core: 0.62, state: "watch", isHome: true };

const ROUTES = [
  [/^\/admin(?:\/|$)/, { presence: 0, x: 5, y: 0, scale: 0.4, core: 0, state: "hidden" }],
  [/^\/room\//, { presence: 0, x: 5, y: 0, scale: 0.4, core: 0, state: "hidden" }],
  [/^\/people(?:\/|$)/, { presence: 0, x: 5, y: 0, scale: 0.4, core: 0, state: "hidden" }],
  [/^\/(?:practice|play)(?:\/|$)/, { presence: 0.28, x: 4.9, y: 1.55, scale: 0.42, core: 0.2, state: "listen" }],
  [/^\/report(?:\/|$)/, { presence: 0.28, x: 4.7, y: 2, scale: 0.42, core: 0.42, state: "flight" }],
  [/^\/(?:training|learn|theory)(?:\/|$)/, { presence: 0.34, x: 4.65, y: 2.1, scale: 0.42, core: 0.55, state: "flight" }],
  [/^\/(?:ai|setup)(?:\/|$)/, { presence: 0.32, x: 4.2, y: 2.6, scale: 0.38, core: 0.28, state: "flight" }],
  [/^\/rooms(?:\/|$)/, { presence: 0.32, x: 4.5, y: 2.2, scale: 0.42, core: 0.46, state: "flight" }],
  [/^\/(?:scenarios|history)(?:\/|$)/, { presence: 0.32, x: 4.55, y: 2.2, scale: 0.4, core: 0.45, state: "flight" }],
  [/^\/(?:profile|shop)(?:\/|$)/, { presence: 0.28, x: 4.65, y: 2.2, scale: 0.4, core: 0.32, state: "flight" }],
];

export function visualForRoute(pathname, width) {
  const route = pathname === "/" ? HOME : ROUTES.find(([pattern]) => pattern.test(pathname))?.[1] || {
    presence: 0.35, x: 4.8, y: 0.7, scale: 0.48, core: 0.2, state: "rest",
  };
  if (width >= 768) return route;
  if (pathname === "/") return { ...route, x: .14, y: 1.45, scale: .88, core: 0.18 };
  return { ...route, x: .85, y: 1.4, scale: Math.max(.44, route.scale * .9), presence: route.presence * .7, core: 0 };
}
