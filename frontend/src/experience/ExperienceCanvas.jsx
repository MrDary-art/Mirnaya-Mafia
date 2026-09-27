import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { OwlV4Controller } from "./owl/OwlV4Controller.js";
import { prepareOwlPerch } from "./owl/owlPerch.js";
import { disposeOwlScene, loadOwlResource, owlPlacement, OWL_SETTINGS, OWL_SHA256, OWL_ASSET } from "./owl/owlV4.js";
import { hardwareHints, hasUsableWebGL, isLowPower, renderPixelRatio, shouldUseStaticOwl } from "../environment2d/performanceTier.js";
import "./owl/owl-v4.css";

const OwlDebugPanel = import.meta.env.DEV ? lazy(() => import("./owl/OwlDebugPanel.jsx")) : null;

export default function ExperienceCanvas({ preferences }) {
  const { pathname, search } = useLocation();
  const home = pathname === "/app";
  const container = useRef(null), runtime = useRef(null), prefs = useRef(preferences);
  prefs.current = preferences;
  const [status, setStatus] = useState("loading");
  const [heroVisible, setHeroVisible] = useState(true);
  const [lab, setLab] = useState(null);
  const force = import.meta.env.DEV && new URLSearchParams(search).has("owl3d");
  const debug = import.meta.env.DEV && new URLSearchParams(search).has("owlLab");
  const staticPreference = preferences?.motion === "static";
  const asset = `${import.meta.env.BASE_URL}assets/owl/${OWL_ASSET}`;

  useEffect(() => {
    if (!home) return undefined;
    let snapshot = null;
    const onWorld = event => {
      snapshot = event.detail;
      runtime.current?.owl.setHomeSnapshot(snapshot);
      setHeroVisible(snapshot.heroProgress < .14);
    };
    window.addEventListener("arena:home-world", onWorld);
    let disposed = false, cleanup = () => {};
    const abort = new AbortController();
    if (import.meta.env.DEV) delete window.__arenaOwlError;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hints = hardwareHints();
    const economy = isLowPower(hints) || window.innerWidth < 768 || prefs.current?.quality === "economy";
    const staticOnly = reduced.matches || prefs.current?.motion === "static";
    setStatus("loading");
    if (!force && (staticOnly || shouldUseStaticOwl(hints) || !hasUsableWebGL())) {
      setStatus("fallback");
      return () => window.removeEventListener("arena:home-world", onWorld);
    }

    async function mount() {
      let scene, renderer, owl;
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js")]);
        if (disposed) return;
        scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(OWL_SETTINGS.cameraFov, 1, .1, 100);
        camera.position.set(0, 0, OWL_SETTINGS.cameraZ);
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power", preserveDrawingBuffer: force });
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        container.current.appendChild(renderer.domElement);
        const root = new THREE.Group();
        const stumpRoot = new THREE.Group();
        scene.add(root, stumpRoot);
        root.visible = false;
        owl = new OwlV4Controller(THREE, root);
        scene.add(new THREE.HemisphereLight(0xeaf4ed, 0x394239, 2));
        const key = new THREE.DirectionalLight(0xffedce, 3.2);
        key.position.set(-3, 5, 7); scene.add(key);
        const fill = new THREE.DirectionalLight(0xc7e6f4, 1.4);
        fill.position.set(4, 2, 5); scene.add(fill);
        const rim = new THREE.DirectionalLight(0xc4dfa8, 1.5);
        rim.position.set(1, 4, -4); scene.add(rim);
        let lastTime = performance.now(), lastRender = 0, scale = 1;
        let frameCount = 0, slowCount = 0, severe = 0;
        let sampleStart = lastTime, sampleFrames = 0, fps = 0, loadedAt = Infinity;
        let stump, perch, skeleton, axes;
        let pointerWasInside = false;
        const placement = () => owlPlacement(window.innerWidth, window.innerHeight, owl.calibration, snapshot);
        function resize() {
          const width = window.innerWidth, height = window.innerHeight;
          camera.aspect = width / height; camera.updateProjectionMatrix();
          renderer.setPixelRatio(renderPixelRatio({ width, height, deviceDpr: devicePixelRatio, lowPower: economy, scale }));
          renderer.setSize(width, height, false);
          const poses = placement(); owl.setPlacement(poses.home, poses.flight);
          if (owl.state === "perched" || owl.reducedMotion) owl.snapToPose(poses.home);
          else if (owl.debug) owl.snapToPose(["Takeoff", "FlyLoop", "Glide", "Landing", "WingFlap", "Celebrate"].includes(owl.activeClip) ? poses.flight : poses.home);
        }
        const onVisibility = () => { lastTime = performance.now(); owl.setPaused(document.hidden); };
        const onPointer = event => {
          if (!owl.model || owl.state !== "perched") return;
          const point = root.position.clone().add(new THREE.Vector3(0, owl.calibration.height * root.scale.x * .55, 0)).project(camera);
          const cx = (point.x + 1) * innerWidth / 2, cy = (1 - point.y) * innerHeight / 2;
          const inside = Math.abs(event.clientX - cx) < (innerWidth < 768 ? 60 : 110) && Math.abs(event.clientY - cy) < 130;
          if (inside && !pointerWasInside) owl.gesture("HeadTilt");
          pointerWasInside = inside;
        };
        const onLost = event => { event.preventDefault(); fail(new Error("WebGL context lost")); };
        window.addEventListener("resize", resize);
        window.addEventListener("pointermove", onPointer, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
        renderer.domElement.addEventListener("webglcontextlost", onLost);
        let cleaned = false;
        cleanup = () => {
          if (cleaned) return;
          cleaned = true; abort.abort();
          renderer.setAnimationLoop(null);
          window.removeEventListener("resize", resize);
          window.removeEventListener("pointermove", onPointer);
          document.removeEventListener("visibilitychange", onVisibility);
          renderer.domElement.removeEventListener("webglcontextlost", onLost);
          owl.dispose(); disposeOwlScene(scene);
          renderer.dispose(); renderer.domElement.remove();
          if (window.__arenaOwlLab === owl) delete window.__arenaOwlLab;
          delete window.__arenaWorldStats;
          runtime.current = null;
        };
        function fail(error) {
          if (disposed) return;
          cleanup(); setStatus("fallback"); setLab(null);
          if (import.meta.env.DEV) window.__arenaOwlError = error.message;
        }
        resize();
        runtime.current = { owl };
        const loader = new GLTFLoader();
        // One byte-cache, separate owned scenes. Unmount aborts fetching and
        // disposes a late parse; StrictMode cannot leave a second renderer.
        const gltf = await loadOwlResource(loader, asset, abort.signal);
        if (disposed) { disposeOwlScene(gltf.scene); return; }
        scene.add(gltf.scene);
        owl.setHomeSnapshot(snapshot);
        owl.attach(gltf.scene, gltf.animations);
        owl.model.traverse(object => {
          // v4 skin bounds are animated; keep its eight meshes from being
          // culled using a stale bind-pose sphere. No global culling changes.
          if (object.isSkinnedMesh) object.frustumCulled = false;
        });
        resize(); owl.snapToPose(owl.wantsAir() ? owl.flightPose : owl.homePose);
        owl.setReducedMotion(reduced.matches || (!force && prefs.current?.motion === "static"));
        const stumpAsset = await loadOwlResource(loader, `${import.meta.env.BASE_URL}assets/owl/hero-stump.glb`, abort.signal);
        if (disposed) { disposeOwlScene(stumpAsset.scene); return; }
        stump = stumpAsset.scene;
        stump.traverse(object => {
          if (object.isMesh) { object.material.color.set(0x85745c); object.material.roughness = 1; object.material.metalness = 0; object.material.transparent = true; object.material.forceSinglePass = true; }
        });
        perch = prepareOwlPerch(THREE,stump);
        stump.traverse(object => { if (object.isMesh) { object.material.userData.restOpacity=object.material.opacity; object.material.transparent=true; } });
        stumpRoot.add(stump);
        if (debug) {
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", gltf.buffer))].map(value => value.toString(16).padStart(2, "0")).join("");
          if (hash !== OWL_SHA256) throw new Error("Owl v4 checksum mismatch");
          if (disposed) return;
          skeleton = new THREE.SkeletonHelper(owl.model); skeleton.visible = false; scene.add(skeleton);
          axes = new THREE.AxesHelper(1); axes.visible = false; root.add(axes);
          owl.showSkeleton = value => { skeleton.visible = value; };
          owl.showAxes = value => { axes.visible = value; };
          owl.render = () => renderer.render(scene, camera);
          owl.camera = camera;
          owl.perch = { ...perch, root: stumpRoot };
          owl.assetUrl = asset; owl.sha256 = hash;
          window.__arenaOwlLab = owl; setLab(owl);
        }
        root.visible = true; loadedAt = performance.now();
        setStatus("ready");
        renderer.setAnimationLoop(now => {
          if (disposed || document.hidden) { lastTime = now; return; }
          if (economy && now - lastRender < 32) return;
          const delta = Math.min((now - lastTime) / 1000, .25);
          const elapsed = now - lastRender;
          lastTime = now; lastRender = now;
          const poses = placement(); owl.setPlacement(poses.home, poses.flight);
          owl.update(delta, now, reduced.matches || (!force && prefs.current?.motion === "static"));
          stumpRoot.position.set(poses.home.x, poses.home.y, 0);
          const perchScale=owl.calibration.footWidth*poses.home.scale*1.18/perch.diameter;
          stumpRoot.scale.set(perchScale,perchScale*.7,perchScale);
          stumpRoot.visible = owl.debug || (snapshot?.heroProgress || 0) < .2;
          const progress = Math.max(0, Math.min(1, ((snapshot?.heroProgress || 0) - .05) / .15));
          const stumpOpacity = owl.debug ? 1 : 1 - progress * progress * (3 - 2 * progress);
          stump.traverse(object => { if (object.isMesh) object.material.opacity = stumpOpacity*object.material.userData.restOpacity; });
          renderer.render(scene, camera);
          sampleFrames += 1;
          if (now - sampleStart > 1000) { fps = Math.round(sampleFrames * 1000 / (now - sampleStart)); sampleFrames = 0; sampleStart = now; }
          if (import.meta.env.DEV) window.__arenaWorldStats = { fps, owlState: owl.getDiagnostics().state, clip: owl.activeClip, triangles: renderer.info.render.triangles, cameraState: "fixed", loadedScenes: snapshot?.loadedScenes?.join(",") || "hero" };
          if (!force && now - loadedAt > 3000) {
            frameCount += 1; if (elapsed > 100) slowCount += 1;
            if (frameCount >= 40) {
              if (slowCount > 25) { scale = Math.max(.5, scale - .2); severe += 1; resize(); } else severe = 0;
              frameCount = 0; slowCount = 0;
              if (severe >= 3) fail(new Error("Sustained low rendering performance"));
            }
          }
        });
      } catch (error) {
        if (!disposed) {
          cleanup(); disposeOwlScene(scene); renderer?.dispose();
          setStatus("fallback"); setLab(null);
          if (import.meta.env.DEV) window.__arenaOwlError = error.message;
        }
      }
    }
    const timer = window.setTimeout(mount, 180);
    return () => {
      disposed = true; abort.abort(); window.clearTimeout(timer);
      window.removeEventListener("arena:home-world", onWorld);
      cleanup(); setLab(null);
    };
  }, [home, force, debug, asset, staticPreference]);

  if (!home) return null;
  return <>
    <div className="nova-experience is-home nova-owl-v4" data-owl-status={status} aria-hidden="true">
      <div ref={container} className="nova-experience-canvas" />
      {status !== "ready" && heroVisible && <img className="nova-owl-v4-poster"
        src={`${import.meta.env.BASE_URL}assets/owl/owl-v4-poster.webp`} alt="" decoding="async" />}
    </div>
    {debug && lab && OwlDebugPanel && <Suspense fallback={null}><OwlDebugPanel owl={lab} /></Suspense>}
  </>;
}
