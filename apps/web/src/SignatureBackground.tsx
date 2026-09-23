import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AppearancePreferences } from "./appearancePreferences";

function hue(color: string) {
  const [r, g, b] = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 0;
  return 60 * (max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
}

export default function SignatureBackground({ appearance, reducedMotion }: { appearance: AppearancePreferences; reducedMotion: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let visible = true;
    const sync = () => {
      element.playbackRate = appearance.speed;
      if (reducedMotion || appearance.animation === "still" || document.hidden || !visible) element.pause();
      else void element.play().catch(() => { /* Keep the poster when autoplay is disabled. */ });
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
    observer.observe(element);
    return () => { element.pause(); observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [appearance.design, appearance.animation, appearance.speed, reducedMotion]);

  const tint = { "--object-hue": `${hue(appearance.spiralColor) - 45}deg` } as CSSProperties;
  return <div className="solana-art" style={tint}>
    <div className="solana-glow"/>
    {!failed && <video ref={video} className="solana-ribbon" src="/backgrounds/solana/ribbon.mp4" poster="/backgrounds/solana/poster.jpg" muted loop playsInline preload="auto" disablePictureInPicture onError={() => setFailed(true)} tabIndex={-1}/>}
    {failed && <img className="solana-ribbon" src="/backgrounds/solana/poster.jpg" alt=""/>}
  </div>;
}

export function SolflareArt() {
  return <div className="solflare-art">
    <div className="solar-orbit orbit-back"/><div className="solar-orbit orbit-front"/>
    <div className="arena-pass"><div className="pass-top"><span>АРЕНА</span><span>↗</span></div><span className="pass-label">ПРАКТИКА ПЕРЕГОВОРОВ</span><strong>01<span>→</span></strong><div className="pass-divider"/><div className="pass-bottom"><span>СЛУШАЙ.<br/>ПОНИМАЙ.<br/>ДОГОВАРИВАЙСЯ.</span><span className="pass-seal">А</span></div><div className="pass-bars"/></div>
    <div className="solar-chip">+ ДОВЕРИЕ</div><div className="solar-spark">✳</div>
  </div>;
}
