import { useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { businessPath } from "../business/navigation.js";
import { formatDate, Empty, Notice } from "./shared.jsx";

const notificationKinds = {
  COMPANY_ASSIGNMENT: { icon: "book-open", label: "Новое назначение", section: "learning" },
  SCHEDULED_ASSIGNMENT: { icon: "calendar-days", label: "Назначение по плану", section: "learning" },
  DEMO_GUIDE: { icon: "book-open", label: "Новое назначение", section: "learning" },
  REMINDER_3D: { icon: "clock-3", label: "Срок приближается", section: "learning" },
  REMINDER_24H: { icon: "clock-3", label: "Срок завтра", section: "learning" },
  REMINDER_3H: { icon: "clock-3", label: "Срок скоро", section: "learning" },
  OVERDUE: { icon: "hourglass", label: "Срок истёк", section: "learning" },
  ASSIGNMENT_RESULT: { icon: "graduation-cap", label: "Результат готов", section: "profile" },
  TEAM_ASSIGNMENT_COMPLETED: { icon: "check-check", label: "Сотрудник завершил задание", section: "profile" },
  MANAGER_COMMENT: { icon: "message-circle", label: "Комментарий руководителя", section: "profile" },
  COMPANY_ACHIEVEMENT: { icon: "trophy", label: "Новое достижение", section: "profile" },
  COMPANY_ONLINE_1X1: { icon: "calendar-days", label: "Назначена встреча", section: "meetings" },
  COMPANY_MEETING: { icon: "calendar-days", label: "Приглашение на встречу", section: "meetings" },
  WORK_EPISODE: { icon: "target", label: "Рабочий эпизод", section: "episodes" },
  EPISODE_COMMITMENT: { icon: "check-check", label: "Новое обязательство", section: "episodes" },
  MEETING_PROTOCOL_PUBLISHED: { icon: "check-check", label: "Опубликован итог встречи", section: "meetings" },
  CERTIFICATE_EXPIRING_30D: { icon: "graduation-cap", label: "Срок сертификата", section: "profile" },
  CERTIFICATE_EXPIRING_7D: { icon: "graduation-cap", label: "Срок сертификата", section: "profile" },
  CERTIFICATE_EXPIRED: { icon: "graduation-cap", label: "Сертификат истёк", section: "profile" },
};

function kindFor(item) {
  return notificationKinds[item.type] || { icon: "bell", label: "Событие компании", section: "overview" };
}

export function CompanyNotifications({ data, reload, compact = false, onNavigate }) {
  const [readIds, setReadIds] = useState([]), [error, setError] = useState(""), [busyId, setBusyId] = useState(null), [markingAll, setMarkingAll] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const lock = useRef(false);
  const messages = data.inbox || [];
  const isRead = item => item.read || readIds.includes(item.id);
  const unread = messages.filter(item => !isRead(item));
  const visible = showRead ? messages : unread;

  async function refresh() {
    try { await reload?.(); }
    catch (cause) { setError(cause.message); }
  }

  async function markRead(item) {
    if (isRead(item)) return true;
    if (lock.current) return false;
    lock.current = true; setError(""); setBusyId(item.id);
    try {
      await api(`/api/company/${data.company.id}/inbox/${item.id}/read`, { method: "POST" });
      setReadIds(ids => ids.includes(item.id) ? ids : [...ids, item.id]);
      await refresh();
      return true;
    } catch (cause) { setError(cause.message); return false; }
    finally { lock.current = false; setBusyId(null); }
  }

  async function openMessage(item) {
    if (!await markRead(item)) return;
    const basePath = businessPath(data.company.id, kindFor(item).section);
    const path = ["WORK_EPISODE", "EPISODE_COMMITMENT"].includes(item.type) && item.payload?.episode_id ? `${basePath}?episode=${item.payload.episode_id}` : basePath;
    if (onNavigate) onNavigate(path);
  }

  async function markAllRead() {
    if (lock.current || !unread.length) return;
    lock.current = true; setError(""); setMarkingAll(true);
    const ids = unread.map(item => item.id);
    try {
      const results = await Promise.allSettled(ids.map(id => api(`/api/company/${data.company.id}/inbox/${id}/read`, { method: "POST" })));
      const saved = ids.filter((id, index) => results[index].status === "fulfilled");
      setReadIds(current => [...new Set([...current, ...saved])]);
      await refresh();
      const failure = results.find(result => result.status === "rejected");
      if (failure) setError(failure.reason.message);
    } finally { lock.current = false; setMarkingAll(false); }
  }

  return <section className={`business-notifications${compact ? " is-compact" : ""}`}>
    {!compact && <header><h2>Уведомления</h2><p>Назначения, сроки, результаты и события вашей компании.</p></header>}
    <div className="business-notification-summary"><span>{unread.length ? `${unread.length} непрочитанных` : "Всё прочитано"}</span>{unread.length > 0 && <button type="button" disabled={markingAll || busyId !== null} onClick={markAllRead}>{markingAll ? "Отмечаем…" : "Прочитать все"}</button>}</div>
    <label className="business-notification-archive"><input type="checkbox" checked={showRead} onChange={event => setShowRead(event.target.checked)} />Показать прочитанные</label>
    {error && <Notice tone="red">{error}</Notice>}
    <div className="business-notification-list">
      {visible.map(item => { const kind = kindFor(item), read = isRead(item); return <article key={item.id} className={read ? "is-read" : "is-unread"}>
        <button type="button" disabled={busyId !== null || markingAll} onClick={() => openMessage(item)}>
          <span className="business-notification-icon" aria-hidden="true"><Icon name={kind.icon} size={19}/></span>
          <span className="business-notification-copy"><span><small>{kind.label}</small><time>{formatDate(item.created_at)}</time></span><strong>{item.title}</strong><span>{item.text}</span></span>
          {!read && <i aria-label="Непрочитано"/>}
        </button>
      </article>; })}
      {!visible.length && <Empty>{messages.length ? "Всё прочитано. Историю можно открыть выше." : "Уведомлений пока нет. Здесь появятся новые назначения, напоминания о сроках и результаты команды."}</Empty>}
    </div>
  </section>;
}
