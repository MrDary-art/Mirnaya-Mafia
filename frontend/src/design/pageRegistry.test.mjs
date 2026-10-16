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
  assert.equal(pageForRoute("/business/workspaces").id, "business");
  assert.equal(pageForRoute("/business/42/analytics").label, "Арена для бизнеса");
  assert.equal(pageForRoute("/analytics").id, "analytics");
});

test("profile editor is distinct from the shop and returns to profile", () => {
  assert.equal(pageForRoute("/shop").id, "shop");
  assert.equal(pageForRoute("/profile/edit").id, "profile-edit");
  assert.deepEqual(backTargetForRoute("/profile/edit"), { to: "/profile", label: "к профилю" });
});

test("story deep links preserve the feed as their parent", () => {
  assert.equal(pageForRoute("/stories").id, "stories");
  assert.equal(pageForRoute("/stories/42").id, "stories");
  assert.equal(pageForRoute("/stories/new").id, "story-studio");
  assert.equal(pageForRoute("/stories/42/edit").id, "story-edit");
  for (const path of ["/stories/new", "/stories/42", "/stories/42/edit"]) {
    assert.equal(backTargetForRoute(path).to, "/stories");
  }
});

test("social links have distinct labels and predictable parents", () => {
  assert.equal(pageForRoute("/feed").id, "feed");
  assert.equal(pageForRoute("/feed/post/12").id, "post");
  assert.equal(pageForRoute("/feed/notifications").id, "social-notifications");
  assert.equal(pageForRoute("/collections/12").id, "collection");
  assert.equal(backTargetForRoute("/feed/post/12").to, "/feed");
  assert.equal(backTargetForRoute("/collections/12").to, "/collections");
});

test("community back links close a chat before leaving feed or profile", () => {
  assert.deepEqual(backTargetForRoute("/feed", "?section=messages&chat=12&q=batna"), { to: "/feed?section=messages&q=batna", label: "к сообщениям" });
  assert.deepEqual(backTargetForRoute("/profile", "?section=messages&chat=12"), { to: "/profile?section=messages", label: "к сообщениям" });
  assert.deepEqual(backTargetForRoute("/profile", "?section=friends"), { to: "/profile", label: "к стене профиля" });
  assert.equal(backTargetForRoute("/feed", "?section=friends").to, "/feed");
  assert.equal(backTargetForRoute("/people/anna").to, "/feed?section=friends");
});


test("Game Lab routes retain the trainer hierarchy", () => {
  assert.equal(pageForRoute("/lab").id, "lab");
  assert.equal(pageForRoute("/lab/red-zone").id, "lab-red-zone");
  assert.equal(pageForRoute("/lab/red-zone/play/abc").id, "lab-player");
  assert.equal(pageForRoute("/lab/echo").id, "lab-echo");
  assert.equal(pageForRoute("/lab/echo/play/abc").id, "lab-echo-player");
  assert.deepEqual(backTargetForRoute("/lab"), { to: "/app", label: "на главную" });
  assert.deepEqual(backTargetForRoute("/lab/red-zone"), { to: "/lab", label: "к лаборатории" });
  assert.deepEqual(backTargetForRoute("/lab/red-zone/play/abc"), { to: "/lab/red-zone", label: "к кейсам" });
  assert.deepEqual(backTargetForRoute("/lab/echo"), { to: "/lab", label: "к лаборатории" });
  assert.deepEqual(backTargetForRoute("/lab/echo/play/abc"), { to: "/lab/echo", label: "к траектории" });
});
