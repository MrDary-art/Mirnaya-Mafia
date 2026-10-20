import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Link, useNavigate } from "react-router-dom";
import CompanyMeetingCalendar from "../components/CompanyMeetingCalendar.jsx";

export default function CalendarEventForm({ data, onClose, onCreated }) {
  const dialog = useRef(null);
  const navigate = useNavigate();
  const [kind, setKind] = useState("duel"), [people, setPeople] = useState([]);
  const [form, setForm] = useState({ title: "", situation: "", goal: "", scheduled_at: "", duration_minutes: 15, host_membership_id: "", guest_membership_id: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [created, setCreated] = useState(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    api(`/api/company/${data.company.id}/employees`).then(rows => setPeople(rows.filter(row => row.status === "ACTIVE"))).catch(cause => setError(cause.message));
    return () => previous?.focus();
  }, [data.company.id]);
  function field(name, value) { setForm(current => ({ ...current, [name]: value })); }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const scheduled_at = new Date(form.scheduled_at).toISOString();
      if (kind === "duel") {
        if (form.host_membership_id === form.guest_membership_id) throw new Error("Выберите двух разных участников.");
        await api(`/api/company/${data.company.id}/online-1x1`, { method: "POST", body: { ...form, scheduled_at, duration_minutes: Number(form.duration_minutes), host_membership_id: Number(form.host_membership_id), guest_membership_id: Number(form.guest_membership_id) } });
        setCreated({ message: "Встреча назначена. Участники увидят её в календаре." });
      }
      onCreated();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={`calendar-event-dialog ${kind === "council" ? "calendar-event-dialog--council" : ""}`} onCancel={onClose} aria-labelledby="calendar-event-title">
    <header><h2 id="calendar-event-title">Добавить мероприятие</h2><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
    {created ? <div><p role="status">{created.message}</p>{created.href && <Link className="primary-button" to={created.href}>Открыть групповую игру</Link>}<button type="button" className="subtle-button" onClick={onClose}>Готово</button></div> : <>
      <label>Формат<select value={kind} onChange={event => { if(event.target.value === "council") { onClose(); navigate(`${data.business_base || `/business/${data.company.id}`}/council?create=1`); } else setKind(event.target.value); }}><option value="duel">Встреча 1×1</option>{data.membership?.role === "COMPANY_OWNER" && <option value="council">Групповая встреча · Совет решений</option>}</select></label>
      <form onSubmit={submit}>
      <CompanyMeetingCalendar value={form.scheduled_at} duration={Number(form.duration_minutes)} onChange={value => field("scheduled_at", value)} />
      <>
        {[["host_membership_id", "Первый участник"], ["guest_membership_id", "Второй участник"]].map(([key, title]) => <label key={key}>{title}<select aria-label={title} required value={form[key]} onChange={event => field(key, event.target.value)}><option value="">Выберите сотрудника</option>{people.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select></label>)}
        <label>Название<input required maxLength={220} value={form.title} onChange={event => field("title", event.target.value)} /></label>
        <label>Ситуация<textarea required value={form.situation} onChange={event => field("situation", event.target.value)} /></label>
        <label>Цель встречи<textarea required value={form.goal} onChange={event => field("goal", event.target.value)} /></label>
        <label>Длительность, минут<input type="number" min={2} max={30} required value={form.duration_minutes} onChange={event => field("duration_minutes", event.target.value)} /></label>
      </>
      {error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy || !form.scheduled_at}>{busy ? "Создаём…" : "Создать мероприятие"}</button>
    </form></>}
  </dialog>;
}
