export const FOREST_ARTBOARD = Object.freeze({ width: 1672, height: 941 });

const mobileFocal = {
  hero: .73, ai: .70, rooms: .52, scenarios: .36,
  learning: .65, history: .66, friends: .34, profile: .59,
};

const water = (polygon, flow = [.25, .08]) => ({ polygon, flow });

const definitions = {
  hero: {
    label: "Поляна у верхнего ручья",
    water: water([[.55, .55], [.73, .51], [.79, .58], [.71, .68], [.86, .93], [.85, 1], [.50, 1], [.50, .78], [.53, .65]], [.32, .12]),
    droplet: { source: [.54, .20], target: [.54, .68], interval: 27 },
    branch: { left: "28%", top: "2%", width: "38%", transformOrigin: "0% 0%" },
    quietZones: [[.04, .15, .52, .58]], owlProtectedZone: [.59, .20, .37, .65],
    nextSceneId: "ai",
  },
  ai: {
    label: "Тихий плёс у источника",
    water: water([[.50, .48], [1, .49], [1, 1], [.20, 1], [.37, .67]], [.19, .04]),
    branch: { left: "52%", top: "0%", width: "48%", transformOrigin: "0% 0%" },
    quietZones: [[.04, .18, .47, .64]], nextSceneId: "rooms",
  },
  rooms: {
    label: "Слияние двух ручьёв",
    water: water([[.16, .52], [.36, .49], [.52, .58], [.70, .47], [.86, .49], [1, .72], [1, 1], [0, 1], [0, .70]], [.13, .18]),
    quietZones: [[.30, .14, .40, .42]], nextSceneId: "scenarios",
  },
  scenarios: {
    label: "Скальный каскад",
    water: water([[.31, .62], [.54, .62], [.72, .68], [1, .72], [1, 1], [.12, 1], [.19, .72]], [.30, .08]),
    waterfall: { polygon: [[.31, .28], [.45, .29], [.46, .60], [.40, .65], [.30, .61], [.27, .52]], source: [.36, .29], impact: [.37, .63] },
    quietZones: [[.58, .15, .38, .63]], nextSceneId: "learning",
  },
  learning: {
    label: "Террасы на лесном берегу",
    water: water([[.16, .52], [.48, .51], [.65, .62], [.58, .80], [.74, 1], [0, 1], [0, .70]], [.27, .10]),
    branch: { left: "55%", top: "-1%", width: "38%", transformOrigin: "0% 0%" },
    quietZones: [[.27, .10, .46, .47]], nextSceneId: "history",
  },
  history: {
    label: "Излучина реки",
    water: water([[.69, .47], [.82, .49], [.79, .68], [.98, .83], [1, 1], [.34, 1], [.36, .68], [.56, .55]], [.25, .09]),
    quietZones: [[.04, .15, .44, .60]], nextSceneId: "friends",
  },
  friends: {
    label: "Прибрежная поляна",
    water: water([[.15, .49], [.57, .52], [.65, .70], [.61, 1], [0, 1], [0, .63]], [.17, .03]),
    branch: { left: "51%", top: "-2%", width: "42%", transformOrigin: "0% 0%" },
    quietZones: [[.57, .14, .38, .60]], nextSceneId: "profile",
  },
  profile: {
    label: "Зеркальная заводь",
    water: water([[.39, .52], [.92, .51], [1, .60], [1, 1], [.18, 1], [.17, .69], [.30, .57]], [.07, .01]),
    quietZones: [[.04, .14, .43, .60]], nextSceneId: "finale",
  },
  finale: {
    label: "Тихое завершение маршрута",
    posterId: "profile", water: water([[.39, .52], [.92, .51], [1, .60], [1, 1], [.18, 1], [.17, .69], [.30, .57]], [.04, .01]),
    quietZones: [[.22, .15, .58, .56]], nextSceneId: null,
  },
};

const mobileWidth = Math.round(FOREST_ARTBOARD.height * .66);

export const FOREST_SCENES = Object.freeze(Object.fromEntries(
  Object.entries(definitions).map(([id, scene]) => {
    const posterId = scene.posterId || id;
    const left = Math.max(0, Math.min(
      FOREST_ARTBOARD.width - mobileWidth,
      Math.round(FOREST_ARTBOARD.width * mobileFocal[posterId]) - Math.floor(mobileWidth / 2),
    ));
    return [id, Object.freeze({
      id, ...scene, artboard: FOREST_ARTBOARD,
      poster: `/assets/forest2d/${posterId}.webp`,
      mobilePoster: `/assets/forest2d/${posterId}-mobile.webp`,
      skyMask: `/assets/forest2d/sky-mask-${posterId}.png`,
      mobileSkyMask: `/assets/forest2d/sky-mask-${posterId}-mobile.png`,
      waterNetworkId: "arena-river-01",
      mobileCrop: { left, top: 0, width: mobileWidth, height: FOREST_ARTBOARD.height },
      modes: ["full", "calm", "static"],
    })];
  }),
));

export const FOREST_ORDER = Object.freeze(Object.keys(FOREST_SCENES));

export function sceneForRoute(pathname) {
  if (pathname === "/") return FOREST_SCENES.hero;
  if (/^\/(?:ai|setup|practice)(?:\/|$)/.test(pathname)) return FOREST_SCENES.ai;
  if (/^\/(?:rooms|room)(?:\/|$)/.test(pathname)) return FOREST_SCENES.rooms;
  if (/^\/(?:scenarios|play)(?:\/|$)/.test(pathname)) return FOREST_SCENES.scenarios;
  if (/^\/(?:training|theory|learn)(?:\/|$)/.test(pathname)) return FOREST_SCENES.learning;
  if (/^\/history(?:\/|$)/.test(pathname)) return FOREST_SCENES.history;
  if (/^\/people(?:\/|$)/.test(pathname)) return FOREST_SCENES.friends;
  if (/^\/(?:profile|report|shop|analytics|admin)(?:\/|$)/.test(pathname)) return FOREST_SCENES.profile;
  return FOREST_SCENES.hero;
}

export function isFocusedRoute(pathname) {
  return /^\/(?:practice|play|room|theory|admin)(?:\/|$)/.test(pathname)
    || /^\/training\/(?:path\/(?:attempt|level)|errors)(?:\/|$)/.test(pathname)
    || /^\/ai\/job(?:\/|$)/.test(pathname)
    || /^\/learn\/.+/.test(pathname)
    || (pathname !== "/" && !/^\/(?:ai|setup|scenarios|report|rooms|training|learn|history|analytics|shop|profile|people)(?:\/|$)/.test(pathname));
}
