export const SERIAL_CATEGORIES = {
  school: "Школа", home: "Семья", friends: "Дружба", first_steps: "Самостоятельность", work: "Работа",
};

export const METRIC_LABELS = { trust: "Доверие", goal: "Цель", control: "Инициатива", eq: "Внимание к чувствам" };

export function storyTheme(story = {}) {
  const id = story.id || "";
  if (id === "after_school") return "school";
  if (id === "first_steps") return "first_steps";
  return SERIAL_CATEGORIES[story.category] ? story.category : SERIAL_CATEGORIES[id] ? id : "school";
}

export function categoryLabel(story) { return SERIAL_CATEGORIES[storyTheme(story)]; }

export function withoutAgeLabel(value = "") {
  return String(value)
    .replace(/(?:,\s*)?\d{1,2}\s*(?:год(?:а)?|лет)(?=\s*[,;.]|\s*$)/giu, "")
    .replace(/\b\d{1,2}\+/gu, "")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;]+|[\s,;]+$/g, "");
}

export function backgroundPosition(background) {
  const tile = { school: 0, stage: 0, home: 1, bedroom: 1, friends: 2, cafe: 2, city: 2, courtyard: 2, chat: 1, work: 3, office: 3 }[background] ?? 0;
  return `${tile % 2 * 100}% ${Math.floor(tile / 2) * 100}%`;
}

export function portraitPosition(index = 0) {
  const safe = Math.max(0, Math.min(23, Number(index) || 0));
  return `${safe % 6 / 5 * 100}% ${Math.floor(safe / 6) / 3 * 100}%`;
}

export function storyBackground(story) {
  return typeof story?.cover === "string" ? story.cover : story?.cover?.background || story?.cover_background || { school: "school", home: "home", friends: "cafe", first_steps: "courtyard", work: "office" }[storyTheme(story)];
}

export function charactersOf(story) {
  const characters = story?.characters || [];
  return Array.isArray(characters) ? characters : Object.entries(characters).map(([id, value]) => ({ id, ...value }));
}

export function characterFor(story, speaker) {
  return charactersOf(story).find((character) => character.id === speaker);
}

export function speakerLabel(story, speaker) {
  if (speaker === "you") return "Вы";
  if (!speaker || speaker === "narrator") return "";
  return characterFor(story, speaker)?.name || speaker;
}

export function mainEpisodes(story) { return (story?.episodes || []).filter((episode) => !isBonus(episode)); }
export function isBonus(episode) { return Boolean(episode?.bonus || episode?.is_bonus || episode?.kind === "bonus" || episode?.type === "bonus"); }
export function latestRun(story) {
  return [...(story?.slots || []).filter(Boolean)].filter((slot) => slot.id).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
}
export function sceneLines(scene) {
  if (Array.isArray(scene?.dialogue) && scene.dialogue.length) return scene.dialogue;
  return scene?.text ? [{ speaker: scene.speaker || "narrator", text: scene.text }] : [{ speaker: "narrator", text: "История продолжается." }];
}
export function sceneHasEnding(scene) { return Boolean(scene?.ending || scene?.type === "ending" || scene?.terminal); }
export function choicePrice(choice) { return choice?.owned ? 0 : Math.max(0, Number(choice?.cost) || 0); }
export function choiceDisabledReason(choice, stars) {
  if (choice.available === false) return choice.locked_reason || "Этот выбор зависит от предыдущих решений.";
  if (choicePrice(choice) > Number(stars || 0)) return `Нужно ещё ${choicePrice(choice) - Number(stars || 0)} ★. Бесплатные варианты доступны ниже.`;
  return "";
}
export function nextEpisode(payload) {
  const current = payload.episodes?.findIndex((episode) => episode.id === payload.run?.episode_id) ?? -1;
  return payload.episodes?.slice(current + 1).find((episode) => !isBonus(episode) && episode.available && !episode.completed);
}

export function shortDate(date) {
  if (!date) return "Сохранено";
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? "Сохранено" : new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(parsed);
}
