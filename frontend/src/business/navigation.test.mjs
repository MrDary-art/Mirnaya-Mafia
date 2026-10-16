import assert from "node:assert/strict";
import test from "node:test";

import {
  businessSectionLabel,
  canAccessBusinessSection,
  navigationFor,
  secondaryNavigationFor,
} from "./navigation.js";

const employee = { permissions: { manage_team: false } };
const manager = { permissions: { manage_team: true, manage_company: true, manage_learning: true, manage_assignments: true, view_analytics: true } };

test("employee sidebar stays compact while every legacy employee section remains reachable", () => {
  const visible = navigationFor(employee).map(([key]) => key);
  assert.deepEqual(visible, ["overview", "news", "assignments", "practice", "directory", "results", "learning", "certificates", "calendar", "notifications", "profile"]);

  for (const section of ["ratings", "achievements", "surveys", "meetings", "tournaments", "goals"]) {
    assert.equal(canAccessBusinessSection(employee, section), true, section);
    assert.ok(businessSectionLabel(employee, section));
    assert.ok(secondaryNavigationFor(employee, section).some(([key]) => key === section));
  }
});

test("manager access remains capability filtered", () => {
  const visible = navigationFor(manager).map(([key]) => key);
  assert.ok(visible.includes("analytics"));
  assert.ok(visible.includes("settings"));
  assert.equal(canAccessBusinessSection(manager, "directory"), false);

  for (const section of [
    "overview", "news", "structure", "employees", "cohorts", "assignments",
    "scenarios", "program-builder", "practice", "results", "learning",
    "meetings", "tournaments", "goals", "ratings", "analytics",
    "certificates", "achievements", "surveys", "library", "calendar",
    "notifications", "applications", "access", "settings", "policies", "integrations", "growth",
  ]) assert.equal(canAccessBusinessSection(manager, section), true, section);
});
