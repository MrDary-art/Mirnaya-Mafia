import CalendarEventForm from "./CalendarEventForm.jsx";
import { useMemo, useRef, useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice } from "./shared.jsx";
import CompanyMeetingCalendar from "../components/CompanyMeetingCalendar.jsx";
import Icon from "../components/Icon.jsx";


export function Achievements({ data }) {
  const companyId = data.company.id;
  const canManage = data.permissions.manage_learning;
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    min_score: 70,
    min_trust: 0,
    min_goal: 0,
    min_control: 0,
    min_eq: 0,
  });

  const load = () => api("/api/company/" + companyId + "/achievements").then(setItems).catch(error => setNote(error.message));
  useEffect(load, [companyId]);

  async function create(event) {
    event.preventDefault();
    try {
      await api("/api/company/" + companyId + "/achievements", { method: "POST", body: form });
      setForm(current => ({ ...current, title: "", description: "" }));
      setNote("Достижение создано. Оно будет выдаваться автоматически после прохождения корпоративных заданий.");
      await load();
    } catch (error) {
      setNote(error.message);
    }
  }

  return <section className="business-achievements">
    <header className="business-achievements-header">
      <div>
        <span className="business-management-eyebrow">ПРИЗНАНИЕ РЕЗУЛЬТАТА</span>
        <h3>Сертификаты и достижения</h3>
        <p>Достижения проверяют результаты корпоративных заданий автоматически. Они не связаны с личными играми сотрудника.</p>
      </div>
    </header>
    {note && <Notice>{note}</Notice>}
    {canManage && <form className="business-achievement-form" onSubmit={create}>
      <label>Название достижения<input required className="company-input" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <label>Минимальный результат<input type="number" min="0" max="100" className="company-input" value={form.min_score} onChange={event => setForm({ ...form, min_score: Number(event.target.value) })} /></label>
      <label className="business-achievement-description">За что выдаётся<textarea className="company-input" rows="2" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <div className="business-achievement-thresholds">
        <label>Доверие<input type="number" min="0" max="100" className="company-input" value={form.min_trust} onChange={event => setForm({ ...form, min_trust: Number(event.target.value) })} /></label>
        <label>Цель<input type="number" min="0" max="100" className="company-input" value={form.min_goal} onChange={event => setForm({ ...form, min_goal: Number(event.target.value) })} /></label>
        <label>Контроль<input type="number" min="0" max="100" className="company-input" value={form.min_control} onChange={event => setForm({ ...form, min_control: Number(event.target.value) })} /></label>
        <label>Эмпатия<input type="number" min="0" max="100" className="company-input" value={form.min_eq} onChange={event => setForm({ ...form, min_eq: Number(event.target.value) })} /></label>
      </div>
      <button className="primary-button">Создать достижение</button>
    </form>}
    <div className="business-achievement-grid">
      {items.map(item => {
        const conditions = item.conditions || {};
        const criteria = [
          ["Результат", conditions.min_score || 0],
          ["Доверие", conditions.min_trust || 0],
          ["Цель", conditions.min_goal || 0],
          ["Контроль", conditions.min_control || 0],
          ["Эмпатия", conditions.min_eq || 0],
        ].filter(([, value], index) => index === 0 || value > 0);
        return <article key={item.id} className={item.earned ? "is-earned" : ""}>
          <div className="business-achievement-card-top"><span className="business-achievement-icon" aria-hidden="true">{item.icon || "✦"}</span><span className={item.earned ? "business-status business-status-positive" : "business-status"}>{item.earned ? "Получено" : "Проверяется автоматически"}</span></div>
          <h4>{item.title}</h4>
          <p>{item.description || "Награда за подтверждённый результат в корпоративной практике."}</p>
          <dl>{criteria.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>от {value}</dd></div>)}</dl>
        </article>;
      })}
      {!items.length && <Empty>Достижений пока нет. Создайте первое правило признания результата.</Empty>}
    </div>
  </section>;
}

export function Surveys({ data }) { const id=data.company.id; const manager=data.permissions.manage_team; const [items,setItems]=useState([]),[title,setTitle]=useState(""),[questions,setQuestions]=useState(""),[answers,setAnswers]=useState({}),[results,setResults]=useState({}),[note,setNote]=useState(""); const load=()=>api(`/api/company/${id}/surveys`).then(setItems).catch(e=>setNote(e.message));useEffect(load,[id]);const create=async e=>{e.preventDefault();const rows=questions.split("\\n").map(x=>x.trim()).filter(Boolean);try{await api(`/api/company/${id}/surveys`,{method:"POST",body:{title,questions:rows,anonymous:true}});setTitle("");setQuestions("");setNote(ru("opros opublikovan"));load()}catch(e){setNote(e.message)}};const showResults=async item=>{try{setResults({...results,[item.id]:await api(`/api/company/${id}/surveys/${item.id}/results`)})}catch(e){setNote(e.message)}};const answer=async item=>{try{await api(`/api/company/${id}/surveys/${item.id}/responses`,{method:"POST",body:{answers:answers[item.id]||{}}});setNote(ru("otvet otpravlen"));load()}catch(e){setNote(e.message)}};return <section className="space-y-5"><div><div className="eyebrow">{ru("obratnaya svyaz")}</div><h2 className="text-3xl font-bold">{ru("korporativnye oprosy")}</h2><p className="mt-2 text-slate-400">{ru("anonimnye otvety ne raskryvayut lichnost uchastnika rukovoditelyu")}</p></div>{note&&<Notice>{note}</Notice>}{manager&&<form className="glass space-y-3 rounded-2xl p-5" onSubmit={create}><input required className="company-input" placeholder={ru("tema oprosa")} value={title} onChange={e=>setTitle(e.target.value)}/><textarea required rows="4" className="company-input" placeholder={ru("odin vopros v kazhdoj stroke")} value={questions} onChange={e=>setQuestions(e.target.value)}/><button className="primary-button">{ru("opublikovat opros")}</button></form>}<div className="space-y-4">{items.map(item=><article key={item.id} className="glass rounded-2xl p-5"><b className="text-xl">{item.title}</b><span className="ml-3 text-xs text-lime-200">{item.anonymous?ru("anonimno"):ru("otkryto")}</span>{manager&&<button className="subtle-button mt-3" onClick={()=>showResults(item)}>{ru("posmotret itogi")}</button>}{results[item.id]&&<div className="mt-3 rounded-xl bg-white/5 p-3 text-sm"><b>{ru("otvetov")}: {results[item.id].responses}</b>{Object.entries(results[item.id].answers).map(([question,values])=><p key={question} className="mt-2">{question}: {Object.entries(values).map(([answer,count])=>`${answer} (${count})`).join(", ")}</p>)}</div>}{item.answered?<p className="mt-3 text-lime-300">{ru("vy uzhe otvetili")}</p>:<div className="mt-4 space-y-3">{item.questions.map(question=><label key={question} className="block text-sm">{question}<input className="company-input" value={answers[item.id]?.[question]||""} onChange={e=>setAnswers({...answers,[item.id]:{...(answers[item.id]||{}),[question]:e.target.value}})}/></label>)}<button className="primary-button" onClick={()=>answer(item)}>{ru("otpravit otvet")}</button></div>}</article>)}{!items.length&&<Empty>{ru("aktivnyh oprosov net")}</Empty>}</div></section>; }



const calendarKinds = {
  COURSE: { label: "Курс", icon: "book-open" },
  KNOWLEDGE_TEST: { label: "Тест", icon: "check-check" },
  PRACTICE: { label: "Практика", icon: "bot" },
  AI_PRACTICE: { label: "Практика с ИИ", icon: "bot" },
  SCENARIO: { label: "Сценарий", icon: "route" },
  ARENA_SCENARIO: { label: "Сценарий", icon: "route" },
  MEETING: { label: "Встреча", icon: "users" },
  COUNCIL: { label: "Командная практика", icon: "users" },
  TOURNAMENT: { label: "Турнир", icon: "trophy" },
  COMPETITION: { label: "Соревнование", icon: "trophy" },
  CERTIFICATE: { label: "Сертификат", icon: "graduation-cap" },
  TEAM_GOAL: { label: "Командная цель", icon: "target" },
  ASSIGNMENT: { label: "Задание", icon: "check" },
};

const eventKind = item => calendarKinds[item.category] ? item.category : (calendarKinds[item.type] ? item.type : "ASSIGNMENT");
const calendarStatusLabels = { booked: "Забронировано", confirmed: "Подтверждено", invited: "Приглашение", facilitator: "Ведущий", offered: "Предложено", scheduled: "Запланировано", SCHEDULED: "Запланировано", open: "Открыта запись", preparation: "Подготовка", finished: "Завершено", cancelled: "Отменено" };
const eventCountLabel = count => `${count} ${count % 10 === 1 && count % 100 !== 11 ? "событие" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "события" : "событий"}`;
const inactiveCalendarStatuses = new Set(["PASSED", "FAILED", "COMPLETED", "CANCELLED", "ARCHIVED", "FINISHED", "REVOKED", "EXPIRED"]);

export function Calendar({ data, compact = false }) {
  const [events, setEvents] = useState([]);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const dayDetailRef = useRef(null);
  const loadEvents = () => api(`/api/company/${data.company.id}/calendar`).then(setEvents).catch(cause => setError(cause.message));
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeKinds, setActiveKinds] = useState([]);
  useEffect(() => { api("/api/company/" + data.company.id + "/calendar").then(setEvents).catch(cause => setError(cause.message)); }, [data.company.id]);

  const monthTitle = `${month.toLocaleDateString("ru-RU", { month: "long" })} ${month.getFullYear()}`;
  const keyOf = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  };
  const visibleEvents = useMemo(() => events.filter(item => !inactiveCalendarStatuses.has(String(item.status || "").toUpperCase()) && (!activeKinds.length || activeKinds.includes(eventKind(item)))), [events, activeKinds]);
  const eventsByDate = useMemo(() => visibleEvents.reduce((result, item) => {
    const key = keyOf(item.date);
    if (key) (result[key] ||= []).push(item);
    return result;
  }, {}), [visibleEvents]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return { date, key: keyOf(date) };
  });
  const selectedEvents = eventsByDate[selectedDate] || [];
  const today = keyOf(new Date());
  const availableKinds = useMemo(() => [...new Set(events.map(eventKind))], [events]);
  const moveMonth = offset => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(keyOf(next));
  };
  const goToday = () => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(keyOf(now)); };
  const selectDay = key => {
    setSelectedDate(key);
    requestAnimationFrame(() => dayDetailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };
  const toggleKind = kind => setActiveKinds(current => current.includes(kind) ? current.filter(item => item !== kind) : [...current, kind]);
  const timeLabel = value => {
    const date = new Date(value);
    return date.getHours() || date.getMinutes() ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "Весь день";
  };
  const eventHref = item => item.council_id
    ? `${data.business_base || `/business/${data.company.id}`}/council/${item.council_id}`
    : item.room_id
    ? `${data.business_base || `/business/${data.company.id}`}/room/${item.room_id}`
    : `${data.business_base || `/business/${data.company.id}`}/${item.section || "learning"}`;
  const renderAgendaItem = item => {
    const kind = eventKind(item);
    const meta = calendarKinds[kind];
    return <article key={item.id} className="business-calendar-agenda-item" data-event-kind={kind}>
      <span className="business-calendar-agenda-icon"><Icon name={meta.icon} size={17} /></span>
      <div><span>{meta.label}</span><b>{item.title}</b><dl><div><dt>Время</dt><dd>{timeLabel(item.date)}</dd></div><div><dt>Статус</dt><dd>{statusLabels[item.status] || calendarStatusLabels[item.status] || item.status || "Запланировано"}</dd></div></dl></div>
      <a href={eventHref(item)} aria-label={`Открыть: ${item.title}`}><span>Открыть</span><Icon name="arrow-up-right" size={17} /></a>
    </article>;
  };

  return <section className={compact ? "business-calendar business-calendar-compact" : "business-calendar"}>
    {creatingEvent && <CalendarEventForm data={data} onClose={() => setCreatingEvent(false)} onCreated={loadEvents} />}
    {error && <Notice tone="red">{error}</Notice>}
    <div className="business-calendar-shell">
      <div className="business-calendar-toolbar">
        <div className="business-calendar-month-actions"><button type="button" aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}><Icon name="arrow-left" size={18}/></button><button type="button" aria-label="Следующий месяц" onClick={() => moveMonth(1)}><Icon name="arrow-right" size={18}/></button></div>
        <h3>{monthTitle}</h3>{data.permissions?.manage_team ? <button type="button" className="business-calendar-today" onClick={() => setCreatingEvent(true)}>Добавить мероприятие</button> : <button type="button" className="business-calendar-today" onClick={goToday}>Сегодня</button>}
      </div>
      {availableKinds.length > 1 && <div className="business-calendar-filters" aria-label="Фильтр событий">{availableKinds.map(kind => <button key={kind} type="button" data-event-kind={kind} className={!activeKinds.length || activeKinds.includes(kind) ? "is-active" : ""} aria-pressed={!activeKinds.length || activeKinds.includes(kind)} onClick={() => toggleKind(kind)}><i />{calendarKinds[kind].label}</button>)}</div>}
      <div className="business-calendar-layout">
        <div className="business-calendar-month">
          <div className="business-calendar-weekdays" aria-hidden="true">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="business-calendar-grid" role="grid" aria-label={"Календарь: " + monthTitle}>{days.map(({ date, key }) => {
            const dayEvents = eventsByDate[key] || [];
            const isCurrentMonth = date.getMonth() === month.getMonth();
            const isSelected = key === selectedDate;
            return <button key={key} type="button" role="gridcell" className={["business-calendar-day", isCurrentMonth ? "" : "is-outside", key === today ? "is-today" : "", isSelected ? "is-selected" : "", dayEvents.length ? "has-events" : ""].filter(Boolean).join(" ")} aria-selected={isSelected} onClick={() => selectDay(key)}><time dateTime={key}>{date.getDate()}</time>{dayEvents.slice(0, 2).map(item => <span key={item.id} data-event-kind={eventKind(item)} className="business-calendar-event"><i />{item.title}</span>)}{dayEvents.length > 2 && <span className="business-calendar-more">+{dayEvents.length - 2}</span>}</button>;
          })}</div>
        </div>
      </div>
      <aside ref={dayDetailRef} className="business-calendar-agenda business-calendar-day-detail" aria-live="polite">
        <div className="business-calendar-agenda-heading"><div><h4>{new Date(selectedDate + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h4><p>{eventCountLabel(selectedEvents.length)}</p></div></div>
        <div className="business-calendar-agenda-list">{selectedEvents.map(renderAgendaItem)}{!selectedEvents.length && <div className="business-calendar-agenda-empty"><Icon name="calendar-days" size={24}/><b>На этот день ничего не назначено</b><span>Выберите другую дату или добавьте мероприятие.</span></div>}</div>
      </aside>
    </div>
  </section>;
}

export { CorporateActivities } from "./activities.jsx";
