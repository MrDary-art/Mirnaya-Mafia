import { useEffect, useRef, useState } from "react";

// Login has no owl canvas. This renderer exists only while Login is mounted;
// the main experience owns the sole WebGL context on authenticated routes.
export default function LoginWorld() {
  const host = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    async function mount() {
      try {
        const [THREE, { createProductWorld }] = await Promise.all([
          import("three"), import("../experience/product-world/createProductWorld.js"),
        ]);
        if (disposed || !host.current) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setClearColor(0x080c0e, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.02;
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.current.appendChild(renderer.domElement);
        const world = createProductWorld(THREE, { placement: "auth" });
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        const resize = () => {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
          renderer.setSize(window.innerWidth, window.innerHeight, false);
          world.resize(window.innerWidth, window.innerHeight);
        };
        const contextLost = (event) => { event.preventDefault(); setFailed(true); };
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        window.addEventListener("resize", resize);
        resize();
        renderer.setAnimationLoop(() => {
          if (document.hidden) return;
          world.update("/admin", "hero", performance.now(), reduced.matches, "full");
          world.render(renderer);
        });
        cleanup = () => {
          renderer.setAnimationLoop(null);
          window.removeEventListener("resize", resize);
          renderer.domElement.removeEventListener("webglcontextlost", contextLost);
          world.dispose(); renderer.dispose(); renderer.domElement.remove();
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    }
    mount();
    return () => { disposed = true; cleanup(); };
  }, []);
  return <div className={`auth-product-world${failed ? " is-fallback" : ""}`} ref={host} aria-hidden="true"><img className="auth-static-motif" src="/assets/product-world/M12.png" alt="" /></div>;
}
