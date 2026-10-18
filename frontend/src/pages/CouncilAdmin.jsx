import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import CouncilSchedulePicker from "../components/CouncilSchedulePicker";
import CouncilModeration from "../components/CouncilModeration.jsx";
import "./decision-council.css";
import "../admin/council-admin.css";

const emptyPolicy = { scope: "none", muted: false, camera_blocked: false, kick: false };
const statuses = { open: "Идёт запись", locked: "Состав собран", roles: "Роли открыты", preparation: "Комната подготовки", active: "Идёт встреча", finished: "Завершена", cancelled: "Отменена" };
function PolicyFields({ value, onChange, disabled = false }) {
  return <fieldset className="ca-policy" disabled={disabled}><legend>Права генеральных директоров</legend>
    <label>Кем могут управлять<select value={value.scope} onChange={e => onChange({ ...value, scope: e.target.value })}><option value="none">Только организаторы платформы</option><option value="own">Директора — участниками своей компании</option><option value="all">Директора — всеми участниками встречи</option></select></label>
    <div className="ca-checks">{[["muted", "Микрофон"], ["camera_blocked", "Камера"], ["kick", "Исключение из встречи"]].map(([key, label]) => <label key={key}><input type="checkbox" disabled={value.scope === "none"} checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })} />{label}</label>)}</div>
    <p>{value.scope === "none" ? "Связью и составом управляют назначенный ведущий и администраторы платформы." : "Только для активных генеральных директоров выбранных компаний. Личные задания и переписки участников остаются закрытыми."}</p>
  </fieldset>;
}

export default function CouncilAdmin() {
  const { user, ready } = useAuth();
  const managePanel = useRef(null);
  const [meetings, setMeetings] = useState([]), [moderators, setModerators] = useState([]), [companies, setCompanies] = useState([]);
  const [candidate, setCandidate] = useState(""), [view, setView] = useState("schedule");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [duration,setDuration] = useState(30);
  const [when, setWhen] = useState(""), [organizer, setOrganizer] = useState(""), [plays, setPlays] = useState(false), [title, setTitle] = useState("Сохранить контракт");
  const [format, setFormat] = useState("company"), [selected, setSelected] = useState([]), [addCompany, setAddCompany] = useState("");
  const [policy, setPolicy] = useState(emptyPolicy), [defaults, setDefaults] = useState(emptyPolicy);
  const [managed, setManaged] = useState(null), [meetingPolicy, setMeetingPolicy] = useState(emptyPolicy);
  async function load() {
    const [items, people, organizations] = await Promise.all([api("/api/admin/council"), api("/api/admin/council/moderators"), api("/api/admin/council/companies")]);
    setMeetings(items); setModerators(people); setCompanies(organizations);
  }
  useEffect(() => {
    if (!user?.is_admin || user.must_change_password) return;
    Promise.all([load(), api("/api/admin/council/director-defaults").then(value => { setDefaults(value); setPolicy(value); })]).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [user?.is_admin, user?.must_change_password]);
  useEffect(() => { if (managed) managePanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [managed?.id]);
  useEffect(() => {
    if (!managed) return;
    const timer = setInterval(() => api(`/api/admin/council/${managed.id}/manage`).then(value => { setManaged(value); setError(""); }).catch(e => setError(e.message)), 8000);
    return () => clearInterval(timer);
  }, [managed?.id]);
  if (!ready) return <p>Проверяем доступ…</p>;
  if (!user?.is_admin || user.must_change_password) return <Navigate to="/admin" replace />;
  async function run(work, message) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); if (message) setNotice(message); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  function changeFormat(value) { setFormat(value); setSelected([]); setAddCompany(""); }
  function includeCompany() {
    const next = [...selected, { company_id: Number(addCompany), seats: 4 }];
    setSelected(next.map((item, index) => ({ ...item, seats: Math.floor(4 / next.length) + (index < 4 % next.length ? 1 : 0) }))); setAddCompany("");
  }
  async function publish(e) {
    e.preventDefault();
    await run(async () => {
      await api("/api/admin/council", { method: "POST", body: { reservation_minutes:duration, scheduled_at: new Date(`${when}:00+03:00`).toISOString(), organizer_username: organizer, organizer_plays: plays, title, format, companies: selected, director_permissions: policy } });
      await load(); setView("schedule");
    }, "Встреча назначена. Сотрудники выбранных компаний получили приглашение записаться.");
  }
  async function manage(id) { await run(async () => { const data = await api(`/api/admin/council/${id}/manage`); setManaged(data); setMeetingPolicy({ ...emptyPolicy, ...data.director_permissions }); }); }
  async function action(path, body, method = "POST") {
    return run(async () => { await api(`/api/admin/council/${managed.id}${path}`, { method, ...(body ? { body } : {}) }); setManaged(await api(`/api/admin/council/${managed.id}/manage`)); });
  }
  const seats = selected.reduce((sum, item) => sum + item.seats, 0);
  const validTeams = (format === "company" ? selected.length === 1 : selected.length >= 2) && seats === 4;
  return <main className="council-public council-page ca-page">
    <header className="admin-section-heading"><h1>Совет решений</h1></header>
    {error && <div className="ca-feedback" role="alert">{error}</div>}{notice && <div className="ca-feedback" role="status">{notice}</div>}
    <nav className="admin-local-tabs" aria-label="Разделы Совета решений">{[["schedule", "Расписание"], ["create", "Назначить встречу"], ["moderators", "Модераторы и права"]].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => { setView(id); setManaged(null); }}>{label}</button>)}</nav>
    {loading ? <p role="status">Загружаем встречи и компании…</p> : <>
      <section hidden={view !== "create"} className="council-panel"><h2>Назначить встречу</h2>
        <div className="ca-formats">{[["company", "Совет внутри компании", "Сотрудники одной компании за общим столом."], ["tournament", "Межкорпоративный турнир", "Одна турнирная встреча: 2–4 компании и четыре игровых места."]].map(([key, label, text]) => <button type="button" key={key} aria-pressed={format === key} onClick={() => changeFormat(key)}><strong>{label}</strong><span>{text}</span></button>)}</div>
        <form onSubmit={publish} className="ca-form">
          <div className="ca-grid"><label>Название встречи<input required minLength={3} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></label><label>Резерв времени<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[15,30,45,60,90].map(n=><option value={n} key={n}>{n} минут</option>)}</select></label></div>
          <CouncilSchedulePicker value={when} onChange={setWhen} capacity={4} duration={duration}/><fieldset className="ca-companies"><legend>{format === "company" ? "Компания" : "Компании и игровые места"}</legend>
            <div className="ca-add"><label>Выбрать компанию<select value={addCompany} onChange={e => setAddCompany(e.target.value)}><option value="">Выберите из списка</option>{companies.filter(c => !selected.some(item => item.company_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name} · сотрудников: {c.members}</option>)}</select></label><button type="button" disabled={!addCompany || selected.length >= (format === "company" ? 1 : 4)} onClick={includeCompany}>Добавить</button></div>
            {selected.map(item => <div className="ca-company" key={item.company_id}><b>{companies.find(c => c.id === item.company_id)?.name}</b><label>Мест<input aria-label={`Мест для ${companies.find(c => c.id === item.company_id)?.name}`} type="number" min={1} max={4} value={item.seats} onChange={e => setSelected(selected.map(c => c.company_id === item.company_id ? { ...c, seats: Number(e.target.value) } : c))} /></label><button type="button" onClick={() => setSelected(selected.filter(c => c.company_id !== item.company_id))}>Убрать</button></div>)}
            <p className={seats === 4 ? "ca-total" : "ca-total is-incomplete"}>Распределено {seats} из 4 мест{format === "tournament" ? ` · компаний: ${selected.length}` : ""}</p>
          </fieldset>
          <div className="ca-grid"><label>Организатор<select required value={organizer} onChange={e => setOrganizer(e.target.value)}><option value="">Выберите модератора</option>{moderators.map(person => <option key={person.id} value={person.username}>{person.name} · @{person.username}</option>)}</select></label><label>Участие организатора<select value={plays ? "player" : "facilitator"} onChange={e => setPlays(e.target.value === "player")}><option value="facilitator">Ведущий без игровой роли</option><option value="player">Занимает место своей компании</option></select></label></div>
          {!moderators.length && <p>Добавьте игровой аккаунт во вкладке «Модераторы и права».</p>}
          <PolicyFields value={policy} onChange={setPolicy} disabled={busy} />
          <div className="ca-form-footer"><p>Запись доступна сотрудникам выбранных компаний. Чужие компании и личные аккаунты доступа не получают.</p><button className="council-button" disabled={busy || !validTeams || !organizer}>{busy ? "Сохраняем…" : "Назначить встречу"}</button></div>
        </form>
      </section>
      <section hidden={view !== "moderators"} className="council-panel"><h2>Модераторы совета</h2><p>Игровой аккаунт ведущего получает полномочия на назначенные ему встречи. Администраторы управляют ими из расписания.</p>
        <form className="ca-add" onSubmit={e => { e.preventDefault(); run(async () => { await api("/api/admin/council/moderators", { method: "POST", body: { username: candidate } }); setCandidate(""); await load(); }, "Модератор назначен."); }}><label>Логин аккаунта<input required value={candidate} onChange={e => setCandidate(e.target.value)} placeholder="Например, maria_sales" /></label><button disabled={busy}>Назначить модератором</button></form>
        <div className="council-moderation-list">{moderators.map(person => <article key={person.id}><b>♛ {person.name} <small>@{person.username}</small></b><button disabled={busy} onClick={() => run(async () => { await api(`/api/admin/council/moderators/${person.id}`, { method: "DELETE" }); await load(); }, "Полномочия отозваны.")}>Снять полномочия</button></article>)}</div>
        <h3>Настройки для новых встреч</h3><PolicyFields value={defaults} onChange={setDefaults} disabled={busy} /><button disabled={busy} onClick={() => run(async () => { await api("/api/admin/council/director-defaults", { method: "PUT", body: defaults }); setPolicy(defaults); }, "Настройки сохранены. Действующие встречи настраиваются отдельно.")}>Сохранить настройки прав</button>
      </section>
      <section hidden={view !== "schedule"} className="council-panel"><div className="council-panel-heading"><h2>Назначенные встречи</h2><button disabled={busy} onClick={() => run(load)}>Обновить</button></div>
        <div className="ca-schedule">{meetings.map(meeting => <article key={meeting.id}><div className="ca-meeting-meta"><span>{meeting.format === "tournament" ? "Турнир компаний" : meeting.company_id ? "Совет компании" : "Ранее назначенная встреча"}</span><span>{statuses[meeting.status] || meeting.status}</span></div><h3>{meeting.title}</h3><time>{new Date(meeting.scheduled_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</time><div className="ca-team-tags">{(meeting.companies.length ? meeting.companies : meeting.company_id ? [{ company_id: meeting.company_id, name: companies.find(c => c.id === meeting.company_id)?.name || "Компания", seats: meeting.capacity }] : []).map(c => <span key={c.company_id}>{c.name} · {c.seats} места</span>)}</div><p>{meeting.confirmed} подтвердили · занято {meeting.seats_taken} из {meeting.capacity}</p><div className="ca-actions"><button disabled={busy} onClick={() => manage(meeting.id)}>Управление встречей</button>{!["active", "finished", "cancelled"].includes(meeting.status) && <button disabled={busy} onClick={() => run(async () => { await api(`/api/admin/council/${meeting.id}/cancel`, { method: "POST" }); await load(); }, "Встреча отменена.")}>Отменить встречу</button>}</div></article>)}</div>
        {!meetings.length && <div className="admin-empty"><p>В расписании пока нет встреч.</p><button onClick={() => setView("create")}>Назначить встречу</button></div>}
      </section>
      {view === "schedule" && managed && <section ref={managePanel} className="council-panel ca-manage"><div className="council-panel-heading"><h2>{managed.title}</h2><button onClick={() => setManaged(null)}>Закрыть управление</button></div><PolicyFields value={meetingPolicy} onChange={setMeetingPolicy} disabled={busy || ["finished", "cancelled"].includes(managed.status)} /><button disabled={busy || ["finished", "cancelled"].includes(managed.status) || !managed.company_id && !managed.companies.length} onClick={() => run(async () => { await api(`/api/admin/council/${managed.id}/director-permissions`, { method: "PATCH", body: meetingPolicy }); setManaged(await api(`/api/admin/council/${managed.id}/manage`)); await load(); }, "Права этой встречи обновлены.")}>Применить права к встрече</button><CouncilModeration data={{ ...managed, moderation_permissions: { muted: true, camera_blocked: true, kick: true } }} action={action} busy={busy || ["finished", "cancelled"].includes(managed.status)} /></section>}
    </>}
  </main>;
}
