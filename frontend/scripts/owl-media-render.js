import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OwlV4Controller } from '../src/experience/owl/OwlV4Controller.js';
import { prepareOwlPerch } from '../src/experience/owl/owlPerch.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
camera.position.set(0, 1.3, 8.2);
camera.lookAt(0, 1.05, 0);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(512, 512);
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xeaf4ed, 0x394239, 2));
for (const [color, intensity, position] of [
  [0xffedce, 3.2, [-3, 5, 7]],
  [0xc7e6f4, 1.4, [4, 2, 5]],
  [0xc4dfa8, 1.5, [1, 4, -4]],
]) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position);
  scene.add(light);
}

const loader = new GLTFLoader();
const [character, support] = await Promise.all([
  loader.loadAsync('/assets/owl/owl-v4-repaired.glb'),
  loader.loadAsync('/assets/owl/hero-stump.glb'),
]);
const root = new THREE.Group();
scene.add(root);
const owl = new OwlV4Controller(THREE, root);
owl.attach(character.scene, character.animations);
owl.model.traverse(object => { if (object.isSkinnedMesh) object.frustumCulled = false; });
const stump = support.scene;
stump.traverse(object => {
  if (!object.isMesh) return;
  object.material.color.set(0x85745c);
  object.material.roughness = 1;
  object.material.metalness = 0;
});
const perch = prepareOwlPerch(THREE, stump);
const perchScale = owl.calibration.footWidth * 1.18 / perch.diameter;
stump.scale.set(perchScale, perchScale * .7, perchScale);
scene.add(stump);
camera.updateMatrixWorld();
const anchor = new THREE.Vector3(0, 0, 0).project(camera);

window.__owlMedia = {
  clips: Object.fromEntries(character.animations.map(clip => [clip.name, clip.duration])),
  calibration: owl.calibration,
  anchor: { x: (anchor.x + 1) * 256, y: (1 - anchor.y) * 256 },
  render(clip, time) {
    owl.inspectClip(clip);
    owl.seek(time);
    root.position.set(0, 0, 0);
    root.scale.setScalar(1);
    root.rotation.set(0, 0, 0);
    root.visible = true;
    stump.visible = false;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png').split(',')[1];
  },
  renderStump() {
    root.visible = false;
    stump.visible = true;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png').split(',')[1];
  },
};
