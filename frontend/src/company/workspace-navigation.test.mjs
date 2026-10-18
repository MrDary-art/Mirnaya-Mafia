import test from "node:test";
import assert from "node:assert/strict";
import { notificationPath, readableNotification, moveWidget } from "./workspace-navigation.js";
import { buildPersonalPlan } from "./personal-plan.js";
test("notifications open concrete permitted workspaces instead of generic sections", () => {
  assert.equal(notificationPath(6, { type: "COMPANY_ASSIGNMENT", payload: { assignment_id: 7 } }), "/business/6/learning?view=mine&assignment=7");
  assert.equal(notificationPath(6, { type: "TEAM_ASSIGNMENT_COMPLETED", payload: { attempt_id: 9 } }, true), "/business/6/learning?view=manage&attempt=9");
  assert.equal(notificationPath(6, { type: "MEETING_PROTOCOL_PUBLISHED", payload: { meeting_id: 4 } }), "/business/6/calendar?view=meetings&meeting=4");
  assert.equal(notificationPath(6, { payload: { room_id: 8 } }), "/business/6/room/8");
  assert.equal(notificationPath(6, { payload: { room_id: "https://evil.test" } }), "/business/6/overview");
});
test("notification dates are formatted without swallowing punctuation", () => {
  assert.equal(readableNotification("Встреча. 2026-10-19T13:00:00+00:00.", value => "19 октября 16:00 МСК"), "Встреча. 19 октября 16:00 МСК.");
});
test("dashboard order changes without mutating saved preferences", () => {
  const source = ["plan", "calendar", "practice"];
  assert.deepEqual(moveWidget(source, "calendar", -1), ["calendar", "plan", "practice"]);
  assert.deepEqual(moveWidget(source, "plan", -1), source);
  assert.deepEqual(source, ["plan", "calendar", "practice"]);
});
test("a retry uses the assignment ID, not the recipient target ID", () => {
  const rows = buildPersonalPlan([{ id: 7, target_id: 99, title: "Retry", status: "FAILED", attempts_used: 1, attempts_allowed: 3 }], [], Date.now(), 10);
  assert.equal(rows[0].assignmentId, 7); assert.equal(rows[0].retry, true);
  assert.equal(buildPersonalPlan([{ id: 7, title: "No attempts left", status: "FAILED", attempts_used: 3, attempts_allowed: 3 }]).length, 0);
});
