import { useEffect, useRef, useState } from "react";
import type { AppearancePreferences, AppearanceScope } from "./appearancePreferences";
import type { SpiralScene } from "./spiralScene";
import SignatureBackground, { SolflareArt } from "./SignatureBackground";
import { useLocation } from "react-router-dom";

export default function Background({ appearance, reducedMotion, scope }: { appearance: AppearancePreferences; reducedMotion: boolean; scope: AppearanceScope }) {
  const { pathname } = useLocation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SpiralScene | null>(null);
  const latest = useRef({ appearance, reducedMotion });
  const [fallback, setFallback] = useState(false);
  latest.current = { appearance, reducedMotion };

  useEffect(() => {
    if (appearance.background !== "spiral") return;
    let cancelled = false;
    let current: SpiralScene | null = null;
    setFallback(false);
    import("./spiralScene").then(({ createSpiralScene }) => {
      if (cancelled || !canvas.current) return;
      current = createSpiralScene(canvas.current, () => { if (!cancelled) setFallback(true); });
      scene.current = current;
      current.update(latest.current.appearance, latest.current.reducedMotion);
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => { cancelled = true; current?.dispose(); scene.current = null; };
  }, [appearance.background]);

  useEffect(() => { scene.current?.update(appearance, reducedMotion); }, [appearance, reducedMotion]);

  return <div className={`site-background background-${appearance.background}`} aria-hidden="true">
    {appearance.background === "signature" && (scope === "workspace" ? <SolflareArt/> : pathname !== "/" && <SignatureBackground appearance={appearance} reducedMotion={reducedMotion}/>)}
    {appearance.background === "spiral" && <><canvas ref={canvas} className={fallback ? "spiral-canvas is-unavailable" : "spiral-canvas"}/>{fallback && <svg className="spiral-fallback" viewBox="0 0 500 1000" fill="none">{Array.from({length:10},(_,i) => <ellipse key={i} cx="250" cy={i*100+50} rx="165" ry="54" stroke="currentColor" strokeWidth="16" transform={`rotate(-24 250 ${i*100+50})`}/>)}</svg>}</>}
    {appearance.background === "aurora" && <div className="aurora-clouds"><i/><i/><i/></div>}
    {appearance.background === "grid" && <div className="background-grid"/>}
  </div>;
}
