const taskStatuses = new Set(["ASSIGNED", "OPENED", "IN_PROGRESS", "OVERDUE"]);
const closedStatuses = new Set(["PASSED", "COMPLETED", "FAILED", "FINISHED", "DONE", "CLOSED", "RESOLVED", "ENDED", "CANCELLED", "ARCHIVED", "DECLINED", "EXPIRED", "REVOKED"]);
const labels = { COUNCIL: "Совет решений", ONLINE_1X1: "Встреча 1×1", COMPANY_MEETING: "Встреча", MEETING_ACTION: "Поручение", TEAM_GOAL: "Командная цель", CERTIFICATE_EXPIRY: "Сертификат", TOURNAMENT: "Турнир" };

// Both views use the server's personal calendar; merging never adds team assignments.
export function buildPersonalPlan(assignments = [], events = [], now = Date.now(), membershipId) {
  const rows = new Map();
  for (const item of assignments) {
    const retry = item.status === "FAILED" && Number(item.attempts_used || 0) < Number(item.attempts_allowed || 0);
    if ((!taskStatuses.has(item.status) && !retry) || (item.membership_id != null && Number(item.membership_id) !== Number(membershipId))) continue;
    const targetId = item.target_id || item.id;
    rows.set(`assignment-${targetId}`, { id: `assignment-${targetId}`, title: item.title, date: item.deadline,
      status: item.status, targetId, assignmentId: item.id, retry, startable: item.status !== "OVERDUE", kind: "Личное задание", section: "learning" });
  }
  for (const event of events) {
    if (closedStatuses.has(String(event.status).toUpperCase()) || event.type === "PROGRAM") continue;
    if (event.membership_id != null && Number(event.membership_id) !== Number(membershipId)) continue;
    // Calendar deadlines are the same assignments, not a second task.
    if (event.type === "ASSIGNMENT") continue;
    const time = Date.parse(event.date);
    if (!Number.isFinite(time)) continue;
    const isDeadline = ["MEETING_ACTION", "TEAM_GOAL"].includes(event.type);
    if (time < now && !isDeadline) continue;
    rows.set(event.id, { ...event, kind: labels[event.type] || "Событие календаря", overdue: isDeadline && time < now });
  }
  return [...rows.values()].sort((a, b) => {
    const overdue = row => row.status === "OVERDUE" || Boolean(row.overdue);
    if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
    const time = row => Number.isFinite(Date.parse(row.date)) ? Date.parse(row.date) : Infinity;
    return time(a) - time(b) || a.title.localeCompare(b.title, "ru");
  });
}

export function planEventPath(companyId, item) {
  const base = `/business/${companyId}`;
  if (item.assignmentId) return `${base}/learning?view=mine&assignment=${item.assignmentId}`;
  if (item.meeting_id) return `${base}/calendar?view=meetings&meeting=${item.meeting_id}${item.action_id ? `&action=${item.action_id}#meeting-action-${item.action_id}` : ""}`;
  return item.council_id ? `${base}/council/${item.council_id}` : item.room_id ? `${base}/room/${item.room_id}` : `${base}/${item.section === "meetings" ? "calendar" : item.section || "calendar"}`;
}
