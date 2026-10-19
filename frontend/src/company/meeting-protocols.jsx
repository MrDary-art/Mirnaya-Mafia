import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";

const kindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений", PREPARATION_CALL: "Тестовый созвон" };
const creatableKindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений" };
const stateLabels = { SCHEDULED: "Запланирована", PROCESSING: "Готовим отчёт", REVIEW: "Отчёт готов", AWAITING_REVIEW: "Нужно проверить", SENT: "Отчёт отправлен", COMPLETED: "Завершена", DRAFT: "Черновик", PUBLISHED: "Отчёт отправлен" };
const itemLabels = { DECISION: "Решение", ACTION: "Задача", QUESTION: "Открытый вопрос", RISK: "Риск" };

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

export default function MeetingProtocols({ data }) {
  const companyId = data.company.id;
  const canSchedule = Boolean(data.permissions?.manage_team);
  const [searchParams] = useSearchParams();
  const requestedMeetingParam = searchParams.get("meeting");
  const requestedMeetingId = requestedMeetingParam ? Number(requestedMeetingParam) : null;
  const [meetings, setMeetings] = useState([]);
  const [councils, setCouncils] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(() => ({ kind: "MEETING", title: "", description: "", agenda: "", membership_ids: [], scheduled_at: "", duration_minutes: 30, consent_required: false, consent_purposes: [], episode_id: searchParams.get("episode") || "" }));
  const [segment, setSegment] = useState("");
  const businessBase = data.business_base || `/business/${companyId}`;
  const isCouncil = form.kind === "COUNCIL";
  const selectablePeople = directory.filter(person => person.membership_id !== data.membership?.id);
  const selectedPeople = new Set(form.membership_ids);

  async function load() {
    const [meetingResult, councilResult, directoryResult, episodeResult] = await Promise.all([
      api(`/api/company/${companyId}/meetings`),
      api(`/api/council?company_id=${companyId}`),
      api(`/api/company/${companyId}/messenger/directory`).catch(() => []),
      api(`/api/company/${companyId}/episodes`).catch(() => []),
    ]);
    setMeetings(meetingResult);
    setCouncils(councilResult);
    setDirectory(directoryResult);
    setEpisodes(episodeResult.filter(item => item.access === "full"));
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
    if (canSchedule && (episodeId || searchParams.get("create") === "1")) {
      if (episodeId) setForm(current => ({ ...current, episode_id: episodeId }));
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

  async function request(path, options = {}, success = "") {
    setBusy(true); setError("");
    try {
      const result = await api(`/api/company/${companyId}${path}`, options);
      if (success) setNotice(success);
      await load();
      if (selectedId) await openMeeting(selectedId);
      return result;
    } catch (cause) { setError(cause.message); return null; }
    finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault();
    const payload = { ...form, episode_id: form.episode_id ? Number(form.episode_id) : null, agenda: form.agenda.split("\n").map(item => item.trim()).filter(Boolean), scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null, duration_minutes: Number(form.duration_minutes), membership_ids: form.membership_ids.map(Number) };
    const created = await request("/meetings", { method: "POST", body: payload }, "Встреча создана.");
    if (created) { setShowCreate(false); setSelectedId(created.id); setForm({ kind: "MEETING", title: "", description: "", agenda: "", membership_ids: [], scheduled_at: "", duration_minutes: 30, consent_required: false, consent_purposes: [], episode_id: "" }); }
  }
  async function addTranscript(event) {
    event.preventDefault();
    if (!segment.trim()) return;
    const result = await request(`/meetings/${selectedId}/transcript`, { method: "POST", body: { text: segment.trim() } }, "Заметка добавлена.");
    if (result) setSegment("");
  }
  async function analyze() { await request(`/meetings/${selectedId}/analyze`, { method: "POST" }, "Итог подготовлен."); }
  async function finish() { await request(`/meetings/${selectedId}/finish`, { method: "POST" }, "Встреча завершена."); }
  async function publish() { await request(`/meetings/${selectedId}/protocol/publish`, { method: "POST" }, "Отчёт отправлен участникам."); }

  return <section className="meeting-workspace" aria-live="polite">
    {canSchedule && <header className="meeting-intro"><button className="primary-button" type="button" onClick={() => setShowCreate(value => !value)} aria-expanded={showCreate}><Icon name={showCreate ? "x" : "plus"} size={18}/>{showCreate ? "Закрыть форму" : "Создать встречу"}</button></header>}

    {error && <p className="meeting-message meeting-message--error" role="alert">{error}</p>}
    {notice && <p className="meeting-message" role="status">{notice}</p>}

    {showCreate && canSchedule && <form className="meeting-create" onSubmit={create}>
      <div className="meeting-form-heading"><h2>Новая встреча</h2></div>
      <div className="meeting-form-grid">
        <Field label="Формат"><select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>{Object.entries(creatableKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Рабочий эпизод"><select value={form.episode_id} onChange={event => setForm({ ...form, episode_id: event.target.value })}><option value="">Без эпизода</option>{episodes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Название"><input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Например, планирование запуска" /></Field>
        <Field label="Дата и время"><input required={isCouncil} type="datetime-local" value={form.scheduled_at} onChange={event => setForm({ ...form, scheduled_at: event.target.value })} /></Field>
        <Field label="Длительность, минут"><input type="number" min="5" max="480" value={form.duration_minutes} onChange={event => setForm({ ...form, duration_minutes: event.target.value })} /></Field>
        <Field label="Цель"><textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Какой результат нужно получить?" /></Field>
        <Field label="Повестка"><textarea value={form.agenda} onChange={event => setForm({ ...form, agenda: event.target.value })} placeholder={"Статус проекта\nРешения по запуску\nСледующие шаги"} /></Field>
      </div>
      <fieldset className="meeting-participant-picker"><legend>{isCouncil ? "Три сотрудника для Совета" : "Участники"}</legend>{isCouncil && <p className="meeting-council-note"><Icon name="users" size={16}/>Вы участвуете как четвёртый человек. Совет — это групповая видеовстреча с личными ролями; подтверждать участие дополнительно не нужно.</p>}<div>{selectablePeople.map(person => { const selected = selectedPeople.has(person.membership_id); const limitReached = isCouncil && !selected && selectedPeople.size >= 3; return <label key={person.membership_id} className={limitReached ? "is-disabled" : ""}><input disabled={limitReached} type="checkbox" checked={selected} onChange={() => setForm(current => ({ ...current, membership_ids: current.membership_ids.includes(person.membership_id) ? current.membership_ids.filter(id => id !== person.membership_id) : [...current.membership_ids, person.membership_id] }))} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>; })}</div>{isCouncil && <p className="meeting-council-count" role="status">Выбрано: {selectedPeople.size} из 3 сотрудников</p>}
      </fieldset>
      <div className="meeting-form-actions"><button className="primary-button" disabled={busy || isCouncil && selectedPeople.size !== 3}>{isCouncil ? "Создать Совет решений" : "Создать встречу"}</button><button className="subtle-button" type="button" onClick={() => setShowCreate(false)}>Отмена</button></div>
    </form>}

    <div className="meeting-layout">
      <aside className="meeting-list" aria-label="Список встреч">
        <section className="meeting-list-group"><h3>Предстоящие</h3>{upcomingCouncils.map(meeting => <Link key={`council-${meeting.id}`} className="meeting-list-item" to={`${businessBase}/council/${meeting.id}`}><span className="meeting-list-item__meta"><span>Совет решений</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><span>{meeting.registration_open ? meeting.available_seats > 0 ? `Открыта запись · ${meeting.available_seats} места` : "Запись в резерв" : meeting.my_status ? "Вы участвуете" : "Состав формируется"}</span><span>{meeting.seats_taken} из {meeting.capacity}</span></span></Link>)}{upcomingMeetings.map(meeting => <button type="button" key={meeting.id} className={`meeting-list-item ${meeting.id === selectedId ? "is-active" : ""}`} onClick={() => setSelectedId(meeting.id)}><span className="meeting-list-item__meta"><span>{kindLabels[meeting.kind]}</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><Status value={meeting.report_status || meeting.status} /><span>{meeting.participants.length} участника</span></span></button>)}{!upcomingCouncils.length && !upcomingMeetings.length && <p className="meeting-list-empty">Нет предстоящих встреч.</p>}</section>
        <section className="meeting-list-group"><h3>Прошедшие</h3>{pastMeetings.map(meeting => <button type="button" key={meeting.id} className={`meeting-list-item ${meeting.id === selectedId ? "is-active" : ""}`} onClick={() => setSelectedId(meeting.id)}><span className="meeting-list-item__meta"><span>{kindLabels[meeting.kind]}</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><Status value={meeting.report_status || meeting.status} /><span>{meeting.participants.length} участника</span></span></button>)}{!pastMeetings.length && <p className="meeting-list-empty">Прошедших встреч пока нет.</p>}</section>
      </aside>
      <main className="meeting-detail" aria-label="Детали встречи">
        {!detail ? <div className="meeting-empty meeting-empty--large"><Icon name="messages-square" size={28}/><h3>Выберите встречу</h3><p>Здесь появятся участники и отправленные отчёты по завершённым звонкам.</p></div> : <MeetingDetail detail={detail} directory={directory} busy={busy} segment={segment} setSegment={setSegment} onFinish={finish} onAnalyze={analyze} onAddSegment={addTranscript} onPublish={publish} companyId={companyId} businessBase={businessBase} />}
      </main>
    </div>
  </section>;
}

function MeetingDetail({ detail, directory, busy, segment, setSegment, onFinish, onAnalyze, onAddSegment, onPublish, companyId, businessBase }) {
  const [transcript, setTranscript] = useState([]);
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  useEffect(() => {
    if (!detail.can_review_report) { setTranscript([]); return; }
    api(`/api/company/${companyId}/meetings/${detail.id}/transcript`).then(setTranscript).catch(() => setTranscript([]));
  }, [companyId, detail.id, detail.can_review_report]);
  const report = detail.report;
  const linkedCouncil = Boolean(detail.council_meeting_id);
  return <>
    <header className="meeting-detail-header"><div><div className="meeting-detail-header__meta"><span>{kindLabels[detail.kind]}</span><Status value={detail.report_status || detail.status} /></div><h2>{detail.title}</h2>{detail.description && <p>{detail.description}</p>}</div><div className="meeting-detail-actions">{linkedCouncil && <Link className="subtle-button meeting-council-open" to={`${businessBase}/council/${detail.council_meeting_id}`}><Icon name="video" size={16}/>Открыть Совет</Link>}{!linkedCouncil && detail.can_review_report && detail.status === "SCHEDULED" && <button className="primary-button" disabled={busy} onClick={onFinish}>Завершить встречу</button>}{!linkedCouncil && detail.can_review_report && ["PROCESSING", "REVIEW"].includes(detail.status) && <button className="primary-button" disabled={busy} onClick={onAnalyze}>Подготовить отчёт</button>}</div></header>

    <section className="meeting-info-strip"><div><span>Когда</span><b>{formatDate(detail.scheduled_at)}</b></div><div><span>Участники</span><b>{detail.participants.length}</b></div></section>
    {!!detail.agenda?.length && <section className="meeting-agenda"><h3>Повестка</h3><ol>{detail.agenda.map(item => <li key={item}>{item}</li>)}</ol></section>}

    <div className="meeting-review-grid">
      {linkedCouncil ? <section className="meeting-council-bridge"><Icon name="video" size={22}/><div><h3>Совет решений</h3><p>Групповой звонок проходит в Совете. После завершения ИИ соберёт черновик отчёта, а создатель рабочей ситуации проверит его перед отправкой команде.</p><Link className="subtle-button" to={`${businessBase}/council/${detail.council_meeting_id}`}>Перейти к звонку <Icon name="arrow-right" size={16}/></Link></div></section> : detail.can_review_report && <section className="meeting-transcript"><header><h3>Заметки</h3><button className="subtle-button" type="button" onClick={() => setShowTranscriptInput(value => !value)}><Icon name="plus" size={16}/>Добавить</button></header>
        {showTranscriptInput && <form className="meeting-transcript-form" onSubmit={onAddSegment}><textarea value={segment} onChange={event => setSegment(event.target.value)} placeholder="Добавьте реплику или заметку со встречи" /><button className="primary-button" disabled={busy}>Сохранить</button></form>}
        <div className="meeting-transcript-lines">{transcript.map(row => <article key={row.id}><div><b>{row.speaker}</b><time>{Math.floor(row.start_ms / 60000)}:{String(Math.floor(row.start_ms / 1000) % 60).padStart(2, "0")}</time></div><p>{row.text}</p></article>)}{!transcript.length && <div className="meeting-empty"><p>Заметок пока нет.</p></div>}</div>
      </section>}
      <section className="meeting-protocol"><header><h3>Отчёт по встрече</h3>{report && <span className="meeting-version">Версия {report.version}</span>}</header>
        {!report ? <div className="meeting-empty"><p>{detail.can_review_report ? "ИИ подготовит черновик отчёта после звонка." : detail.report_status === "AWAITING_REVIEW" ? "Создатель рабочей ситуации проверяет отчёт. Он появится здесь после отправки." : "Отчёт появится после завершения встречи."}</p></div> : <>
          <div className="meeting-summary"><span>Краткий итог</span><p>{report.summary || "ИИ не смог выделить краткий итог."}</p></div>
          <div className="meeting-items">{report.items.map(item => <article key={item.id} className={`meeting-item meeting-item--${item.kind.toLowerCase()}`}><div className="meeting-item__top"><span>{itemLabels[item.kind]}</span>{item.confidence < 80 && <small>Проверьте формулировку</small>}</div><b>{item.title}</b>{item.detail && <p>{item.detail}</p>}</article>)}</div>
          {report.status !== "PUBLISHED" && detail.can_review_report && <footer className="meeting-protocol-actions"><p>Проверьте краткий итог и найденные решения. После подтверждения отчёт получат участники.</p><button className="primary-button" disabled={busy} onClick={onPublish}>Подтвердить и отправить участникам <Icon name="arrow-right" size={16}/></button></footer>}
          {report.status === "PUBLISHED" && <p className="meeting-published"><Icon name="check-check" size={18}/>Отчёт отправлен участникам встречи.</p>}
        </>}
      </section>
    </div>
  </>;
}
