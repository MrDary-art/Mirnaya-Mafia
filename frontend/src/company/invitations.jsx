import { useState } from "react";
import { api } from "../api.js";
import { basicRoleOptions, useEffect, roleLabels, formatDate, Empty, Notice } from "./shared.jsx";

const inviteStatus = { PENDING: "Ожидает вступления", ACCEPTED: "Принято", REVOKED: "Отозвано", EXPIRED: "Истекло" };

export function InvitationLinks({ data, departments, embedded = false }) {
  const id = data.company.id;
  const [items, setItems] = useState([]), [generated, setGenerated] = useState(null), [revokeTarget, setRevokeTarget] = useState(null);
  const [form, setForm] = useState({ corporate_role: "EMPLOYEE", department_id: "", job_title: "Сотрудник", expires_in_days: 7, username: "" });
  const [error, setError] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const load = () => api(`/api/company/${id}/invitation-links`).then(setItems).catch(cause => setError(cause.message));
  useEffect(load, [id]);
  async function create(event) {
    event.preventDefault(); setError(""); setNote(""); setBusy(true);
    try { const result = await api(`/api/company/${id}/invitation-links`, { method: "POST", body: { ...form, department_id: form.department_id ? Number(form.department_id) : null, expires_in_days: Number(form.expires_in_days), username: form.username.trim() || undefined } }); setGenerated({ ...result, absoluteUrl: new URL(result.url, window.location.origin).href }); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(generated.absoluteUrl); setNote("Ссылка скопирована."); }
    catch { setNote("Выделите ссылку в поле и скопируйте её вручную."); }
  }
  async function revoke() {
    setBusy(true); setError("");
    try { await api(`/api/company/${id}/invitation-links/${revokeTarget.id}/revoke`, { method: "POST" }); if (generated?.id === revokeTarget.id) setGenerated(null); setRevokeTarget(null); setNote("Приглашение отозвано."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  const content = <><p className="mt-3 max-w-[70ch] text-sm text-slate-400">Получатель входит в свой аккаунт и подтверждает вступление. После вступления назначьте руководителя в карточке сотрудника. Ссылка действует для одного человека до указанного срока.</p>{error && <div className="mt-4"><Notice tone="red">{error}</Notice></div>}{note && <div className="mt-4"><Notice>{note}</Notice></div>}
    <form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-2"><label>Логин получателя, если известен<input className="company-input" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="Необязательно" /></label><label>Должность<input required maxLength={160} className="company-input" value={form.job_title} onChange={event => setForm({ ...form, job_title: event.target.value })} /></label><label>Подразделение<select aria-label="Подразделение" className="company-input" value={form.department_id} onChange={event => setForm({ ...form, department_id: event.target.value })}><option value="">Без подразделения</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>Уровень доступа<select aria-label="Уровень доступа" className="company-input" value={form.corporate_role} onChange={event => setForm({ ...form, corporate_role: event.target.value })}>{basicRoleOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Срок действия, дней<input required type="number" min={1} max={30} className="company-input" value={form.expires_in_days} onChange={event => setForm({ ...form, expires_in_days: event.target.value })} /></label><div className="flex items-end"><button disabled={busy} className="primary-button">Создать одноразовую ссылку</button></div></form>
    {generated && <section className="mt-5 rounded-2xl border border-lime-300/25 bg-lime-300/5 p-4"><h3 className="font-bold">Приглашение создано</h3><p className="mt-2 text-sm text-slate-400">Сохраните ссылку сейчас: после закрытия страницы её полный адрес больше не показывается. Действует до {formatDate(generated.expires_at)}.</p><label className="mt-3 block text-sm">Ссылка приглашения<input readOnly className="company-input" value={generated.absoluteUrl} onFocus={event => event.currentTarget.select()} /></label><button type="button" className="subtle-button mt-3" onClick={copy}>Скопировать ссылку</button></section>}
    {revokeTarget && <section className="mt-5 rounded-2xl border border-amber-300/30 p-4"><p>Отозвать приглашение №{revokeTarget.id}? По этой ссылке больше нельзя будет вступить.</p><div className="mt-3 flex flex-wrap gap-3"><button disabled={busy} type="button" className="primary-button" onClick={revoke}>Подтвердить отзыв</button><button type="button" className="subtle-button" onClick={() => setRevokeTarget(null)}>Отмена</button></div></section>}
    <div className="mt-5 space-y-3">{items.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><div><b>Приглашение №{item.id} · {item.role_label || roleLabels[item.corporate_role]}</b><p className="mt-2 text-sm text-slate-400">{item.job_title} · {item.department_id ? departments.find(department => department.id === item.department_id)?.name || "Подразделение" : "Без подразделения"}</p><p className="mt-1 text-sm text-slate-400">{inviteStatus[item.status] || item.status} · До {formatDate(item.expires_at)}</p>{item.targeted && <p className="mt-1 text-xs text-slate-400">Для указанного аккаунта</p>}</div>{item.status === "PENDING" && <button disabled={busy} type="button" className="subtle-button" onClick={() => setRevokeTarget(item)}>Отозвать ссылку</button>}</article>)}{!items.length && <Empty>Одноразовых приглашений пока нет.</Empty>}</div></>;
  if (embedded) return <section className="business-invitation-links"><h3>Одноразовая ссылка</h3>{content}</section>;
  return <details className="glass rounded-3xl p-5"><summary className="cursor-pointer font-bold">Одноразовые ссылки приглашения</summary>{content}</details>;
}
