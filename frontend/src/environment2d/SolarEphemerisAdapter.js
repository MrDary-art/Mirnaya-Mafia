import * as SunCalc from "suncalc";

// SunCalc 2.0.2: apparent altitude and north-clockwise azimuth, both in degrees.
// Its events are UTC instants; Intl is solely responsible for civil-day labels.
export const SOLAR_PROVIDER = Object.freeze({ name: "SunCalc", version: "2.0.2", license: "BSD-2-Clause",
  altitudeKind: "apparent", angleUnit: "degree", azimuthOrigin: "north-clockwise" });

export function validTimeZone(timeZone) {
  try { new Intl.DateTimeFormat("en", { timeZone }).format(0); return timeZone; }
  catch { return "UTC"; }
}

export function localDayKey(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: validTimeZone(timeZone),
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(epochMs);
  const item = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${item("year")}-${item("month")}-${item("day")}`;
}

function eventEpoch(value) {
  const epoch = value instanceof Date ? value.getTime() : NaN;
  return Number.isFinite(epoch) ? epoch : null;
}

function eventsForLocalDay(epochMs, latitude, longitude, timeZone) {
  const target = localDayKey(epochMs, timeZone);
  const events = { solarNoon: [], sunrise: [], sunset: [], dawn: [], dusk: [] };
  for (const offset of [-86400000, 0, 86400000]) {
    const times = SunCalc.getTimes(new Date(epochMs + offset), latitude, longitude);
    for (const key of Object.keys(events)) {
      const instant = eventEpoch(times[key]);
      if (instant !== null && localDayKey(instant, timeZone) === target) events[key].push(instant);
    }
  }
  return Object.fromEntries(Object.entries(events).map(([key, values]) =>
    [key, [...new Set(values)].sort((a, b) => a - b)[0] ?? null]));
}

export function sampleSolar(epochMs, location) {
  if (!Number.isFinite(epochMs) || !location || !Number.isFinite(location.latitude)
    || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90
    || Math.abs(location.longitude) > 180) return null;
  try {
    const date = new Date(epochMs);
    const position = SunCalc.getPosition(date, location.latitude, location.longitude);
    const before = SunCalc.getPosition(new Date(epochMs - 300000), location.latitude, location.longitude);
    const after = SunCalc.getPosition(new Date(epochMs + 300000), location.latitude, location.longitude);
    if (!Number.isFinite(position.altitude) || !Number.isFinite(position.azimuth)) return null;
    const events = eventsForLocalDay(epochMs, location.latitude, location.longitude, location.timeZone);
    const times = SunCalc.getTimes(date, location.latitude, location.longitude);
    const delta = after.altitude - before.altitude;
    const daylightState = times.alwaysUp ? "polar-day" : times.alwaysDown ? "polar-night"
      : events.sunrise === null && events.sunset === null ? "indeterminate" : "normal";
    return {
      epochMs, altitudeDeg: position.altitude, altitudeKind: "apparent",
      azimuthNorthClockwiseDeg: ((position.azimuth % 360) + 360) % 360,
      altitudeTrend: delta > .02 ? "rising" : delta < -.02 ? "falling" : "steady",
      solarNoonEpochMs: events.solarNoon, sunriseEpochMs: events.sunrise,
      sunsetEpochMs: events.sunset, civilDawnEpochMs: events.dawn, civilDuskEpochMs: events.dusk,
      daylightState, sourceMode: location.precision === "coarse" ? "coarse-location" : "selected-city",
    };
  } catch { return null; }
}

export function shortestAzimuthDelta(fromDeg, toDeg) {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}
