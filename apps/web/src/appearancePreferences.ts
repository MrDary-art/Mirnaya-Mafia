export type AppearanceScope = "public" | "workspace";
export type Background = "signature" | "spiral" | "aurora" | "grid" | "plain";
export type Animation = "rotate" | "float" | "still";
export type AppearancePreferences = {
  design: "arena";
  background: Background;
  animation: Animation;
  speed: number;
  opacity: number;
  spiralColor: string;
  accentColor: string;
  iconColor: string;
};

export const defaultAppearance: AppearancePreferences = {
  design: "arena",
  background: "signature",
  animation: "rotate",
  speed: 1,
  opacity: 1,
  spiralColor: "#ff8a32",
  accentColor: "#ff962e",
  iconColor: "#ffb15c",
};
export const appearanceKey = "arena-appearance-v3";
export const appearanceStorageKey = (scope: AppearanceScope) => `${appearanceKey}:${scope}`;
export function defaultForScope(scope: AppearanceScope): AppearancePreferences {
  return scope === "workspace"
    ? { ...defaultAppearance, accentColor: "#ffef46", iconColor: "#e0cc38", spiralColor: "#ffef46" }
    : { ...defaultAppearance };
}
const hex = /^#[0-9a-f]{6}$/i;

export function normalizeAppearance(value: unknown, scope: AppearanceScope = "public"): AppearancePreferences {
  const input = (value && typeof value === "object" ? value : {}) as Partial<AppearancePreferences>;
  const defaults = defaultForScope(scope);
  const color = (v: unknown, fallback: string) => typeof v === "string" && hex.test(v) ? v : fallback;
  const number = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    design: "arena",
    background: ["signature", "spiral", "aurora", "grid", "plain"].includes(input.background ?? "") ? input.background! : defaults.background,
    animation: ["rotate", "float", "still"].includes(input.animation ?? "") ? input.animation! : defaultAppearance.animation,
    speed: number(input.speed, 0.25, 2, 1),
    opacity: number(input.opacity, 0.1, 1, defaultAppearance.opacity),
    spiralColor: color(input.spiralColor, defaults.spiralColor),
    accentColor: color(input.accentColor, defaults.accentColor),
    iconColor: color(input.iconColor, defaults.iconColor),
  };
}

export function readAppearance(scope: AppearanceScope = "public"): AppearancePreferences {
  // Previous versions stay intact; each part of the combined theme has its own palette.
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(appearanceStorageKey(scope)) ?? "null"), scope); }
  catch { return defaultForScope(scope); }
}

export function readableInk(color: string): string {
  const channels = color.slice(1).match(/../g)!.map(value => {
    const c = parseInt(value, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? "#17231c" : "#ffffff";
}
