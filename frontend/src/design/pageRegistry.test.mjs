import assert from "node:assert/strict";
import test from "node:test";
import { backTargetForRoute, pageForRoute } from "./pageRegistry.js";

test("deep links return to the nearest usable parent page", () => {
  assert.deepEqual(backTargetForRoute("/room/27"), { to: "/rooms", label: "к встречам" });
  assert.deepEqual(backTargetForRoute("/rooms/demo"), { to: "/rooms", label: "к встречам" });
  assert.deepEqual(backTargetForRoute("/theory/lesson-4"), { to: "/theory", label: "к урокам" });
  assert.deepEqual(backTargetForRoute("/report/12/ideal-dialogue"), { to: "/report/12", label: "к отчёту" });
  assert.deepEqual(backTargetForRoute("/training/path/chapter/2/summary"), { to: "/training/path/chapter/2", label: "к главе" });
  assert.deepEqual(backTargetForRoute("/training/path/attempt/8/review"), { to: "/training/path/attempt/8/report", label: "к результату" });
  assert.deepEqual(backTargetForRoute("/training/path"), { to: "/training", label: "к обучению" });
});

test("AI practice back routes preserve the current session", () => {
  assert.equal(backTargetForRoute("/ai/prepare").to, "/ai");
  assert.equal(backTargetForRoute("/ai/guide").to, "/ai");
  assert.equal(backTargetForRoute("/practice", "?session=39").to, "/ai/prepare?retry=39");
  assert.equal(backTargetForRoute("/practice").to, "/ai/prepare");
  assert.equal(backTargetForRoute("/setup", "?mode=online").to, "/ai");
  assert.equal(backTargetForRoute("/setup", "?preset=demo").to, "/scenarios");
  assert.equal(pageForRoute("/ai/prepare").id, "ai-prepare");
  assert.equal(pageForRoute("/ai/guide").id, "ai-guide");
});

test("other modes back routes lead to their parent sections", () => {
  for (const [path, target] of [
    ["/play/39", "/scenarios"],
    ["/report/39", "/analytics"],
    ["/room/39", "/rooms"],
    ["/theory/lesson-4", "/theory"],
    ["/learn/program-1", "/learn"],
    ["/learn", "/training"],
    ["/shop", "/profile"],
    ["/profile/edit", "/profile"],
    ["/training/path/chapter/2", "/training/path"],
  ]) assert.equal(backTargetForRoute(path).to, target, path);
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
