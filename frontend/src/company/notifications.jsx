import { useState } from "react";
import { api } from "../api.js";
import { formatDate, Empty, Notice } from "./shared.jsx";

export function CompanyNotifications({ data, reload }) {
  const [readIds, setReadIds] = useState([]), [error, setError] = useState(""), [busyId, setBusyId] = useState(null);
  async function markRead(item) {
    setError(""); setBusyId(item.id);
    try { await api(`/api/company/${data.company.id}/inbox/${item.id}/read`, { method: "POST" }); setReadIds(ids => [...ids, item.id]); if (reload) await reload(); }
    catch (cause) { setError(cause.message); } finally { setBusyId(null); }
  }
  return <section className="space-y-5"><header><h2 className="text-3xl font-bold">Уведомления</h2><p className="mt-3 text-slate-400">Назначения, результаты и события вашей компании.</p></header>{error && <Notice tone="red">{error}</Notice>}<div className="space-y-3">{data.inbox?.map(item => <article key={item.id} className="glass rounded-2xl p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-lg font-bold">{item.title}</h3><time className="text-sm text-slate-400">{formatDate(item.created_at)}</time></div><p className="mt-3 text-slate-400">{item.text}</p>{!item.read && !readIds.includes(item.id) ? <button className="subtle-button mt-4" disabled={busyId === item.id} onClick={() => markRead(item)}>Отметить прочитанным</button> : <span className="mt-4 block text-sm text-slate-400">Прочитано</span>}</article>)}{!data.inbox?.length && <Empty>Событий пока нет. Здесь появятся назначения, результаты и сообщения компании.</Empty>}</div></section>;
}
