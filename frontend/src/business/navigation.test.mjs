import assert from "node:assert/strict";
import test from "node:test";

import {
  businessSectionLabel,
  canAccessBusinessSection,
  canonicalBusinessSection,
  navigationFor,
} from "./navigation.js";

const employee = { has_company: true, permissions: { manage_team: false } };
const learningDelegate = { has_company: true, permissions: { manage_learning: true, view_analytics: true } };
const manager = { has_company: true, permissions: { manage_team: true, manage_company: true, manage_learning: true, manage_assignments: true, view_analytics: true } };

test("every active member receives the same primary product areas", () => {
  const expected = ["overview", "learning", "team", "community", "meetings", "growth"];
  assert.deepEqual(navigationFor(employee).map(([key]) => key), expected);
  assert.deepEqual(navigationFor(learningDelegate).map(([key]) => key), expected);
  assert.equal(canAccessBusinessSection(employee, "overview"), true);
  assert.equal(canAccessBusinessSection(employee, "settings"), false);
});

test("manager actions stay permission-gated outside primary navigation", () => {
  const visible = navigationFor(manager).map(([key]) => key);
  assert.deepEqual(visible, ["overview", "learning", "team", "community", "meetings", "growth"]);
  for (const section of visible) {
    assert.equal(canAccessBusinessSection(manager, section), true, section);
    assert.ok(businessSectionLabel(manager, section));
  }
  assert.equal(canAccessBusinessSection(manager, "settings"), true);
});

test("legacy links resolve to their consolidated product area", () => {
  assert.equal(canonicalBusinessSection("employees"), "team");
  assert.equal(canonicalBusinessSection("messenger"), "community");
  assert.equal(canonicalBusinessSection("program-builder"), "learning");
  assert.equal(canonicalBusinessSection("assignments"), "learning");
  assert.equal(canonicalBusinessSection("analytics"), "growth");
  assert.equal(canonicalBusinessSection("certificates"), "growth");
  assert.equal(canonicalBusinessSection("access"), "settings");
  assert.equal(canonicalBusinessSection("onboarding"), "overview");
  assert.equal(canonicalBusinessSection("profile"), "profile");
  assert.equal(canAccessBusinessSection(manager, "employees"), true);
  assert.equal(canAccessBusinessSection(employee, "certificates"), true);
});
