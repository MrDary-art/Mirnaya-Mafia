export const LAB_DAY_MS = 90_000;

// Development-only visual clock; never patches global Date or product timers.
export function acceleratedDayEpoch(baseEpochMs, elapsedMs) {
  const date = new Date(baseEpochMs);
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return utcMidnight + (((elapsedMs % LAB_DAY_MS) + LAB_DAY_MS) % LAB_DAY_MS) / LAB_DAY_MS * 86400000;
}
