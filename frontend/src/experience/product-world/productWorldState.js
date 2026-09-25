const ROUTES = [
  [/^\/ai\/job$/, "M02"], [/^\/ai$/, "M01"], [/^\/setup$/, "M02"], [/^\/practice$/, "M01"],
  [/^\/scenarios$/, "M04"], [/^\/play\//, "M04"], [/^\/report\//, "M05"],
  [/^\/rooms\/demo$/, "M10"], [/^\/rooms$/, "M03"], [/^\/room\//, "M03"],
  [/^\/training\/path\/attempt\/[^/]+\/review$/, "M05"],
  [/^\/training\/path\/attempt\/[^/]+\/report$/, "M06"],
  [/^\/training\/path\/attempt\//, "M07"],
  [/^\/training\/path\/level\//, "M07"],
  [/^\/training\/path/, "M06"], [/^\/training$/, "M06"],
  [/^\/theory/, "M07"], [/^\/learn/, "M07"], [/^\/training\/errors$/, "M07"],
  [/^\/people\/[^/]+$/, "M08"], [/^\/people$/, "M09"],
  [/^\/profile$/, "M08"], [/^\/shop$/, "M08"], [/^\/history$/, "M05"],
  [/^\/admin$/, "M12"],
];

const HOME = {
  hero: null, ai: "M01", rooms: "M03", scenarios: "M04", learning: "M06",
  history: "M05", friends: "M09", profile: "M08", finale: "M10",
};

export function motifForRoute(pathname, sectionId = "hero") {
  if (pathname === "/") return HOME[sectionId] ?? null;
  return ROUTES.find(([match]) => match.test(pathname))?.[1] ?? "M12";
}

export const PRODUCT_MOTIFS = Object.freeze({
  M01: "Ядро диалога", M02: "Призма контекста", M03: "Парные створки",
  M04: "Досье сценария", M05: "Лента разговора", M06: "Учебная астролябия",
  M07: "Папка знания", M08: "Скульптура профиля", M09: "Связи",
  M10: "Капсула встречи", M11: "Парный итог", M12: "Системный знак",
});
