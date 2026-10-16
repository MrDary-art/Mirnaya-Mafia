export const METRIC_LABELS = {
  trust: "Доверие",
  goal: "Цель",
  control: "Инициатива",
  eq: "Внимание к чувствам",
};

export const STAGE_LABELS = {
  calm: "Разговор стабилен",
  tense: "Напряжение растёт",
  critical: "Критическая точка",
  interrupted: "Разговор приостановлен",
};

export const EMOTION_LABELS = {
  neutral: "Сохраняет позицию",
  receptive: "Готов услышать",
  escalated: "Сопротивление усилилось",
};

const EMOTION_ASSETS = new Set(["receptive", "escalated"]);
const BACKGROUND_TILES = { school: 0, home: 1, apartment: 1, cafe: 2, office: 3 };
export function backgroundPosition(background) {
  const tile = BACKGROUND_TILES[background] ?? 0;
  return `${(tile % 2) * 100}% ${Math.floor(tile / 2) * 100}%`;
}

export function characterImage(character, emotion = "neutral") {
  const safe = String(character?.portrait || "").replace(/[^a-z0-9_-]/gi, "");
  const suffix = EMOTION_ASSETS.has(emotion) ? `-${emotion}` : "";
  return safe ? `/assets/game-lab/red-zone/${safe}${suffix}.webp` : "";
}

export function characterImages(character) {
  return ["neutral", "receptive", "escalated"].map((emotion) => characterImage(character, emotion));
}

export function caseAction(item) {
  if (!item?.run) return "Начать кейс";
  if (item.run.status === "completed") return "Посмотреть результат";
  return "Продолжить";
}

export function trainerProgress(completed = 0, total = 0) {
  return total ? Math.round((completed / total) * 100) : 0;
}

export function shortcutFor(index) {
  return index < 9 ? String(index + 1) : "";
}
