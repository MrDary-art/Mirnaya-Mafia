import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createPerches, disposePerches } from "./createPerches.js";

test("semantic supports have distinct geometry and remain outside the owl rig", () => {
  const perches = createPerches(THREE, -1.4);
  assert.deepEqual([...perches.keys()], ["ai", "bridge", "archive", "observatory", "reflection", "vault"]);
  for (const { group, materials } of perches.values()) {
    assert.ok(group.children.length >= 2);
    assert.ok(group.children.every((mesh) => mesh.isMesh));
    assert.ok(materials.every((material) => material.transparent && material.opacity === 0));
    assert.equal(group.parent, null);
  }
  disposePerches(perches);
});
