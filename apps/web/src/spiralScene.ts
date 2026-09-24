import {
  ACESFilmicToneMapping, BufferAttribute, BufferGeometry, Color, DoubleSide,
  EquirectangularReflectionMapping, Mesh, MeshStandardMaterial, PerspectiveCamera,
  PMREMGenerator, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import type { AppearancePreferences } from "./appearancePreferences";
import { defaultAppearance } from "./appearancePreferences";

export type SpiralScene = {
  update: (appearance: AppearancePreferences, reducedMotion: boolean) => void;
  dispose: () => void;
};
const base = "/backgrounds/vara/";

function readGeometry(buffer: ArrayBuffer) {
  const header = new DataView(buffer);
  if (header.byteLength < 16 || header.getUint32(0, true) !== 0x414e5241 || header.getUint32(4, true) !== 1) throw new Error("Invalid spiral geometry");
  const vertices = header.getUint32(8, true), indices = header.getUint32(12, true);
  if (buffer.byteLength !== 16 + vertices * 32 + indices * 4) throw new Error("Incomplete spiral geometry");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffer, 16, vertices * 3), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(buffer, 16 + vertices * 12, vertices * 3), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(buffer, 16 + vertices * 24, vertices * 2), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(buffer, 16 + vertices * 32, indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSpiralScene(canvas: HTMLCanvasElement, onError: () => void): SpiralScene {
  const renderer = new WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  const camera = new PerspectiveCamera(75, 1, 0.01, 100);
  const abort = new AbortController();
  const textures: Texture[] = [];
  const bitmaps: ImageBitmap[] = [];
  let environment: WebGLRenderTarget | undefined;
  let mesh: Mesh<BufferGeometry, MeshStandardMaterial> | undefined;
  let disposed = false, reducedMotion = false, frame = 0, last = 0, elapsed = 0;
  let options = { ...defaultAppearance };

  function paint() { if (!disposed && mesh) renderer.render(scene, camera); }
  function animate(now: number) {
    frame = 0;
    if (disposed || document.hidden) return;
    const delta = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (mesh && !reducedMotion && options.animation !== "still") {
      elapsed += delta * options.speed;
      // Reference motion: 0.15 radians/second around the vertical axis.
      mesh.rotation.y -= 0.15 * delta * options.speed;
      mesh.rotation.z = options.animation === "float" ? Math.sin(elapsed * 0.45) * 0.045 : 0;
      // The canvas is fixed to the viewport. Page scroll varies between routes;
      // applying it here moves the mesh outside the camera on long pages.
      mesh.position.y = options.animation === "float" ? Math.sin(elapsed * 0.7) * 0.055 : 0;
    }
    paint();
    if (mesh && options.animation !== "still" && !reducedMotion) frame = requestAnimationFrame(animate);
  }
  function wake() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (!disposed && !document.hidden) frame = requestAnimationFrame(animate);
  }
  function resize() {
    if (disposed) return;
    const {width,height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.position.set(-0.2173184581,-0.0588820184,-0.77);
    camera.lookAt(0,0,0);
    // Match the VARA reference camera and focal offset, while keeping the
    // spiral in view on narrow screens (the reference hides it on mobile).
    camera.position.add(new Vector3(1,0,0).applyQuaternion(camera.quaternion).multiplyScalar(width < 600 ? -0.09 : -0.35));
    camera.position.add(new Vector3(0,1,0).applyQuaternion(camera.quaternion).multiplyScalar(-2));
    camera.updateProjectionMatrix();
    paint();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener("visibilitychange",wake);
  const lost = (event: Event) => { event.preventDefault(); if (!disposed) { dispose(); onError(); } };
  canvas.addEventListener("webglcontextlost",lost);
  resize();

  async function resource(file: string) {
    const response = await fetch(base+file,{signal:abort.signal});
    if (!response.ok) throw new Error(`Spiral asset: ${response.status}`);
    return response;
  }
  async function texture(file: string, flipY: boolean) {
    const response = await resource(file);
    const bitmap = await createImageBitmap(await response.blob(), {imageOrientation:flipY?"flipY":"none"});
    if (disposed) { bitmap.close(); throw new Error("Disposed"); }
    bitmaps.push(bitmap);
    const result = new Texture(bitmap);
    result.colorSpace = SRGBColorSpace;
    result.needsUpdate = true;
    textures.push(result);
    return result;
  }
  Promise.all([
    resource("spiral.bin.gz").then(async response => {
      if (!response.body) throw new Error("Empty geometry");
      return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }),
    texture("material.png",false),
    texture("environment.jpg",true),
  ]).then(([data,map,sky]) => {
    if (disposed) return;
    const geometry = readGeometry(data);
    sky.mapping = EquirectangularReflectionMapping;
    const pmrem = new PMREMGenerator(renderer);
    environment = pmrem.fromEquirectangular(sky);
    pmrem.dispose();
    scene.environment = environment.texture;
    const material = new MeshStandardMaterial({color:new Color(options.spiralColor), map, metalness:0.9, roughness:0.1, side:DoubleSide});
    mesh = new Mesh(geometry, material);
    scene.add(mesh);
    resize(); wake();
  }).catch(() => { if (!disposed) { dispose(); onError(); } });

  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort(); cancelAnimationFrame(frame); observer.disconnect();
    document.removeEventListener("visibilitychange",wake);
    canvas.removeEventListener("webglcontextlost",lost);
    mesh?.geometry.dispose(); mesh?.material.dispose(); environment?.dispose();
    textures.forEach(value => value.dispose()); bitmaps.forEach(value => value.close());
    renderer.dispose(); renderer.forceContextLoss();
  }
  return {
    update(next, reduce) {
      options = next; reducedMotion = reduce;
      mesh?.material.color.set(next.spiralColor);
      wake();
    },
    dispose,
  };
}
