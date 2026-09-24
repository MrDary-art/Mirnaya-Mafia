import assert from "node:assert/strict";
import test from "node:test";
import { homeFlightMotion } from "./homeFlightMotion.js";

test("takeoff opens the wings before powered flight", () => {
  const early = homeFlightMotion({ beatPhase: 1, speed: "normal", takeoffAge: .2 });
  const push = homeFlightMotion({ beatPhase: 1, speed: "normal", takeoffAge: 1 });
  assert.equal(early.powered, 0);
  assert.ok(push.powered > .9);
  assert.equal(push.phase, "takeoff");
});

test("fast catch-up uses more frequent powered beats than slow orbit", () => {
  const slow = homeFlightMotion({ beatPhase: 1, speed: "slow" });
  const jump = homeFlightMotion({ beatPhase: 1, speed: "jump" });
  assert.ok(jump.frequency > slow.frequency);
  assert.ok(jump.powered > .95);
  assert.equal(jump.phase, "catchUpFlight");
});

test("landing brakes and folds the wing stroke", () => {
  const braking = homeFlightMotion({ beatPhase: 1, speed: "normal", landingAge: .2 });
  const contact = homeFlightMotion({ beatPhase: 1, speed: "normal", landingAge: 1.1 });
  assert.ok(braking.powered > contact.powered);
  assert.equal(contact.phase, "landing");
});
