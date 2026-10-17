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
