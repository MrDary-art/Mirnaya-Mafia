import assert from "node:assert/strict";
import test from "node:test";
import { flightMotion } from "./flightMotion.js";

test("flight stages anticipation, powered travel, braking and contact", () => {
  assert.equal(flightMotion(0).phase, "focus");
  assert.equal(flightMotion(.18).phase, "prepare");
  assert.equal(flightMotion(.3).phase, "takeoff");
  assert.equal(flightMotion(.55).phase, "poweredFlight");
  assert.equal(flightMotion(.76).phase, "glide");
  assert.equal(flightMotion(.88).phase, "brake");
  assert.equal(flightMotion(.99).phase, "landing");
  assert.equal(flightMotion(.18).travel, 0);
  assert.equal(flightMotion(1).travel, 1);
  assert.ok(Math.abs(flightMotion(.5).travel - .5) < .001);
  assert.ok(flightMotion(.5).lift > .4);
});

test("wing strokes continue in flight and banking follows travel direction", () => {
  const middle = [.45, .5, .55, .6, .65].map((p) => flightMotion(p));
  assert.ok(middle.some(({ flap }) => flap > .1));
  assert.ok(middle.some(({ flap }) => flap < -.1));
  assert.ok(flightMotion(.5, 1).bank < 0);
  assert.ok(flightMotion(.5, -1).bank > 0);
  assert.equal(flightMotion(1).flap, 0);
});
