import { useState } from "react";
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
  CERTIFICATE_EXPIRING_30D: { icon: "graduation-cap", label: "Срок сертификата", section: "profile" },
  CERTIFICATE_EXPIRING_7D: { icon: "graduation-cap", label: "Срок сертификата", section: "profile" },
  CERTIFICATE_EXPIRED: { icon: "graduation-cap", label: "Сертификат истёк", section: "profile" },
};

function kindFor(item) {
  return notificationKinds[item.type] || { icon: "bell", label: "Событие компании", section: "overview" };
}

export function CompanyNotifications({ data, reload, compact = false, onNavigate }) {
  const [readIds, setReadIds] = useState([]), [error, setError] = useState(""), [busyId, setBusyId] = useState(null), [markingAll, setMarkingAll] = useState(false);
  const messages = data.inbox || [];
  const isRead = item => item.read || readIds.includes(item.id);
  const unread = messages.filter(item => !isRead(item));

  async function markRead(item) {
    if (isRead(item)) return;
    setError(""); setBusyId(item.id); setReadIds(ids => ids.includes(item.id) ? ids : [...ids, item.id]);
    try { await api(`/api/company/${data.company.id}/inbox/${item.id}/read`, { method: "POST" }); }
    catch (cause) { setReadIds(ids => ids.filter(id => id !== item.id)); setError(cause.message); }
    finally { setBusyId(null); }
  }

  async function openMessage(item) {
    await markRead(item);
    const path = businessPath(data.company.id, kindFor(item).section);
    if (onNavigate) onNavigate(path);
  }

  async function markAllRead() {
    setError(""); setMarkingAll(true);
    const ids = unread.map(item => item.id);
    setReadIds(current => [...new Set([...current, ...ids])]);
    try {
      await Promise.all(ids.map(id => api(`/api/company/${data.company.id}/inbox/${id}/read`, { method: "POST" })));
      if (reload) await reload();
    } catch (cause) {
      setReadIds(current => current.filter(id => !ids.includes(id)));
      setError(cause.message);
    } finally { setMarkingAll(false); }
  }

  return <section className={`business-notifications${compact ? " is-compact" : ""}`}>
    {!compact && <header><h2>Уведомления</h2><p>Назначения, сроки, результаты и события вашей компании.</p></header>}
    {compact && <div className="business-notification-summary"><span>{unread.length ? `${unread.length} непрочитанных` : "Всё прочитано"}</span>{unread.length > 0 && <button type="button" disabled={markingAll} onClick={markAllRead}>{markingAll ? "Отмечаем…" : "Прочитать все"}</button>}</div>}
    {error && <Notice tone="red">{error}</Notice>}
    <div className="business-notification-list">
      {messages.map(item => { const kind = kindFor(item), read = isRead(item); return <article key={item.id} className={read ? "is-read" : "is-unread"}>
        <button type="button" disabled={busyId === item.id} onClick={() => openMessage(item)}>
          <span className="business-notification-icon" aria-hidden="true"><Icon name={kind.icon} size={19}/></span>
          <span className="business-notification-copy"><span><small>{kind.label}</small><time>{formatDate(item.created_at)}</time></span><strong>{item.title}</strong><span>{item.text}</span></span>
          {!read && <i aria-label="Непрочитано"/>}
        </button>
      </article>; })}
      {!messages.length && <Empty>Уведомлений пока нет. Здесь появятся новые назначения, напоминания о сроках и результаты команды.</Empty>}
    </div>
  </section>;
}
