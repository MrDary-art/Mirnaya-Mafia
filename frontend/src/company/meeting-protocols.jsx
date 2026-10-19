import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";

const kindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений", PREPARATION_CALL: "Тестовый созвон" };
const creatableKindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений", PREPARATION_CALL: "Тестовый созвон" };
const stateLabels = { SCHEDULED: "Запланирована", PROCESSING: "Готовим отчёт", REVIEW: "Отчёт готов", AWAITING_REVIEW: "Нужно проверить", SENT: "Отчёт отправлен", COMPLETED: "Завершена", CANCELLED: "Отменена", DRAFT: "Черновик", PUBLISHED: "Отчёт отправлен" };
const itemLabels = { DECISION: "Решение", ACTION: "Задача", QUESTION: "Открытый вопрос", RISK: "Риск" };
const calendarWeekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dateTimeValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const readDateTime = value => {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) : null;
};
const normalizeDateTime = value => {
  if (!value) return "";
  const date = readDateTime(value) || new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeValue(date);
};
const sameCalendarDay = (left, right) => Boolean(left && right) && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

function formatDate(value) {
  if (!value) return "Время не выбрано";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isPastMeeting(meeting, now = Date.now()) {
  if (["COMPLETED", "PUBLISHED", "CANCELLED"].includes(meeting.status) || meeting.protocol_status === "PUBLISHED") return true;
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
  const requestedEpisodeParam = searchParams.get("episode");
  const linkedEpisodeId = requestedEpisodeParam && /^\d+$/.test(requestedEpisodeParam) ? Number(requestedEpisodeParam) : null;
  const [meetings, setMeetings] = useState([]);
  const [councils, setCouncils] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [directoryError, setDirectoryError] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [note, setNote] = useState("");
  const [linkedEpisode, setLinkedEpisode] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({ kind: creatableKindLabels[searchParams.get("kind")] ? searchParams.get("kind") : "MEETING", title: "", description: "", goal: "", membership_ids: [], scheduled_at: normalizeDateTime(searchParams.get("scheduled_at")), duration_minutes: 30 }));
  const [participantQuery, setParticipantQuery] = useState("");
  const businessBase = data.business_base || `/business/${companyId}`;
  const isCouncil = form.kind === "COUNCIL";
  const isPreparationCall = form.kind === "PREPARATION_CALL";
  const selectablePeople = directory.filter(person => person.status === "ACTIVE" && person.membership_id !== data.membership?.id);
  const visiblePeople = selectablePeople.filter(person => [person.name, person.job_title, person.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(participantQuery.trim().toLocaleLowerCase()));
  const selectableIds = new Set(selectablePeople.map(person => person.membership_id));
  const selectedPeople = new Set(form.membership_ids.filter(id => selectableIds.has(id)));
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
    setDirectoryError(false);
    const [meetingResult, councilResult, directoryResult] = await Promise.all([
      api(`/api/company/${companyId}/meetings`),
      api(`/api/council?company_id=${companyId}`),
      canSchedule ? api(`/api/company/${companyId}/employees?active_only=true`).catch(() => { setDirectoryError(true); return []; }) : Promise.resolve([]),
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
    try {
      const result = await api(`/api/company/${companyId}/meetings/${id}`);
      const notes = result.can_review_report ? await api(`/api/company/${companyId}/meetings/${id}/transcript`) : [];
      setDetail(result); setTranscript(notes); setNote(""); setSelectedId(id);
    }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { load().catch(cause => setError(cause.message)); }, [companyId]);
  useEffect(() => { if (selectedId) openMeeting(selectedId); }, [selectedId]);
  useEffect(() => {
    setLinkedEpisode(null);
    if (!canSchedule || !linkedEpisodeId) return undefined;
    let active = true;
    api(`/api/company/${companyId}/episodes/${linkedEpisodeId}`).then(episode => {
      if (!active) return;
      setLinkedEpisode(episode);
      setForm(current => ({
        ...current,
        kind: "PREPARATION_CALL",
        title: `Тестовый созвон: ${episode.title}`,
        description: episode.brief || "",
        goal: episode.expected_result || "",
        membership_ids: (episode.participants || [])
          .filter(person => person.membership_id !== data.membership?.id && person.status !== "DECLINED")
          .map(person => person.membership_id),
      }));
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [canSchedule, companyId, data.membership?.id, linkedEpisodeId]);
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
      if (episodeId || creatableKindLabels[kind] || scheduledAt) setForm(current => ({ ...current, kind: creatableKindLabels[kind] ? kind : current.kind, scheduled_at: scheduledAt ? normalizeDateTime(scheduledAt) : current.scheduled_at }));
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
    if (requestedEpisodeParam && !linkedEpisode) { setError("Не удалось загрузить рабочую ситуацию. Обновите страницу и повторите."); return; }
    const title = form.title.trim();
    if (title.length < 3) { setError("Название встречи должно содержать минимум 3 символа."); return; }
    const scheduledAt = readDateTime(form.scheduled_at);
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) { setError("Выберите корректные дату и время встречи."); return; }
    if (isCouncil && selectedPeople.size !== 3) { setError("Для Совета решений выберите ровно трёх доступных сотрудников."); return; }
    if (isPreparationCall && (selectedPeople.size < 1 || selectedPeople.size > 7)) { setError("Для тестового созвона выберите от 1 до 7 доступных сотрудников."); return; }
    const payload = { kind: form.kind, title, description: form.description.trim(), agenda: form.goal.trim() ? [form.goal.trim()] : [], scheduled_at: scheduledAt.toISOString(), duration_minutes: 30, membership_ids: [...selectedPeople], episode_id: linkedEpisode?.id || null };
    const created = await request("/meetings", { method: "POST", body: payload });
    if (created) { setShowCreate(false); setSelectedId(created.id); setForm({ kind: "MEETING", title: "", description: "", goal: "", membership_ids: [], scheduled_at: "", duration_minutes: 30 }); navigate(`${businessBase}/meetings?meeting=${created.id}`); }
  }
  async function analyze() { await request(`/meetings/${selectedId}/analyze`, { method: "POST" }); }
  async function saveNote(event) {
    event.preventDefault();
    if (!note.trim()) return;
    const saved = await request(`/meetings/${selectedId}/transcript`, { method: "POST", body: { text: note.trim() } });
    if (saved) setNote("");
  }
  async function finish() { await request(`/meetings/${selectedId}/finish`, { method: "POST" }); }
  async function publish() { await request(`/meetings/${selectedId}/protocol/publish`, { method: "POST" }); }
  async function assignAction(itemId, membershipId, version) { await request(`/meetings/${selectedId}/protocol/items/${itemId}/assignee`, { method: "PATCH", body: { version, assignee_membership_id: membershipId } }); }
  async function updateSummary(summary, version) { return request(`/meetings/${selectedId}/protocol`, { method: "PUT", body: { summary, version } }); }
  async function addReportItem(kind, title) { return request(`/meetings/${selectedId}/protocol/items`, { method: "POST", body: { kind, title } }); }

  return <section className="meeting-workspace" aria-live="polite">
    {showCreate && canSchedule ? <section className="meeting-create-page" aria-label="Создание встречи">
      <header className="meeting-create-page__header"><div><p>Встречи</p><h2>Новая встреча</h2><span>{linkedEpisode ? `Тестовый созвон для ситуации «${linkedEpisode.title}». Команда подставлена из ситуации.` : "Запланируйте время и выберите участников."}</span></div><button className="subtle-button" type="button" onClick={closeCreate}><Icon name="x" size={16}/> Закрыть</button></header>
      {error && <p className="meeting-message meeting-message--error" role="alert">{error}</p>}
      {directoryError && <p className="meeting-message meeting-message--error" role="alert">Не удалось загрузить доступных сотрудников. <button type="button" className="subtle-button" onClick={() => load().catch(cause => setError(cause.message))}>Повторить загрузку</button></p>}
      <form className="meeting-create" onSubmit={create}>
      <div className="meeting-form-grid">
        <Field label="Название"><input required minLength={3} maxLength={220} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Например, планирование запуска" /></Field>
        <MeetingDateTimeField value={form.scheduled_at} onChange={value => setForm(current => ({ ...current, scheduled_at: value }))} />
        <Field label="Описание"><textarea maxLength={3000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Коротко опишите, о чём встреча." /></Field>
        <Field label="Цель"><textarea value={form.goal} onChange={event => setForm({ ...form, goal: event.target.value })} placeholder="К какому результату нужно прийти?" /></Field>
      </div>
      <fieldset className="meeting-participant-picker"><legend>{isCouncil ? "Три сотрудника для Совета" : "Участники"}</legend><label className="meeting-participant-search"><Icon name="search" size={17}/><input type="search" value={participantQuery} onChange={event => setParticipantQuery(event.target.value)} placeholder="Найти сотрудника" /></label><div className="meeting-participant-summary"><p aria-live="polite">Выбрано: <b>{selectedPeople.size}</b></p>{!isCouncil && visiblePeople.length > 0 && <button type="button" className="subtle-button" onClick={() => setForm(current => ({ ...current, membership_ids: visiblePeople.every(person => selectedPeople.has(person.membership_id)) ? current.membership_ids.filter(id => !visiblePeople.some(person => person.membership_id === id)) : [...new Set([...current.membership_ids, ...visiblePeople.map(person => person.membership_id)])] }))}>{visiblePeople.every(person => selectedPeople.has(person.membership_id)) ? "Снять выбор" : "Выбрать всех"}</button>}</div><div className="meeting-participant-list">{visiblePeople.map(person => { const selected = selectedPeople.has(person.membership_id); const limitReached = isCouncil && !selected && selectedPeople.size >= 3; return <label key={person.membership_id} className={limitReached ? "is-disabled" : ""}><input disabled={limitReached} type="checkbox" checked={selected} onChange={() => setForm(current => ({ ...current, membership_ids: current.membership_ids.includes(person.membership_id) ? current.membership_ids.filter(id => id !== person.membership_id) : [...current.membership_ids, person.membership_id] }))} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>; })}{!visiblePeople.length && <p className="meeting-participant-empty">Сотрудников по этому запросу нет.</p>}</div>{isCouncil && <p className="meeting-council-count" role="status">Выбрано: {selectedPeople.size} из 3 сотрудников</p>}
      </fieldset>
      <div className="meeting-form-actions"><button className="primary-button" disabled={busy || !form.scheduled_at || Boolean(requestedEpisodeParam && !linkedEpisode) || isCouncil && selectedPeople.size !== 3 || isPreparationCall && (selectedPeople.size < 1 || selectedPeople.size > 7)}>{isCouncil ? "Создать Совет решений" : isPreparationCall ? "Создать тестовый созвон" : "Создать встречу"}</button><button className="subtle-button" type="button" onClick={closeCreate}>Отмена</button>{isPreparationCall && <p role="status">Для группового тестового созвона выберите от 1 до 7 сотрудников; руководитель участвует автоматически.</p>}</div>
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
        {!detail ? <div className="meeting-empty meeting-empty--large"><Icon name="messages-square" size={28}/><h3>Выберите встречу</h3><p>Здесь появятся участники и отправленные отчёты по завершённым звонкам.</p></div> : <MeetingDetail detail={detail} transcript={transcript} note={note} onNoteChange={setNote} onSaveNote={saveNote} busy={busy} onFinish={finish} onAnalyze={analyze} onPublish={publish} onAssignAction={assignAction} onUpdateSummary={updateSummary} onAddReportItem={addReportItem} businessBase={businessBase} />}
      </main>
    </div>
    </>}
  </section>;
}

function ActionAssignee({ item, participants, version, busy, onAssign }) {
  const [membershipId, setMembershipId] = useState(item.assignee_membership_id || "");
  return <form className="meeting-item-assignee" onSubmit={event => { event.preventDefault(); if (membershipId) onAssign(item.id, Number(membershipId), version); }}>
    <label>Исполнитель задачи<select value={membershipId} onChange={event => setMembershipId(event.target.value)}><option value="">Выберите сотрудника</option>{participants.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select></label>
    <button className="subtle-button" disabled={busy || !membershipId || Number(membershipId) === item.assignee_membership_id}>Сохранить</button>
  </form>;
}

function MeetingDetail({ detail, transcript, note, onNoteChange, onSaveNote, busy, onFinish, onAnalyze, onPublish, onAssignAction, onUpdateSummary, onAddReportItem, businessBase }) {
  const report = detail.report;
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [itemKind, setItemKind] = useState("DECISION");
  const [itemTitle, setItemTitle] = useState("");
  useEffect(() => { setEditingSummary(false); setSummaryDraft(report?.summary || ""); }, [detail.id, report?.version]);
  const blockers = report?.issues?.filter(issue => issue.severity === "BLOCKER") || [];
  const linkedCouncil = Boolean(detail.council_meeting_id);
  const linkedPreparationCall = linkedCouncil && detail.kind === "PREPARATION_CALL";
  const recordingProcessing = linkedPreparationCall && detail.council_audio_status && !["complete", "error"].includes(detail.council_audio_status);
  const scheduledCall = detail.kind === "PREPARATION_CALL" && detail.status === "SCHEDULED";
  const canDraft = transcript.some(segment => !segment.excluded_from_analysis && segment.text.trim());
  return <>
    <header className="meeting-detail-header"><div><div className="meeting-detail-header__meta"><span>{kindLabels[detail.kind]}</span><Status value={detail.report_status || detail.status} /></div><h2>{detail.title}</h2>{detail.description && <p>{detail.description}</p>}</div><div className="meeting-detail-actions">{linkedCouncil && <Link className="subtle-button meeting-council-open" to={`${businessBase}/council/${detail.council_meeting_id}`}><Icon name="video" size={16}/>{linkedPreparationCall ? "Открыть тестовый созвон" : "Открыть Совет"}</Link>}{!linkedCouncil && detail.can_review_report && detail.status === "SCHEDULED" && <button className="primary-button" disabled={busy} onClick={onFinish}>Завершить встречу</button>}{!linkedCouncil && detail.can_review_report && ["PROCESSING", "REVIEW"].includes(detail.status) && <button className="primary-button" disabled={busy || !canDraft} onClick={onAnalyze}>Подготовить отчёт</button>}</div></header>

    <section className="meeting-info-strip"><div><span>Когда</span><b>{formatDate(detail.scheduled_at)}</b></div><div><span>Участники</span><b>{detail.participants.length}</b></div></section>
    {!!detail.agenda?.[0] && <section className="meeting-goal"><span>Цель</span><p>{detail.agenda[0]}</p></section>}
    {scheduledCall && !linkedCouncil && <section className="meeting-call-pending" role="status"><Icon name="video" size={21}/><div><h3>Старый тестовый созвон без комнаты</h3><p>Эта встреча создана до подключения Совета решений. Сохраните заметки здесь, чтобы подготовить отчёт.</p></div></section>}
    {linkedCouncil && <section className="meeting-council-bridge"><Icon name="video" size={22}/><div><h3>{linkedPreparationCall ? "Тестовый созвон в Совете решений" : "Совет решений"}</h3><p>Групповой звонок проходит в Совете. После завершения появится закрытый черновик отчёта. Руководитель проверит его и отправит участникам.</p><Link className="subtle-button" to={`${businessBase}/council/${detail.council_meeting_id}`}>Перейти к звонку <Icon name="arrow-right" size={16}/></Link></div></section>}
    {recordingProcessing && <p className="meeting-evidence-empty" role="status">Запись созвона ещё загружается или расшифровывается. Отправка отчёта откроется после обработки.</p>}
    {linkedPreparationCall && detail.council_audio_status === "error" && <p className="meeting-evidence-empty" role="alert">Расшифровка записи не завершилась. Проверьте доступные материалы и исправьте итог вручную перед отправкой.</p>}
    {linkedPreparationCall && detail.can_review_report && <section className="meeting-transcript" aria-label="Материалы созвона"><header><div><h3>Материалы для проверки</h3><p>Сохранённые публичные реплики и расшифровки. Проверьте их перед отправкой отчёта; личные сообщения сюда не попадают.</p></div><span className="meeting-version">{transcript.length} фрагм.</span></header>{transcript.length ? <div className="meeting-transcript-lines">{transcript.map(segment => <article key={segment.id}><b>{segment.speaker || "Участник"}</b><p>{segment.text}</p></article>)}</div> : <p className="meeting-evidence-empty">Пока нет записанных реплик. Уточните итог вручную перед отправкой.</p>}</section>}
    {!linkedCouncil && detail.can_review_report && <section className="meeting-transcript" aria-label="Материалы встречи"><header><div><h3>Заметки для отчёта</h3><p>Запишите факты, решения и следующие шаги после созвона. ИИ уточнит только краткий итог; черновик проверяете вы.</p></div><span className="meeting-version">{transcript.length} фрагм.</span></header>{detail.status !== "COMPLETED" && <form className="meeting-transcript-form" onSubmit={onSaveNote}><label htmlFor="meeting-note">Заметка или фрагмент расшифровки</label><textarea id="meeting-note" value={note} onChange={event => onNoteChange(event.target.value)} maxLength={10000} placeholder="Например: договорились проверить сроки запуска до пятницы" /><button className="subtle-button" disabled={busy || !note.trim()}>Сохранить заметку</button></form>}{transcript.length ? <div className="meeting-transcript-lines">{transcript.map(segment => <article key={segment.id}><b>Заметка {segment.id}</b><p>{segment.text}</p></article>)}</div> : <p className="meeting-evidence-empty">Заметок пока нет. Без них отчёт не создаётся.</p>}{["PROCESSING", "REVIEW"].includes(detail.status) && !canDraft && <p className="meeting-evidence-empty" role="status">Добавьте хотя бы одну заметку, затем подготовьте отчёт.</p>}</section>}
    <section className="meeting-protocol"><header><h3>Отчёт по встрече</h3>{report && <span className="meeting-version">Версия {report.version}</span>}</header>
        {!report ? <div className="meeting-empty"><p>{detail.can_review_report ? "Черновик отчёта появится после завершения встречи. ИИ может уточнить формулировки, если доступен." : detail.report_status === "AWAITING_REVIEW" ? "Создатель рабочей ситуации проверяет отчёт. Он появится здесь после отправки." : "Отчёт появится после завершения встречи."}</p></div> : <>
          <div className="meeting-summary"><div className="meeting-summary-heading"><span>Краткий итог</span>{report.status !== "PUBLISHED" && detail.can_review_report && !editingSummary && <button className="subtle-button" type="button" disabled={busy} onClick={() => setEditingSummary(true)}>Исправить итог</button>}</div>{editingSummary ? <form className="meeting-summary-edit" onSubmit={async event => { event.preventDefault(); if (await onUpdateSummary(summaryDraft.trim(), report.version)) setEditingSummary(false); }}><label htmlFor="meeting-summary-draft">Текст отчёта</label><textarea id="meeting-summary-draft" value={summaryDraft} onChange={event => setSummaryDraft(event.target.value)} maxLength={3000} required /><div><button className="primary-button" disabled={busy || !summaryDraft.trim()}>Сохранить итог</button><button className="subtle-button" type="button" disabled={busy} onClick={() => { setEditingSummary(false); setSummaryDraft(report.summary); }}>Отмена</button></div></form> : <p>{report.summary || "Краткий итог не сформирован."}</p>}</div>
          <div className="meeting-items">{report.items.map(item => <article key={item.id} className={`meeting-item meeting-item--${item.kind.toLowerCase()}`}><div className="meeting-item__top"><span>{itemLabels[item.kind]}</span>{item.confidence < 80 && <small>Проверьте формулировку</small>}</div><b>{item.title}</b>{item.detail && <p>{item.detail}</p>}{item.kind === "ACTION" && report.status !== "PUBLISHED" && detail.can_review_report && <ActionAssignee item={item} participants={detail.participants} version={report.version} busy={busy} onAssign={onAssignAction}/>}</article>)}</div>
          {report.status !== "PUBLISHED" && detail.can_review_report && <form className="meeting-add-action" onSubmit={async event => { event.preventDefault(); if (await onAddReportItem(itemKind, itemTitle.trim())) setItemTitle(""); }}><h4>Добавить пропущенный пункт</h4><div><label>Тип пункта<select value={itemKind} onChange={event => setItemKind(event.target.value)}><option value="DECISION">Решение</option><option value="ACTION">Задача</option><option value="QUESTION">Открытый вопрос</option><option value="RISK">Риск</option></select></label><label>Формулировка<input value={itemTitle} onChange={event => setItemTitle(event.target.value)} minLength={2} maxLength={240} required placeholder="Кратко и по существу" /></label></div><button className="subtle-button" disabled={busy || itemTitle.trim().length < 2}>Добавить в черновик</button></form>}
          {blockers.length > 0 && detail.can_review_report && <div className="meeting-checks" role="alert"><h4>Перед отправкой назначьте исполнителя</h4>{blockers.map(issue => <p className="meeting-check meeting-check--blocker" key={issue.id}>{issue.message}</p>)}</div>}
          {report.status !== "PUBLISHED" && detail.can_review_report && <footer className="meeting-protocol-actions"><p>{recordingProcessing ? "Дождитесь расшифровки записи, затем проверьте итог." : blockers.length ? "Когда обязательные пункты будут заполнены, отчёт можно будет отправить участникам." : "Проверьте краткий итог и найденные решения. После подтверждения отчёт получат участники."}</p><button className="primary-button" disabled={busy || blockers.length > 0 || recordingProcessing} onClick={onPublish}>Подтвердить и отправить участникам <Icon name="arrow-right" size={16}/></button></footer>}
          {report.status === "PUBLISHED" && <p className="meeting-published"><Icon name="check-check" size={18}/>Отчёт отправлен участникам встречи.</p>}
        </>}
    </section>
  </>;
}
