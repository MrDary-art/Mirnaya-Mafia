import { findForestCity } from "./cityCatalog.js";
import { sampleSolar, shortestAzimuthDelta, validTimeZone } from "./SolarEphemerisAdapter.js";

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export const DAYLIGHT_PALETTES = Object.freeze({
  night: { label: "Ночь", zenith: "#091320", middle: "#13263a", horizon: "#29394a", forestShade: .49 },
  predawn: { label: "Предрассвет", zenith: "#132238", middle: "#39475e", horizon: "#82788d", forestShade: .31 },
  blue: { label: "Синий час", zenith: "#1d3851", middle: "#53677c", horizon: "#a39ba8", forestShade: .23 },
  dawn: { label: "Рассвет", zenith: "#47758b", middle: "#a4b6ba", horizon: "#e7b99a", forestShade: .14 },
  morning: { label: "Утро", zenith: "#628ea2", middle: "#a9c2c7", horizon: "#d7d8ce", forestShade: .05 },
  day: { label: "День", zenith: "#568ea8", middle: "#91b6c5", horizon: "#d0d9d7", forestShade: .01 },
  low: { label: "Вечерний свет", zenith: "#546e88", middle: "#9c9ba9", horizon: "#e3b688", forestShade: .12 },
  sunset: { label: "Закат", zenith: "#263b60", middle: "#865f7b", horizon: "#d78e79", forestShade: .22 },
  twilight: { label: "Сумерки", zenith: "#142742", middle: "#354765", horizon: "#706d8d", forestShade: .35 },
});

export const DEVICE_PHASE_TIMELINE = Object.freeze([
  [0, "night"], [4.5, "predawn"], [6.5, "dawn"], [9, "morning"],
  [16.5, "day"], [18, "low"], [20, "sunset"], [21.5, "twilight"], [24, "night"],
]);

const risingSolar = [[-24, "night"], [-18, "night"], [-12, "predawn"], [-6, "blue"],
  [0, "dawn"], [8, "morning"], [18, "day"], [90, "day"]];
const fallingSolar = [[-24, "night"], [-18, "night"], [-12, "twilight"], [-6, "twilight"],
  [0, "sunset"], [8, "low"], [18, "day"], [90, "day"]];

function blendPoints(value, points) {
  if (value <= points[0][0]) return { first: points[0][1], second: points[0][1], mix: 0 };
  for (let index = 1; index < points.length; index += 1) {
    if (value <= points[index][0]) {
      const [start, first] = points[index - 1];
      const [end, second] = points[index];
      return { first, second, mix: smooth((value - start) / (end - start)) };
    }
  }
  const last = points.at(-1)[1];
  return { first: last, second: last, mix: 0 };
}

function rgb(hex) { return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)); }
function mixHex(first, second, amount) {
  const a = rgb(first), b = rgb(second);
  const channels = a.map((value, index) => {
    const linear = ((value / 255) ** 2.2) * (1 - amount) + ((b[index] / 255) ** 2.2) * amount;
    return Math.round(linear ** (1 / 2.2) * 255);
  });
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function localHours(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: validTimeZone(timeZone), hour: "2-digit",
    minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(epochMs);
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value || 0);
  return part("hour") + part("minute") / 60 + part("second") / 3600;
}

export function deviceTimeZone() {
  try { return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }
  catch { return "UTC"; }
}

function approximateSun(hours) {
  const altitudeDeg = Math.sin(((hours - 6.5) / 13.5) * Math.PI) * 55;
  return { altitudeDeg, azimuthNorthClockwiseDeg: (90 + (hours - 6.5) * 13.33 + 360) % 360,
    altitudeTrend: hours < 13.25 ? "rising" : "falling", sourceMode: "clock-approximation" };
}

export function buildEnvironmentTimeState(epochMs, preferences, systemTimeZone = deviceTimeZone()) {
  const safeEpoch = Number.isFinite(epochMs) ? epochMs : Date.now();
  const city = findForestCity(preferences?.cityId);
  const timeMode = preferences?.timeMode === "manual" ? "manual"
    : preferences?.timeMode === "solar-location" && city ? "solar-location" : "device-clock";
  const timeZone = timeMode === "solar-location" ? city.timeZone : validTimeZone(systemTimeZone);
  const hours = localHours(safeEpoch, timeZone);
  const manualHours = { dawn: 6.5, day: 12, sunset: 19, night: 23 };
  const visualHours = timeMode === "manual" ? manualHours[preferences?.manualPhase] ?? 12 : hours;
  const solar = timeMode === "solar-location" ? sampleSolar(safeEpoch, city) : null;
  const visualSun = solar || approximateSun(visualHours);
  let blend;
  if (timeMode === "manual") {
    const manual = { dawn: "dawn", day: "day", sunset: "sunset", night: "night" }[preferences?.manualPhase] || "day";
    blend = { first: manual, second: manual, mix: 0 };
  } else if (solar) {
    blend = blendPoints(solar.altitudeDeg, solar.altitudeTrend === "falling" ? fallingSolar : risingSolar);
  } else blend = blendPoints(hours, DEVICE_PHASE_TIMELINE);

  const first = DAYLIGHT_PALETTES[blend.first];
  const second = DAYLIGHT_PALETTES[blend.second];
  const { mix } = blend;
  const altitude = visualSun.altitudeDeg;
  const daylight = smooth((altitude + 7) / 22);
  const starOpacity = 1 - smooth((altitude + 15) / 10);
  const shade = first.forestShade * (1 - mix) + second.forestShade * mix;
  const bearing = city?.latitude < 0 ? 0 : 180;
  const difference = shortestAzimuthDelta(bearing, visualSun.azimuthNorthClockwiseDeg);
  const sunX = timeMode === "solar-location" ? .5 + difference / 200 : .5 + (visualHours - 12) * .083;
  const sunY = .62 - altitude * .012;
  const visibleSun = altitude > -.7 && sunX > -.1 && sunX < 1.1 && sunY > -.1 && sunY < .8;
  const label = mix < .5 ? first.label : second.label;
  const sky = {
    zenith: mixHex(first.zenith, second.zenith, mix),
    middle: mixHex(first.middle, second.middle, mix),
    horizon: mixHex(first.horizon, second.horizon, mix),
  };
  const warmth = blend.first === "sunset" || blend.second === "sunset" || blend.first === "dawn" || blend.second === "dawn";
  const light = {
    ambientRgb: rgb(sky.middle), sunRgb: rgb(warmth ? "#f3bf91" : "#e3e5d0"),
    sunStrength: visibleSun ? smooth((altitude + 1) / 12) * .8 : 0,
    skyExposure: .42 + daylight * .58,
    waterSpecularStrength: .18 + daylight * .55,
  };
  return {
    epochMs: safeEpoch, timeZone, mode: timeMode,
    accuracyLabel: timeMode === "manual" ? "manual" : solar ? "solar-calculation" : "clock-approximation",
    solar, phaseWeights: { [blend.first]: 1 - mix, [blend.second]: (blend.first === blend.second ? 1 : mix) },
    phaseLabel: label, sky, light, forestShade: shade,
    sun: { x: sunX, y: sunY, visible: visibleSun, altitudeDeg: altitude,
      azimuthNorthClockwiseDeg: visualSun.azimuthNorthClockwiseDeg },
    stars: clamp(starOpacity), daylight,
  };
}

export function environmentCssVariables(state) {
  return {
    "--forest-sky-zenith": state.sky.zenith,
    "--forest-sky-middle": state.sky.middle,
    "--forest-sky-horizon": state.sky.horizon,
    "--forest-shade": state.forestShade.toFixed(3),
    "--forest-daylight": state.daylight.toFixed(3),
    "--forest-stars": state.stars.toFixed(3),
    "--forest-sun-x": `${(state.sun.x * 100).toFixed(2)}%`,
    "--forest-sun-y": `${(state.sun.y * 100).toFixed(2)}%`,
    "--forest-sun-opacity": state.sun.visible ? state.light.sunStrength.toFixed(3) : "0",
  };
}
