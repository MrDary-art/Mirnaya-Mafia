import { useEffect, useId, useState } from 'react';
import './owl/owl-v4.css';
import preview from '../assets/owl-preview.webp?inline';

const bird = `${import.meta.env.BASE_URL}assets/owl/generated/owl-folded.webp`;
const eyes = [
  { x:385, y:275, rx:43, ry:39 },
  { x:577, y:298, rx:37, ry:34 },
];

export default function ExperienceCanvas() {
  const [blinking, setBlinking] = useState(false);
  const [ready, setReady] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.decoding = 'async';
    image.onload = async () => {
      try { await image.decode(); } catch { return; }
      if (active) setReady(true);
    };
    image.src = bird;
    return () => { active = false; image.onload = null; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let next, finish, disposed = false;
    function schedule(delay = 4200 + Math.random() * 5200) {
      window.clearTimeout(next);
      if (disposed || document.hidden || motion.matches) return;
      next = window.setTimeout(() => {
        setBlinking(true);
        finish = window.setTimeout(() => {
          setBlinking(false);
          schedule(Math.random() < .12 ? 240 : 4200 + Math.random() * 5200);
        }, 320);
      }, delay);
    }
    function reset() {
      window.clearTimeout(next); window.clearTimeout(finish);
      setBlinking(false); schedule();
    }
    schedule(1800 + Math.random() * 2200);
    document.addEventListener('visibilitychange', reset);
    motion.addEventListener('change', reset);
    return () => {
      disposed = true;
      window.clearTimeout(next); window.clearTimeout(finish);
      document.removeEventListener('visibilitychange', reset);
      motion.removeEventListener('change', reset);
    };
  }, [ready]);
  return <figure className={`nova-owl-seated${ready ? ' is-ready' : ''}${blinking ? ' is-blinking' : ''}`} aria-label="Сова сидит на лесной полянке">
    <span className="nova-owl-ground-shadow" aria-hidden="true" />
    <img className="nova-owl-seated-bird nova-owl-preview" src={preview} alt="Сидящая сова со сложенными крыльями" width="1024" height="1536" />
    {ready && <img className="nova-owl-seated-bird" src={bird} alt="" aria-hidden="true" width="1024" height="1536" decoding="async" />}
    {ready && <svg className="nova-owl-eyelids" viewBox="0 0 1024 1536" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${id}-upper`} width="1024" height="1536" patternUnits="userSpaceOnUse"><image href={bird} x="0" y="64" width="1024" height="1536" /></pattern>
        <pattern id={`${id}-lower`} width="1024" height="1536" patternUnits="userSpaceOnUse"><image href={bird} x="0" y="-70" width="1024" height="1536" /></pattern>
        {eyes.map((eye,i)=><clipPath key={i} id={`${id}-eye-${i}`}><ellipse cx={eye.x} cy={eye.y} rx={eye.rx} ry={eye.ry}/></clipPath>)}
      </defs>
      {eyes.map((eye,i)=><g key={i} clipPath={`url(#${id}-eye-${i})`}>
        <rect className="nova-owl-upper-lid" x={eye.x-eye.rx} y={eye.y-eye.ry} width={eye.rx*2} height={eye.ry*2} fill={`url(#${id}-upper)`} style={{transformOrigin:`${eye.x}px ${eye.y-eye.ry}px`}} />
        <rect className="nova-owl-lower-lid" x={eye.x-eye.rx} y={eye.y-eye.ry} width={eye.rx*2} height={eye.ry*2} fill={`url(#${id}-lower)`} style={{transformOrigin:`${eye.x}px ${eye.y+eye.ry}px`}} />
      </g>)}
    </svg>}
  </figure>;
}
