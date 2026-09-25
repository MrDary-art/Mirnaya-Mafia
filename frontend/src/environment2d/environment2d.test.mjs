import assert from "node:assert/strict";
import test from "node:test";
import { createSceneProjection } from "./layoutProjection.js";
import { FOREST_ORDER, FOREST_SCENES, isFocusedRoute, sceneForRoute } from "./sceneDefinitions.js";
import { readForestMotionMode } from "./backgroundMotionPreferences.js";

test("each Home chapter has one visual definition and progressive route", () => {
  assert.equal(FOREST_ORDER.length, 9);
  for (const [index, id] of FOREST_ORDER.entries()) {
    const scene = FOREST_SCENES[id];
    assert.ok(scene.poster.endsWith(".webp"));
    assert.ok(scene.mobilePoster.endsWith("-mobile.webp"));
    assert.ok(scene.water.polygon.length >= 3);
    assert.equal(scene.nextSceneId, FOREST_ORDER[index + 1] || null);
  }
  assert.equal(sceneForRoute("/scenarios").id, "scenarios");
  assert.equal(sceneForRoute("/rooms/12").id, "rooms");
  assert.equal(sceneForRoute("/analytics").id, "profile");
});

test("focused work routes suppress decorative motion", () => {
  for (const path of ["/practice", "/play/1", "/room/12", "/theory/3", "/admin", "/training/path/attempt/9", "/ai/job", "/learn/3", "/missing"]) {
    assert.equal(isFocusedRoute(path), true, path);
  }
  for (const path of ["/", "/ai", "/rooms", "/scenarios", "/training"]) {
    assert.equal(isFocusedRoute(path), false, path);
  }
});

test("the water mask and visual crop share the same cover projection", () => {
  const scene = FOREST_SCENES.hero;
  const desktop = createSceneProjection(scene, { left: 0, top: 0, width: 1672, height: 941 });
  const [dx, dy] = desktop([.5, .5]);
  assert.ok(Math.abs(dx - 836) < .01);
  assert.ok(Math.abs(dy - 470.5) < .01);
  const mobile = createSceneProjection(scene, { left: 0, top: 0, width: 390, height: 844 }, { mobile: true });
  const [mx, my] = mobile([.5, .5]);
  assert.ok(Number.isFinite(mx) && Number.isFinite(my));
  assert.ok(mx < 0); // The desktop midpoint falls outside the intentional right-side mobile crop.
  assert.ok(my > 0 && my < 844);
});

test("legacy off preference remains static, while reduced motion wins over a legacy default", () => {
  const previous = globalThis.window;
  try {
    let legacy = "off";
    globalThis.window = {
      localStorage: { getItem: (key) => key === "arena_product_effects" ? legacy : null },
      matchMedia: () => ({ matches: true }),
    };
    assert.equal(readForestMotionMode(), "static");
    legacy = "calm";
    assert.equal(readForestMotionMode(), "calm");
    legacy = "full";
    assert.equal(readForestMotionMode(), "static");
  } finally {
    globalThis.window = previous;
  }
});
