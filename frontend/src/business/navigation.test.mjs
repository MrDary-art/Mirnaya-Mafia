import assert from "node:assert/strict";
import test from "node:test";

import {
  businessSectionLabel,
  businessPracticePath,
  canAccessBusinessSection,
  canonicalBusinessSection,
  navigationFor,
} from "./navigation.js";

const employee = { has_company: true, permissions: { manage_team: false } };
const learningDelegate = { has_company: true, permissions: { manage_learning: true, view_analytics: true } };
const manager = { has_company: true, permissions: { manage_team: true, manage_company: true, manage_learning: true, manage_assignments: true, view_analytics: true } };

test("every active member receives the same primary product areas", () => {
  const expected = ["overview", "learning", "team", "community", "calendar", "profile"];
  assert.deepEqual(navigationFor(employee).map(([key]) => key), expected);
  assert.deepEqual(navigationFor(learningDelegate).map(([key]) => key), expected);
  assert.equal(canAccessBusinessSection(employee, "overview"), true);
  assert.equal(canAccessBusinessSection(employee, "settings"), false);
  assert.equal(canAccessBusinessSection(learningDelegate, "settings"), true);
});

test("manager actions stay permission-gated outside primary navigation", () => {
  const visible = navigationFor(manager).map(([key]) => key);
  assert.deepEqual(visible, ["overview", "learning", "team", "community", "calendar", "profile"]);
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
  assert.equal(canonicalBusinessSection("growth"), "profile");
  assert.equal(canonicalBusinessSection("analytics"), "profile");
  assert.equal(canonicalBusinessSection("certificates"), "profile");
  assert.equal(canonicalBusinessSection("access"), "settings");
  assert.equal(canonicalBusinessSection("onboarding"), "overview");
  assert.equal(canonicalBusinessSection("profile"), "profile");
  assert.equal(canonicalBusinessSection("calendar"), "calendar");
  assert.equal(canonicalBusinessSection("meetings"), "calendar");
  assert.equal(canAccessBusinessSection(manager, "employees"), true);
  assert.equal(canAccessBusinessSection(employee, "certificates"), true);
});

test("practice modes stay inside the selected business workspace", () => {
  assert.equal(businessPracticePath(42, "scenarios"), "/business/42/learning/scenarios");
  assert.equal(businessPracticePath("acme", "serials", "/play/run-7"), "/business/acme/learning/serials/play/run-7");
});
