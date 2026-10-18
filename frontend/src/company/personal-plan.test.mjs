import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonalPlan, planEventPath } from "./personal-plan.js";

const now = Date.parse("2026-10-18T10:00:00Z");
test("personal plan merges calendar and own assignments in chronological order without duplicates", () => {
  const rows = buildPersonalPlan([
    { id: 1, membership_id: 10, title: "My task", status: "ASSIGNED", deadline: "2026-10-22T10:00:00Z" },
    { id: 2, membership_id: 11, title: "Other task", status: "ASSIGNED" },
  ], [
    { id: "assignment-1", type: "ASSIGNMENT", target_id: 1, date: "2026-10-22T10:00:00Z" },
    { id: "room-1", type: "ONLINE_1X1", title: "Meeting", date: "2026-10-19T10:00:00Z", room_id: 8 },
  ], now, 10);
  assert.deepEqual(rows.map(row => row.title), ["Meeting", "My task"]);
  assert.equal(planEventPath(6, rows[0]), "/business/6/room/8");
});
test("finished, cancelled and past meetings are not upcoming work; overdue personal actions remain", () => {
  const events = [
    { id: "done", title: "Done", type: "COMPANY_MEETING", status: "finished", date: "2026-10-20" },
    { id: "cancel", title: "Cancelled", type: "COUNCIL", status: "cancelled", date: "2026-10-20" },
    { id: "past", title: "Past meeting", type: "ONLINE_1X1", date: "2026-10-17" },
    { id: "enrolment", title: "Enrolled", type: "PROGRAM", date: "2026-10-20" },
    { id: "action", title: "My overdue action", type: "MEETING_ACTION", date: "2026-10-17" },
  ];
  assert.deepEqual(buildPersonalPlan([], events, now, 10).map(row => row.id), ["action"]);
});
test("undated personal tasks remain visible and overdue tasks come first", () => {
  const rows = buildPersonalPlan([
    { id: 1, title: "No deadline", status: "ASSIGNED" },
    { id: 2, title: "Overdue", status: "OVERDUE", deadline: "2026-10-16" },
    { id: 3, title: "Finished", status: "PASSED" },
  ], [], now, 10);
  assert.deepEqual(rows.map(row => row.title), ["Overdue", "No deadline"]);
  assert.equal(rows[0].startable, false);
});
