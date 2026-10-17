const ROLE_ORDER = {
  COMPANY_OWNER: 0,
  COMPANY_ADMIN: 1,
  LND_MANAGER: 2,
  DEPARTMENT_MANAGER: 3,
  TEAM_LEAD: 4,
  MENTOR: 5,
  AUDITOR: 6,
  EMPLOYEE: 7,
};

function byRoleAndName(left, right) {
  return (ROLE_ORDER[left.role] ?? 99) - (ROLE_ORDER[right.role] ?? 99)
    || left.name.localeCompare(right.name, "ru");
}

export function buildEmployeeHierarchy(people = []) {
  const active = people.filter(person => person.status === "ACTIVE");
  const byId = new Map(active.map(person => [person.membership_id, person]));
  const children = new Map(active.map(person => [person.membership_id, []]));
  const roots = [];

  for (const person of active) {
    const managerId = person.manager_membership_id;
    if (!managerId || managerId === person.membership_id || !byId.has(managerId)) {
      roots.push(person);
      continue;
    }
    const seen = new Set([person.membership_id]);
    let cursor = byId.get(managerId);
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor.membership_id)) { cyclic = true; break; }
      seen.add(cursor.membership_id);
      cursor = byId.get(cursor.manager_membership_id);
    }
    if (cyclic) roots.push(person);
    else children.get(managerId).push(person);
  }

  roots.sort(byRoleAndName);
  children.forEach(list => list.sort(byRoleAndName));
  return { active, byId, children, roots };
}

export function hierarchyExpandableIds(hierarchy) {
  return hierarchy.active
    .filter(person => (hierarchy.children.get(person.membership_id) || []).length > 0)
    .map(person => person.membership_id);
}

// Missing managers are not invented: dashed edges denote company membership.
export function layoutReportingGraph(hierarchy, { collapsed = new Set(), visibleIds = null, positions = {} } = {}) {
  const owner = hierarchy.active.find(person => person.role === "COMPANY_OWNER");
  const parents = new Map(), inferred = new Set();
  hierarchy.children.forEach((children, parent) => children.forEach(person => parents.set(person.membership_id, parent)));
  for (const person of hierarchy.roots) {
    if (owner && person !== owner) { parents.set(person.membership_id, owner.membership_id); inferred.add(person.membership_id); }
  }
  const counts = new Map();
  parents.forEach(parent => counts.set(parent, (counts.get(parent) || 0) + 1));
  const levelOf = (id, seen = new Set()) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const parent = parents.get(id);
    if (!parent) return 0;
    if (inferred.has(id)) return hierarchy.byId.get(id)?.role === "EMPLOYEE" ? 2 : 1;
    return levelOf(parent, seen) + 1;
  };
  const shown = hierarchy.active.filter(person => {
    const id = person.membership_id;
    if (visibleIds && !visibleIds.has(id) && !(person === owner && visibleIds.size)) return false;
    if (!visibleIds) {
      let parent = parents.get(id); const seen = new Set([id]);
      while (parent && !seen.has(parent)) {
        if (collapsed.has(parent)) return false;
        seen.add(parent); parent = parents.get(parent);
      }
    }
    return true;
  });
  const rows = new Map();
  shown.forEach(person => { const level = levelOf(person.membership_id); rows.set(level, [...(rows.get(level) || []), person]); });
  const width = Math.max(320, ...[...rows.values()].map(row => row.length * 270 + 30));
  const nodes = [];
  rows.forEach((row, level) => row.sort(byRoleAndName).forEach((person, index) => {
    const stored = positions[person.membership_id];
    const position = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? stored : { x: (width - row.length * 270) / 2 + index * 270 + 15, y: 24 + level * 226 };
    nodes.push({ person, x: position.x, y: position.y, reports: counts.get(person.membership_id) || 0 });
  }));
  const byId = new Map(nodes.map(node => [node.person.membership_id, node]));
  const edges = [...parents].filter(([child, parent]) => byId.has(child) && byId.has(parent)).map(([child, parent]) => ({ child, parent, inferred: inferred.has(child) }));
  return { nodes, edges, byId, expandableIds: [...counts.keys()], width: Math.max(width, ...nodes.map(node => node.x + 260)), height: Math.max(220, ...nodes.map(node => node.y + 190)) };
}

export function hierarchyVisibleIds(people, query = "", departmentId = "") {
  const { byId } = buildEmployeeHierarchy(people);
  const normalized = query.trim().toLocaleLowerCase("ru");
  if (!normalized && !departmentId) return null;
  const visible = new Set();
  for (const person of byId.values()) {
    const matchesDepartment = !departmentId || String(person.department_id || "") === String(departmentId);
    const matchesText = !normalized || [person.name, person.username, person.job_title, person.profession, person.specialization, person.department, person.role_label]
      .some(value => value?.toLocaleLowerCase("ru").includes(normalized));
    if (!matchesDepartment || !matchesText) continue;
    let cursor = person;
    const guard = new Set();
    while (cursor && !guard.has(cursor.membership_id)) {
      visible.add(cursor.membership_id);
      guard.add(cursor.membership_id);
      cursor = byId.get(cursor.manager_membership_id);
    }
  }
  return visible;
}

export function groupEmployeesByProfession(people = []) {
  const groups = new Map();
  for (const person of people.filter(item => item.status === "ACTIVE")) {
    const title = person.profession || person.specialization || person.job_title || "Специальность не указана";
    groups.set(title, [...(groups.get(title) || []), person]);
  }
  return [...groups.entries()]
    .map(([title, members]) => ({ title, members: members.sort(byRoleAndName) }))
    .sort((left, right) => right.members.length - left.members.length || left.title.localeCompare(right.title, "ru"));
}
