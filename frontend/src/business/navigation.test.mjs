import assert from "node:assert/strict";
import test from "node:test";

import {
  businessSectionLabel,
  canAccessBusinessSection,
  canonicalBusinessSection,
  navigationFor,
} from "./navigation.js";

const employee = { permissions: { manage_team: false } };
const learningDelegate = { permissions: { manage_learning: true, view_analytics: true } };
const manager = { permissions: { manage_team: true, manage_company: true, manage_learning: true, manage_assignments: true, view_analytics: true } };

test("employees do not receive a second corporate application navigation", () => {
  assert.deepEqual(navigationFor(employee), []);
  assert.equal(canAccessBusinessSection(employee, "overview"), false);
  assert.deepEqual(navigationFor(learningDelegate), []);
});

test("manager navigation contains only the seven operating workflows", () => {
  const visible = navigationFor(manager).map(([key]) => key);
  assert.deepEqual(visible, ["overview", "team", "assignments", "results", "news", "meetings", "settings"]);
  for (const section of visible) {
    assert.equal(canAccessBusinessSection(manager, section), true, section);
    assert.ok(businessSectionLabel(manager, section));
  }
});

test("legacy links resolve to their consolidated workflow", () => {
  assert.equal(canonicalBusinessSection("employees"), "team");
  assert.equal(canonicalBusinessSection("program-builder"), "assignments");
  assert.equal(canonicalBusinessSection("analytics"), "results");
  assert.equal(canonicalBusinessSection("surveys"), "news");
  assert.equal(canonicalBusinessSection("access"), "settings");
  assert.equal(canonicalBusinessSection("onboarding"), "overview");
  assert.equal(canAccessBusinessSection(manager, "employees"), true);
  assert.equal(canAccessBusinessSection(manager, "analytics"), true);
});
