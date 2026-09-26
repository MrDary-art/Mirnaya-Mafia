import { useEffect, useRef } from "react";
import { createSceneProjection } from "./layoutProjection.js";
import { FOREST_ORDER, FOREST_SCENES, isFocusedRoute, sceneForRoute } from "./sceneDefinitions.js";
import { effectDpr } from "./sharpnessPolicy.js";
import { hardwareHints, isLowPower } from "./performanceTier.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fract = (value) => value - Math.floor(value);
// Placeholder until registered day/night artwork is available; no solar work runs at runtime.
const STATIC_LIGHT = Object.freeze({ daylight: .52, sky: { horizon: "#789199" } });

function polygonPath(ctx, points, project) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const [x, y] = project(point);
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function boundsOf(points, project) {
  const projected = points.map(project);
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function drawFlow(ctx, scene, project, seconds, calm, timeState, image, mobile) {
  if (!scene.water) return;
  const bounds = boundsOf(scene.water.polygon, project);
  if (bounds.bottom < 0 || bounds.top > window.innerHeight) return;
  ctx.save();
  polygonPath(ctx, scene.water.polygon, project);
  ctx.clip();
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const [flowX, flowY] = scene.water.flow;
  if (image?.complete && image.naturalWidth > 0) {
    const crop = mobile ? scene.mobileCrop : { left: 0, width: scene.artboard.width };
    const left = project([crop.left / scene.artboard.width, 0])[0];
    const right = project([(crop.left + crop.width) / scene.artboard.width, 0])[0];
    // <picture> has already selected the authored crop on mobile.
    const sourceX = mobile ? 0 : crop.left / scene.artboard.width * image.naturalWidth;
    const sourceWidth = mobile ? image.naturalWidth : crop.width / scene.artboard.width * image.naturalWidth;
    const top = project([0, 0])[1];
    const bottom = project([0, 1])[1];
    const step = calm ? 28 : 19;
    for (let y = Math.max(0, bounds.top); y < Math.min(window.innerHeight, bounds.bottom); y += step) {
      const sourceY = (y - top) / (bottom - top) * image.naturalHeight;
      const sourceH = step / (bottom - top) * image.naturalHeight;
      if (sourceY < 0 || sourceY + sourceH > image.naturalHeight) continue;
      const current = y / Math.max(1, height);
      const displacement = Math.sin(current * 19 + seconds * (flowX * 2.3 + .3)) * (calm ? .8 : 2.5)
        + Math.sin(current * 47 - seconds * .57) * (calm ? .3 : .8);
      ctx.globalAlpha = .13;
      ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceH,
        left + displacement, y, right - left, step + .7);
    }
  }
  const perBand = calm ? 4 : window.innerWidth < 768 ? 5 : 8;
  for (let band = 0; band < (calm ? 2 : 3); band += 1) {
    ctx.globalAlpha = ((calm ? .10 : .15) + band * .035) * (.48 + timeState.daylight * .52);
    ctx.strokeStyle = band === 1 ? "#cad9d2" : timeState.sky.horizon;
    ctx.lineWidth = band === 1 ? 1.05 : .75;
    ctx.beginPath();
    for (let item = 0; item < perBand; item += 1) {
      const index = band * perBand + item;
      const seed = fract(index * .6180339 + .17);
      const phase = fract(seed + seconds * (calm ? .006 : .012) * (1 + flowX));
      const x = bounds.left + phase * width;
      const y = bounds.top + fract(index * .382 + seconds * (calm ? .002 : .004) * flowY) * height;
      const length = 12 + fract(index * .37) * 25;
      ctx.moveTo(x - length * .5, y);
      ctx.quadraticCurveTo(x, y - 2.5, x + length * .5, y + flowY * 7);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWaterfall(ctx, scene, project, seconds, calm, timeState) {
  if (!scene.waterfall) return;
  const { polygon, source, impact } = scene.waterfall;
  const [sourceX, sourceY] = project(source);
  const [impactX, impactY] = project(impact);
  if (impactY < -30 || sourceY > window.innerHeight + 30) return;
  ctx.save();
  polygonPath(ctx, polygon, project);
  ctx.clip();
  const fall = Math.max(1, impactY - sourceY);
  const curtain = ctx.createLinearGradient(sourceX - fall * .12, sourceY, sourceX + fall * .14, impactY);
  curtain.addColorStop(0, `rgba(173,208,210,${.025 + timeState.daylight * .025})`);
  curtain.addColorStop(.42, `rgba(212,231,225,${.035 + timeState.daylight * .035})`);
  curtain.addColorStop(1, `rgba(126,177,187,${.025 + timeState.daylight * .025})`);
  ctx.fillStyle = curtain;
  ctx.fillRect(sourceX - fall * .28, sourceY, fall * .55, fall + 7);
  for (let band = 0; band < 3; band += 1) {
    const centerX = sourceX + (band - 1) * fall * .115;
    for (let segment = 0; segment < (calm ? 4 : 8); segment += 1) {
      const phase = fract(segment * .367 + band * .19 + seconds * (calm ? .15 : .31));
      const y = sourceY + phase * fall;
      const length = Math.min(38, 9 + phase * 27);
      ctx.strokeStyle = band === 1 ? "#d7e5dc" : "#9cc8c7";
      ctx.globalAlpha = (calm ? .12 : .23) * (1 - phase * .38) * (.48 + timeState.daylight * .52);
      ctx.lineWidth = band === 1 ? 1.8 : 1.15;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.sin(seconds * .42 + segment) * 3, y);
      ctx.lineTo(centerX - 2 + Math.sin(seconds * .38 + segment) * 3, y + length);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = (calm ? .17 : .29) * (.55 + timeState.daylight * .45);
  ctx.strokeStyle = "#cad9d2";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(impactX, impactY + 3, Math.max(19, fall * .17), Math.max(4, fall * .025), 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!calm) {
    for (let index = 0; index < 12; index += 1) {
      const phase = fract(index * .317 + seconds * .71);
      const direction = index % 2 ? 1 : -1;
      const x = impactX + direction * (6 + phase * (14 + index * 1.9));
      const y = impactY - phase * (34 + index * 1.2) + phase * phase * 29;
      ctx.globalAlpha = .25 * (1 - phase);
      ctx.fillStyle = "#cad9d2";
      ctx.beginPath();
      ctx.arc(x, y, index % 4 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawRipple(ctx, x, y, age, calm = false) {
  if (age < 0 || age > 1.8) return;
  ctx.save();
  ctx.strokeStyle = "#b0d3d0";
  for (let index = 0; index < 3; index += 1) {
    const stage = age - index * .22;
    if (stage < 0) continue;
    ctx.globalAlpha = (calm ? .12 : .24) * (1 - stage / 1.8);
    ctx.lineWidth = .9;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + stage * 28, 1.4 + stage * 6.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDroplet(ctx, scene, project, seconds, calm) {
  if (!scene.droplet || calm || seconds < 5) return;
  const { source, target, interval } = scene.droplet;
  const phase = (seconds - 5) % interval;
  const [sx, sy] = project(source);
  const [tx, ty] = project(target);
  if (sx < -30 || sx > window.innerWidth + 30 || ty < 0 || sy > window.innerHeight) return;
  if (phase < 2.1) {
    const growth = clamp(phase / 2.1, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(181, 217, 214, .57)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + growth * 3.5, 2.1 + growth * 1.5, 2.4 + growth * 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (phase < 2.7) {
    const fall = clamp((phase - 2.1) / .6, 0, 1);
    const eased = fall * fall;
    const x = sx + (tx - sx) * eased;
    const y = sy + (ty - sy) * eased;
    ctx.save();
    ctx.fillStyle = "rgba(181, 217, 214, .79)";
    ctx.beginPath();
    ctx.ellipse(x, y, 3.5, 4.3 - fall * .6, .05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(241, 249, 242, .54)";
    ctx.beginPath();
    ctx.arc(x - 1, y - 1.7, .8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (phase < 4.5) {
    const age = phase - 2.7;
    if (age < .27) {
      ctx.save();
      ctx.strokeStyle = "rgba(202, 217, 210, .45)";
      ctx.lineWidth = 1;
      for (let index = 0; index < 3; index += 1) {
        const direction = index - 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + direction * (4 + age * 18), ty - (7 - age * 20));
        ctx.stroke();
      }
      ctx.restore();
    }
    drawRipple(ctx, tx, ty, age);
  }
}

function drawLeaf(ctx, x, y, size, angle, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#8b9d71";
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * .82, -size * .52, size * .7, size * .5, 0, size);
  ctx.bezierCurveTo(-size * .68, size * .5, -size * .82, -size * .53, 0, -size);
  ctx.fill();
  ctx.strokeStyle = "rgba(217, 207, 157, .56)";
  ctx.lineWidth = .65;
  ctx.beginPath();
  ctx.moveTo(0, -size * .75);
  ctx.lineTo(0, size * .7);
  ctx.stroke();
  ctx.restore();
}

function drawLeaves(ctx, scene, project, seconds, calm, mobile, wind) {
  if (calm) return;
  const count = mobile ? 1 : 2;
  for (let index = 0; index < count; index += 1) {
    const phase = fract((seconds + index * 8.7) / (index ? 22 : 18));
    if (phase > .65) continue;
    const source = scene.id === "scenarios" ? [.11 + index * .07, .13] : [.82 + index * .07, .08];
    const [sx, sy] = project(source);
    const duration = phase / .65;
    const x = sx + wind * (index ? 11 : 15) + duration * (index ? -65 : 44);
    const y = sy + duration * Math.min(window.innerHeight * .72, 470);
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) continue;
    drawLeaf(ctx, x, y, index ? 5.5 : 7, Math.sin(seconds * 1.2 + index) * .8 + duration * 1.7, .72 * Math.sin(Math.PI * duration));
  }
}

export default function ForestAmbientCanvas({ pathname, mode, quality = "auto", journeyRef }) {
  const canvasRef = useRef(null);
  const ambientSecondsRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx;
    try { ctx = canvas?.getContext("2d", { alpha: true }); } catch { return undefined; }
    if (!ctx) return undefined;
    const home = pathname === "/app";
    const effectiveMode = isFocusedRoute(pathname) ? "static" : mode;
    const lowPower = isLowPower(hardwareHints());
    const drawInterval = effectiveMode === "calm" || quality === "economy"
      ? lowPower ? 83 : 50 : lowPower ? 50 : 33;
    let raf = 0;
    let lastTime = performance.now();
    let lastDraw = 0;
    let seconds = ambientSecondsRef.current;
    let currentId = "";
    let activeBranch = null;
    let activeImage = null;
    let activeMist = null;
    let panelTop = 0;
    let panelHeight = window.innerHeight;
    let sample = { activeSection: "hero", position: 0, scrollY: window.scrollY };
    let frameSamples = [];
    let lastStatsAt = performance.now();
    let adaptiveCalm = false;
    let budgetFrames = 0;
    let slowBudgetFrames = 0;
    let healthyWindows = 0;
    let scrollWind = 0;

    function resize() {
      if (effectiveMode === "static") {
        if (canvas.width !== 1) canvas.width = 1;
        if (canvas.height !== 1) canvas.height = 1;
        currentId = "";
        return;
      }
      const dpr = effectDpr({ width: window.innerWidth, height: window.innerHeight,
        deviceDpr: window.devicePixelRatio, quality: quality === "auto" && lowPower ? "economy" : quality });
      const width = Math.ceil(window.innerWidth * dpr);
      const height = Math.ceil(window.innerHeight * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      currentId = "";
    }

    function onWorld(event) { sample = event.detail; }
    function onLayout() { currentId = ""; }

    function activeFrame(sceneId) {
      if (!home) {
        const panel = document.querySelector(".forest-route-panel");
        activeImage = panel?.querySelector(".forest-panel-image") || null;
        activeBranch = panel?.querySelector("[data-forest-branch]") || null;
        activeMist = panel?.querySelector(".forest-panel-mist") || null;
        return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      }
      if (currentId !== sceneId) {
        const panel = journeyRef.current?.querySelector(`[data-forest-scene="${sceneId}"]`);
        panelTop = panel?.offsetTop ?? 0;
        panelHeight = panel?.offsetHeight || window.innerHeight;
        activeBranch = panel?.querySelector("[data-forest-branch]") || null;
        activeImage = panel?.querySelector(".forest-panel-image") || null;
        activeMist = panel?.querySelector(".forest-panel-mist") || null;
        currentId = sceneId;
      }
      return { left: 0, top: panelTop - sample.scrollY, width: window.innerWidth, height: panelHeight };
    }

    function updateBranch(wind) {
      if (activeBranch) activeBranch.style.transform = `rotate(${wind.toFixed(3)}deg)`;
    }

    function tick(now) {
      if (document.hidden) return;
      raf = requestAnimationFrame(tick);
      const dt = clamp((now - lastTime) / 1000, 0, .5);
      lastTime = now;
      seconds += dt;
      ambientSecondsRef.current = seconds;
      if (now - lastDraw < (adaptiveCalm ? Math.max(50, drawInterval) : drawInterval)) return;
      lastDraw = now;
      const began = performance.now();
      if (import.meta.env.DEV) window.__forestClock = seconds;
      const sceneId = home ? sample.activeSection : sceneForRoute(pathname).id;
      const scene = FOREST_SCENES[sceneId] || FOREST_SCENES.hero;
      const frame = activeFrame(scene.id);
      const mobile = window.innerWidth < 768;
      const index = FOREST_ORDER.indexOf(scene.id);
      const parallaxY = home ? clamp((sample.position - index) * (mobile ? 12 : 23), -32, 32) : 0;
      const project = createSceneProjection(scene, frame, { mobile, parallaxY });
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const calm = effectiveMode === "calm" || !home || adaptiveCalm || quality === "economy";
      const sky = STATIC_LIGHT;
      const targetWind = clamp((sample.velocity || 0) / Math.max(1, window.innerHeight) * .12, -.23, .23);
      scrollWind += (targetWind - scrollWind) * Math.min(1, dt * 4);
      const gustPhase = seconds % 19;
      const gust = gustPhase > 12 && gustPhase < 17 ? Math.sin((gustPhase - 12) / 5 * Math.PI) * .28 : 0;
      const wind = (Math.sin(seconds * .72) + Math.sin(seconds * .31 + .6) * .28 + gust + scrollWind)
        * (calm ? .34 : .84);
      updateBranch(wind);
      if (activeMist) activeMist.style.transform = `translate3d(${(wind * 3.2).toFixed(2)}px,0,0)`;
      drawFlow(ctx, scene, project, seconds, calm, sky, activeImage, mobile);
      drawWaterfall(ctx, scene, project, seconds, calm, sky);
      if (home) {
        if (!mobile) drawDroplet(ctx, scene, project, seconds, calm);
        drawLeaves(ctx, scene, project, seconds, calm, mobile, wind);
      } else if (pathname.startsWith("/report/") && seconds < 6) {
        const point = project([.73, .72]);
        drawRipple(ctx, point[0], point[1], seconds - 2, true);
      } else if (pathname === "/profile") {
        const point = project([.73, .72]);
        drawRipple(ctx, point[0], point[1], (seconds - 3) % 22, true);
      }
      const drawMs = performance.now() - began;
      budgetFrames += 1;
      if (drawMs > 5) slowBudgetFrames += 1;
      if (budgetFrames >= 60) {
        if (slowBudgetFrames >= 18) { adaptiveCalm = true; healthyWindows = 0; }
        else if (adaptiveCalm && slowBudgetFrames <= 2) {
          healthyWindows += 1;
          if (healthyWindows >= 4) { adaptiveCalm = false; healthyWindows = 0; }
        } else healthyWindows = 0;
        budgetFrames = 0;
        slowBudgetFrames = 0;
      }
      if (import.meta.env.DEV) {
        frameSamples.push(drawMs);
        if (now - lastStatsAt > 3000) {
          const sampleCount = frameSamples.length;
          frameSamples.sort((a, b) => a - b);
          window.__forestStats = { scene: scene.id, mode: effectiveMode, quality,
            fps: Math.round(sampleCount * 1000 / (now - lastStatsAt)),
            p95Ms: Number((frameSamples[Math.floor(frameSamples.length * .95)] || 0).toFixed(2)),
            adaptiveCalm, canvas: [canvas.width, canvas.height] };
          frameSamples = [];
          lastStatsAt = now;
        }
      }
    }

    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && effectiveMode !== "static") {
        lastTime = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    resize();
    if (home) window.addEventListener("arena:home-world", onWorld);
    if (home) window.addEventListener("arena:forest-layout", onLayout);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    if (effectiveMode !== "static") raf = requestAnimationFrame(tick);
    else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      journeyRef.current?.querySelectorAll("[data-forest-branch]").forEach((branch) => { branch.style.transform = "rotate(0deg)"; });
    }
    return () => {
      cancelAnimationFrame(raf);
      if (home) window.removeEventListener("arena:home-world", onWorld);
      if (home) window.removeEventListener("arena:forest-layout", onLayout);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      delete window.__forestStats;
      delete window.__forestClock;
    };
  }, [pathname, mode, quality, journeyRef]);

  return <canvas className="forest-ambient-canvas" ref={canvasRef} aria-hidden="true"
    hidden={mode === "static" || isFocusedRoute(pathname)} />;
}
