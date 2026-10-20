import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Empty, Loader, Notice, formatDate } from "./shared.jsx";

const requestLabels = { SCENARIO: "Сценарий", MODE: "Режим практики", INTEGRATION: "Интеграция", OTHER: "Другое" };
const requestStatusLabels = { SUBMITTED: "Отправлена", IN_REVIEW: "На рассмотрении", IN_PROGRESS: "В работе", DONE: "Выполнена", DECLINED: "Отклонена" };

export function ProfessionalProfile({ data }) {
  const id = data.company.id;
  const [catalog, setCatalog] = useState({ professions: [] });
  const [specialties, setSpecialties] = useState([]);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [transferCode, setTransferCode] = useState("");

  async function load() {
    setError("");
    try {
      const [catalogValue, specialtyRows, profile] = await Promise.all([
        api(`/api/company/${id}/catalog`),
        api(`/api/company/${id}/catalog/specialties`),
        api(`/api/company/${id}/me/professional-profile`),
      ]);
      setCatalog(catalogValue);
      setSpecialties(specialtyRows);
      setForm({
        profession_id: profile.profession?.id || "",
        specialty_id: profile.specialty?.id || "",
        professional_level: profile.professional_level || 1,
        share_results: Boolean(profile.share_results),
        level_verified: Boolean(profile.level_verified),
        recommendations: profile.recommendations || { programs: [], scenarios: [] },
      });
    } catch (cause) { setError(cause.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api(`/api/company/${id}/me/professional-profile`, { method: "PUT", body: {
        profession_id: form.profession_id ? Number(form.profession_id) : null,
        specialty_id: form.specialty_id ? Number(form.specialty_id) : null,
        professional_level: Number(form.professional_level),
        share_results: form.share_results,
      }});
      setMessage("Профессиональный профиль сохранён. Изменение уровня ожидает подтверждения руководителя.");
      await load();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  async function confirmTransfer(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api(`/api/company/${id}/ownership-transfers/confirm`, { method: "POST", body: { confirmation_code: transferCode.trim() } });
      setTransferCode("");
      setMessage("Передача компании подтверждена. Обновите страницу, чтобы применить права владельца.");
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  if (!form && !error) return <Loader />;
  const availableSpecialties = specialties.filter(item => String(item.profession_id) === String(form?.profession_id));
  const recommendations = [...(form?.recommendations?.programs || []).map(item => ({ ...item, kind: "Программа" })), ...(form?.recommendations?.scenarios || []).map(item => ({ ...item, kind: "Практика" }))];
  return <section className="business-panel professional-profile-card">
    <div className="business-card-heading"><div><h3>Профессиональный профиль</h3><p>Профессия определяет рекомендованные программы, практики и цели компетенций.</p></div>{form?.level_verified && <span className="business-status business-status-positive">Уровень подтверждён</span>}</div>
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    {form && <form onSubmit={save} className="professional-profile-form">
      <label>Профессия<select value={form.profession_id} onChange={event => setForm({ ...form, profession_id: event.target.value, specialty_id: "", level_verified: false })}><option value="">Не выбрана</option>{catalog.professions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Специальность<select value={form.specialty_id} disabled={!form.profession_id} onChange={event => setForm({ ...form, specialty_id: event.target.value })}><option value="">Не выбрана</option>{availableSpecialties.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Текущий уровень<select value={form.professional_level} onChange={event => setForm({ ...form, professional_level: Number(event.target.value), level_verified: false })}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
      <label className="professional-profile-consent"><input type="checkbox" checked={form.share_results} onChange={event => setForm({ ...form, share_results: event.target.checked })}/><span>Разрешить использовать корпоративные результаты для рекомендаций развития</span></label>
      <button className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить профиль"}</button>
    </form>}
    {recommendations.length > 0 && <div className="professional-profile-recommendations"><h4>Подходит вашей роли</h4>{recommendations.map(item => <div key={`${item.kind}-${item.id}`}><span>{item.kind}</span><b>{item.title}</b></div>)}</div>}
    <details className="professional-transfer-confirm"><summary>Подтвердить передачу компании</summary><form onSubmit={confirmTransfer}><label>Одноразовый код<input inputMode="numeric" minLength="8" maxLength="32" required value={transferCode} onChange={event => setTransferCode(event.target.value)} /></label><button className="subtle-button" disabled={busy}>Подтвердить</button></form></details>
  </section>;
}

export function ProductRequests({ data }) {
  const id = data.company.id;
  const canManage = Boolean(data.permissions?.manage_learning);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ request_type: "SCENARIO", title: "", description: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try { setItems(await api(`/api/company/${id}/product-requests`)); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/company/${id}/product-requests`, { method: "POST", body: form }); setForm({ request_type: "SCENARIO", title: "", description: "" }); setOpen(false); setMessage("Заявка отправлена."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function update(item, status) {
    setBusy(true); setError("");
    try { await api(`/api/company/${id}/product-requests/${item.id}`, { method: "PATCH", body: { status, admin_note: item.admin_note || null } }); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <section className="business-management-page">
    <div className="business-section-line"><div><h2>Заявки на контент и функции</h2><p>Запросите новый сценарий, режим или интеграцию и следите за решением.</p></div><button type="button" className="primary-button" onClick={() => setOpen(value => !value)}>{open ? "Закрыть" : "Новая заявка"}</button></div>
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    {open && <form className="business-management-card product-request-form" onSubmit={submit}><label>Тип<select value={form.request_type} onChange={event => setForm({ ...form, request_type: event.target.value })}>{Object.entries(requestLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Название<input required minLength={2} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })}/></label><label className="is-wide">Что требуется<textarea required minLength={10} rows="4" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label><button className="primary-button" disabled={busy}>{busy ? "Отправляем…" : "Отправить"}</button></form>}
    {loading ? <Loader /> : error && !items.length ? <div className="business-management-card"><p>Не удалось загрузить заявки.</p><button type="button" className="subtle-button" onClick={load}>Повторить</button></div> : <div className="product-request-list">{items.map(item => <article key={item.id}><div><span>{requestLabels[item.request_type] || item.request_type}</span><h3>{item.title}</h3><p>{item.description}</p>{item.admin_note && <small>Комментарий: {item.admin_note}</small>}</div><div><b>{requestStatusLabels[item.status] || item.status}</b>{canManage && item.status !== "DONE" && item.status !== "DECLINED" && <button type="button" className="subtle-button" disabled={busy} onClick={() => update(item, item.status === "SUBMITTED" ? "IN_REVIEW" : "DONE")}>{item.status === "SUBMITTED" ? "Взять в работу" : "Завершить"}</button>}</div></article>)}{!items.length && <Empty>Заявок пока нет.</Empty>}</div>}
  </section>;
}


export function SecurityCenter({ data }) {
  const id = data.company.id;
  const isOwner = data.membership.role === "COMPANY_OWNER";
  const [identity, setIdentity] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [people, setPeople] = useState([]);
  const [transferTo, setTransferTo] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const byId = useMemo(() => new Map(people.map(item => [item.membership_id, item])), [people]);
  async function load() { try { const [identityValue, sessionRows, employees] = await Promise.all([api(`/api/company/${id}/corporate-identity`), api(`/api/company/${id}/active-sessions`), api(`/api/company/${id}/employees`)]); setIdentity({ organization_code: identityValue.organization_code || "", email_domain: identityValue.email_domain || "", require_verified_email: identityValue.require_verified_email !== false }); setSessions(sessionRows); setPeople(employees.filter(item => item.status === "ACTIVE" && item.membership_id !== data.membership.id)); } catch (cause) { setError(cause.message); } }
  useEffect(() => { load(); }, [id]);
  async function saveIdentity(event) { event.preventDefault(); setError(""); try { await api(`/api/company/${id}/corporate-identity`, { method: "PUT", body: { ...identity, email_domain: identity.email_domain || null } }); setMessage("Параметры корпоративного входа сохранены."); await load(); } catch (cause) { setError(cause.message); } }
  async function revoke(sessionId) { try { await api(`/api/company/${id}/active-sessions/${sessionId}`, { method: "DELETE" }); setMessage("Сессия завершена."); await load(); } catch (cause) { setError(cause.message); } }
  async function transfer(event) { event.preventDefault(); try { const result = await api(`/api/company/${id}/ownership-transfers`, { method: "POST", body: { to_membership_id: Number(transferTo) } }); setConfirmation(result); } catch (cause) { setError(cause.message); } }
  if (!identity && !error) return <Loader />;
  return <section className="business-management-page security-center">
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    {data.permissions?.invite_members && data.company.join_code && <section className="business-management-card security-join-code"><div><span>Код компании</span><strong>{data.company.join_code}</strong></div><p>Передайте этот код сотруднику, чтобы он мог присоединиться к компании.</p></section>}
    {identity && <form className="business-management-card" onSubmit={saveIdentity}><h3>Корпоративный вход</h3><div className="security-settings-grid"><label>Код организации<input required minLength={4} pattern="[A-Za-z0-9_-]+" value={identity.organization_code} onChange={event => setIdentity({ ...identity, organization_code: event.target.value })}/></label><label>Рабочий домен<input type="text" placeholder="company.ru" value={identity.email_domain} onChange={event => setIdentity({ ...identity, email_domain: event.target.value })}/></label><label className="professional-profile-consent"><input type="checkbox" checked={identity.require_verified_email} onChange={event => setIdentity({ ...identity, require_verified_email: event.target.checked })}/><span>Требовать подтверждённую рабочую почту</span></label></div><button className="primary-button">Сохранить вход</button></form>}
    <section className="business-management-card"><div className="business-card-heading"><div><h3>Активные корпоративные сессии</h3><p>Завершение сессии сразу блокирует связанный токен доступа.</p></div><span>{sessions.length}</span></div><div className="active-session-list">{sessions.map(item => <div key={item.id}><span><b>{byId.get(item.membership_id)?.name || `Сотрудник #${item.membership_id}`}</b><small>{item.user_agent || "Устройство не указано"} · {formatDate(item.last_seen_at)}</small></span><button type="button" className="subtle-button" onClick={() => revoke(item.id)}>Завершить</button></div>)}{!sessions.length && <Empty>Активных корпоративных сессий нет.</Empty>}</div></section>
    {isOwner && <form className="business-management-card" onSubmit={transfer}><h3>Передача компании</h3><p>Новый владелец должен подтвердить передачу одноразовым кодом в течение 30 минут.</p><div className="security-transfer-row"><select required value={transferTo} onChange={event => setTransferTo(event.target.value)}><option value="">Выберите нового владельца</option>{people.map(item => <option key={item.membership_id} value={item.membership_id}>{item.name} · {item.job_title || item.role_label}</option>)}</select><button className="subtle-button">Создать запрос</button></div>{confirmation && <Notice>Код подтверждения: <strong>{confirmation.confirmation_code}</strong>. Передайте его выбранному сотруднику по защищённому каналу.</Notice>}</form>}
  </section>;
}
