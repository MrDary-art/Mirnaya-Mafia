import { useEffect, useRef, useState } from "react";
import { buildEnvironmentTimeState, deviceTimeZone } from "./DaylightDirector.js";
import { SolarClock } from "./SolarClock.js";
import { acceleratedDayEpoch } from "./environmentLab.js";

// The SolarClock owns real UTC time; render effects retain their own monotonic clock.
export function useEnvironmentTimeState(preferences) {
  const clockRef = useRef(null);
  if (!clockRef.current) clockRef.current = new SolarClock();
  const labOriginRef = useRef({ epoch: Date.now(), monotonic: performance.now() });
  const labEnabled = Boolean(import.meta.env?.DEV && new URLSearchParams(window.location.search).get("forestLab") === "cycle");
  function sampleEpoch() {
    return labEnabled ? acceleratedDayEpoch(labOriginRef.current.epoch,
      performance.now() - labOriginRef.current.monotonic) : clockRef.current.currentEpochMs();
  }
  function buildState(epoch, preferencesForBuild) {
    const next = buildEnvironmentTimeState(epoch, preferencesForBuild, deviceTimeZone());
    return labEnabled ? { ...next, preview: true, phaseLabel: `Превью · ${next.phaseLabel}` } : next;
  }
  const [state, setState] = useState(() => buildState(sampleEpoch(), preferences));

  useEffect(() => {
    const clock = clockRef.current;
    let timer = 0;
    let disposed = false;
    let lastAltitude = state.sun.altitudeDeg;
    function update(resync = false) {
      if (disposed) return;
      if (resync) clock.resync();
      const next = buildState(sampleEpoch(), preferences);
      lastAltitude = next.sun.altitudeDeg;
      setState(next);
    }
    function schedule() {
      clearTimeout(timer);
      if (disposed || document.hidden || preferences.motion === "static" || preferences.timeMode === "manual") return;
      timer = window.setTimeout(() => { update(true); schedule(); }, labEnabled ? 1000 : Math.abs(lastAltitude) < 8 ? 10000 : 30000);
    }
    function onVisibility() {
      if (document.hidden) { clearTimeout(timer); return; }
      update(true);
      schedule();
    }
    update(true);
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [preferences.timeMode, preferences.cityId, preferences.manualPhase, preferences.motion, labEnabled]);
  return state;
}
