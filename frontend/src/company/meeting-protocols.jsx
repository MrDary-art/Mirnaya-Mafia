import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";

const kindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений", PREPARATION_CALL: "Тестовый созвон" };
const creatableKindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений", PREPARATION_CALL: "Тестовый созвон" };
const stateLabels = { SCHEDULED: "Запланирована", PROCESSING: "Готовим отчёт", REVIEW: "Отчёт готов", AWAITING_REVIEW: "Нужно проверить", SENT: "Отчёт отправлен", COMPLETED: "Завершена", DRAFT: "Черновик", PUBLISHED: "Отчёт отправлен" };
const itemLabels = { DECISION: "Решение", ACTION: "Задача", QUESTION: "Открытый вопрос", RISK: "Риск" };
const calendarWeekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dateTimeValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const readDateTime = value => {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) : null;
};
const sameCalendarDay = (left, right) => Boolean(left && right) && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

function formatDate(value) {
  if (!value) return "Время не выбрано";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isPastMeeting(meeting, now = Date.now()) {
  if (["COMPLETED", "PUBLISHED"].includes(meeting.status) || meeting.protocol_status === "PUBLISHED") return true;
  return Boolean(meeting.scheduled_at && new Date(meeting.scheduled_at).getTime() < now);
}

function Status({ value }) {
  return <span className={`meeting-status meeting-status--${String(value || "draft").toLowerCase()}`}>{stateLabels[value] || value}</span>;
}

function Field({ label, children }) {
  return <label className="meeting-field"><span>{label}</span>{children}</label>;
}

function MeetingDateTimeField({ value, onChange }) {
  const root = useRef(null);
  const initial = readDateTime(value);
  const [isOpen, setIsOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(initial?.getFullYear() ?? new Date().getFullYear(), initial?.getMonth() ?? new Date().getMonth(), 1));
  const selected = readDateTime(value);
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(cursor);
  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const calendarDays = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => index < firstWeekday || index >= firstWeekday + daysInMonth ? null : new Date(cursor.getFullYear(), cursor.getMonth(), index - firstWeekday + 1));
  const emit = next => onChange(dateTimeValue(next));
  const updateDate = day => {
    const source = selected || new Date();
    emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), selected ? source.getHours() : 9, selected ? source.getMinutes() : 0));
  };
  const updateTime = (unit, nextValue) => {
    const next = new Date(selected || new Date(cursor.getFullYear(), cursor.getMonth(), 1, 9, 0));
    if (unit === "hours") next.setHours(Number(nextValue));
    else next.setMinutes(Number(nextValue));
    emit(next);
  };
  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutside = event => { if (!root.current?.contains(event.target)) setIsOpen(false); };
    const closeOnEscape = event => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [isOpen]);
  return <div className="business-date-field meeting-date-field" ref={root}><span id="meeting-date">Дата и время</span><div className="business-date-picker"><button type="button" className="business-date-trigger" aria-labelledby="meeting-date" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen(open => !open)}><span>{selected ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(selected) : "Выберите дату и время"}</span><Icon name="calendar-days" size={18}/></button>{isOpen && <div className="business-calendar-popover" role="dialog" aria-label="Дата и время встречи"><header><button type="button" aria-label="Предыдущий месяц" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Icon name="arrow-left" size={17}/></button><b>{monthName}</b><button type="button" aria-label="Следующий месяц" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><Icon name="arrow-right" size={17}/></button></header><div className="business-calendar-weekdays">{calendarWeekdays.map(day => <span key={day}>{day}</span>)}</div><div className="business-calendar-days">{calendarDays.map((day, index) => day ? <button key={day.toISOString()} type="button" className={sameCalendarDay(day, selected) ? "is-selected" : sameCalendarDay(day, new Date()) ? "is-today" : ""} onClick={() => updateDate(day)}>{day.getDate()}</button> : <span key={`empty-${index}`} />)}</div><div className="business-calendar-time"><Icon name="clock" size={16}/><span>Время</span><select aria-label="Час" value={selected ? String(selected.getHours()).padStart(2, "0") : "09"} onChange={event => updateTime("hours", event.target.value)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={String(hour).padStart(2, "0")}>{String(hour).padStart(2, "0")}</option>)}</select><i>:</i><select aria-label="Минуты" value={selected ? String(selected.getMinutes()).padStart(2, "0") : "00"} onChange={event => updateTime("minutes", event.target.value)}>{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={String(minute).padStart(2, "0")}>{String(minute).padStart(2, "0")}</option>)}</select></div></div>}</div></div>;
}

export default function MeetingProtocols({ data }) {
  const companyId = data.company.id;
  const canSchedule = Boolean(data.permissions?.manage_team);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMeetingParam = searchParams.get("meeting");
  const requestedMeetingId = requestedMeetingParam ? Number(requestedMeetingParam) : null;
  const [meetings, setMeetings] = useState([]);
  const [councils, setCouncils] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({ kind: creatableKindLabels[searchParams.get("kind")] ? searchParams.get("kind") : "MEETING", title: "", description: "", goal: "", membership_ids: [], scheduled_at: searchParams.get("scheduled_at") || "", duration_minutes: 30 }));
  const [participantQuery, setParticipantQuery] = useState("");
  const businessBase = data.business_base || `/business/${companyId}`;
  const isCouncil = form.kind === "COUNCIL";
  const selectablePeople = directory.filter(person => person.membership_id !== data.membership?.id);
  const visiblePeople = selectablePeople.filter(person => [person.name, person.job_title, person.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(participantQuery.trim().toLocaleLowerCase()));
  const selectedPeople = new Set(form.membership_ids);
  const closeCreate = () => {
    setError("");
    setShowCreate(false);
    navigate(`${businessBase}/meetings`);
  };
  const openCreate = () => {
    setError("");
    navigate(`${businessBase}/meetings?create=1`);
  };

  async function load() {
    const [meetingResult, councilResult, directoryResult] = await Promise.all([
      api(`/api/company/${companyId}/meetings`),
      api(`/api/council?company_id=${companyId}`),
      api(`/api/company/${companyId}/messenger/directory`).catch(() => []),
    ]);
    setMeetings(meetingResult);
    setCouncils(councilResult);
    setDirectory(directoryResult);
    if (!selectedId && meetingResult[0]) {
      setSelectedId(Number.isInteger(requestedMeetingId) && meetingResult.some(meeting => meeting.id === requestedMeetingId)
        ? requestedMeetingId
        : meetingResult.find(meeting => !isPastMeeting(meeting))?.id || meetingResult[0].id);
    }
  }
  async function openMeeting(id) {
    setError("");
    try { const result = await api(`/api/company/${companyId}/meetings/${id}`); setDetail(result); setSelectedId(id); }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { load().catch(cause => setError(cause.message)); }, [companyId]);
  useEffect(() => { if (selectedId) openMeeting(selectedId); }, [selectedId]);
  useEffect(() => {
    if (Number.isInteger(requestedMeetingId) && meetings.some(meeting => meeting.id === requestedMeetingId)) {
      setSelectedId(requestedMeetingId);
    }
  }, [requestedMeetingId, meetings]);
  useEffect(() => {
    const episodeId = searchParams.get("episode");
    const scheduledAt = searchParams.get("scheduled_at");
    if (canSchedule && (episodeId || searchParams.get("create") === "1")) {
      const kind = searchParams.get("kind");
      if (episodeId || creatableKindLabels[kind] || scheduledAt) setForm(current => ({ ...current, kind: creatableKindLabels[kind] ? kind : current.kind, scheduled_at: scheduledAt || current.scheduled_at }));
      setShowCreate(true);
    }
  }, [searchParams, canSchedule]);

  const { upcomingMeetings, pastMeetings } = useMemo(() => {
    const now = Date.now();
    const byDate = (direction) => (left, right) => direction * ((new Date(left.scheduled_at || 0).getTime()) - (new Date(right.scheduled_at || 0).getTime()));
    return {
      upcomingMeetings: meetings.filter(meeting => !isPastMeeting(meeting, now)).slice().sort(byDate(1)),
      pastMeetings: meetings.filter(meeting => isPastMeeting(meeting, now)).slice().sort(byDate(-1)),
    };
  }, [meetings]);
  const linkedCouncilIds = useMemo(() => new Set(meetings.map(meeting => meeting.council_meeting_id).filter(Boolean)), [meetings]);
  const upcomingCouncils = useMemo(() => councils
    // Old Councils do not have a corporate meeting card. Keep them reachable
    // during migration, but never render a newly linked Council twice.
    .filter(meeting => !linkedCouncilIds.has(meeting.id))
    .filter(meeting => !["finished", "cancelled"].includes(meeting.status))
    .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at)), [councils, linkedCouncilIds]);

  async function request(path, options = {}) {
    setBusy(true); setError("");
    try {
      const result = await api(`/api/company/${companyId}${path}`, options);
      await load();
      if (selectedId) await openMeeting(selectedId);
      return result;
    } catch (cause) { setError(cause.message); return null; }
    finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault();
    const title = form.title.trim();
    if (title.length < 3) { setError("Название встречи должно содержать минимум 3 символа."); return; }
    if (!form.scheduled_at) { setError("Выберите дату и время встречи."); return; }
    const payload = { kind: form.kind, title, description: form.description.trim(), agenda: form.goal.trim() ? [form.goal.trim()] : [], scheduled_at: new Date(form.scheduled_at).toISOString(), duration_minutes: 30, membership_ids: form.membership_ids.map(Number) };
    const created = await request("/meetings", { method: "POST", body: payload });
    if (created) { setShowCreate(false); setSelectedId(created.id); setForm({ kind: "MEETING", title: "", description: "", goal: "", membership_ids: [], scheduled_at: "", duration_minutes: 30 }); navigate(`${businessBase}/meetings?meeting=${created.id}`); }
  }
  async function analyze() { await request(`/meetings/${selectedId}/analyze`, { method: "POST" }); }
  async function finish() { await request(`/meetings/${selectedId}/finish`, { method: "POST" }); }
  async function publish() { await request(`/meetings/${selectedId}/protocol/publish`, { method: "POST" }); }

  return <section className="meeting-workspace" aria-live="polite">
    {showCreate && canSchedule ? <section className="meeting-create-page" aria-label="Создание встречи">
      <header className="meeting-create-page__header"><div><p>Встречи</p><h2>Новая встреча</h2><span>Запланируйте время и выберите участников.</span></div><button className="subtle-button" type="button" onClick={closeCreate}><Icon name="x" size={16}/> Закрыть</button></header>
      {error && <p className="meeting-message meeting-message--error" role="alert">{error}</p>}
      <form className="meeting-create" onSubmit={create}>
      <div className="meeting-form-grid">
        <Field label="Название"><input required minLength={3} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Например, планирование запуска" /></Field>
        <MeetingDateTimeField value={form.scheduled_at} onChange={value => setForm(current => ({ ...current, scheduled_at: value }))} />
        <Field label="Описание"><textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Коротко опишите, о чём встреча." /></Field>
        <Field label="Цель"><textarea value={form.goal} onChange={event => setForm({ ...form, goal: event.target.value })} placeholder="К какому результату нужно прийти?" /></Field>
      </div>
      <fieldset className="meeting-participant-picker"><legend>{isCouncil ? "Три сотрудника для Совета" : "Участники"}</legend><label className="meeting-participant-search"><Icon name="search" size={17}/><input type="search" value={participantQuery} onChange={event => setParticipantQuery(event.target.value)} placeholder="Найти сотрудника" /></label><div className="meeting-participant-summary"><p aria-live="polite">Выбрано: <b>{selectedPeople.size}</b></p>{!isCouncil && visiblePeople.length > 0 && <button type="button" className="subtle-button" onClick={() => setForm(current => ({ ...current, membership_ids: visiblePeople.every(person => selectedPeople.has(person.membership_id)) ? current.membership_ids.filter(id => !visiblePeople.some(person => person.membership_id === id)) : [...new Set([...current.membership_ids, ...visiblePeople.map(person => person.membership_id)])] }))}>{visiblePeople.every(person => selectedPeople.has(person.membership_id)) ? "Снять выбор" : "Выбрать всех"}</button>}</div><div className="meeting-participant-list">{visiblePeople.map(person => { const selected = selectedPeople.has(person.membership_id); const limitReached = isCouncil && !selected && selectedPeople.size >= 3; return <label key={person.membership_id} className={limitReached ? "is-disabled" : ""}><input disabled={limitReached} type="checkbox" checked={selected} onChange={() => setForm(current => ({ ...current, membership_ids: current.membership_ids.includes(person.membership_id) ? current.membership_ids.filter(id => id !== person.membership_id) : [...current.membership_ids, person.membership_id] }))} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>; })}{!visiblePeople.length && <p className="meeting-participant-empty">Сотрудников по этому запросу нет.</p>}</div>{isCouncil && <p className="meeting-council-count" role="status">Выбрано: {selectedPeople.size} из 3 сотрудников</p>}
      </fieldset>
      <div className="meeting-form-actions"><button className="primary-button" disabled={busy || !form.scheduled_at || isCouncil && selectedPeople.size !== 3}>{isCouncil ? "Создать Совет решений" : "Создать встречу"}</button><button className="subtle-button" type="button" onClick={closeCreate}>Отмена</button></div>
      </form>
    </section> : <>
    {canSchedule && <header className="meeting-intro"><button className="primary-button" type="button" onClick={openCreate}><Icon name="plus" size={18}/>Создать встречу</button></header>}
    {error && <p className="meeting-message meeting-message--error" role="alert">{error}</p>}

    <div className="meeting-layout">
      <aside className="meeting-list" aria-label="Список встреч">
        <section className="meeting-list-group"><h3>Предстоящие</h3>{upcomingCouncils.map(meeting => <Link key={`council-${meeting.id}`} className="meeting-list-item" to={`${businessBase}/council/${meeting.id}`}><span className="meeting-list-item__meta"><span>Совет решений</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><span>{meeting.registration_open ? meeting.available_seats > 0 ? `Открыта запись · ${meeting.available_seats} места` : "Запись в резерв" : meeting.my_status ? "Вы участвуете" : "Состав формируется"}</span><span>{meeting.seats_taken} из {meeting.capacity}</span></span></Link>)}{upcomingMeetings.map(meeting => <button type="button" key={meeting.id} className={`meeting-list-item ${meeting.id === selectedId ? "is-active" : ""}`} onClick={() => setSelectedId(meeting.id)}><span className="meeting-list-item__meta"><span>{kindLabels[meeting.kind]}</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><Status value={meeting.report_status || meeting.status} /><span>{meeting.participants.length} участника</span></span></button>)}{!upcomingCouncils.length && !upcomingMeetings.length && <p className="meeting-list-empty">Нет предстоящих встреч.</p>}</section>
        <section className="meeting-list-group"><h3>Прошедшие</h3>{pastMeetings.map(meeting => <button type="button" key={meeting.id} className={`meeting-list-item ${meeting.id === selectedId ? "is-active" : ""}`} onClick={() => setSelectedId(meeting.id)}><span className="meeting-list-item__meta"><span>{kindLabels[meeting.kind]}</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><Status value={meeting.report_status || meeting.status} /><span>{meeting.participants.length} участника</span></span></button>)}{!pastMeetings.length && <p className="meeting-list-empty">Прошедших встреч пока нет.</p>}</section>
      </aside>
      <main className="meeting-detail" aria-label="Детали встречи">
        {!detail ? <div className="meeting-empty meeting-empty--large"><Icon name="messages-square" size={28}/><h3>Выберите встречу</h3><p>Здесь появятся участники и отправленные отчёты по завершённым звонкам.</p></div> : <MeetingDetail detail={detail} busy={busy} onFinish={finish} onAnalyze={analyze} onPublish={publish} businessBase={businessBase} />}
      </main>
    </div>
    </>}
  </section>;
}

function MeetingDetail({ detail, busy, onFinish, onAnalyze, onPublish, businessBase }) {
  const report = detail.report;
  const linkedCouncil = Boolean(detail.council_meeting_id);
  const scheduledCall = detail.kind === "PREPARATION_CALL" && detail.status === "SCHEDULED";
  return <>
    <header className="meeting-detail-header"><div><div className="meeting-detail-header__meta"><span>{kindLabels[detail.kind]}</span><Status value={detail.report_status || detail.status} /></div><h2>{detail.title}</h2>{detail.description && <p>{detail.description}</p>}</div><div className="meeting-detail-actions">{linkedCouncil && <Link className="subtle-button meeting-council-open" to={`${businessBase}/council/${detail.council_meeting_id}`}><Icon name="video" size={16}/>Открыть Совет</Link>}{!linkedCouncil && detail.can_review_report && detail.status === "SCHEDULED" && <button className="primary-button" disabled={busy} onClick={onFinish}>Завершить встречу</button>}{!linkedCouncil && detail.can_review_report && ["PROCESSING", "REVIEW"].includes(detail.status) && <button className="primary-button" disabled={busy} onClick={onAnalyze}>Подготовить отчёт</button>}</div></header>

    <section className="meeting-info-strip"><div><span>Когда</span><b>{formatDate(detail.scheduled_at)}</b></div><div><span>Участники</span><b>{detail.participants.length}</b></div></section>
    {!!detail.agenda?.[0] && <section className="meeting-goal"><span>Цель</span><p>{detail.agenda[0]}</p></section>}
    {scheduledCall && <section className="meeting-call-pending" role="status"><Icon name="video" size={21}/><div><h3>Подключение откроется в назначенное время</h3><p>Сейчас звонок недоступен. Вернитесь {formatDate(detail.scheduled_at)} — здесь появится вход в созвон.</p></div></section>}
    {linkedCouncil && <section className="meeting-council-bridge"><Icon name="video" size={22}/><div><h3>Совет решений</h3><p>Групповой звонок проходит в Совете. После завершения ИИ соберёт черновик отчёта, а создатель рабочей ситуации проверит его перед отправкой команде.</p><Link className="subtle-button" to={`${businessBase}/council/${detail.council_meeting_id}`}>Перейти к звонку <Icon name="arrow-right" size={16}/></Link></div></section>}
    <section className="meeting-protocol"><header><h3>Отчёт по встрече</h3>{report && <span className="meeting-version">Версия {report.version}</span>}</header>
        {!report ? <div className="meeting-empty"><p>{detail.can_review_report ? "ИИ подготовит черновик отчёта после звонка." : detail.report_status === "AWAITING_REVIEW" ? "Создатель рабочей ситуации проверяет отчёт. Он появится здесь после отправки." : "Отчёт появится после завершения встречи."}</p></div> : <>
          <div className="meeting-summary"><span>Краткий итог</span><p>{report.summary || "ИИ не смог выделить краткий итог."}</p></div>
          <div className="meeting-items">{report.items.map(item => <article key={item.id} className={`meeting-item meeting-item--${item.kind.toLowerCase()}`}><div className="meeting-item__top"><span>{itemLabels[item.kind]}</span>{item.confidence < 80 && <small>Проверьте формулировку</small>}</div><b>{item.title}</b>{item.detail && <p>{item.detail}</p>}</article>)}</div>
          {report.status !== "PUBLISHED" && detail.can_review_report && <footer className="meeting-protocol-actions"><p>Проверьте краткий итог и найденные решения. После подтверждения отчёт получат участники.</p><button className="primary-button" disabled={busy} onClick={onPublish}>Подтвердить и отправить участникам <Icon name="arrow-right" size={16}/></button></footer>}
          {report.status === "PUBLISHED" && <p className="meeting-published"><Icon name="check-check" size={18}/>Отчёт отправлен участникам встречи.</p>}
        </>}
    </section>
  </>;
}
