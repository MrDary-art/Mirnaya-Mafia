import assert from "node:assert/strict";
import test from "node:test";
import { aerialOffset } from "./homeFlightPaths.js";

test("each Home scene has a distinct three-dimensional aerial path", () => {
  const sections = ["ai", "rooms", "scenarios", "learning", "history", "friends", "profile"];
  const positions = sections.map((id) => aerialOffset(id, 3.7));
  assert.equal(new Set(positions.map(({ x, y, z }) => `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`)).size, sections.length);
  assert.ok(positions.some(({ z }) => Math.abs(z) > .25));
});

test("mobile aerial routes are simpler and smaller", () => {
  const desktop = aerialOffset("learning", 3, 1440);
  const mobile = aerialOffset("learning", 3, 390);
  assert.ok(Math.abs(mobile.x) < Math.abs(desktop.x));
  assert.ok(Math.abs(mobile.y) < Math.abs(desktop.y));
});
