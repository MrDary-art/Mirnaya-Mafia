import { useEffect, useRef, useState } from "react";
import { FOREST_ORDER, FOREST_SCENES, isFocusedRoute, sceneForRoute } from "./sceneDefinitions.js";
import ForestAmbientCanvas from "./ForestAmbientCanvas.jsx";
import { FOREST_MOTION_OPTIONS, FOREST_QUALITY_OPTIONS } from "./backgroundMotionPreferences.js";

function ForestPanel({ scene, eager = false, route = false, bridge = false, loaded = true }) {
  return <div className={route ? "forest-route-panel" : `forest-panel${eager ? " is-visible" : ""}`} data-forest-scene={scene.id} aria-hidden="true">
    {loaded && <picture className="forest-panel-media">
      <source media="(max-width: 767px)" srcSet={scene.mobilePoster} />
      <img className="forest-panel-image" src={scene.poster} alt="" loading="eager"
        decoding="async" fetchPriority={eager ? "high" : "auto"}
        onError={(event) => { event.currentTarget.hidden = true; }} />
    </picture>}
    {loaded && bridge && <picture className="forest-panel-bridge">
      <source media="(max-width: 767px)" srcSet={scene.mobilePoster} />
      <img src={scene.poster} alt="" loading="lazy" decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }} />
    </picture>}
    {loaded && <span className="forest-panel-vignette" />}
    {loaded && scene.branch && <img className="forest-panel-branch" data-forest-branch src="/assets/forest2d/branch.webp"
      alt="" loading={eager ? "eager" : "lazy"} decoding="async" style={scene.branch}
      onError={(event) => { event.currentTarget.hidden = true; }} />}
    {loaded && <span className="forest-panel-mist" />}
  </div>;
}

export function ForestMotionControl({ preferences, onChange, id = "forest-motion-mode", inMenu = false, inline = false }) {
  const motion = preferences.motion;
  return <div className={`forest-motion-control${inMenu ? " forest-motion-control-menu" : ""}${inline ? " forest-motion-control-inline" : ""}`}>
    <label htmlFor={id}>Фоновые эффекты</label>
    <select id={id} aria-label="Фоновые эффекты" value={motion} onChange={(event) => onChange({ motion: event.target.value })}>
      {FOREST_MOTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <details className="forest-settings-extra">
      <summary aria-label="Настройки пейзажа">Настроить</summary>
      <div className="forest-settings-panel">
        <label htmlFor={`${id}-time`}>Время пейзажа</label>
        <select id={`${id}-time`} value="fixed" disabled>
          <option value="fixed">Постоянный свет</option>
        </select>
        <small>Смена времени суток временно отключена: она не загружает дополнительные слои и не влияет на скорость страницы.</small>
        <label htmlFor={`${id}-quality`}>Детализация эффектов</label>
        <select id={`${id}-quality`} value={preferences.quality} onChange={(event) => onChange({ quality: event.target.value })}>
          {FOREST_QUALITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <small>Настройка меняет чёткость эффектов; исходные иллюстрации пока не имеют варианта 4K.</small>
      </div>
    </details>
  </div>;
}

export default function ForestBackdrop({ pathname, preferences }) {
  const journeyRef = useRef(null);
  const [loadedScenes, setLoadedScenes] = useState(["hero", "ai"]);
  const home = pathname === "/app";
  const effectiveMode = isFocusedRoute(pathname) ? "static" : preferences.motion;

  useEffect(() => {
    if (home) window.dispatchEvent(new Event("arena:forest-layout"));
  }, [home, loadedScenes]);

  useEffect(() => {
    const element = home ? journeyRef.current : document.querySelector(".forest-route-backdrop");
    const onVisibility = () => element?.toggleAttribute("data-forest-paused", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [home, pathname]);

  useEffect(() => {
    if (!home || !journeyRef.current) return undefined;
    const journey = journeyRef.current;
    const panels = new Map([...journey.querySelectorAll("[data-forest-scene]")]
      .map((element) => [element.dataset.forestScene, element]));
    const observer = new ResizeObserver(measure);
    let observed = false;
    let lastVisible = "";
    let lastNeeded = "hero|ai";
    let frame = 0;

    function measure() {
      const shell = document.querySelector(".nova-shell");
      if (!shell) return;
      const shellTop = shell.getBoundingClientRect().top + window.scrollY;
      let found = 0;
      for (const id of FOREST_ORDER) {
        const section = document.querySelector(`[data-home-section="${id}"]`);
        const panel = panels.get(id);
        if (!section || !panel) continue;
        const rect = section.getBoundingClientRect();
        const top = rect.top + window.scrollY - shellTop;
        panel.style.top = `${top - rect.height * .16}px`;
        panel.style.height = `${rect.height * 1.16}px`;
        if (!observed) observer.observe(section);
        found += 1;
      }
      observed = found === FOREST_ORDER.length;
      window.dispatchEvent(new Event("arena:forest-layout"));
    }

    function onWorld(event) {
      const snapshot = event.detail;
      const needed = new Set([...(snapshot.loadedScenes || []), snapshot.activeSection,
        snapshot.previousSection, snapshot.nextSection]);
      const neededList = FOREST_ORDER.filter((id) => needed.has(id));
      const neededKey = neededList.join("|");
      // Keep decoded scenes mounted when reversing scroll; don't flash an empty panel.
      if (neededKey !== lastNeeded) {
        setLoadedScenes(previous => [...new Set([...previous, ...neededList])]);
        lastNeeded = neededKey;
      }
      if (!observed) measure();
      const visible = (snapshot.loadedScenes || []).join("|");
      if (visible !== lastVisible) {
        const visibleSet = new Set(snapshot.loadedScenes || []);
        panels.forEach((panel, id) => panel.classList.toggle("is-visible", visibleSet.has(id)));
        lastVisible = visible;
      }
      const mobile = snapshot.width < 768;
      for (const id of snapshot.loadedScenes || []) {
        const panel = panels.get(id);
        if (!panel) continue;
        const index = FOREST_ORDER.indexOf(id);
        const shift = Math.max(-32, Math.min(32, (snapshot.position - index) * (mobile ? 12 : 23)));
        panel.style.setProperty("--forest-parallax-y", `${shift}px`);
        if (index > 0) {
          const reveal = Math.max(0, Math.min(1, (index + .18 - snapshot.position) / .40));
          panel.style.setProperty("--forest-bridge-opacity", reveal.toFixed(3));
        }
      }
    }

    frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("arena:home-world", onWorld);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("arena:home-world", onWorld);
    };
  }, [home]);

  return <>
    {home
      ? <div className="forest-journey" ref={journeyRef} data-forest-motion={effectiveMode} data-forest-phase="Постоянный свет" aria-hidden="true">
        {FOREST_ORDER.map((id, index) => <ForestPanel key={id} scene={FOREST_SCENES[id]} eager={index === 0}
          loaded={loadedScenes.includes(id)} bridge={index > 0 && id !== "finale"} />)}
      </div>
      : <div className="forest-route-backdrop" data-forest-motion={effectiveMode} data-forest-phase="Постоянный свет" aria-hidden="true">
        <ForestPanel scene={sceneForRoute(pathname)} eager route />
      </div>}
    <ForestAmbientCanvas pathname={pathname} mode={preferences.motion} quality={preferences.quality} journeyRef={journeyRef} />
  </>;
}
