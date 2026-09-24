import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { OwlController } from "./OwlController.js";

const home = { x: 0, y: 0, scale: 1, presence: 1, state: "watch" };
const next = { x: 4, y: 0, scale: 0.5, presence: 0.5, state: "focus" };

test("initial reveal stays perched without a takeoff stroke", () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()));
  const wing = new THREE.Bone();
  wing.name = "Wing.L.Upper";
  model.add(wing);
  const controller = new OwlController(THREE, root);
  controller.setRoute({ ...home, x: 2, y: 1 }, 0);
  controller.attach(model, []);
  controller.update(.016, performance.now() + 400, false);
  assert.equal(root.position.x, 2);
  assert.equal(root.position.y, 1);
  assert.equal(controller.state, "watch");
  assert.equal(wing.rotation.z, 0);
  controller.dispose();
});

test("route flight follows a timed, eased arc and lands at its target", () => {
  const root = new THREE.Group();
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()), []);
  controller.update(0.016, 1000, true);
  controller.setRoute(next, 1000);
  controller.update(0.016, 1800, false);
  assert.ok(Math.abs(root.position.x - 2) < 0.001);
  assert.ok(root.position.y > 0.4);
  assert.equal(controller.state, "flight");
  controller.update(0.016, 2600, false);
  assert.equal(root.position.x, 4);
  assert.equal(root.scale.x, 0.5);
  assert.equal(controller.opacity, 0.5);
  controller.dispose();
});

test("reduced-motion preference lands immediately without an arc", () => {
  const root = new THREE.Group();
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()), []);
  controller.setRoute(next, 1000);
  controller.update(0.016, 1000, true);
  assert.equal(root.position.x, 4);
  assert.equal(root.position.y, 0);
  assert.equal(controller.state, "focus");
  controller.dispose();
});

test("pointer gaze does not rotate the head or whole owl around Y", () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()));
  const head = new THREE.Bone();
  head.name = "Head";
  model.add(head);
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(model, [new THREE.AnimationClip("Idle", 1, [])]);
  controller.update(.016, performance.now() + 1700, false);
  controller.setPointer(1, .5);
  for (let frame = 0; frame < 90; frame += 1) {
    controller.update(.016, performance.now() + 1800 + frame * 16, false);
  }
  assert.equal(root.rotation.y, 0);
  assert.equal(head.rotation.y, 0);
  assert.ok(Math.abs(head.rotation.z) > .01, "small head tilt should remain");
  assert.ok(Math.abs(head.rotation.z) <= .04, "head tilt must not accumulate between frames");
  controller.dispose();
});

test("flight strokes move both wings and secondary feathers, not the head", () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()));
  for (const name of ["Head", "Wing.L.Upper", "Wing.L.Tip", "Wing.R.Upper", "Wing.R.Tip", "Feather.L.01", "Feather.R.01"]) {
    const bone = new THREE.Bone();
    bone.name = name;
    model.add(bone);
  }
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(model, []);
  controller.update(.016, 1000, true);
  controller.setRoute(next, 1000);
  controller.update(.016, 1640, false);
  const left = model.getObjectByName("Wing.L.Upper").rotation.z;
  const right = model.getObjectByName("Wing.R.Upper").rotation.z;
  assert.ok(Math.abs(left) > .1);
  assert.ok(Math.abs(right) > .1);
  assert.ok(left * right < 0);
  assert.ok(Math.abs(model.getObjectByName("Feather.L.01").rotation.z) > .01);
  assert.equal(model.getObjectByName("Head").rotation.x, 0);
  assert.equal(model.getObjectByName("Head").rotation.y, 0);
  assert.equal(root.rotation.y, 0);
  controller.dispose();
});

test("runtime resolves sanitized GLTF bone names and resets eyelids for reduced motion", () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()));
  for (const name of ["Head", "EyeL", "EyeR", "Neck01", "Neck02", "Neck03",
    "WingLUpper", "WingLTip", "WingRUpper", "WingRTip", "HipL", "HipR"]) {
    const bone = new THREE.Bone();
    bone.name = name;
    model.add(bone);
  }
  for (const name of ["LidUpperL", "LidUpperR", "LidLowerL", "LidLowerR"]) {
    const lid = new THREE.Mesh(new THREE.BoxGeometry(.1), new THREE.MeshBasicMaterial());
    lid.name = name;
    lid.morphTargetInfluences = [0];
    model.add(lid);
  }
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(model, []);
  assert.ok(controller.wings.every(({ upper, tip }) => upper && tip));
  assert.ok(controller.legs.slice(0, 2).every(Boolean));
  assert.ok(controller.lids.every(Boolean));
  controller.blinkStarted = 1;
  controller.blinkDuration = 1;
  controller.nextBlink = 100;
  controller.update(.016, 1500, false);
  assert.ok(controller.lids.every((lid) => lid.morphTargetInfluences[0] > .99));
  controller.update(.016, 1500, true);
  assert.ok(controller.lids.every((lid) => lid.morphTargetInfluences[0] === 0));
  assert.equal(controller.head.rotation.y, 0);
  controller.dispose();
});

test("held idle clip never exposes the spread-wing bind pose", () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()));
  const wing = new THREE.Bone();
  wing.name = "WingLUpper";
  model.add(wing);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.9));
  const track = new THREE.QuaternionKeyframeTrack("WingLUpper.quaternion", [0, 2],
    [...quaternion.toArray(), ...quaternion.toArray()]);
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(model, [new THREE.AnimationClip("Idle", 2, [track])]);
  for (let frame = 0; frame < 400; frame += 1) {
    controller.update(.016, 2000 + frame * 16, false);
    assert.ok(wing.rotation.z < -1.8, `raised bind pose at frame ${frame}: ${wing.rotation.z}`);
  }
  controller.dispose();
});

test("reduced motion samples the folded idle pose on the first frame", () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshBasicMaterial()));
  const wing = new THREE.Bone();
  wing.name = "WingLUpper";
  model.add(wing);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.9));
  const clip = new THREE.AnimationClip("Idle", 2, [new THREE.QuaternionKeyframeTrack(
    "WingLUpper.quaternion", [0, 2], [...quaternion.toArray(), ...quaternion.toArray()],
  )]);
  const controller = new OwlController(THREE, root);
  controller.setRoute(home, 0);
  controller.attach(model, [clip]);
  controller.update(.016, 2000, true);
  assert.ok(wing.rotation.z < -1.8);
  controller.dispose();
});
