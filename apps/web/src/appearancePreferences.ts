export type Design = "aave" | "solflare" | "solana";
export type Background = "signature" | "spiral" | "aurora" | "grid" | "plain";
export type Animation = "rotate" | "float" | "still";
export type AppearancePreferences = {
  design: Design;
  background: Background;
  animation: Animation;
  speed: number;
  opacity: number;
  spiralColor: string;
  accentColor: string;
  iconColor: string;
};

export const designPresets = [
  { id: "aave", name: "Lapa · Aave", description: "Цветная геометрия и воздух", source: "https://www.lapa.ninja/post/aave-2/", mode: "light", accentColor: "#8878fa", iconColor: "#6655c8", spiralColor: "#8878fa" },
  { id: "solflare", name: "Maxi · Solflare", description: "Монохром и электрический жёлтый", source: "https://maxibestof.one/websites/77659-solflare", mode: "light", accentColor: "#ffef46", iconColor: "#898000", spiralColor: "#ffef46" },
  { id: "solana", name: "Webflow · Solana", description: "Жидкий объём, неон и глубокий чёрный", source: "https://webflow.com/made-in-webflow/website/solana-rebuild", mode: "dark", accentColor: "#00e99b", iconColor: "#00a875", spiralColor: "#9945ff" },
] as const;

export const defaultAppearance: AppearancePreferences = {
  design: "aave",
  background: "signature",
  animation: "rotate",
  speed: 1,
  opacity: 1,
  spiralColor: designPresets[0].spiralColor,
  accentColor: designPresets[0].accentColor,
  iconColor: designPresets[0].iconColor,
};
export const appearanceKey = "arena-appearance-v2";
export function appearanceForDesign(design: Design): AppearancePreferences {
  const preset = designPresets.find(item => item.id === design)!;
  return { ...defaultAppearance, design, accentColor: preset.accentColor, iconColor: preset.iconColor, spiralColor: preset.spiralColor };
}
const hex = /^#[0-9a-f]{6}$/i;

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const input = (value && typeof value === "object" ? value : {}) as Partial<AppearancePreferences>;
  const design = designPresets.some(item => item.id === input.design) ? input.design! : defaultAppearance.design;
  const defaults = appearanceForDesign(design);
  const color = (v: unknown, fallback: string) => typeof v === "string" && hex.test(v) ? v : fallback;
  const number = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    design,
    background: ["signature", "spiral", "aurora", "grid", "plain"].includes(input.background ?? "") ? input.background! : defaults.background,
    animation: ["rotate", "float", "still"].includes(input.animation ?? "") ? input.animation! : defaultAppearance.animation,
    speed: number(input.speed, 0.25, 2, 1),
    opacity: number(input.opacity, 0.1, 1, defaultAppearance.opacity),
    spiralColor: color(input.spiralColor, defaults.spiralColor),
    accentColor: color(input.accentColor, defaults.accentColor),
    iconColor: color(input.iconColor, defaults.iconColor),
  };
}

export function readAppearance(): AppearancePreferences {
  // v1 is left intact; the new version opens with the new designs instead of the old spiral.
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(appearanceKey) ?? "null")); }
  catch { return { ...defaultAppearance }; }
}

export function readableInk(color: string): string {
  const channels = color.slice(1).match(/../g)!.map(value => {
    const c = parseInt(value, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? "#17231c" : "#ffffff";
}
