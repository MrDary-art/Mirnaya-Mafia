import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createFeatherSystem } from "./createFeatherSystem.js";

test("rare feathers remain in the shared world after the owl changes section", () => {
  const scene = new THREE.Scene();
  const owl = { homeAirborne: true, root: new THREE.Group() };
  owl.root.visible = true;
  const feathers = createFeatherSystem(THREE, scene);
  feathers.update(.016, performance.now() + 13000, owl, true);
  assert.equal(scene.children.length, 1);
  feathers.update(.1, performance.now() + 13100, owl, false);
  assert.equal(scene.children.length, 1);
  feathers.update(4, performance.now() + 17100, owl, false);
  assert.equal(scene.children.length, 0);
  feathers.dispose();
});
