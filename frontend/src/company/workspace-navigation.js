export function notificationPath(companyId, item, manager = false) {
  const base = `/business/${companyId}`, p = item.payload || {};
  const id = value => /^\d+$/.test(String(value)) && Number(value) > 0 ? String(value) : null;
  if (id(p.room_id)) return `${base}/room/${p.room_id}`;
  if (id(p.council_id || p.meeting_id) && item.type?.includes("COUNCIL")) return `${base}/council/${p.council_id || p.meeting_id}`;
  if (id(p.meeting_id)) return `${base}/calendar?view=meetings&meeting=${p.meeting_id}`;
  if (item.type === "PROFESSION_REQUEST") return `${base}/settings?setting=catalog`;
  const attempt = id(p.attempt_id || p.assignment_attempt_id), assignment = id(p.assignment_id), target = id(p.target_id);
  if (attempt || assignment || target) {
    const query = new URLSearchParams({ view: manager ? "manage" : "mine" });
    if (attempt) query.set("attempt", attempt);
    if (assignment) query.set("assignment", assignment);
    if (target) query.set("target", target);
    return `${base}/learning?${query}`;
  }
  if (id(p.session_id)) return `${base}/report/${p.session_id}`;
  if (/CERTIFICATE|ACHIEVEMENT/.test(item.type)) return `${base}/profile?view=certificates`;
  if (/RESULT|COMMENT/.test(item.type)) return `${base}/profile?view=analytics`;
  return `${base}/${/ROOM|MEETING/.test(item.type) ? "calendar" : /ASSIGNMENT|REMINDER|OVERDUE/.test(item.type) ? "learning" : "overview"}`;
}

export function readableNotification(text, format) {
  return String(text || "").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?/g, value => format(value));
}

export const widgetLabels = { plan: "Мой план", calendar: "Календарь", practice: "Практика и задания", progress: "Мои результаты", company: "Обзор команды", colleagues: "Коллеги", news: "Новости компании" };
export function moveWidget(widgets, key, offset) {
  const result = [...widgets], from = result.indexOf(key), to = from + offset;
  if (from < 0 || to < 0 || to >= result.length) return result;
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
