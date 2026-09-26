export const OWL_CLIPS = ['Idle', 'Blink', 'LookAround', 'HeadTilt', 'Nod', 'WaveLeftFoot', 'WaveRightFoot', 'WingFlap', 'Hop', 'Takeoff', 'FlyLoop', 'Glide', 'Landing', 'Celebrate'];
export const OWL_SOURCE_SHA256 = '15e1a769d71593e988168f5b5faaff507e584dde99ac3da8f61beb3b2ffadbc6';
export const OWL_SHA256 = '6e637da0c0e6c2e0c43af9ce0ec5703959082ca796f0679d8870bf48eadb44f5';
export const OWL_ASSET = 'owl-v4-repaired.glb';
export const OWL_SETTINGS = { crossfade: .25, travelDamping: 3.2, maxTravelSpeed: 4, cameraFov: 42, cameraZ: 10 };

export function owlPlacement(width, height, calibration, snapshot) {
  const mobile = width < 768;
  const viewHeight = 2 * Math.tan(OWL_SETTINGS.cameraFov * Math.PI / 360) * OWL_SETTINGS.cameraZ;
  const units = viewHeight / height;
  const bodyHeight = Math.max(.1, calibration?.height || 1.6);
  const scale = Math.min(mobile ? 185 : height * .37, mobile ? 185 : 350) * units / bodyHeight;
  const home = { x: (width * (mobile ? .5 : .81) - width / 2) * units,
    y: (height / 2 - (mobile ? 330 : height * .7)) * units, z: 0, scale };
  home.yaw = Math.atan2(-home.x,OWL_SETTINGS.cameraZ);
  // Existing scroll snapshots remain the only navigation source. Adapt their
  // presentation scale to v4's wider authored wings, not the scroll controller.
  const target = snapshot?.target || home;
  const flightScale = Math.min(scale * .7, (mobile ? width * .64 : Math.min(450, width * .31)) * units / 3.1,
    (width * units / 2 - .2) / 2.1);
  // Includes the perspective expansion of the near wing at peak extension.
  const halfWing = 2.1 * flightScale;
  const halfView = width * units / 2;
  // The highest feather is considerably above the face. Reserve its full
  // authored upper stroke, including perspective, rather than capping the head.
  const nominalRootY = mobile ? viewHeight * .20 : target.y || 0;
  const safeRootY = Math.min(nominalRootY, viewHeight / 2 - 3.2 * flightScale - .4);
  const flight = { x: Math.max(-halfView + halfWing + .2, Math.min(halfView - halfWing - .2, target.x || 0)),
    y: safeRootY - 1.08 * flightScale,
    z: 0, scale: flightScale };
  return { home, flight };
}

export function disposeOwlScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

const buffers = new Map();
export async function loadOwlResource(loader, url, signal) {
  let buffer = buffers.get(url);
  if (!buffer) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Owl asset: HTTP ${response.status}`);
    buffer = await response.arrayBuffer();
    signal.throwIfAborted();
    buffers.set(url, buffer);
  }
  signal.throwIfAborted();
  const gltf = await loader.parseAsync(buffer, url.slice(0, url.lastIndexOf('/') + 1));
  if (signal.aborted) { disposeOwlScene(gltf.scene); signal.throwIfAborted(); }
  return { ...gltf, buffer };
}
