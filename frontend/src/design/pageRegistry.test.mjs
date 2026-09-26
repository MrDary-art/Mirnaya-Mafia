import assert from "node:assert/strict";
import test from "node:test";
import { backTargetForRoute, pageForRoute } from "./pageRegistry.js";

test("deep links return to the nearest usable parent page", () => {
  assert.deepEqual(backTargetForRoute("/room/27"), { to: "/rooms", label: "к встречам" });
  assert.deepEqual(backTargetForRoute("/rooms/demo"), { to: "/rooms", label: "к встречам" });
  assert.deepEqual(backTargetForRoute("/theory/lesson-4"), { to: "/theory", label: "к урокам" });
  assert.deepEqual(backTargetForRoute("/report/12/ideal-dialogue"), { to: "/report/12", label: "к отчёту" });
  assert.deepEqual(backTargetForRoute("/training/path/chapter/2/summary"), { to: "/training/path/chapter/2", label: "к главе" });
  assert.deepEqual(backTargetForRoute("/training/path"), { to: "/training", label: "к обучению" });
});

test("company and analytics use their own page labels", () => {
  assert.equal(pageForRoute("/company").id, "company");
  assert.equal(pageForRoute("/analytics").id, "analytics");
});

test("profile editor is distinct from the shop and returns to profile", () => {
  assert.equal(pageForRoute("/shop").id, "shop");
  assert.equal(pageForRoute("/profile/edit").id, "profile-edit");
  assert.deepEqual(backTargetForRoute("/profile/edit"), { to: "/profile", label: "к профилю" });
});
