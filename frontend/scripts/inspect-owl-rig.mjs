import * as THREE from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadGeometryGlb } from './lib/owl-glb.mjs';

const file = new URL('../public/assets/owl/owl-v4.glb', import.meta.url);
const { scene, animations, json } = await loadGeometryGlb(file);
const meshes = [], bones = [];
scene.traverse(node => {
  if (node.isBone) bones.push({ name: node.name, parent: node.parent.name, position: node.position.toArray(), rotation: node.rotation.toArray().slice(0, 3) });
  if (node.isSkinnedMesh) {
    const counts = {};
    const joints = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
    for (let i = 0; i < joints.count; i++) for (let j = 0; j < 4; j++) if (weights.array[i * 4 + j] > .05) {
      const name = node.skeleton.bones[joints.array[i * 4 + j]].name;
      counts[name] = (counts[name] || 0) + 1;
    }
    meshes.push({ name: node.name, count: joints.count, influences: counts, bounds: new THREE.Box3().setFromObject(node, true) });
  }
});
const mixer = new THREE.AnimationMixer(scene), poses = [];
for (const name of ['Idle', 'FlyLoop', 'Takeoff', 'Landing', 'HeadTilt']) {
  const clip = animations.find(c => c.name === name);
  mixer.stopAllAction(); const action = mixer.clipAction(clip).play();
  for (const t of [0, .2, .4, .6]) {
    action.time = t; mixer.update(0); scene.updateMatrixWorld(true);
    poses.push({ name, t, bones: bones.filter(b => /Root|Spine|Chest|Neck|Head|Wing|Shoulder|Elbow|Wrist/.test(b.name)).map(b => {
      const bone = scene.getObjectByName(b.name);
      return { name: b.name, p: bone.getWorldPosition(new THREE.Vector3()).toArray(), local: bone.position.toArray(), r: bone.rotation.toArray().slice(0, 3), scale: bone.scale.toArray() };
    }) });
  }
}
const report = { bones, meshes, poses, materials: json.materials };
await mkdir('../.cache/owl-repair', { recursive: true });
await writeFile('../.cache/owl-repair/rig-before.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ bones: bones.filter(b => !/Finger|Toe|Primary|Secondary/.test(b.name)), meshes }, null, 2));
