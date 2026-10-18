import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import { useEffect, Loader, Notice, formatDate, roleLabels } from "./shared.jsx";

function Metric({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-white/70 p-4"><span className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</span><strong className="mt-2 block text-2xl text-slate-900">{value ?? "—"}</strong></div>;
}

export function AdvancedHub({ data }) {
  const { user } = useAuth();
  const companyId = data.company.id;
  const roleTitle = roleLabels[data.membership.role] || data.membership.role_label || "Сотрудник";
  const canManage = Boolean(data.permissions?.manage_company || data.permissions?.view_analytics);
  const [archive, setArchive] = useState(null), [twin, setTwin] = useState(null), [catalog, setCatalog] = useState(null), [hr, setHr] = useState(null), [workspace, setWorkspace] = useState(null), [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [title, setTitle] = useState(""), [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true); setError("");
    const calls = [
      api(`/api/company/${companyId}/archive`),
      api(`/api/company/${companyId}/twin/me`),
      api(`/api/company/${companyId}/catalog`),
      canManage ? api(`/api/company/${companyId}/hr/report?min_group_size=3`) : Promise.resolve(null),
      api(`/api/company/${companyId}/me`),
      canManage ? api(`/api/company/${companyId}/roles`) : Promise.resolve([]),
    ];
    const results = await Promise.allSettled(calls);
    const failures = results.filter(item => item.status === "rejected");
    if (failures.length === results.length) setError(failures[0]?.reason?.message || "Раздел временно недоступен");
    if (results[0]?.status === "fulfilled") setArchive(results[0].value);
    if (results[1]?.status === "fulfilled") setTwin(results[1].value);
    if (results[2]?.status === "fulfilled") setCatalog(results[2].value);
    if (results[3]?.status === "fulfilled") setHr(results[3].value);
    if (results[4]?.status === "fulfilled") setWorkspace(results[4].value);
    if (results[5]?.status === "fulfilled") setRoles(results[5].value || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [companyId, data.membership.id]);

  async function createArchive(event) {
    event.preventDefault(); if (!title.trim()) return;
    setCreating(true); setMessage("");
    try {
      await api(`/api/company/${companyId}/archive`, { method: "POST", body: { title, record_type: "NEGOTIATION", data_scope: "METRICS_AND_REPORT", payload: { metrics: {}, report: "Запись создана сотрудником" } } });
      setTitle(""); setMessage("Запись добавлена в личный архив."); await load();
    } catch (cause) { setMessage(cause.message); } finally { setCreating(false); }
  }

  async function toggleTwin() {
    setMessage("");
    try {
      const next = !twin?.opt_in;
      const result = await api(`/api/company/${companyId}/twin/me`, { method: "PUT", body: { opt_in: next, source_types: next ? ["TRAINING_RESULTS"] : [] } });
      setTwin(result); setMessage(next ? "Переговорный двойник включён по вашему согласию." : "Переговорный двойник отключён.");
    } catch (cause) { setMessage(cause.message); }
  }

  if (loading) return <Loader />;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">ЛИЧНЫЕ ДАННЫЕ И РАЗВИТИЕ</div><h2 className="mt-1 text-3xl font-bold text-slate-900">Архив и профиль</h2>{data.membership?.role !== "COMPANY_OWNER" && <p className="mt-2 max-w-2xl text-slate-600">Ваши переговорные записи принадлежат вам. Компания увидит отдельную запись только после явного согласия с выбранным объёмом и сроком доступа.</p>}</div><button className="subtle-button" onClick={load}>Обновить</button></div>
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    <article className="glass rounded-3xl p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow">КОРПОРАТИВНЫЙ ПРОФИЛЬ</div><h3 className="mt-1 text-2xl font-bold text-slate-900">{user?.display_name || user?.username || "Профиль сотрудника"}</h3><p className="mt-2 text-sm text-slate-600">{workspace?.profession?.title || "Специальность пока не назначена"} · {workspace?.membership?.custom_role?.title || roleTitle}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${workspace?.onboarding?.completed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{workspace?.onboarding?.completed ? "Онбординг завершён" : "Нужен первый вход"}</span></div><div className="mt-5 grid gap-3 md:grid-cols-3"><Metric label="Руководитель" value={workspace?.manager_chain?.[0]?.name || "Не назначен"} /><Metric label="Записи архива" value={workspace?.archive?.owned_records || 0} /><Metric label="Роль" value={workspace?.membership?.custom_role?.title || roleTitle} /></div>{canManage && <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center justify-between gap-3"><b className="text-slate-900">Кастомные роли</b><span className="text-xs text-slate-500">{roles.length} активных</span></div><p className="mt-1 text-sm text-slate-600">Роли действуют только внутри этой компании; критические права владельца нельзя передать.</p>{roles.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{roles.slice(0, 6).map(role => <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700" key={role.id}>{role.title}</span>)}</div>}</div>}</article>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Записей в архиве" value={archive?.items?.length || 0} /><Metric label="Профессий в каталоге" value={catalog?.professions?.length || 0} /><Metric label="Компетенций" value={catalog?.competencies?.length || 0} /><Metric label="Методика HR" value={hr?.methodology_version || "hr-v1"} /></div>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <article className="glass rounded-3xl p-6"><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">ПРИВАТНЫЙ АРХИВ</div><h3 className="mt-1 text-2xl font-bold text-slate-900">Ваши записи</h3><p className="mt-2 text-sm text-slate-600">Для каждой записи можно отдельно выдать, просмотреть и отозвать доступ. Руководитель не имеет скрытого доступа.</p></div><span className="rounded-full bg-lime-50 px-3 py-1 text-xs font-semibold text-lime-800">Согласие по записи</span></div>
        <form onSubmit={createArchive} className="mt-5 flex gap-2"><input className="company-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="Название новой записи" maxLength={220} /><button className="primary-button" disabled={creating}>{creating ? "Сохраняем…" : "Сохранить"}</button></form>
        <div className="mt-5 space-y-2">{archive?.items?.map(item => <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4" key={item.id}><div><b className="text-slate-900">{item.title}</b><p className="mt-1 text-xs text-slate-500">{item.record_type} · {formatDate(item.created_at)} · {item.data_scope}</p></div><div className="flex items-center gap-2"><button className="subtle-button" onClick={async () => { try { const preview = await api(`/api/company/${companyId}/archive/${item.id}/preview`); setMessage(`Видимые поля: ${preview.visible_fields["METRICS_AND_REPORT"].join(", ")}`); } catch (cause) { setMessage(cause.message); } }}>Предпросмотр</button><button className="subtle-button" onClick={async () => { try { await api(`/api/company/${companyId}/archive/${item.id}`, { method: "DELETE" }); setMessage("Запись удалена из архива."); await load(); } catch (cause) { setMessage(cause.message); } }}>Удалить</button></div></div>)}{!archive?.items?.length && <p className="text-sm text-slate-500">Архив пока пуст. Добавьте запись после практики.</p>}</div>
      </article>
      <article className="glass rounded-3xl p-6"><div className="eyebrow">ПЕРЕГОВОРНЫЙ ДВОЙНИК</div><h3 className="mt-1 text-2xl font-bold text-slate-900">Профиль поведения</h3><p className="mt-2 text-sm text-slate-600">Профиль рассчитывается по результатам ваших корпоративных заданий. После включения новые результаты будут учитываться автоматически.</p><div className="mt-5 grid grid-cols-2 gap-2">{Object.entries(twin?.profile?.dimensions || { trust: 50, goal: 50, control: 50, eq: 50 }).map(([key, value]) => <Metric key={key} label={{ trust: "Доверие", goal: "Цель", control: "Контроль", eq: "Эмпатия" }[key] || key} value={value} />)}</div><div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div><b className="text-slate-900">{twin?.opt_in ? "Включён" : "Выключен"}</b><p className="text-xs text-slate-500">Данные: {twin?.opt_in ? "результаты корпоративных заданий" : "учёт результатов ещё не включён"}</p></div><button className="primary-button" onClick={toggleTwin}>{twin?.opt_in ? "Отключить" : "Учитывать результаты"}</button></div><Link className="subtle-button mt-3 inline-block" to={`${data.business_base || `/business/${companyId}`}/learning`}>Перейти к заданиям</Link></article>
    </div>
    {canManage && <article className="glass rounded-3xl p-6"><div className="eyebrow">HR И ОБУЧЕНИЕ</div><h3 className="mt-1 text-2xl font-bold text-slate-900">Агрегаты без персональных профилей</h3><p className="mt-2 text-sm text-slate-600">Отчёт учитывает только учебные результаты, показывает версию методики и скрывает малые выборки.</p><div className="mt-5 grid gap-3 md:grid-cols-3">{(hr?.rows || []).map(row => <div className="rounded-2xl border border-slate-200 bg-white/70 p-4" key={row.profession_id}><b className="text-slate-900">Профессия #{row.profession_id}</b><p className="mt-2 text-sm text-slate-600">{row.status === "READY" ? `Средний результат ${row.average_score}/100` : "Выборка скрыта"}</p><span className="text-xs text-slate-500">Участников: {row.member_count ?? "—"}</span></div>)}{!hr?.rows?.length && <p className="text-sm text-slate-500">После назначения профессий здесь появится HR-отчёт.</p>}</div></article>}
  </section>;
}
