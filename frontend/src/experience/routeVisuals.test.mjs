import assert from "node:assert/strict";
import test from "node:test";
import { visualForRoute } from "./routeVisuals.js";

test("Home uses the hero owl and a smaller mobile composition", () => {
  const desktop = visualForRoute("/app", 1440);
  const mobile = visualForRoute("/app", 390);
  assert.equal(desktop.presence, 1);
  assert.equal(desktop.state, "watch");
  assert.equal(desktop.isHome, true);
  assert.ok(mobile.scale < desktop.scale);
  assert.ok(mobile.x < desktop.x);
});

test("active conversation has less owl presence than setup", () => {
  const setup = visualForRoute("/ai", 1440);
  const live = visualForRoute("/play/session-id", 1440);
  assert.ok(live.presence < setup.presence);
  assert.equal(live.state, "listen");
});

test("mobile route owl remains inside the viewport and readable", () => {
  for (const path of ["/ai", "/rooms", "/scenarios", "/training", "/history", "/profile"]) {
    const visual = visualForRoute(path, 390);
    assert.ok(visual.x < 1.2, `${path} is outside the mobile camera`);
    assert.ok(visual.scale >= .44, `${path} is too small`);
    assert.ok(visual.presence >= .19, `${path} is too faint`);
  }
});

test("admin and room routes suppress the owl", () => {
  for (const route of ["/admin", "/admin/settings", "/room/123"]) {
    assert.equal(visualForRoute(route, 1440).presence, 0);
  }
});

test("only Home has a physical landing place", () => {
  for (const path of ["/ai", "/rooms", "/scenarios", "/history", "/training", "/report/1", "/profile"]) {
    assert.equal(visualForRoute(path, 1440).perch, undefined);
    assert.equal(visualForRoute(path, 1440).state, "flight");
  }
});
