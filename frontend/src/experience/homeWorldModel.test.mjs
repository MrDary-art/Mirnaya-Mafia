import assert from "node:assert/strict";
import test from "node:test";
import { HOME_SECTIONS, sectionIdFromHash, speedClass, travelDuration,
  worldPosition, worldTarget } from "./homeWorldModel.js";

test("all Home chapters have stable deep-link identifiers", () => {
  assert.deepEqual(HOME_SECTIONS.map(({ id }) => id),
    ["hero", "ai", "rooms", "scenarios", "learning", "history", "friends", "profile", "finale"]);
  assert.equal(sectionIdFromHash("#learning"), "learning");
  assert.equal(sectionIdFromHash("#unknown"), "hero");
});

test("scroll position selects one continuous world coordinate", () => {
  const offsets = [0, 1100, 2200, 3300];
  assert.ok(worldPosition(0, offsets, 900) < 1);
  assert.ok(worldPosition(1200, offsets, 900) > 1);
  assert.ok(worldPosition(2300, offsets, 900) > 2);
});

test("forward and reverse paths differ while remaining continuous", () => {
  const forward = worldTarget(3.5, 1440, 1);
  const reverse = worldTarget(3.5, 1440, -1);
  assert.ok(Math.abs(forward.x - reverse.x) > .5);
  assert.ok(Math.abs(worldTarget(3.499, 1440).x - worldTarget(3.501, 1440).x) < .1);
  assert.ok(worldTarget(2, 390).scale < worldTarget(2, 1440).scale);
});

test("navigation duration is distance-aware and motion preferences win", () => {
  assert.ok(travelDuration(1) < travelDuration(3));
  assert.ok(travelDuration(8) <= 1000);
  assert.equal(travelDuration(5, true), 0);
  assert.equal(speedClass(50), "slow");
  assert.equal(speedClass(750), "normal");
  assert.equal(speedClass(2500), "fast");
  assert.equal(speedClass(50, true), "jump");
});
