import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { owlPlacement, OWL_SETTINGS } from './owl/owlV4.js';
import { hardwareHints, shouldUseStaticOwl } from '../environment2d/performanceTier.js';
import media from './owl/owlMedia.json';
import './owl/owl-v4.css';

const revision = `${media.sourceSha256.slice(0, 8)}-${media.fps}fps`;
const clipUrl = name => `${import.meta.env.BASE_URL}assets/owl/media/owl-${name.toLowerCase()}-${revision}.webp`;
const posterUrl = `${import.meta.env.BASE_URL}assets/owl/owl-v4-poster.webp`;
const mediaPixelsPerUnit = media.sourceSize /
  (2 * Math.tan(OWL_SETTINGS.cameraFov * Math.PI / 360) * media.cameraZ);
const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function placeImage(element, dimensions, anchorX, anchorY, scale) {
  const left = anchorX - (media.anchor.x - dimensions.box[0]) * scale;
  const top = anchorY - (media.anchor.y - dimensions.box[1]) * scale;
  const imageWidth = `${dimensions.width}px`, imageHeight = `${dimensions.height}px`;
  const transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  if (element.style.width !== imageWidth) element.style.width = imageWidth;
  if (element.style.height !== imageHeight) element.style.height = imageHeight;
  if (element.style.transform !== transform) element.style.transform = transform;
}

export default function ExperienceCanvas({ preferences }) {
  const { pathname } = useLocation();
  const home = pathname === '/app';
  const image = useRef(null);
  const stumpImage = useRef(null);
  const phase = useRef({ name: 'Idle', started: 0 });
  const airborne = useRef(false);
  const snapshot = useRef(null);
  const [clip, setClip] = useState('Idle');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const staticOnly = reduced || preferences?.motion === 'static' || shouldUseStaticOwl(hardwareHints());

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!home) return undefined;
    const onWorld = event => setHeroVisible(event.detail.heroProgress < .14);
    window.addEventListener('arena:home-world', onWorld);
    return () => window.removeEventListener('arena:home-world', onWorld);
  }, [home]);

  useEffect(() => {
    if (!home || staticOnly || failed) return undefined;
    let timer, disposed = false;
    let lastMovingAt = performance.now(), lastGestureAt = -Infinity, pointerWasInside = false;
    const preloads = ['Idle', 'HeadTilt', 'Takeoff', 'FlyLoop', 'Glide', 'Landing', 'Stump'].map(name => {
      const resource = new Image();
      resource.src = clipUrl(name);
      return resource;
    });
    Promise.all(preloads.map(resource => resource.decode()))
      .then(() => { if (!disposed) setReady(true); })
      .catch(() => { if (!disposed) setFailed(true); });
    const changeClip = name => {
      window.clearTimeout(timer);
      phase.current = { name, started: performance.now() };
      setClip(name);
      if (name === 'Takeoff' || name === 'Landing' || name === 'HeadTilt') {
        timer = window.setTimeout(() => {
          changeClip(name === 'Takeoff' && airborne.current ? 'FlyLoop' : 'Idle');
        }, media.clips[name] * 1000);
      }
    };
    const place = () => {
      const element = image.current;
      if (!element) return;
      const width = window.innerWidth, height = window.innerHeight;
      const poses = owlPlacement(width, height, media.calibration, snapshot.current);
      const { name, started } = phase.current;
      const age = performance.now() - started;
      const duration = media.clips[name] * 1000;
      const flightWeight = name === 'FlyLoop' || name === 'Glide' ? 1 : name === 'Takeoff'
        ? ease((age - 400) / (duration - 700)) : name === 'Landing'
          ? 1 - ease(age / (duration - 300)) : 0;
      const x = poses.home.x + (poses.flight.x - poses.home.x) * flightWeight;
      const y = poses.home.y + (poses.flight.y - poses.home.y) * flightWeight;
      const poseScale = poses.home.scale + (poses.flight.scale - poses.home.scale) * flightWeight;
      const screenPixelsPerUnit = height /
        (2 * Math.tan(OWL_SETTINGS.cameraFov * Math.PI / 360) * OWL_SETTINGS.cameraZ);
      let scale = poseScale * screenPixelsPerUnit / mediaPixelsPerUnit;
      const dimensions = media.dimensions[name];
      const homeAnchorX = width / 2 + poses.home.x * screenPixelsPerUnit;
      const homeAnchorY = height / 2 - poses.home.y * screenPixelsPerUnit;
      let anchorX = width / 2 + x * screenPixelsPerUnit;
      let anchorY = height / 2 - y * screenPixelsPerUnit;
      if (width < 768) {
        anchorX += (width - 72 - anchorX) * flightWeight;
        anchorY += (Math.min(height * .52, 440) - anchorY) * flightWeight;
        scale *= 1 - .35 * flightWeight;
      }
      placeImage(element, dimensions, anchorX, anchorY, scale);
      const support = stumpImage.current;
      if (support) {
        placeImage(support, media.dimensions.Stump, homeAnchorX, homeAnchorY,
          poses.home.scale * screenPixelsPerUnit / mediaPixelsPerUnit);
        const progress = ((snapshot.current?.heroProgress || 0) - .05) / .15;
        const opacity = `${1 - ease(progress)}`;
        if (support.style.opacity !== opacity) support.style.opacity = opacity;
      }
    };
    const onWorld = event => {
      snapshot.current = event.detail;
      if (event.detail.heroProgress > .12 && !airborne.current) {
        airborne.current = true;
        changeClip('Takeoff');
      } else if (event.detail.heroProgress < .07 && airborne.current) {
        airborne.current = false;
        changeClip('Landing');
      }
      const moving = event.detail.velocity > 35 || event.detail.travelling;
      if (moving) lastMovingAt = performance.now();
      if (airborne.current && phase.current.name === 'FlyLoop' && performance.now() - lastMovingAt > 5000) {
        changeClip('Glide');
      } else if (moving && phase.current.name === 'Glide') changeClip('FlyLoop');
      place();
    };
    const onPointer = event => {
      const bounds = image.current?.getBoundingClientRect();
      if (!bounds) return;
      const inside = Math.abs(event.clientX - (bounds.left + bounds.width / 2)) < bounds.width * .35
        && event.clientY >= bounds.top && event.clientY < bounds.top + bounds.height * .6;
      const now = performance.now();
      if (inside && !pointerWasInside && phase.current.name === 'Idle' && !airborne.current
        && now - lastGestureAt > 8000) {
        lastGestureAt = now;
        changeClip('HeadTilt');
      }
      pointerWasInside = inside;
    };
    window.addEventListener('arena:home-world', onWorld);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('resize', place);
    place();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener('arena:home-world', onWorld);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', place);
      airborne.current = false;
      snapshot.current = null;
      phase.current = { name: 'Idle', started: 0 };
      setClip('Idle');
    };
  }, [home, staticOnly, failed]);

  if (!home) return null;
  return <div className="nova-experience is-home nova-owl-v4" aria-hidden="true">
    {!staticOnly && !failed && <img ref={stumpImage} className="nova-owl-stump"
      src={clipUrl('Stump')} alt="" decoding="async" onError={() => setFailed(true)}
      style={{ visibility: ready ? 'visible' : 'hidden' }} />}
    {!staticOnly && !failed && <img ref={image} className="nova-owl-media"
      src={clipUrl(clip)} alt="" decoding="async" onError={() => setFailed(true)}
      style={{ opacity: ready ? 1 : 0 }} />}
    {(staticOnly || failed || !ready) && heroVisible &&
      <img className="nova-owl-v4-poster" src={posterUrl} alt="" decoding="async" />}
  </div>;
}
