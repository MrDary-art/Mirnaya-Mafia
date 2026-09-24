import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { visualForRoute } from "./routeVisuals.js";
import { OwlController } from "./owl/OwlController.js";
import { createFeatherSystem } from "./owl/createFeatherSystem.js";
import { createHomeWorld } from "./createHomeWorld.js";
import { smoothstep } from "./homeWorldModel.js";

const OWL_ASSET = window.innerWidth < 768
  ? "/assets/owl/owl-rigged-low.glb"
  : "/assets/owl/owl-rigged-high.glb";

export default function ExperienceCanvas() {
  const { pathname } = useLocation();
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    async function mount() {
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([
          import("three"),
          import("three/addons/loaders/GLTFLoader.js"),
        ]);
        if (disposed || !containerRef.current) return;
        const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        camera.position.set(0, 0, 10);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
        renderer.setClearColor(0x07090a, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.02;
        containerRef.current.appendChild(renderer.domElement);
        renderer.domElement.setAttribute("aria-hidden", "true");

        scene.add(new THREE.HemisphereLight(0xe9f0ed, 0x222e2b, 0.85));
        const key = new THREE.DirectionalLight(0xe5eeeb, 2.15);
        key.position.set(2, 5, 6);
        scene.add(key);
        const faceFill = new THREE.DirectionalLight(0xe8f3ed, 0.65);
        faceFill.position.set(-4, 1, 7);
        scene.add(faceFill);
        const rim = new THREE.PointLight(0x3bd49a, 2.8, 10);
        rim.position.set(5, 1, -1);
        scene.add(rim);
        const violet = new THREE.PointLight(0x826fe8, 1.6, 9);
        violet.position.set(6, -2, 2);
        scene.add(violet);

        const core = new THREE.Group();
        const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x41494a, metalness: 0.35, roughness: 0.46, transparent: true, opacity: 0 });
        const coreGeometry = new THREE.TorusGeometry(2.4, 0.6, 16, 64, Math.PI * 1.55);
        const coreA = new THREE.Mesh(coreGeometry, coreMaterial);
        coreA.rotation.set(0.5, 0.35, -0.4);
        coreA.position.set(-0.5, 0.1, -2.1);
        const coreB = new THREE.Mesh(coreGeometry, coreMaterial);
        coreB.rotation.set(0.85, -0.5, 2.15);
        coreB.position.set(0.45, -0.3, -2.6);
        core.add(coreA, coreB);
        core.position.x = 3;
        scene.add(core);
        const homeWorld = createHomeWorld(THREE, scene);
        let homeSnapshot = null;
        const onHomeWorld = (event) => { homeSnapshot = event.detail; };
        window.addEventListener("arena:home-world", onHomeWorld);

        const owlRoot = new THREE.Group();
        owlRoot.position.set(4.5, -1.25, 0);
        scene.add(owlRoot);
        const stumpRoot = new THREE.Group();
        scene.add(stumpRoot);
        let stump = null;
        let stumpOpacity = 0;
        const owl = new OwlController(THREE, owlRoot);
        const feathers = createFeatherSystem(THREE, scene);
        owl.setRoute(visualForRoute(window.location.pathname, window.innerWidth));

        const hasLowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
        let pixelRatio = Math.min(window.devicePixelRatio || 1, hasLowPower ? 1.1 : 1.7);
        let lastMobile = window.innerWidth < 768;
        let lastFrame = performance.now();
        let fpsSamples = 0;
        let slowFrames = 0;
        let debugFrames = 0;
        let debugSampleAt = lastFrame;

        function resize() {
          const width = window.innerWidth;
          const height = window.innerHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(width, height, false);
          const mobile = width < 768;
          const nextVisual = visualForRoute(window.location.pathname, width);
          if (mobile !== lastMobile) owl.setRoute(nextVisual);
          else owl.route = nextVisual;
          lastMobile = mobile;
        }

        function onPointer(event) {
          owl.setPointer((event.clientX / window.innerWidth - 0.5) * 2, (0.5 - event.clientY / window.innerHeight) * 2);
        }

        function onFocus(event) {
          const box = event.target?.getBoundingClientRect?.();
          if (box) owl.setFocusTarget({ x: ((box.left + box.width / 2) / window.innerWidth - 0.5) * 2, y: (0.5 - (box.top + box.height / 2) / window.innerHeight) * 2 });
        }

        function onBlur() { owl.setFocusTarget(null); }
        function onContextLost(event) { event.preventDefault(); setStatus("fallback"); }
        window.addEventListener("resize", resize);
        window.addEventListener("pointermove", onPointer, { passive: true });
        document.addEventListener("focusin", onFocus);
        document.addEventListener("focusout", onBlur);
        renderer.domElement.addEventListener("webglcontextlost", onContextLost);
        resize();

        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          if (document.hidden) return;
          const now = performance.now();
          const delta = Math.min(clock.getDelta(), 0.25);
          const reduced = reducedQuery.matches;
          const onHome = window.location.pathname === "/";
          if (onHome && homeSnapshot) owl.setHomeSnapshot(homeSnapshot);
          owl.update(delta, now, reduced);
          feathers.update(delta, now, owl, onHome && !reduced);
          if (stump) {
            const home = visualForRoute("/", window.innerWidth);
            const eased = reduced ? 1 : 1 - Math.exp(-delta * 4);
            const departure = onHome && homeSnapshot ? smoothstep((homeSnapshot.heroProgress - .18) / .34) : 1;
            stumpRoot.position.lerp(new THREE.Vector3(home.x, home.y - departure * 1.1, -departure * 1.3), eased);
            stumpRoot.scale.lerp(new THREE.Vector3(home.scale * 1.65, home.scale, home.scale * 1.35), eased);
            const keepStump = onHome ? 1 - departure : 0;
            stumpOpacity += (keepStump - stumpOpacity) * eased;
            stump.visible = stumpOpacity > 0.03;
            stump.material.opacity = stumpOpacity;
          }
          if (onHome && homeSnapshot) homeWorld.update(homeSnapshot, now, reduced);
          else {
            for (const group of homeWorld.groups) group.visible = false;
            homeWorld.spine.visible = false;
          }
          const cameraTargetX = onHome && homeSnapshot && !reduced ? Math.sin(homeSnapshot.position * .8) * .18 : 0;
          camera.position.x += (cameraTargetX - camera.position.x) * (reduced ? 1 : 1 - Math.exp(-delta * 2));
          const targetCore = onHome && homeSnapshot
            ? .62 * (1 - smoothstep((homeSnapshot.heroProgress - .08) / .55)) : owl.route?.core || 0;
          coreMaterial.opacity += (targetCore - coreMaterial.opacity) * (reduced ? 1 : 1 - Math.exp(-delta * 3));
          core.visible = coreMaterial.opacity > 0.01;
          if (!reduced) core.rotation.y = Math.sin(now * 0.00012) * 0.08;
          renderer.render(scene, camera);
          if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("worldDebug")) {
            debugFrames += 1;
            if (now - debugSampleAt > 500) {
              window.__arenaWorldStats = {
                fps: Math.round(debugFrames * 1000 / (now - debugSampleAt)),
                owlState: owl.flightPhase || owl.state,
                wingSpeed: homeSnapshot?.speed || "idle",
                cameraState: `x:${camera.position.x.toFixed(2)}`,
                loadedScenes: homeSnapshot?.loadedScenes?.join(",") || "",
              };
              debugFrames = 0;
              debugSampleAt = now;
            }
          }

          if (now - lastFrame > 20) slowFrames += 1;
          fpsSamples += 1;
          if (fpsSamples >= 120) {
            if (slowFrames > 72 && pixelRatio > 1) {
              pixelRatio = 1;
              resize();
            }
            slowFrames = 0;
            fpsSamples = 0;
          }
          lastFrame = now;
        });

        cleanup = () => {
          renderer.setAnimationLoop(null);
          window.removeEventListener("resize", resize);
          window.removeEventListener("pointermove", onPointer);
          document.removeEventListener("focusin", onFocus);
          document.removeEventListener("focusout", onBlur);
          renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
          window.removeEventListener("arena:home-world", onHomeWorld);
          owl.dispose();
          feathers.dispose();
          coreGeometry.dispose();
          coreMaterial.dispose();
          owl.model?.traverse((object) => {
            if (object.isMesh) {
              object.geometry?.dispose();
              object.material?.dispose();
            }
          });
          if (stump) {
            stump.geometry?.dispose();
            stump.material?.dispose();
          }
          homeWorld.dispose();
          renderer.dispose();
          renderer.domElement.remove();
          if (window.__arenaOwlLab === owl) delete window.__arenaOwlLab;
          delete window.__arenaWorldStats;
          runtimeRef.current = null;
        };
        runtimeRef.current = { owl };
        if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("owlLab")) {
          window.__arenaOwlLab = owl;
        }

        new GLTFLoader().load(OWL_ASSET, (gltf) => {
          if (disposed) return;
          const rig = gltf.scene.getObjectByName("OwlRig");
          const body = gltf.scene.getObjectByName("OwlBody");
          stump = gltf.scene.getObjectByName("TreeStump");
          if (!rig || !body?.isSkinnedMesh || !stump) { setStatus("fallback"); return; }
          const rigMeshes = [];
          rig.traverse((object) => { if (object.isMesh) rigMeshes.push(object); });
          for (const object of [stump, ...rigMeshes]) {
            if (!object.isMesh) continue;
            object.material.transparent = true;
            object.material.opacity = 0;
            object.material.side = THREE.DoubleSide;
            object.frustumCulled = false;
          }
          rig.removeFromParent();
          stump.removeFromParent();
          stump.material.color.set(0x879189);
          stump.material.roughness = .86;
          stump.material.metalness = .06;
          const center = owl.attach(rig, gltf.animations);
          stump.position.sub(center);
          stumpRoot.add(stump);
          const home = visualForRoute("/", window.innerWidth);
          stumpRoot.position.set(home.x, home.y, 0);
          stumpRoot.scale.set(home.scale * 1.65, home.scale, home.scale * 1.35);
          setStatus("ready");
        }, undefined, () => setStatus("fallback"));
      } catch {
        if (!disposed) setStatus("fallback");
      }
    }

    mount();
    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => {
    runtimeRef.current?.owl.setRoute(visualForRoute(pathname, window.innerWidth));
  }, [pathname]);

  return (
    <div className={`nova-experience${pathname === "/" ? " is-home" : ""}`} aria-hidden="true">
      <div ref={containerRef} className="nova-experience-canvas" />
      {status !== "ready" && <img className="nova-owl-fallback" src="/assets/owl-hero-fallback.png" alt="" />}
    </div>
  );
}
