import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Loader, Notice, Empty, formatDate, metricLabels } from "./shared.jsx";
import "./profile-results.css";

const scopes = { METRICS_ONLY: "Только показатели", METRICS_AND_REPORT: "Показатели и отчёт", FULL_TRANSCRIPT: "Показатели, отчёт и переписка" };
const hints = {
  METRICS_ONLY: "Получатель увидит баллы и показатели. Текст отчёта и переписка останутся скрыты.",
  METRICS_AND_REPORT: "Получатель увидит показатели и текст отчёта. Переписка останется скрыта.",
  FULL_TRANSCRIPT: "Получатель увидит всё содержимое записи, включая сохранённую переписку.",
};
const fieldNames = { report: "Отчёт", transcript: "Переписка", messages: "Сообщения", metrics: "Показатели записи", score: "Итоговый балл", methodology_version: "Методика" };
const readable = value => typeof value === "string" ? value : JSON.stringify(value, null, 2);
function archiveText(key, value) {
  if (key === "metrics" && value && typeof value === "object") return Object.entries(value).map(([metric, score]) => `${metricLabels[metric] || metric}: ${score == null ? "Нет данных" : `${score} / 100`}`).join("\n") || "Показатели не сохранены.";
  if (key === "report" && value && typeof value === "object") {
    const verdict = typeof value.verdict === "string" ? value.verdict : value.verdict?.summary || value.verdict?.title;
    const outcomes = { success: "Успешно", failure: "Не пройдено", partial: "Частичный результат", timeout: "Время истекло" };
    return [value.scenario_title, verdict, value.outcome ? `Результат: ${outcomes[value.outcome] || value.outcome}` : null].filter(Boolean).join("\n\n") || (Object.keys(value).length ? readable(value) : "Текстового заключения нет. Показатели практики сохранены отдельно.");
  }
  return readable(value);
}

export function AdvancedHub({ data }) {
  const base = `/api/company/${data.company.id}`;
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [filter, setFilter] = useState("owner"), [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ title: "", report: "", transcript: "" });
  const [params, setParams] = useSearchParams();
  const selected = params.get("record");
  const setSelected = value => setParams(current => { const next = new URLSearchParams(current); if (value) next.set("record", String(value)); else next.delete("record"); return next; });
  async function load() {
    setLoading(true); setError("");
    try { const result = await api(`${base}/archive`); setItems([...new Map(result.items.map(item => [item.id, item])).values()]); }
    catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }
  useEffect(() => { setItems([]); load(); }, [base, data.membership.id]);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const record = await api(`${base}/archive`, { method: "POST", body: {
        title: draft.title.trim(), record_type: "NEGOTIATION", data_scope: draft.transcript.trim() ? "FULL_TRANSCRIPT" : "METRICS_AND_REPORT",
        payload: { report: draft.report.trim(), ...(draft.transcript.trim() ? { transcript: draft.transcript.trim() } : {}) },
      } });
      setDraft({ title: "", report: "", transcript: "" }); setCreating(false); setFilter("owner");
      await load(); setSelected(record.id); setMessage("Запись сохранена. Доступ есть только у вас, пока вы его не выдадите.");
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  const visible = items.filter(item => item.access === filter && item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section className="profile-results">
    <header className="profile-results-heading"><div><h2>Архив</h2><p>Записи практики, сохранённые отчёты и доступ к ним. Каждая запись по умолчанию доступна только владельцу.</p></div><div className="profile-results-actions"><button className="subtle-button" onClick={load} disabled={loading}>Обновить</button><button className="primary-button" onClick={() => setCreating(value => !value)}>{creating ? "Закрыть форму" : "Добавить запись"}</button></div></header>
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    {creating && <form className="profile-results-card" onSubmit={create}><h3>Новая запись</h3><p>Сохраните собственный отчёт или заметки после практики. Эта форма не создаёт автоматическую оценку.</p>
      <label>Название<input className="company-input" required minLength={2} maxLength={220} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
      <label>Отчёт или заметки<textarea className="company-input" required rows={5} value={draft.report} onChange={event => setDraft({ ...draft, report: event.target.value })}/></label>
      <label>Переписка — необязательно<textarea className="company-input" rows={3} value={draft.transcript} onChange={event => setDraft({ ...draft, transcript: event.target.value })}/></label>
      <button className="primary-button" disabled={busy || draft.title.trim().length < 2 || !draft.report.trim()}>{busy ? "Сохраняем…" : "Сохранить в архив"}</button>
    </form>}
    <div className="profile-results-toolbar"><div className="profile-results-actions" role="group" aria-label="Чьи записи">{[["owner", "Мои записи"], ["granted", "Доступные мне"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "primary-button" : "subtle-button"} onClick={() => { setFilter(key); setSelected(null); }}>{label}</button>)}</div><label>Поиск по названию<input className="company-input" type="search" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
    {loading ? <Loader/> : <div className="archive-layout"><div className="profile-results-card archive-list"><h3>{filter === "owner" ? "Мои записи" : "Записи, которыми с вами поделились"}</h3>
      {visible.map(item => <button key={item.id} className={`archive-record ${String(selected) === String(item.id) ? "is-selected" : ""}`} aria-pressed={String(selected) === String(item.id)} onClick={() => setSelected(item.id)}><b>{item.title}</b><span>{formatDate(item.created_at)}</span><small>{item.access === "owner" ? "Ваша запись" : "Доступ по согласию владельца"}</small></button>)}
      {!visible.length && <Empty>{search ? "По этому названию ничего не найдено." : filter === "owner" ? "Записей пока нет. Добавьте отчёт или заметки после практики." : "Здесь появятся записи, к которым коллеги выдали вам доступ."}</Empty>}
    </div>{selected ? <ArchiveDetail key={`${base}:${selected}`} base={base} id={selected} membershipId={data.membership.id} onDeleted={async () => { setSelected(null); await load(); }}/>: <div className="profile-results-card"><h3>Содержимое записи</h3><p>Выберите запись слева, чтобы прочитать отчёт, скачать его или настроить доступ.</p></div>}</div>}
  </section>;
}

function ArchiveDetail({ base, id, membershipId, onDeleted }) {
  const [record, setRecord] = useState(null), [grants, setGrants] = useState([]), [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [accessReady, setAccessReady] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState({ grantee_membership_id: "", data_scope: "METRICS_AND_REPORT", purpose: "", duration_days: "30", confirm_preview: false });
  const path = `${base}/archive/${id}`;
  async function load() {
    setLoading(true); setError(""); setAccessReady(false);
    try {
      const value = await api(path); setRecord(value);
      if (value.access === "owner") {
        const [access, directory] = await Promise.all([api(`${path}/grants`), api(`${base}/messenger/directory`)]);
        setGrants(access); setPeople(directory.filter(person => person.membership_id !== membershipId)); setAccessReady(true);
      }
    } catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [path]);
  async function act(operation, success) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); setMessage(success); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  function download() {
    const content = [record.title, formatDate(record.created_at), ...Object.entries(record.data || {}).map(([key, value]) => `${fieldNames[key] || key}\n${archiveText(key, value)}`)].join("\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `archive-${id}.txt`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article className="profile-results-card archive-detail" aria-busy={loading || busy}>
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    {loading ? <Loader/> : !record ? <button className="subtle-button" onClick={load}>Повторить загрузку</button> : <>
      <header><h3>{record.title}</h3><p>{formatDate(record.created_at)} · {record.access === "owner" ? "Ваша запись" : "Вам доступна только разрешённая владельцем часть записи"}</p><button className="subtle-button" onClick={download}>Скачать запись .txt</button></header>
      {Object.entries(record.data || {}).map(([key, value]) => <section className="archive-content" key={key}><h4>{fieldNames[key] || key}</h4><pre>{archiveText(key, value)}</pre></section>)}
      {!Object.keys(record.data || {}).length && <p>В доступной части записи пока нет содержимого.</p>}
      {record.access === "owner" && <section className="archive-access"><h3>Управление доступом</h3><p>Руководители не получают автоматический доступ. Выберите коллегу, объём данных и срок. Доступ можно отозвать в любое время.</p>
        {!accessReady ? <button className="subtle-button" onClick={load}>Повторить загрузку доступов</button> : <>
          <div className="archive-grants">{grants.map(grant => <div key={grant.id}><b>{grant.name}</b><span>{scopes[grant.data_scope]} · {({ ACTIVE: "Действует", EXPIRED: "Истёк", REVOKED: "Отозван" })[grant.status]}</span><p>{grant.purpose}</p><small>Срок: {grant.expires_at ? formatDate(grant.expires_at) : "без ограничения"}{grant.last_viewed_at ? ` · Просмотрено: ${formatDate(grant.last_viewed_at)}` : " · Ещё не просмотрено"}</small>{grant.status === "ACTIVE" && <button className="subtle-button" disabled={busy} onClick={() => act(() => api(`${path}/grants/${grant.id}/revoke`, { method: "POST" }), "Доступ отозван.")}>Отозвать доступ</button>}</div>)}{!grants.length && <p>Никому не выдан доступ к этой записи.</p>}</div>
          <form onSubmit={event => { event.preventDefault(); act(async () => { await api(`${path}/grants`, { method: "POST", body: { ...draft, grantee_membership_id: Number(draft.grantee_membership_id), duration_days: Number(draft.duration_days), purpose: draft.purpose.trim() } }); setDraft({ ...draft, confirm_preview: false }); }, "Доступ выдан выбранному сотруднику."); }}>
            <label>Кому выдать доступ<select className="company-input" required value={draft.grantee_membership_id} onChange={event => setDraft({ ...draft, grantee_membership_id: event.target.value, confirm_preview: false })}><option value="">Выберите сотрудника</option>{people.map(person => <option value={person.membership_id} key={person.membership_id}>{person.name}{person.job_title ? ` · ${person.job_title}` : ""}</option>)}</select></label>
            <label>Что будет видно<select className="company-input" value={draft.data_scope} onChange={event => setDraft({ ...draft, data_scope: event.target.value, confirm_preview: false })}>{Object.entries(scopes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <p className="archive-preview">{hints[draft.data_scope]} Содержимое показано выше; отсутствующие в записи данные не добавляются.</p>
            <label>Цель доступа<input className="company-input" required minLength={4} maxLength={500} placeholder="Например, разбор практики с наставником" value={draft.purpose} onChange={event => setDraft({ ...draft, purpose: event.target.value })}/></label>
            <label>Срок доступа, дней<input className="company-input" type="number" required min={1} max={3650} value={draft.duration_days} onChange={event => setDraft({ ...draft, duration_days: event.target.value })}/></label>
            <label className="archive-confirm"><input type="checkbox" required checked={draft.confirm_preview} onChange={event => setDraft({ ...draft, confirm_preview: event.target.checked })}/>Я проверил(а), какие данные увидит выбранный сотрудник, и разрешаю доступ.</label>
            <button className="primary-button" disabled={busy || !people.length || !draft.confirm_preview || !draft.grantee_membership_id || draft.purpose.trim().length < 4}>Выдать доступ</button>
            {!people.length && <p>Пока нет других активных сотрудников компании.</p>}
          </form>
        </>}
        <div className="archive-delete">{confirmDelete ? <><p>Удалить запись «{record.title}»? Она исчезнет из архива и станет недоступна получателям.</p><button className="subtle-button" disabled={busy} onClick={async () => { setBusy(true); try { await api(path, { method: "DELETE" }); await onDeleted(); } catch (cause) { setError(cause.message); setBusy(false); } }}>Подтвердить удаление</button><button className="subtle-button" disabled={busy} onClick={() => setConfirmDelete(false)}>Отмена</button></> : <button className="subtle-button" onClick={() => setConfirmDelete(true)}>Удалить запись</button>}</div>
      </section>}
    </>}
  </article>;
}

export function ProfileInsights({ data, personalOnly = false, teamOnly = false }) {
  const base = `/api/company/${data.company.id}`;
  const canSeeHr = !personalOnly && Boolean(data.permissions?.view_analytics);
  const [twin, setTwin] = useState(null), [catalog, setCatalog] = useState(null), [hr, setHr] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function load() {
    setLoading(true); setError("");
    const tasks = [api(`${base}/twin/me`), ...(canSeeHr ? [api(`${base}/catalog`), api(`${base}/hr/report?min_group_size=3`)] : [])];
    const results = await Promise.allSettled(tasks);
    setTwin(results[0].status === "fulfilled" ? results[0].value : null);
    setCatalog(results[1]?.status === "fulfilled" ? results[1].value : null);
    setHr(results[2]?.status === "fulfilled" ? results[2].value : null);
    setError(results.filter(result => result.status === "rejected").map(result => result.reason.message).join("; ")); setLoading(false);
  }
  useEffect(() => { load(); }, [base, data.membership.id, canSeeHr]);
  async function update(enable) {
    setBusy(true); setError(""); setMessage("");
    try {
      if (enable !== undefined) await api(`${base}/twin/me`, { method: "PUT", body: { opt_in: enable, source_types: enable ? ["TRAINING_RESULTS"] : [] } });
      if (enable !== false) await api(`${base}/twin/me/generate`, { method: "POST" });
      await load(); setMessage(enable === false ? "Учёт результатов отключён." : "Профиль обновлён по доступным корпоративным результатам.");
    } catch (cause) { await load(); setError(cause.message); } finally { setBusy(false); }
  }
  // Neutral defaults from the server are not observations of behaviour.
  const samples = twin?.profile?.dimension_samples || {};
  return <section className="profile-results">
    {error && <Notice tone="red">{error}<button className="subtle-button" onClick={load}>Повторить загрузку</button></Notice>}{message && <Notice>{message}</Notice>}
    {loading ? <Loader/> : <>
      {!teamOnly && <article className="profile-results-card"><div className="profile-results-heading"><div><h2>Мой профиль поведения</h2><p>Сводка по вашим корпоративным заданиям. Показатели описывают игровую практику и не являются оценкой личности.</p></div><Link className="subtle-button" to={`/business/${data.company.id}/profile?view=consents`}>Управлять согласием</Link></div>
        {twin && (twin.opt_in ? <><p>Учёт включён. Показатели — средние значения из сохранённых результатов практики. Нажмите «Пересчитать профиль», чтобы учесть последние результаты.</p>{!personalOnly && <div className="profile-metrics">{["trust", "goal", "control", "eq"].map(key => <div key={key}><span>{metricLabels[key]}</span><strong>{samples[key] > 0 ? `${twin.profile?.dimensions?.[key]} / 100` : "—"}</strong><small>{samples[key] > 0 ? `Результатов с показателем: ${samples[key]}` : "Недостаточно данных для оценки"}</small></div>)}</div>}{personalOnly && <p>Сводные показатели практики показаны выше. В расчёте профиля: {twin.profile?.signals?.find(item => item.source === "TRAINING_RESULTS")?.sample_size || 0} завершённых результатов.</p>}<button className="primary-button" disabled={busy} onClick={() => update()}>{busy ? "Обновляем…" : "Пересчитать профиль"}</button></> : <p>Учёт выключен. После вашего согласия профиль будет рассчитываться по результатам корпоративных заданий. Пока данных нет, вместо оценки показывается «—».</p>)}
      </article>}
      {canSeeHr && <article className="profile-results-card"><h2>Сводка по профессиям</h2><p>Общие результаты корпоративного обучения. Это отдельная сводка компании, а не ваш личный профиль.</p><div className="profile-metrics"><div><span>Профессий в каталоге</span><strong>{catalog?.professions?.length ?? "—"}</strong></div><div><span>Компетенций</span><strong>{catalog?.competencies?.length ?? "—"}</strong></div><div><span>Методика расчёта</span><strong>{hr?.methodology_version || "—"}</strong></div></div>
        {hr && <p>Средний балл скрывается, если завершённых оценённых попыток меньше {hr.minimum_group_size}.</p>}
        {hr?.rows?.map(row => <div className="archive-content" key={row.profession_id}><h3>{catalog?.professions?.find(item => item.id === row.profession_id)?.title || `Профессия №${row.profession_id}`}</h3><p>{row.status === "READY" ? `Средний балл: ${row.average_score}/100 · Участников: ${row.member_count}` : "Недостаточно попыток для отображения среднего балла"}</p></div>)}
        {hr && !hr.rows?.length && <p>Сводка появится после назначения профессий сотрудникам и выполнения заданий.</p>}
      </article>}
    </>}
  </section>;
}
