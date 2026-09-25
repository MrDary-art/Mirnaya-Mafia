import assert from "node:assert/strict";
import test from "node:test";
import { FOREST_CITIES, findForestCity } from "./cityCatalog.js";
import { buildEnvironmentTimeState, deviceTimeZone } from "./DaylightDirector.js";
import { SOLAR_PROVIDER, localDayKey, sampleSolar, shortestAzimuthDelta, validTimeZone } from "./SolarEphemerisAdapter.js";
import { SolarClock } from "./SolarClock.js";
import { normalizeEnvironmentPreferences } from "./backgroundMotionPreferences.js";
import { artCoverage, effectDpr } from "./sharpnessPolicy.js";
import { acceleratedDayEpoch, LAB_DAY_MS } from "./environmentLab.js";

const prefs = (extra = {}) => ({ timeMode: "device-clock", cityId: null, manualPhase: "day", motion: "full", quality: "auto", ...extra });

test("SunCalc 2.0.2 unit and azimuth conventions are pinned", () => {
  assert.equal(SOLAR_PROVIDER.version, "2.0.2");
  assert.equal(SOLAR_PROVIDER.altitudeKind, "apparent");
  const sample = sampleSolar(Date.parse("2026-09-25T12:00:00Z"), findForestCity("moscow"));
  assert.ok(Math.abs(sample.altitudeDeg - 24.8043) < .05);
  assert.ok(Math.abs(sample.azimuthNorthClockwiseDeg - 224.6996) < .05);
  assert.equal(sample.altitudeTrend, "falling");
  assert.equal(shortestAzimuthDelta(359, 1), 2);
  assert.equal(shortestAzimuthDelta(1, 359), -2);
});

test("local civil day and DST use Intl without changing the UTC solar instant", () => {
  const city = findForestCity("london");
  const beforeEpoch = Date.parse("2026-03-29T00:55:00Z");
  const afterEpoch = Date.parse("2026-03-29T01:05:00Z");
  const before = sampleSolar(beforeEpoch, city);
  const after = sampleSolar(afterEpoch, city);
  assert.equal(after.epochMs - before.epochMs, 600000);
  assert.ok(Math.abs(after.altitudeDeg - before.altitudeDeg) < 5);
  assert.equal(localDayKey(beforeEpoch, city.timeZone), "2026-03-29");
  assert.equal(localDayKey(afterEpoch, city.timeZone), "2026-03-29");
  assert.equal(validTimeZone("not/a-zone"), "UTC");
  const fallFirst = sampleSolar(Date.parse("2026-10-25T00:30:00Z"), city);
  const fallRepeated = sampleSolar(Date.parse("2026-10-25T01:30:00Z"), city);
  assert.ok(Math.abs(fallRepeated.altitudeDeg - fallFirst.altitudeDeg) < 15);
  assert.equal(fallRepeated.epochMs - fallFirst.epochMs, 3600000);
  assert.equal(localDayKey(Date.parse("2026-10-24T23:30:00Z"), "Asia/Kathmandu"), "2026-10-25");
});

test("polar day and night never invent missing rise/set events", () => {
  const city = findForestCity("tromso");
  const summer = sampleSolar(Date.parse("2026-06-21T12:00:00Z"), city);
  const winter = sampleSolar(Date.parse("2026-12-21T12:00:00Z"), city);
  assert.equal(summer.daylightState, "polar-day");
  assert.equal(winter.daylightState, "polar-night");
  assert.equal(summer.sunriseEpochMs, null);
  assert.equal(winter.sunsetEpochMs, null);
  assert.ok(summer.altitudeDeg > 0);
  assert.ok(winter.altitudeDeg < 0);
  assert.equal(buildEnvironmentTimeState(Date.parse("2026-12-21T12:00:00Z"),
    prefs({ timeMode: "solar-location", cityId: "tromso" }), "UTC").sun.visible, false);
});

test("one city and instant produce one solar phase regardless of device zone", () => {
  const epoch = Date.parse("2026-09-25T12:00:00Z");
  const a = buildEnvironmentTimeState(epoch, prefs({ timeMode: "solar-location", cityId: "sydney" }), "Europe/Moscow");
  const b = buildEnvironmentTimeState(epoch, prefs({ timeMode: "solar-location", cityId: "sydney" }), "America/New_York");
  assert.equal(a.timeZone, "Australia/Sydney");
  assert.deepEqual(a.sky, b.sky);
  assert.equal(a.solar.altitudeDeg, b.solar.altitudeDeg);
  assert.ok(a.sun.x !== .5); // Southern sky orientation is not hardcoded north-only.
  assert.equal(a.accuracyLabel, "solar-calculation");
});

test("device clock is labelled approximate and manual atmosphere is never claimed real", () => {
  const epoch = Date.parse("2026-09-25T20:00:00Z");
  const device = buildEnvironmentTimeState(epoch, prefs(), "Europe/Moscow");
  const manual = buildEnvironmentTimeState(epoch, prefs({ timeMode: "manual", manualPhase: "night" }), "Europe/Moscow");
  assert.equal(device.accuracyLabel, "clock-approximation");
  assert.equal(device.solar, null);
  assert.equal(manual.accuracyLabel, "manual");
  assert.equal(manual.phaseLabel, "Ночь");
  assert.notDeepEqual(device.sky, manual.sky);
  assert.ok(deviceTimeZone());
});

test("clock resyncs wall time while animation does not accumulate elapsed sleep", () => {
  let wall = 1000000, monotonic = 5000;
  const clock = new SolarClock(() => wall, () => monotonic);
  monotonic += 30000;
  assert.equal(clock.currentEpochMs(), 1030000);
  wall += 3600000;
  const correction = clock.resync();
  assert.ok(correction > 3500000);
  assert.equal(clock.currentEpochMs(), wall);
});

test("accelerated preview loops one day in 90 seconds without changing Date", () => {
  const base = Date.parse("2026-09-25T12:00:00Z");
  assert.equal(acceleratedDayEpoch(base, 0), Date.parse("2026-09-25T00:00:00Z"));
  assert.equal(acceleratedDayEpoch(base, LAB_DAY_MS / 2), Date.parse("2026-09-25T12:00:00Z"));
  assert.equal(acceleratedDayEpoch(base, LAB_DAY_MS), acceleratedDayEpoch(base, 0));
  assert.equal(Date.now instanceof Function, true);
});

test("settings validate malformed input and quality scales effects separately from art", () => {
  assert.equal(FOREST_CITIES.length, 7);
  const normalized = normalizeEnvironmentPreferences({ timeMode: "solar-location", cityId: "unknown", motion: "bad", quality: "bad" }, prefs());
  assert.equal(normalized.cityId, null);
  assert.equal(normalized.motion, "full");
  assert.equal(normalized.quality, "auto");
  assert.ok(effectDpr({ width: 1920, height: 1080, deviceDpr: 2, quality: "high" }) >
    effectDpr({ width: 1920, height: 1080, deviceDpr: 2, quality: "economy" }));
  assert.ok(effectDpr({ width: 3840, height: 2160, deviceDpr: 2, quality: "high" }) < 2);
  assert.ok(3840 * 2160 * effectDpr({ width: 3840, height: 2160, deviceDpr: 2, quality: "economy" }) ** 2 <= 2_010_000);
  assert.ok(artCoverage({ sourcePixelsInCrop: 1018, displayedCssPixels: 1490, targetArtDpr: 2 }) < .5);
});
