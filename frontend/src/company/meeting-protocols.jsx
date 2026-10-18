import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";

const kindLabels = { MEETING: "Собрание", NEGOTIATION: "Переговоры", ONE_TO_ONE: "Встреча 1×1", COUNCIL: "Совет решений" };
const stateLabels = { SCHEDULED: "Запланирована", PROCESSING: "Готовим итоги", REVIEW: "Требует проверки", COMPLETED: "Завершена", DRAFT: "Черновик", PUBLISHED: "Опубликован" };
const consentOptions = [
  { id: "TRANSCRIPT_ANALYSIS", label: "Черновик итогов по заметкам" },
  { id: "PROTOCOL_SHARING", label: "Публикация протокола участникам" },
];
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

function Field({ label, children, hint }) {
  return <label className="meeting-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function MeetingProtocols({ data }) {
  const companyId = data.company.id;
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
  const [form, setForm] = useState(() => ({ kind: "MEETING", title: "", description: "", agenda: "", membership_ids: [], scheduled_at: "", duration_minutes: 30, consent_required: true, consent_purposes: consentOptions.map(item => item.id), episode_id: searchParams.get("episode") || "" }));
  const [segment, setSegment] = useState("");
  const [action, setAction] = useState({ title: "", assignee_membership_id: "", due_at: "", acceptance_criteria: "" });

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
    if (episodeId) {
      setForm(current => ({ ...current, episode_id: episodeId }));
      setShowCreate(true);
    }
  }, [searchParams]);

  const { upcomingMeetings, pastMeetings } = useMemo(() => {
    const now = Date.now();
    const byDate = (direction) => (left, right) => direction * ((new Date(left.scheduled_at || 0).getTime()) - (new Date(right.scheduled_at || 0).getTime()));
    return {
      upcomingMeetings: meetings.filter(meeting => !isPastMeeting(meeting, now)).slice().sort(byDate(1)),
      pastMeetings: meetings.filter(meeting => isPastMeeting(meeting, now)).slice().sort(byDate(-1)),
    };
  }, [meetings]);
  const upcomingCouncils = useMemo(() => councils
    .filter(meeting => !["finished", "cancelled"].includes(meeting.status))
    .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at)), [councils]);

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
    const created = await request("/meetings", { method: "POST", body: payload }, "Встреча создана. Участники увидят приглашение и согласие на обработку итогов.");
    if (created) { setShowCreate(false); setSelectedId(created.id); setForm({ kind: "MEETING", title: "", description: "", agenda: "", membership_ids: [], scheduled_at: "", duration_minutes: 30, consent_required: true, consent_purposes: consentOptions.map(item => item.id), episode_id: "" }); }
  }
  async function addTranscript(event) {
    event.preventDefault();
    if (!segment.trim()) return;
    const result = await request(`/meetings/${selectedId}/transcript`, { method: "POST", body: { text: segment.trim() } }, "Фрагмент добавлен в расшифровку.");
    if (result) setSegment("");
  }
  async function analyze() { await request(`/meetings/${selectedId}/analyze`, { method: "POST" }, "Черновик итогов подготовлен. Проверьте каждый пункт перед подтверждением."); }
  async function finish() { await request(`/meetings/${selectedId}/finish`, { method: "POST" }, "Встреча завершена. Добавьте или дождитесь расшифровки, затем подготовьте итог."); }
  async function consent(accepted, purposes) { await request(`/meetings/${selectedId}/consent`, { method: "POST", body: { accepted, purposes } }, accepted ? "Согласие сохранено." : "Отказ сохранён."); }
  async function addAction(event) {
    event.preventDefault();
    const payload = { kind: "ACTION", title: action.title, assignee_membership_id: action.assignee_membership_id ? Number(action.assignee_membership_id) : null, due_at: action.due_at ? new Date(action.due_at).toISOString() : null, acceptance_criteria: action.acceptance_criteria };
    const result = await request(`/meetings/${selectedId}/protocol/items`, { method: "POST", body: payload }, "Задача добавлена в черновик.");
    if (result) setAction({ title: "", assignee_membership_id: "", due_at: "", acceptance_criteria: "" });
  }
  async function approve(status) {
    if (!detail?.protocol) return;
    await request(`/meetings/${selectedId}/protocol/approve`, { method: "POST", body: { version: detail.protocol.version, status } }, status === "APPROVED" ? "Вы подтвердили эту версию протокола." : "Запрос на изменения сохранён.");
  }
  async function publish() { await request(`/meetings/${selectedId}/protocol/publish`, { method: "POST" }, "Протокол опубликован. Участники получили уведомление."); }

  return <section className="meeting-workspace" aria-live="polite">
    <header className="meeting-intro">
      <div><h2>Встречи</h2><p>Проводите разговоры, фиксируйте решения и подтверждайте обязательства в одном месте.</p></div>
      <div className="meeting-intro-actions"><Link className="subtle-button" to={`${data.business_base || `/business/${companyId}`}/rooms`}>Практика 1×1</Link><Link className="subtle-button" to={`${data.business_base || `/business/${companyId}`}/council`}>Совет решений</Link><button className="primary-button" type="button" onClick={() => setShowCreate(value => !value)} aria-expanded={showCreate}><Icon name={showCreate ? "x" : "plus"} size={18}/>{showCreate ? "Закрыть" : "Создать встречу"}</button></div>
    </header>

    {error && <p className="meeting-message meeting-message--error" role="alert">{error}</p>}
    {notice && <p className="meeting-message" role="status">{notice}</p>}

    {showCreate && <form className="meeting-create" onSubmit={create}>
      <div className="meeting-form-heading"><div><h3>Новая встреча</h3><p>Сначала укажите цель и участников. Остальные детали можно дополнить позже.</p></div></div>
      <div className="meeting-form-grid">
        <Field label="Формат"><select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Рабочий эпизод" hint="Необязательно"><select value={form.episode_id} onChange={event => setForm({ ...form, episode_id: event.target.value })}><option value="">Без эпизода</option>{episodes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Название"><input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Например, планирование запуска" /></Field>
        <Field label="Дата и время"><input type="datetime-local" value={form.scheduled_at} onChange={event => setForm({ ...form, scheduled_at: event.target.value })} /></Field>
        <Field label="Длительность, минут"><input type="number" min="5" max="480" value={form.duration_minutes} onChange={event => setForm({ ...form, duration_minutes: event.target.value })} /></Field>
        <Field label="Цель встречи" hint="Эта формулировка поможет участникам подготовиться."><textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Какой результат нужно получить?" /></Field>
        <Field label="Повестка" hint="Один пункт на строку."><textarea value={form.agenda} onChange={event => setForm({ ...form, agenda: event.target.value })} placeholder={"Статус проекта\nРешения по запуску\nСледующие шаги"} /></Field>
      </div>
      <fieldset className="meeting-participant-picker"><legend>Участники</legend><p>Вы автоматически добавлены как организатор.</p><div>{directory.map(person => <label key={person.membership_id}><input type="checkbox" checked={form.membership_ids.includes(person.membership_id)} onChange={() => setForm(current => ({ ...current, membership_ids: current.membership_ids.includes(person.membership_id) ? current.membership_ids.filter(id => id !== person.membership_id) : [...current.membership_ids, person.membership_id] }))} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>)}</div>
      </fieldset>
      <label className="meeting-consent"><input type="checkbox" checked={form.consent_required} onChange={event => setForm({ ...form, consent_required: event.target.checked })} /><span><b>Запросить согласие</b><small>Участники сами подтвердят выбранные назначения обработки.</small></span></label>
      {form.consent_required && <fieldset className="meeting-consent-purposes"><legend>Что запросить</legend>{consentOptions.map(option => <label key={option.id}><input type="checkbox" checked={form.consent_purposes.includes(option.id)} onChange={() => setForm(current => ({ ...current, consent_purposes: current.consent_purposes.includes(option.id) ? current.consent_purposes.filter(id => id !== option.id) : [...current.consent_purposes, option.id] }))} /><span>{option.label}</span></label>)}</fieldset>}
      <div className="meeting-form-actions"><button className="primary-button" disabled={busy || form.consent_required && !form.consent_purposes.length}>Создать встречу</button><button className="subtle-button" type="button" onClick={() => setShowCreate(false)}>Отмена</button></div>
    </form>}

    <div className="meeting-layout">
      <aside className="meeting-list" aria-label="Список встреч">
        <section className="meeting-list-group"><h3>Предстоящие</h3>{upcomingCouncils.map(meeting => <Link key={`council-${meeting.id}`} className="meeting-list-item" to={`${data.business_base || `/business/${companyId}`}/council/${meeting.id}`}><span className="meeting-list-item__meta"><span>Совет решений</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><span>{meeting.registration_open ? meeting.available_seats > 0 ? `Открыта запись · ${meeting.available_seats} места` : "Запись в резерв" : meeting.my_status ? "Вы участвуете" : "Состав формируется"}</span><span>{meeting.seats_taken} из {meeting.capacity}</span></span></Link>)}{upcomingMeetings.map(meeting => <button type="button" key={meeting.id} className={`meeting-list-item ${meeting.id === selectedId ? "is-active" : ""}`} onClick={() => setSelectedId(meeting.id)}><span className="meeting-list-item__meta"><span>{kindLabels[meeting.kind]}</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><Status value={meeting.protocol_status || meeting.status} /><span>{meeting.participants.length} участника</span></span></button>)}{!upcomingCouncils.length && !upcomingMeetings.length && <p className="meeting-list-empty">Нет предстоящих встреч.</p>}</section>
        <section className="meeting-list-group"><h3>Прошедшие</h3>{pastMeetings.map(meeting => <button type="button" key={meeting.id} className={`meeting-list-item ${meeting.id === selectedId ? "is-active" : ""}`} onClick={() => setSelectedId(meeting.id)}><span className="meeting-list-item__meta"><span>{kindLabels[meeting.kind]}</span><time>{formatDate(meeting.scheduled_at)}</time></span><b>{meeting.title}</b><span className="meeting-list-item__footer"><Status value={meeting.protocol_status || meeting.status} /><span>{meeting.participants.length} участника</span></span></button>)}{!pastMeetings.length && <p className="meeting-list-empty">Прошедших встреч пока нет.</p>}</section>
      </aside>
      <main className="meeting-detail" aria-label="Детали встречи">
        {!detail ? <div className="meeting-empty meeting-empty--large"><Icon name="messages-square" size={28}/><h3>Выберите встречу</h3><p>Здесь появятся участники, расшифровка и подтверждённые итоги.</p></div> : <MeetingDetail detail={detail} directory={directory} busy={busy} segment={segment} setSegment={setSegment} action={action} setAction={setAction} onConsent={consent} onFinish={finish} onAnalyze={analyze} onAddSegment={addTranscript} onAddAction={addAction} onApprove={approve} onPublish={publish} companyId={companyId} />}
      </main>
    </div>
  </section>;
}

function MeetingDetail({ detail, directory, busy, segment, setSegment, action, setAction, onConsent, onFinish, onAnalyze, onAddSegment, onAddAction, onApprove, onPublish, companyId }) {
  const [transcript, setTranscript] = useState([]);
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [consentSelection, setConsentSelection] = useState([]);
  useEffect(() => { api(`/api/company/${companyId}/meetings/${detail.id}/transcript`).then(setTranscript).catch(() => setTranscript([])); }, [companyId, detail.id]);
  useEffect(() => { setConsentSelection((detail.consent_purposes || []).map(item => item.id)); }, [detail.id, detail.consent_purposes]);
  const protocol = detail.protocol;
  const blockers = protocol?.issues?.filter(issue => issue.severity === "BLOCKER") || [];
  const toggleConsentPurpose = purpose => setConsentSelection(current => current.includes(purpose) ? current.filter(item => item !== purpose) : [...current, purpose]);
  return <>
    <header className="meeting-detail-header"><div><div className="meeting-detail-header__meta"><span>{kindLabels[detail.kind]}</span><Status value={detail.protocol_status || detail.status} /></div><h2>{detail.title}</h2><p>{detail.description || "Цель пока не добавлена."}</p></div><div className="meeting-detail-actions">{detail.is_organizer && detail.status === "SCHEDULED" && <button className="primary-button" disabled={busy} onClick={onFinish}>Завершить и подготовить итог</button>}{detail.is_organizer && ["PROCESSING", "REVIEW"].includes(detail.status) && <button className="primary-button" disabled={busy} onClick={onAnalyze}>Подготовить черновик</button>}</div></header>

    <section className="meeting-info-strip"><div><span>Когда</span><b>{formatDate(detail.scheduled_at)}</b></div><div><span>Участники</span><b>{detail.participants.length}</b></div><div><span>Согласие</span><b>{detail.consent_purposes?.length ? `${detail.participants.filter(person => person.consent_status === "ACCEPTED").length} из ${detail.participants.length}` : "Не требуется"}</b></div></section>
    {!!detail.consent_purposes?.length && <section className="meeting-consent-choice"><div><b>Согласие на обработку</b><small>Выберите назначения и подтвердите решение.</small></div><div className="meeting-consent-choice-options">{detail.consent_purposes.map(purpose => <label key={purpose.id}><input type="checkbox" checked={consentSelection.includes(purpose.id)} onChange={() => toggleConsentPurpose(purpose.id)} /><span>{purpose.label}</span></label>)}</div><div className="meeting-consent-choice-actions"><button type="button" className="subtle-button" disabled={busy || !consentSelection.length} onClick={() => onConsent(false, consentSelection)}>Не согласен</button><button type="button" className="primary-button" disabled={busy || !consentSelection.length} onClick={() => onConsent(true, consentSelection)}>Согласиться</button></div></section>}
    {!!detail.agenda?.length && <section className="meeting-agenda"><h3>Повестка</h3><ol>{detail.agenda.map(item => <li key={item}>{item}</li>)}</ol></section>}

    <div className="meeting-review-grid">
      <section className="meeting-transcript"><header><div><h3>Расшифровка</h3><p>Каждый итог можно проверить по исходному фрагменту.</p></div><button className="subtle-button" type="button" onClick={() => setShowTranscriptInput(value => !value)}><Icon name="plus" size={16}/>Добавить фрагмент</button></header>
        {showTranscriptInput && <form className="meeting-transcript-form" onSubmit={onAddSegment}><textarea value={segment} onChange={event => setSegment(event.target.value)} placeholder="Добавьте реплику или заметку со встречи" /><button className="primary-button" disabled={busy}>Сохранить</button></form>}
        <div className="meeting-transcript-lines">{transcript.map(row => <article key={row.id}><div><b>{row.speaker}</b><time>{Math.floor(row.start_ms / 60000)}:{String(Math.floor(row.start_ms / 1000) % 60).padStart(2, "0")}</time></div><p>{row.text}</p></article>)}{!transcript.length && <div className="meeting-empty"><Icon name="mic" size={20}/><p>Расшифровка появится после записи или добавления заметок.</p></div>}</div>
      </section>
      <section className="meeting-protocol"><header><div><h3>Итоги встречи</h3><p>Система готовит черновик, а обязательства подтверждают участники.</p></div>{protocol && <span className="meeting-version">Версия {protocol.version}</span>}</header>
        {!protocol ? <div className="meeting-empty"><Icon name="sparkles" size={22}/><b>Итоги ещё не подготовлены</b><p>Завершите встречу, добавьте расшифровку и запустите подготовку черновика.</p></div> : <>
          <div className="meeting-summary"><span>Краткий итог</span><p>{protocol.summary || "Добавьте краткое резюме."}</p></div>
          {protocol.issues.length > 0 && <section className="meeting-checks"><h4>Проверки перед публикацией</h4>{protocol.issues.map(issue => <p key={issue.id} className={`meeting-check meeting-check--${issue.severity.toLowerCase()}`}><Icon name={issue.severity === "BLOCKER" ? "circle-alert" : "info"} size={16}/>{issue.message}</p>)}</section>}
          <div className="meeting-items">{protocol.items.map(item => <article key={item.id} className={`meeting-item meeting-item--${item.kind.toLowerCase()}`}><div className="meeting-item__top"><span>{itemLabels[item.kind]}</span>{item.confidence < 80 && <small>Проверьте формулировку</small>}</div><b>{item.title}</b>{item.assignee_membership_id && <p>Исполнитель: {directory.find(person => person.membership_id === item.assignee_membership_id)?.name || "Сотрудник"}</p>}{item.due_at && <p>Срок: {formatDate(item.due_at)}</p>}{item.source_segment_ids.length > 0 && <button type="button" className="meeting-source">Источник в расшифровке</button>}</article>)}</div>
          {protocol.status !== "PUBLISHED" && <form className="meeting-add-action" onSubmit={onAddAction}><h4>Добавить задачу</h4><Field label="Что нужно сделать"><input required value={action.title} onChange={event => setAction({ ...action, title: event.target.value })} placeholder="Например, подготовить план запуска" /></Field><div><Field label="Исполнитель"><select value={action.assignee_membership_id} onChange={event => setAction({ ...action, assignee_membership_id: event.target.value })}><option value="">Выберите сотрудника</option>{detail.participants.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select></Field><Field label="Срок"><input type="datetime-local" value={action.due_at} onChange={event => setAction({ ...action, due_at: event.target.value })} /></Field></div><Field label="Как понять, что готово"><input value={action.acceptance_criteria} onChange={event => setAction({ ...action, acceptance_criteria: event.target.value })} placeholder="Например, план согласован с командой" /></Field><button className="subtle-button" disabled={busy}>Добавить в черновик</button></form>}
          <footer className="meeting-protocol-actions">{protocol.status !== "PUBLISHED" && <><button className="subtle-button" disabled={busy} onClick={() => onApprove("CHANGES_REQUESTED")}>Запросить изменения</button><button className="subtle-button" disabled={busy} onClick={() => onApprove("APPROVED")}>Подтвердить версию</button>{detail.is_organizer && <button className="primary-button" disabled={busy || blockers.length > 0} onClick={onPublish}>Опубликовать итог</button>}</>}{protocol.status === "PUBLISHED" && <p className="meeting-published"><Icon name="check-check" size={18}/>Итог опубликован и доступен участникам.</p>}</footer>
        </>}
      </section>
    </div>
  </>;
}
