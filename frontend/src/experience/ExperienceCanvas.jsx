import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { hardwareHints, shouldUseStaticOwl } from '../environment2d/performanceTier.js';
import './owl/owl-v4.css';
import { flightRoute } from './owl/flightRoute.js';

const asset = name => `${import.meta.env.BASE_URL}assets/owl/generated/${name}`;
const owl = {
  folded: asset('owl-folded.png'),
  stage1: asset('owl-stage-1.png'),
  stage2: asset('owl-stage-2.png'),
  stage3: asset('owl-stage-3.png'),
  stage4: asset('owl-stage-4.png'),
  upstroke: asset('owl-upstroke.png'),
  downstroke: asset('owl-downstroke.png'),
  branch: asset('owl-perch-branch.png'),
};
const flightFrames = [owl.upstroke, owl.downstroke];

function place(element, { x, y, width, height }) {
  if (!element) return;
  const transform = `translate3d(${Math.round(x - width / 2)}px, ${Math.round(y - height)}px, 0)`;
  element.style.width = `${Math.round(width)}px`;
  element.style.height = `${Math.round(height)}px`;
  element.style.transition = 'opacity 360ms ease';
  element.style.transform = transform;
}

export default function ExperienceCanvas({ preferences }) {
  const { pathname } = useLocation();
  const home = pathname === '/app';
  const perched = useRef(null);
  const branch = useRef(null);
  const flight = useRef(null);
  const [ready, setReady] = useState(false);
  const [airborne, setAirborne] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const staticOnly = reduced || preferences?.motion === 'static' || shouldUseStaticOwl(hardwareHints());

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!home || staticOnly) return undefined;
    let disposed = false;
    const resources = Object.values(owl).map(url => { const image = new Image(); image.src = url; return image; });
    Promise.all(resources.map(image => image.decode())).then(() => !disposed && setReady(true));
    return () => { disposed = true; setReady(false); };
  }, [home, staticOnly]);

  useEffect(() => {
    if (!home || staticOnly || !ready) return undefined;
    let lastWorld = { heroProgress: 0 };
    let current = null, destination = null, route = [], frame, previousTime = performance.now(), lastPlan = 0;
    let size = { width: 100, height: 150 };
    const animate = now => {
      const dt = Math.min(.04, (now - previousTime) / 1000);
      previousTime = now;
      if (current && destination) {
        if (now - lastPlan > 160) {
          lastPlan = now;
          const padX = size.width / 2 + 16, padY = size.height / 2 + 20;
          const obstacles = [...document.querySelectorAll('.nova-world-copy, .nova-rail, .nova-bottom-nav')]
            .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height && r.bottom > 0 && r.top < innerHeight)
            .map(r => ({left:r.left-padX,right:r.right+padX,top:r.top-padY,bottom:r.bottom+padY}));
          route = flightRoute(current, destination, {left:padX,right:innerWidth-padX,top:padY+85,bottom:innerHeight-padY-24}, obstacles);
          if (route.length > 1 && Math.hypot(route[0].x-current.x,route[0].y-current.y) < 20) route.shift();
        }
        // Travel continues after scrolling stops; arrival naturally slows to a hover.
        while (route.length && Math.hypot(route[0].x-current.x,route[0].y-current.y) < 3) route.shift();
        if (route.length) {
          const next = route[0], dx=next.x-current.x, dy=next.y-current.y, distance=Math.hypot(dx,dy);
          const remaining = Math.hypot(destination.x-current.x,destination.y-current.y);
          const travel = Math.min(distance, Math.max(28, Math.min(190, remaining*1.8))*dt);
          current.x += dx/distance*travel; current.y += dy/distance*travel;
        }
        place(flight.current, {x:current.x,y:current.y+size.height/2,...size});
      }
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    const layout = () => {
      const width = window.innerWidth, height = window.innerHeight;
      const mobile = width < 768;
      const progress = Math.max(0, Math.min(1, (lastWorld.heroProgress - .07) / .14));
      // Keep the bird compact enough to read as part of the landscape rather
      // than as a second hero illustration.
      const owlWidth = mobile ? Math.min(172, width * .47) : Math.min(265, height * .31);
      const owlHeight = owlWidth * 1.5;
      const homeX = mobile ? width * .5 : width * .81;
      const homeY = mobile ? 295 : height * .75;
      // The world's target is already the river/camera route. Apply a small
      // portion of its lateral drift while keeping the left copy column clear.
      const riverX = mobile ? width * .56 : width * .82 + (lastWorld.target?.x || 0) * width * .025;
      const riverY = mobile ? height * .40 : height * .43 - (lastWorld.target?.y || 0) * height * .055;
      const flightWidth = Math.min(owlWidth * 1.12, mobile ? width * .52 : height * .275);
      const flightHeight = flightWidth * 1.5;
      // On desktop, reserve the left 72% for copy. The route moves in the
      // river area on the right instead of ever travelling behind text.
      const rightEdge = width - flightWidth / 2 - 22;
      const riverLeftEdge = Math.min(rightEdge, Math.max(width * .72 + flightWidth / 2, rightEdge - width * .13));
      const flightX = mobile
        ? Math.max(width * .42, Math.min(width * .72, riverX))
        : Math.max(riverLeftEdge, Math.min(rightEdge, riverX));
      // Flight frames have a 1:1.5 canvas. Clamp the *bottom* anchor using
      // that full height, so wing tips cannot leave the viewport on laptops.
      const flightY = Math.max(flightHeight + 18, Math.min(height - 24, riverY));
      const x = homeX + (flightX - homeX) * progress;
      const y = homeY + (flightY - homeY) * progress;
      place(perched.current, { x: homeX, y: homeY, width: owlWidth, height: owlHeight });
      // The branch centre sits beneath the feet; its natural width remains
      // shorter than the owl's former stump and stays in the background.
      place(branch.current, { x: homeX, y: homeY + owlWidth * .32, width: owlWidth * 1.25, height: owlWidth / 1.5 });
      size = {width:Math.min(flightWidth, 100), height:Math.min(flightWidth, 100)*1.5};
      destination = {x:mobile ? x : width-80, y:Math.max(size.height/2+110, y-size.height/2)};
      if (!current) current = {x:mobile ? homeX : width-80,y:homeY-size.height/2};
      if (branch.current) branch.current.style.opacity = `${1 - progress}`;
    };
    const onWorld = event => { lastWorld = event.detail; setAirborne(event.detail.heroProgress > .12); layout(); };
    window.addEventListener('arena:home-world', onWorld);
    window.addEventListener('resize', layout);
    layout();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('arena:home-world', onWorld); window.removeEventListener('resize', layout); };
  }, [home, staticOnly, ready]);

  if (!home) return null;
  return <div className={`nova-experience is-home nova-owl-v4 nova-owl-generated ${airborne ? 'is-airborne' : ''}`} aria-hidden="true">
    {!staticOnly && ready && <img ref={branch} className="nova-owl-branch" src={owl.branch} alt="" />}
    {!staticOnly && ready && <img ref={perched} className="nova-owl-perched" src={owl.folded} alt="" />}
    {!staticOnly && ready && <div ref={flight} className="nova-owl-flight">
      {flightFrames.map((src, index) => <img key={src} className="nova-owl-wing"
        style={{ '--owl-frame-delay': `${index * -.3}s` }} src={src} alt="" />)}
    </div>}
    {(staticOnly || !ready) && <img className="nova-owl-perched nova-owl-static" src={owl.folded} alt="" />}
  </div>;
}
