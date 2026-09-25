export function hardwareHints(device = globalThis.navigator) {
  return {
    cores: Number(device?.hardwareConcurrency) || null,
    memoryGb: Number(device?.deviceMemory) || null,
    saveData: Boolean(device?.connection?.saveData),
  };
}

export function isLowPower(hints) {
  return Boolean(hints.saveData || (hints.cores !== null && hints.cores <= 4)
    || (hints.memoryGb !== null && hints.memoryGb <= 4));
}

export function shouldUseStaticOwl(hints) {
  return Boolean(hints.saveData || (hints.cores !== null && hints.cores <= 2)
    || (hints.memoryGb !== null && hints.memoryGb <= 2));
}

// Avoid importing Three.js and a multi-megabyte GLB on software-only WebGL.
let cachedWebGL = null;

export function hasUsableWebGL(createCanvas) {
  const cacheable = createCanvas === undefined;
  if (cacheable && cachedWebGL !== null) return cachedWebGL;
  let gl;
  let usable = false;
  try {
    gl = (createCanvas || (() => document.createElement("canvas")))().getContext("webgl", { failIfMajorPerformanceCaveat: true,
      antialias: false, powerPreference: "low-power" });
    if (gl) {
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      const name = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      usable = !/swiftshader|software|llvmpipe|softpipe|microsoft basic render/i.test(String(name));
    }
  } catch { usable = false; }
  finally { gl?.getExtension("WEBGL_lose_context")?.loseContext(); }
  if (cacheable) cachedWebGL = usable;
  return usable;
}

export function renderPixelRatio({ width, height, deviceDpr = 1, lowPower = false, scale = 1 }) {
  const budget = lowPower ? 1_300_000 : 3_000_000;
  const cap = lowPower ? 1 : 1.5;
  return Math.max(.35, Math.min(deviceDpr || 1, cap,
    Math.sqrt(budget / Math.max(1, width * height))) * scale);
}
