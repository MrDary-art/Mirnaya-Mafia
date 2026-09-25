import { useEffect, useState } from "react";
import { findForestCity } from "./cityCatalog.js";
import { hardwareHints, hasUsableWebGL, isLowPower, shouldUseStaticOwl } from "./performanceTier.js";

export const FOREST_MOTION_KEY = "arena_forest_effects";
export const FOREST_SETTINGS_KEY = "arena_forest_environment_v8";
export const FOREST_MOTION_OPTIONS = [
  ["full", "Живой фон"], ["calm", "Спокойный фон"], ["static", "Без анимации"],
];
export const FOREST_QUALITY_OPTIONS = [
  ["auto", "Авто"], ["high", "Высокая"], ["ultra", "Максимальная"], ["economy", "Экономная"],
];
export const FOREST_PHASE_OPTIONS = [
  ["dawn", "Рассвет"], ["day", "День"], ["sunset", "Закат"], ["night", "Ночь"],
];
const motionValues = new Set(FOREST_MOTION_OPTIONS.map(([value]) => value));
const qualityValues = new Set(FOREST_QUALITY_OPTIONS.map(([value]) => value));
const phaseValues = new Set(FOREST_PHASE_OPTIONS.map(([value]) => value));
let memoryPreferences = null;

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function defaults() {
  const hints = hardwareHints();
  const weak = isLowPower(hints);
  const veryWeak = shouldUseStaticOwl(hints) || !hasUsableWebGL();
  return { schemaVersion: 8, timeMode: "device-clock", cityId: null, manualPhase: "day",
    motion: reducedMotion() || veryWeak ? "static" : weak ? "calm" : "full",
    quality: weak || veryWeak ? "economy" : "auto", explicitPerformance: false };
}

export function normalizeEnvironmentPreferences(raw, fallback = defaults()) {
  const city = findForestCity(raw?.cityId);
  const timeMode = raw?.timeMode === "manual" ? "manual"
    : raw?.timeMode === "solar-location" ? "solar-location" : "device-clock";
  return {
    schemaVersion: 8, timeMode, cityId: city?.id || null,
    manualPhase: phaseValues.has(raw?.manualPhase) ? raw.manualPhase : fallback.manualPhase,
    motion: motionValues.has(raw?.motion) ? raw.motion : fallback.motion,
    quality: qualityValues.has(raw?.quality) ? raw.quality : fallback.quality,
    explicitPerformance: raw?.explicitPerformance === true,
  };
}

function legacyMotion() {
  try {
    const mode = window.localStorage.getItem(FOREST_MOTION_KEY);
    if (motionValues.has(mode)) return mode;
    const legacy = window.localStorage.getItem("arena_product_effects");
    if (legacy === "off") return "static";
    if (legacy === "calm") return "calm";
  } catch { /* The in-memory fallback still works. */ }
  return null;
}

export function readEnvironmentPreferences() {
  if (memoryPreferences) return memoryPreferences;
  const base = defaults();
  try {
    const stored = window.localStorage.getItem(FOREST_SETTINGS_KEY);
    if (stored) {
      const saved = normalizeEnvironmentPreferences(JSON.parse(stored), base);
      return saved.explicitPerformance ? saved : { ...saved, motion: base.motion, quality: base.quality };
    }
  } catch { /* Corrupt or blocked storage: use safe defaults. */ }
  const legacy = legacyMotion();
  return normalizeEnvironmentPreferences({ motion: legacy === "static" || legacy === "calm" ? legacy : base.motion }, base);
}

export function saveEnvironmentPreferences(patch) {
  memoryPreferences = normalizeEnvironmentPreferences({ ...readEnvironmentPreferences(), ...patch,
    explicitPerformance: readEnvironmentPreferences().explicitPerformance || "motion" in patch || "quality" in patch });
  try { window.localStorage.setItem(FOREST_SETTINGS_KEY, JSON.stringify(memoryPreferences)); } catch { /* Keep this tab usable. */ }
  window.dispatchEvent(new CustomEvent("arena:forest-preferences", { detail: memoryPreferences }));
  return memoryPreferences;
}

export function useEnvironmentPreferences() {
  const [preferences, setPreferences] = useState(readEnvironmentPreferences);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event) => {
      if (event?.type === "storage") memoryPreferences = null;
      setPreferences(readEnvironmentPreferences());
    };
    const onMotionChange = () => {
      const next = readEnvironmentPreferences();
      setPreferences(query.matches ? { ...next, motion: "static" } : next);
    };
    query.addEventListener?.("change", onMotionChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("arena:forest-preferences", onChange);
    return () => {
      query.removeEventListener?.("change", onMotionChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("arena:forest-preferences", onChange);
    };
  }, []);
  return [preferences, saveEnvironmentPreferences];
}

// Preserve the v6 public frontend contract for Login and existing tests.
export function readForestMotionMode() { return readEnvironmentPreferences().motion; }
export function saveForestMotionMode(motion) {
  if (motionValues.has(motion)) saveEnvironmentPreferences({ motion });
}
export function useForestMotionMode() {
  const [preferences] = useEnvironmentPreferences();
  return [preferences.motion, saveForestMotionMode];
}
