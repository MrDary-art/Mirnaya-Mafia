export type Theme = "system" | "light" | "dark";
export type Personalization = { displayName: string; focus: string };

const themeKey = "arena-theme";
const personalizationKey = (userId: string) => `arena-personalization:${userId}`;

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(themeKey);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch { return "system"; }
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(themeKey, theme);
}

export function readPersonalization(userId: string): Personalization {
  try {
    const saved = JSON.parse(localStorage.getItem(personalizationKey(userId)) ?? "null");
    return {
      displayName: typeof saved?.displayName === "string" ? saved.displayName.slice(0, 40) : "",
      focus: typeof saved?.focus === "string" ? saved.focus : "",
    };
  } catch {
    return { displayName: "", focus: "" };
  }
}

export function savePersonalization(userId: string, value: Personalization) {
  localStorage.setItem(personalizationKey(userId), JSON.stringify(value));
}
