import assert from "node:assert/strict";
import test from "node:test";

import {
  businessBackTarget,
  businessSectionLabel,
  businessPracticePath,
  canAccessBusinessSection,
  canonicalBusinessSection,
  navigationFor,
} from "./navigation.js";

const employee = { has_company: true, permissions: { manage_team: false } };
const learningDelegate = { has_company: true, permissions: { manage_learning: true, view_analytics: true } };
const manager = { has_company: true, permissions: { manage_team: true, manage_company: true, manage_learning: true, manage_assignments: true, view_analytics: true } };

test("every active member keeps the same core areas while analytics needs permission", () => {
  const expected = ["overview", "episodes", "learning", "meetings", "team", "calendar", "council"];
  assert.deepEqual(navigationFor(employee).map(([key]) => key), expected);
  assert.deepEqual(navigationFor(learningDelegate).map(([key]) => key), [...expected.slice(0, -2), "analytics", "calendar", "council"]);
  assert.equal(canAccessBusinessSection(employee, "overview"), true);
  assert.equal(canAccessBusinessSection(employee, "settings"), false);
  assert.equal(canAccessBusinessSection(learningDelegate, "settings"), true);
});

test("company settings remain permission-gated", () => {
  const visible = navigationFor(manager).map(([key]) => key);
  assert.deepEqual(visible, ["overview", "episodes", "learning", "meetings", "team", "analytics", "calendar", "council"]);
  for (const section of visible) {
    assert.equal(canAccessBusinessSection(manager, section), true, section);
    assert.ok(businessSectionLabel(manager, section));
  }
  assert.equal(canAccessBusinessSection(manager, "settings"), true);
});

test("legacy links resolve to their consolidated product area", () => {
  assert.equal(canonicalBusinessSection("employees"), "team");
  assert.equal(canonicalBusinessSection("messenger"), "team");
  assert.equal(canonicalBusinessSection("program-builder"), "learning");
  assert.equal(canonicalBusinessSection("assignments"), "learning");
  assert.equal(canonicalBusinessSection("growth"), "profile");
  assert.equal(canonicalBusinessSection("analytics"), "analytics");
  assert.equal(canonicalBusinessSection("certificates"), "profile");
  assert.equal(canonicalBusinessSection("access"), "settings");
  assert.equal(canonicalBusinessSection("onboarding"), "onboarding");
  assert.equal(canonicalBusinessSection("profile"), "profile");
  assert.equal(canonicalBusinessSection("calendar"), "calendar");
  assert.equal(canonicalBusinessSection("meetings"), "meetings");
  assert.equal(canAccessBusinessSection(manager, "employees"), true);
  assert.equal(canAccessBusinessSection(employee, "certificates"), true);
});

test("practice modes stay inside the selected business workspace", () => {
  assert.equal(businessPracticePath(42, "scenarios"), "/business/42/learning/scenarios");
  assert.equal(businessPracticePath("acme", "serials", "/play/run-7"), "/business/acme/learning/serials/play/run-7");
});

test("back navigation keeps direct links inside their company", () => {
  assert.equal(businessBackTarget(42, "/business/42/overview"), "/business/workspaces?choose=1");
  assert.equal(businessBackTarget(42, "/business/42/episodes"), "/business/42/overview");
  assert.equal(businessBackTarget(42, "/business/42/council/8"), "/business/42/meetings");
  assert.equal(businessBackTarget(42, "/business/42/learning/scenarios/setup"), "/business/42/learning/scenarios");
  assert.equal(businessBackTarget(42, "/business/7/overview"), "/business/42/overview");
});
