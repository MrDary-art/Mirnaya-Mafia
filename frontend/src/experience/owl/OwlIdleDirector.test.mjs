import assert from "node:assert/strict";
import test from "node:test";
import { OwlIdleDirector } from "./OwlIdleDirector.js";

test("eight idle actions vary without repeating any of the previous three", () => {
  let seed = 1;
  const director = new OwlIdleDirector(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
  const chosen = Array.from({ length: 100 }, () => director.choose("watch").name);
  for (let index = 1; index < chosen.length; index += 1) {
    assert.ok(!chosen.slice(Math.max(0, index - 3), index).includes(chosen[index]));
  }
  assert.equal(new Set(chosen).size, 8);
});

test("idle returns to neutral and reduced motion cancels the pose", () => {
  const director = new OwlIdleDirector(() => .5);
  director.reset(0);
  assert.equal(director.update(1000).tilt, 0);
  director.update(2400);
  const midway = director.update(3000);
  assert.ok(Object.values(midway).some((value) => value !== 0));
  assert.ok(Object.values(director.update(3000, "rest", false)).every((value) => value === 0));
  assert.equal(director.active, null);
});
