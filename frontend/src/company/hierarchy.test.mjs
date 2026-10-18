import test from "node:test";
import assert from "node:assert/strict";
import { buildEmployeeHierarchy, groupEmployeesByProfession, hierarchyExpandableIds, hierarchyVisibleIds, layoutReportingGraph } from "./hierarchy.js";

const people = [
  { membership_id: 1, name: "Владелец", role: "COMPANY_OWNER", status: "ACTIVE", profession: "Управление" },
  { membership_id: 2, name: "Руководитель", role: "DEPARTMENT_MANAGER", status: "ACTIVE", manager_membership_id: 1, profession: "Продажи", department_id: 10 },
  { membership_id: 3, name: "Менеджер", role: "EMPLOYEE", status: "ACTIVE", manager_membership_id: 2, profession: "Продажи", department_id: 10 },
  { membership_id: 4, name: "Уволенный", role: "EMPLOYEE", status: "LEFT", manager_membership_id: 2, profession: "Продажи", department_id: 10 },
];

test("builds reporting lines and excludes former employees", () => {
  const result = buildEmployeeHierarchy(people);
  assert.deepEqual(result.roots.map(person => person.membership_id), [1]);
  assert.deepEqual(result.children.get(1).map(person => person.membership_id), [2]);
  assert.deepEqual(result.children.get(2).map(person => person.membership_id), [3]);
  assert.equal(result.byId.has(4), false);
  const withNewHire = buildEmployeeHierarchy([...people, { membership_id: 5, name: "Новый сотрудник", role: "EMPLOYEE", status: "ACTIVE", manager_membership_id: 2 }]);
  assert.deepEqual(withNewHire.children.get(2).map(person => person.membership_id), [3, 5]);
});

test("search keeps the management chain visible", () => {
  assert.deepEqual([...hierarchyVisibleIds(people, "Менеджер")].sort(), [1, 2, 3]);
});

test("finds every employee whose branch can be collapsed", () => {
  const hierarchy = buildEmployeeHierarchy(people);
  assert.deepEqual(hierarchyExpandableIds(hierarchy), [1, 2]);
});

test("groups active employees by profession", () => {
  const groups = groupEmployeesByProfession(people);
  assert.equal(groups.find(group => group.title === "Продажи").members.length, 2);
});

test("reporting graph puts managers above reports and preserves real edges", () => {
  const graph = layoutReportingGraph(buildEmployeeHierarchy(people));
  assert.ok(graph.byId.get(1).y < graph.byId.get(2).y);
  assert.ok(graph.byId.get(2).y < graph.byId.get(3).y);
  assert.deepEqual(graph.edges, [{ child: 2, parent: 1, inferred: false }, { child: 3, parent: 2, inferred: false }]);
  const folded = layoutReportingGraph(buildEmployeeHierarchy(people), { collapsed: new Set([2]) });
  assert.equal(folded.byId.has(3), false);
  const dragged = layoutReportingGraph(buildEmployeeHierarchy(people), { positions: { 2: { x: 600, y: 400 } } });
  assert.equal(dragged.byId.get(2).x, 600);
  assert.equal(dragged.byId.get(2).y, 400);
});

test("unassigned people have role levels and explicitly inferred company links", () => {
  const unassigned = people.filter(person => person.status === "ACTIVE").map(person => ({ ...person, manager_membership_id: null }));
  const graph = layoutReportingGraph(buildEmployeeHierarchy(unassigned));
  assert.ok(graph.byId.get(1).y < graph.byId.get(2).y);
  assert.ok(graph.byId.get(2).y < graph.byId.get(3).y);
  assert.ok(graph.edges.every(edge => edge.inferred));
});

test("expanded reports stay grouped directly below their manager", () => {
  const team = [
    ...people.filter(person => person.status === "ACTIVE"),
    { membership_id: 5, name: "Second manager", role: "TEAM_LEAD", status: "ACTIVE", manager_membership_id: 1 },
    { membership_id: 6, name: "First report", role: "EMPLOYEE", status: "ACTIVE", manager_membership_id: 2 },
    { membership_id: 7, name: "Second report", role: "EMPLOYEE", status: "ACTIVE", manager_membership_id: 5 },
  ];
  const graph = layoutReportingGraph(buildEmployeeHierarchy(team));
  const firstManager = graph.byId.get(2);
  const firstReports = [graph.byId.get(3), graph.byId.get(6)];
  const secondManager = graph.byId.get(5);
  const secondReport = graph.byId.get(7);

  assert.ok(firstReports.every(report => report.y > firstManager.y));
  assert.ok(secondReport.y > secondManager.y);
  assert.ok(Math.max(...firstReports.map(report => report.x)) < secondReport.x);
  assert.ok(firstManager.x >= Math.min(...firstReports.map(report => report.x)));
  assert.ok(firstManager.x <= Math.max(...firstReports.map(report => report.x)));
});
