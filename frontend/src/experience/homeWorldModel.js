export const HOME_SECTIONS = [
  { id: "hero", route: "/", label: "Главная", title: "Не каждый сложный разговор нужно проходить впервые." },
  { id: "ai", route: "/ai", label: "ИИ-диалог", title: "Разговор, к которому можно подготовиться." },
  { id: "rooms", route: "/rooms", label: "1×1", title: "Два человека. Один честный разговор." },
  { id: "scenarios", route: "/scenarios", label: "Сценарии", title: "Проверьте решение до того, как оно станет реальным." },
  { id: "learning", route: "/training", label: "Обучение", title: "Навык растёт, когда теория встречается с практикой." },
  { id: "history", route: "/history", label: "История", title: "Каждый разговор оставляет след." },
  { id: "friends", route: "/people", label: "Друзья", title: "Переговоры соединяют людей." },
  { id: "profile", route: "/profile", label: "Профиль", title: "Ваш путь становится видимым." },
  { id: "finale", route: "/", label: "Продолжить", title: "Следующий разговор начинается с вас." },
];

const DESKTOP_PATH = [
  { x: 3.0, y: .6, z: 0, scale: 1.52 },
  { x: 2.5, y: .9, z: -.4, scale: .76 },
  { x: -.7, y: -2.25, z: -.8, scale: .73 },
  { x: -2.7, y: .75, z: -.3, scale: .79 },
  { x: 2.5, y: 1.5, z: -1.2, scale: .68 },
  { x: 2.8, y: -.65, z: -.6, scale: .72 },
  { x: -2.4, y: 1.7, z: -2, scale: .48 },
  { x: 2.55, y: 1.0, z: -.35, scale: .76 },
  { x: -.6, y: 1.55, z: -1, scale: .64 },
];
const MOBILE_PATH = [
  { x: .14, y: 1.45, z: 0, scale: .88 },
  { x: .75, y: 1.45, z: -.4, scale: .42 },
  { x: -.65, y: 1.4, z: -.6, scale: .4 },
  { x: -.76, y: 1.4, z: -.4, scale: .43 },
  { x: .7, y: 1.48, z: -.8, scale: .38 },
  { x: .72, y: 1.42, z: -.5, scale: .4 },
  { x: -.65, y: 1.52, z: -1.6, scale: .3 },
  { x: .72, y: 1.48, z: -.35, scale: .42 },
  { x: 0, y: 1.45, z: -.8, scale: .38 },
];

export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function sectionIdFromHash(hash) {
  const id = decodeURIComponent((hash || "").replace(/^#/, ""));
  return HOME_SECTIONS.some((section) => section.id === id) ? id : "hero";
}

export function travelDuration(distance, reducedMotion = false) {
  if (reducedMotion) return 0;
  return Math.min(980, distance <= 1 ? 620 : distance === 2 ? 780 : 880 + (distance - 3) * 22);
}

export function speedClass(pixelsPerSecond, jump = false) {
  if (jump) return "jump";
  if (pixelsPerSecond > 1700) return "fast";
  if (pixelsPerSecond > 320) return "normal";
  return "slow";
}

export function worldTarget(position, width, direction = 1) {
  const path = width < 768 ? MOBILE_PATH : DESKTOP_PATH;
  const index = Math.min(path.length - 1, Math.max(0, Math.floor(position)));
  const next = Math.min(path.length - 1, index + 1);
  const t = smoothstep((position - index - .08) / .84);
  const from = path[index];
  const to = path[next];
  const mix = (key) => from[key] + (to[key] - from[key]) * t;
  // Reverse travel uses a different lateral arc, not the forward path backwards.
  const arc = Math.sin(Math.PI * t) * (direction < 0 ? -.52 : .38);
  return { x: mix("x") + arc, y: mix("y") + Math.sin(Math.PI * t) * .32,
    z: mix("z"), scale: mix("scale"), index, sectionId: HOME_SECTIONS[index].id };
}

export function worldPosition(scrollY, sectionOffsets, viewportHeight) {
  if (!sectionOffsets.length) return 0;
  const probe = scrollY + viewportHeight * .36;
  let index = 0;
  while (index + 1 < sectionOffsets.length && sectionOffsets[index + 1] <= probe) index += 1;
  const start = sectionOffsets[index];
  const end = sectionOffsets[index + 1] ?? start + viewportHeight * 1.2;
  return index + clamp01((probe - start) / Math.max(1, end - start));
}
