import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { businessPath } from "../business/navigation.js";
import { Empty, Loader, formatDate, statusLabels } from "./shared.jsx";

const states = {
  PREPARING: "Подготовка", READY: "Готово к встрече", IN_MEETING: "Встреча", PROTOCOL_REVIEW: "Проверка итога",
  ACTIVE: "В работе", COMPLETED: "Завершён", CANCELLED: "Отменён", ARCHIVED: "Архив",
};
const types = { NEGOTIATION: "Переговоры", FEEDBACK: "Обратная связь", ALIGNMENT: "Согласование", ESCALATION: "Эскалация", OTHER: "Другая ситуация" };
const visibility = { PRIVATE: "Только я", PARTICIPANTS: "Участники", TEAM: "Команда" };
const commitmentStates = { PENDING: "Ждёт принятия", ACCEPTED: "Принято", IN_PROGRESS: "В работе", BLOCKED: "Блокер", COMPLETED: "Ждёт подтверждения", VERIFIED: "Подтверждено", DISPUTED: "Нужно уточнение" };
const prepFields = [["goal", "Цель"], ["facts", "Факты"], ["questions", "Уточнить"], ["red_lines", "Не менять"]];
const retrospectiveFields = [["outcome", "Что получилось"], ["what_worked", "Что сработало"], ["next_step", "Следующий шаг"]];
const closedAssignmentStates = new Set(["COMPLETED", "PASSED", "FAILED", "CANCELLED"]);
const completedEpisodeStates = new Set(["COMPLETED", "CANCELLED", "ARCHIVED"]);
const workSituationManagerRoles = new Set(["COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER", "DEPARTMENT_MANAGER", "TEAM_LEAD"]);
const episodeStatusLabel = status => completedEpisodeStates.has(status) ? "Завершена" : "Активна";
const episodeFilters = [
  ["ACTIVE", "Активные"],
  ["COMPLETED", "Завершённые"],
];

function EpisodeTextarea({ value, onChange, ...props }) {
  const field = useRef(null);
  const resize = () => {
    if (!field.current) return;
    field.current.style.height = "auto";
    field.current.style.height = `${field.current.scrollHeight}px`;
  };
  useEffect(resize, [value]);
  return <textarea {...props} ref={field} rows={3} value={value} onChange={event => { resize(); onChange(event); }} />;
}

function EmptyEpisode({ canCreate, onCreate }) {
  return <section className="business-episode-empty">
    <div aria-hidden="true"><Icon name="target" size={24}/></div>
    <h2>Рабочих ситуаций пока нет</h2>
    <p>{canCreate ? "Создайте ситуацию для своей команды и зафиксируйте общий результат." : "Когда руководитель добавит вас в рабочую ситуацию, она появится здесь."}</p>
    {canCreate && <button type="button" className="primary-button" onClick={onCreate}>Создать ситуацию <Icon name="plus" size={17}/></button>}
  </section>;
}

function EpisodeCreate({ assignments, directory, busy, error, onCancel, onCreate }) {
  const [form, setForm] = useState({ title: "", situation_type: "NEGOTIATION", expected_result: "", scheduled_at: "", visibility: "PRIVATE", practice_target_id: "", participant_ids: [] });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const toggleParticipant = membershipId => setForm(current => ({ ...current, participant_ids: current.participant_ids.includes(membershipId) ? current.participant_ids.filter(id => id !== membershipId) : [...current.participant_ids, membershipId] }));
  const practices = assignments.filter(item => !closedAssignmentStates.has(item.status));
  return <form className="business-episode-create" onSubmit={event => {
    event.preventDefault();
    onCreate({ ...form, practice_target_id: form.practice_target_id ? Number(form.practice_target_id) : null, scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null });
  }}>
    <header><h2>Новая рабочая ситуация</h2><button type="button" className="business-icon-button" onClick={onCancel} aria-label="Закрыть"><Icon name="x"/></button></header>
    <div className="business-episode-create-grid">
      <label>Название<input autoFocus required value={form.title} onChange={event => set("title", event.target.value)} placeholder="Например, продление договора" /></label>
      <label>Формат<select value={form.situation_type} onChange={event => set("situation_type", event.target.value)}>{Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="is-wide">Ожидаемый результат<EpisodeTextarea value={form.expected_result} onChange={event => set("expected_result", event.target.value)} placeholder="К чему хотите прийти после разговора?" /></label>
      <label>Когда<input type="datetime-local" value={form.scheduled_at} onChange={event => set("scheduled_at", event.target.value)} /></label>
      <label>Видимость<select value={form.visibility} onChange={event => set("visibility", event.target.value)}>{Object.entries(visibility).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {practices.length > 0 && <label className="is-wide">Репетиция<select value={form.practice_target_id} onChange={event => set("practice_target_id", event.target.value)}><option value="">Не связывать</option>{practices.map(item => <option key={item.target_id} value={item.target_id}>{item.title}</option>)}</select></label>}
    </div>
    {form.visibility !== "PRIVATE" && directory.length > 0 && <fieldset className="business-episode-participants"><legend>Участники</legend><div>{directory.map(person => <label key={person.membership_id}><input type="checkbox" checked={form.participant_ids.includes(person.membership_id)} onChange={() => toggleParticipant(person.membership_id)} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>)}</div></fieldset>}
    {error && <p className="business-alert" role="alert">{error}</p>}
    <footer><button type="button" className="subtle-button" onClick={onCancel}>Отмена</button><button className="primary-button" disabled={busy}>{busy ? "Создаём…" : "Создать"} <Icon name="arrow-right" size={17}/></button></footer>
  </form>;
}

function PreparationPlanCreate({ directory, busy, error, preview, onCancel, onPreview, onCreate }) {
  const [form, setForm] = useState({ title: "", situation_type: "NEGOTIATION", brief: "", expected_result: "", scheduled_at: "", participant_ids: [], test_call_enabled: false, test_call_at: "", test_call_duration: 30 });
  const [query, setQuery] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const toggle = membershipId => setForm(current => ({ ...current, participant_ids: current.participant_ids.includes(membershipId) ? current.participant_ids.filter(id => id !== membershipId) : [...current.participant_ids, membershipId] }));
  const people = directory.filter(person => [person.name, person.job_title, person.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const payload = () => ({ ...form, visibility: "PARTICIPANTS", create_preparation_plan: true,
    scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    test_call_at: form.test_call_enabled && form.test_call_at ? new Date(form.test_call_at).toISOString() : null });
  const submit = event => { event.preventDefault(); preview ? onCreate(payload()) : onPreview(payload()); };
  return <form className="business-episode-create business-preparation-create" onSubmit={submit}>
    <header><div><span className="business-eyebrow">Рабочая ситуация</span><h2>{preview ? "План подготовки готов" : "Создать рабочую ситуацию"}</h2><p>{preview ? "Проверьте состав — после запуска команда сразу получит назначения." : "Опишите реальное событие. Арена соберёт подготовку и разошлёт её выбранной команде."}</p></div><button type="button" className="business-icon-button" onClick={onCancel} aria-label="Закрыть"><Icon name="x"/></button></header>
    {!preview ? <>
      <div className="business-episode-create-grid">
        <label>Название<input autoFocus required value={form.title} onChange={event => set("title", event.target.value)} placeholder="Например, защита условий с ключевым клиентом" /></label>
        <label>Формат<select value={form.situation_type} onChange={event => set("situation_type", event.target.value)}>{Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="is-wide">Контекст события<EpisodeTextarea required value={form.brief} onChange={event => set("brief", event.target.value)} placeholder="Что происходит, почему разговор важен и что команде нужно учесть?" /></label>
        <label className="is-wide">Ожидаемый результат<EpisodeTextarea value={form.expected_result} onChange={event => set("expected_result", event.target.value)} placeholder="К какому решению или следующему шагу нужно прийти?" /></label>
        <label>Дата события<input type="datetime-local" value={form.scheduled_at} onChange={event => set("scheduled_at", event.target.value)} /></label>
        <label className="business-preparation-call-toggle"><input type="checkbox" checked={form.test_call_enabled} onChange={event => set("test_call_enabled", event.target.checked)} /><span><b>Добавить тестовый созвон</b><small>Встреча появится в календаре команды.</small></span></label>
        {form.test_call_enabled && <><label>Когда созвон<input required type="datetime-local" value={form.test_call_at} onChange={event => set("test_call_at", event.target.value)} /></label><label>Длительность<select value={form.test_call_duration} onChange={event => set("test_call_duration", Number(event.target.value))}>{[15, 30, 45, 60].map(value => <option key={value} value={value}>{value} мин.</option>)}</select></label></>}
      </div>
      <fieldset className="business-episode-participants business-preparation-team"><legend>Команда</legend><p>Выберите сотрудников, которым нужна подготовка. Вы автоматически участвуете как руководитель.</p><label className="business-episode-participant-search"><Icon name="search" size={17}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти сотрудника" /></label><div>{people.length ? people.map(person => <label key={person.membership_id}><input type="checkbox" checked={form.participant_ids.includes(person.membership_id)} onChange={() => toggle(person.membership_id)} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>) : <p>Сотрудников по этому запросу нет.</p>}</div></fieldset>
    </> : <section className="business-preparation-preview" aria-live="polite"><div className="business-preparation-preview-summary"><b>{preview.participant_count}</b><span>участников получат подготовку</span></div>{preview.plan.generated_by === "ai_recommendation" && <p className="business-preparation-ai-note"><Icon name="sparkles" size={15}/>ИИ уточнил формулировки плана. Состав заданий и сроки проверены Arena.</p>}<div>{preview.plan.items.map(item => <article key={item.key}><span><Icon name={item.kind === "AI_PRACTICE" ? "message-circle" : "book-open"} size={19}/></span><div><b>{item.title}</b><p>{item.description}</p>{item.deadline && <small>До {formatDate(item.deadline)}</small>}</div></article>)}</div>{preview.plan.meeting && <article className="business-preparation-preview-meeting"><span><Icon name="calendar-days" size={19}/></span><div><b>{preview.plan.meeting.title}</b><p>{preview.plan.meeting.scheduled_at ? formatDate(preview.plan.meeting.scheduled_at) : "Время будет назначено позже"}</p></div></article>}</section>}
    {error && <p className="business-alert" role="alert">{error}</p>}
    <footer><button type="button" className="subtle-button" onClick={onCancel}>Отмена</button>{preview && <button type="button" className="subtle-button" onClick={() => onPreview(null)}>Изменить</button>}<button className="primary-button" disabled={busy}>{busy ? "Подготавливаем…" : preview ? "Запустить подготовку" : "Собрать подготовку"} <Icon name="arrow-right" size={17}/></button></footer>
  </form>;
}

function EpisodeRow({ episode, selected, onSelect }) {
  const openCommitments = (episode.commitments || []).filter(item => item.status !== "VERIFIED").length;
  return <button type="button" className={`business-episode-row${selected ? " is-selected" : ""}`} onClick={onSelect} aria-current={selected ? "page" : undefined}>
    <span className="business-episode-row-copy"><b>{episode.title}</b><small>{types[episode.situation_type] || "Рабочая ситуация"}</small></span>
    <span className="business-episode-row-meta"><em>{episodeStatusLabel(episode.status)}</em>{openCommitments > 0 && <i>{openCommitments}</i>}</span>
  </button>;
}

function EpisodeParticipants({ episode, directory, busy, onInvite }) {
  const [membershipId, setMembershipId] = useState("");
  const [query, setQuery] = useState("");
  const participantIds = new Set((episode.participants || []).map(item => item.membership_id));
  const participantIdsKey = [...participantIds].join(",");
  useEffect(() => { setMembershipId(""); setQuery(""); }, [episode.id, participantIdsKey]);
  if (episode.visibility === "PRIVATE") return null;
  const available = directory.filter(person => !participantIds.has(person.membership_id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingPeople = available.filter(person => [person.name, person.job_title, person.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery));
  const selectedPerson = available.find(person => person.membership_id === Number(membershipId));
  return <section className="business-episode-related business-episode-members">
    <header><h3>Участники</h3></header>
    <div className="business-episode-member-list">{(episode.participants || []).map(person => <div key={person.membership_id}><span><b>{person.name}</b><small>{person.role === "OWNER" ? "Создатель" : "Участник"}</small></span><em>{person.role === "OWNER" ? "Владелец" : "Участник"}</em></div>)}</div>
    {available.length > 0 && episode.source_type !== "PREPARATION_PLAN" && <form className="business-episode-participant-search" onSubmit={event => { event.preventDefault(); if (membershipId) onInvite(episode, Number(membershipId)); }}><label><span className="sr-only">Найти сотрудника</span><Icon name="search" size={17}/><input type="search" value={query} onChange={event => { setQuery(event.target.value); setMembershipId(""); }} placeholder="Найти сотрудника" autoComplete="off" /></label>{matchingPeople.length ? <div className="business-episode-participant-options">{matchingPeople.slice(0, 6).map(person => <button key={person.membership_id} type="button" aria-pressed={Number(membershipId) === person.membership_id} onClick={() => setMembershipId(String(person.membership_id))}><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span>{Number(membershipId) === person.membership_id && <Icon name="check" size={16}/>}</button>)}</div> : <p>Сотрудников по этому запросу нет.</p>}<footer>{selectedPerson ? <span>Выбран: {selectedPerson.name}</span> : <span>Выберите сотрудника из списка.</span>}<button type="submit" className="subtle-button" disabled={!membershipId || busy}>Пригласить <Icon name="plus" size={15}/></button></footer></form>}
  </section>;
}

function EpisodeCompletedSummary({ episode }) {
  const description = episode.brief || episode.preparation?.facts || episode.preparation?.goal || episode.expected_result || "Описание не заполнено.";
  const result = episode.retrospective?.outcome || episode.retrospective?.next_step || "Итог ещё не зафиксирован.";
  return <section className="business-episode-completed-summary" aria-label="Итог ситуации">
    <div><h3>Краткое описание</h3><p>{description}</p></div>
    <div><h3>Участники</h3>{episode.participants?.length ? <ul>{episode.participants.map(person => <li key={person.membership_id}>{person.name}</li>)}</ul> : <p>Участники не указаны.</p>}</div>
    <div><h3>Результат</h3><p>{result}</p></div>
  </section>;
}

function PreparationPlanDetail({ episode, directory, busy, onMeetings, onInvite }) {
  const completed = completedEpisodeStates.has(episode.status);
  const progress = episode.progress || {};
  const personalProgress = episode.access === "full" ? progress.percent : (progress.own_percent ?? progress.percent);
  if (completed) return <article className="business-episode-detail"><header className="business-episode-detail-head"><div><span>Рабочая ситуация</span><h2>{episode.title}</h2></div><em>Завершена</em></header><EpisodeCompletedSummary episode={episode}/></article>;
  return <article className="business-episode-detail business-preparation-detail">
    <header className="business-episode-detail-head"><div><span>Рабочая ситуация</span><h2>{episode.title}</h2><p>{episode.expected_result || "Подготовка команды к важному разговору."}</p></div><em>Активна</em></header>
    <dl className="business-episode-facts"><div><dt>Дата события</dt><dd>{episode.scheduled_at ? formatDate(episode.scheduled_at) : "Не назначена"}</dd></div><div><dt>Команда</dt><dd>{episode.participant_count} чел.</dd></div><div><dt>Подготовка</dt><dd>{personalProgress ?? 0}%</dd></div></dl>
    <section className="business-preparation-brief"><h3>Контекст</h3><p>{episode.brief || "Контекст не указан."}</p></section>
    <section className="business-preparation-progress"><header><div><h3>{episode.access === "full" ? "Ход подготовки команды" : "Моя подготовка"}</h3><p>{episode.access === "full" ? `${progress.completed || 0} из ${progress.required || 0} назначений выполнено` : `${progress.own_completed || 0} из ${progress.own_required || 0} назначений выполнено`}</p></div><b>{personalProgress ?? 0}%</b></header><i style={{ "--progress": `${personalProgress ?? 0}%` }} /></section>
    <section className="business-preparation-plan"><header><h3>Что назначено</h3><p>Сценарий проходится в удобное время; репетиция помогает подготовиться к событию.</p></header><div>{episode.plan?.items?.map(item => <article key={item.key}><span><Icon name={item.kind === "AI_PRACTICE" ? "message-circle" : "book-open"} size={18}/></span><div><b>{item.title}</b><small>{item.kind === "SCENARIO" ? "Без времени в календаре" : item.deadline ? `До ${formatDate(item.deadline)}` : "Практика с ИИ"}</small></div></article>)}</div></section>
    {episode.meetings?.length > 0 && <section className="business-preparation-meetings"><header><h3>Тестовый созвон</h3><button type="button" className="subtle-button" onClick={() => onMeetings(episode.id)}>Открыть</button></header>{episode.meetings.map(meeting => <button key={meeting.id} type="button" onClick={() => onMeetings(episode.id)}><span><b>{meeting.title}</b><small>{meeting.scheduled_at ? formatDate(meeting.scheduled_at) : "Время будет назначено позже"}</small></span><Icon name="arrow-right" size={17}/></button>)}</section>}
    {episode.access === "full" && <EpisodeParticipants episode={episode} directory={directory} busy={busy} onInvite={onInvite}/>}
  </article>;
}

function EpisodeDetail({ episode, assignments, directory, busy, onSave, onState, onCommitment, onMeetings, onStartPractice, onComplete, onInvite }) {
  const [draft, setDraft] = useState({});
  useEffect(() => setDraft({
    expected_result: episode?.expected_result || "", practice_target_id: episode?.practice?.target_id || "",
    ...(episode?.preparation || {}), ...(episode?.retrospective || {}),
  }), [episode?.id, episode?.updated_at]);
  if (!episode) return <div className="business-episode-detail-empty"><Icon name="target" size={24}/><p>Выберите эпизод слева.</p></div>;
  if (episode.source_type === "PREPARATION_PLAN") return <PreparationPlanDetail episode={episode} directory={directory} busy={busy} onMeetings={onMeetings} onInvite={onInvite}/>;
  const full = episode.access === "full";
  const canEdit = Boolean(episode.can_edit);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const practice = episode.practice;
  const practices = assignments.filter(item => !closedAssignmentStates.has(item.status));
  const nextAction = canEdit && episode.status === "PREPARING" ? ["READY", "Сохранить и продолжить"] : null;
  const canClose = canEdit && episode.status === "ACTIVE";
  const isCompleted = completedEpisodeStates.has(episode.status);
  return <article className="business-episode-detail">
    <header className="business-episode-detail-head"><div><h2>{episode.title}</h2>{!isCompleted && episode.expected_result && <p>{episode.expected_result}</p>}</div><em>{episodeStatusLabel(episode.status)}</em></header>
    {!isCompleted && <dl className="business-episode-facts"><div><dt>Когда</dt><dd>{episode.scheduled_at ? formatDate(episode.scheduled_at) : "Не назначено"}</dd></div><div><dt>Участники</dt><dd>{episode.participant_count}</dd></div><div><dt>Доступ</dt><dd>{visibility[episode.visibility]}</dd></div></dl>}
    {isCompleted ? <EpisodeCompletedSummary episode={episode}/> : <>
    {full && <section className="business-episode-preparation"><header><h3>Подготовка</h3></header><label className="business-episode-result">Ожидаемый результат<textarea disabled={!canEdit} value={draft.expected_result || ""} onChange={event => update("expected_result", event.target.value)} placeholder="Что должно измениться после разговора?" /></label><div>{prepFields.map(([key, label]) => <label key={key}>{label}<textarea disabled={!canEdit} value={draft[key] || ""} onChange={event => update(key, event.target.value)} placeholder="Кратко" /></label>)}</div>{canEdit && <footer><button type="button" className="subtle-button" disabled={busy} onClick={() => onSave(episode, draft)}>Сохранить</button>{nextAction && <button type="button" className="primary-button" disabled={busy} onClick={() => onState(episode, nextAction[0])}>{nextAction[1]} <Icon name="arrow-right" size={17}/></button>}{episode.status === "READY" && <><button type="button" className="subtle-button" disabled={busy} onClick={() => onState(episode, "ACTIVE")}>Без встречи</button><button type="button" className="primary-button" onClick={() => onMeetings(episode.id)}>Создать встречу <Icon name="arrow-right" size={17}/></button></>}</footer>}</section>}
    {!full && <p className="business-episode-summary-note"><Icon name="lock" size={16}/>Подготовка владельца скрыта.</p>}
    {full && <EpisodeParticipants episode={episode} directory={directory} busy={busy} onInvite={onInvite}/>}
    {full && <section className="business-episode-related business-episode-practice"><header><h3>Репетиция</h3></header>{practice ? <div><span><b>{practice.title}</b><small>{statusLabels[practice.status] || practice.status}{practice.deadline ? ` · до ${formatDate(practice.deadline)}` : ""}</small></span>{!closedAssignmentStates.has(practice.status) && <button type="button" className="subtle-button" onClick={() => onStartPractice(practice.target_id)}>{practice.status === "IN_PROGRESS" ? "Продолжить" : "Начать"}</button>}</div> : canEdit && practices.length ? <label className="business-episode-practice-picker">Связать практику<select value={draft.practice_target_id || ""} onChange={event => update("practice_target_id", event.target.value)}><option value="">Не выбрана</option>{practices.map(item => <option key={item.target_id} value={item.target_id}>{item.title}</option>)}</select><button type="button" className="subtle-button" disabled={busy} onClick={() => onSave(episode, draft)}>Сохранить</button></label> : <p>Нет связанной репетиции.</p>}</section>}
    <section className="business-episode-related"><header><h3>Встречи</h3>{full && <button type="button" className="subtle-button" onClick={() => onMeetings(episode.id)}>Открыть</button>}</header>{episode.meetings?.length ? <div>{episode.meetings.map(meeting => full || episode.access === "participant" ? <button type="button" key={meeting.id} onClick={() => onMeetings(episode.id)}><span><b>{meeting.title}</b><small>{meeting.scheduled_at ? formatDate(meeting.scheduled_at) : "Без даты"}</small></span><em>{states[meeting.status] || meeting.status}</em></button> : <div key={meeting.id} className="business-episode-meeting-row"><span><b>{meeting.title}</b><small>{meeting.scheduled_at ? formatDate(meeting.scheduled_at) : "Без даты"}</small></span><em>{states[meeting.status] || meeting.status}</em></div>)}</div> : <p>Встреч пока нет.</p>}</section>
    <section className="business-episode-related"><header><h3>Обязательства</h3></header>{episode.commitments?.length ? <div>{episode.commitments.map(item => <div key={item.id} className={`business-episode-commitment is-${item.status.toLowerCase()}`}><span><b>{item.title}</b><small>{item.owner_name || "Исполнитель не назначен"}{item.due_at ? ` · до ${formatDate(item.due_at)}` : ""}{item.blocker_note ? ` · ${item.blocker_note}` : ""}</small></span>{item.is_mine && item.status === "PENDING" && <span className="business-episode-commitment-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => onCommitment(episode, item, "ACCEPTED")}>Принять</button></span>}{item.is_mine && item.status === "ACCEPTED" && <span className="business-episode-commitment-actions"><button type="button" className="subtle-button" disabled={busy} onClick={() => onCommitment(episode, item, "IN_PROGRESS")}>Начать</button><button type="button" className="primary-button" disabled={busy} onClick={() => onCommitment(episode, item, "COMPLETED")}>Готово</button></span>}{item.is_mine && item.status === "IN_PROGRESS" && <span className="business-episode-commitment-actions"><button type="button" className="subtle-button" disabled={busy} onClick={() => onCommitment(episode, item, "BLOCKED", "Нужна помощь")}>Нужна помощь</button><button type="button" className="primary-button" disabled={busy} onClick={() => onCommitment(episode, item, "COMPLETED")}>Готово</button></span>}{item.is_mine && item.status === "BLOCKED" && <span className="business-episode-commitment-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => onCommitment(episode, item, "IN_PROGRESS")}>Продолжить</button></span>}{item.can_verify && <span className="business-episode-commitment-actions"><button type="button" className="subtle-button" disabled={busy} onClick={() => onCommitment(episode, item, "IN_PROGRESS")}>Вернуть</button><button type="button" className="primary-button" disabled={busy} onClick={() => onCommitment(episode, item, "VERIFIED")}>Подтвердить</button></span>}<em>{commitmentStates[item.status] || item.status}</em></div>)}</div> : <p>Обязательств пока нет.</p>}</section>
    {full && (episode.meetings?.length || ["ACTIVE", "COMPLETED"].includes(episode.status)) && <section className="business-episode-retrospective"><header><h3>Итог</h3>{episode.status === "COMPLETED" && <em>Завершён</em>}</header>{retrospectiveFields.map(([key, label]) => <label key={key}>{label}<textarea disabled={!canEdit || episode.status === "COMPLETED"} value={draft[key] || ""} onChange={event => update(key, event.target.value)} placeholder="Кратко" /></label>)}{canEdit && episode.status !== "COMPLETED" && <footer><button type="button" className="subtle-button" disabled={busy} onClick={() => onSave(episode, draft)}>Сохранить</button>{canClose && <button type="button" className="primary-button" disabled={busy} onClick={() => onComplete(episode, draft)}>Завершить <Icon name="check" size={17}/></button>}</footer>}</section>}
    </>}
  </article>;
}

export default function WorkEpisodes({ data, start }) {
  const companyId = data.company.id;
  const canCreate = Boolean(data.permissions?.manage_team) && workSituationManagerRoles.has(data.membership?.role);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEpisodeId = searchParams.get("episode");
  const assignments = data.assignments || [];
  const [episodes, setEpisodes] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [episodeFilter, setEpisodeFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(() => canCreate && searchParams.get("create") === "1");
  const [planPreview, setPlanPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(preferred) {
    setLoading(true);
    try {
      const value = await api(`/api/company/${companyId}/episodes`);
      const requested = Number(requestedEpisodeId);
      setEpisodes(value);
      setSelectedId(current => preferred || (Number.isInteger(requested) && value.some(item => item.id === requested) ? requested : value.some(item => item.id === current) ? current : value[0]?.id || null));
    } catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [companyId, requestedEpisodeId]);
  useEffect(() => { if (canCreate && searchParams.get("create") === "1") setShowCreate(true); }, [canCreate, searchParams]);
  useEffect(() => {
    if (!canCreate) { setDirectory([]); return undefined; }
    let current = true;
    api(`/api/company/${companyId}/employees`).then(value => { if (current) setDirectory(value.filter(person => person.membership_id !== data.membership?.id)); }).catch(() => { if (current) setDirectory([]); });
    return () => { current = false; };
  }, [canCreate, companyId, data.membership?.id]);
  const visibleEpisodes = episodes.filter(item => episodeFilter === "ACTIVE" ? !completedEpisodeStates.has(item.status) : completedEpisodeStates.has(item.status));
  useEffect(() => {
    setSelectedId(current => visibleEpisodes.some(item => item.id === current) ? current : visibleEpisodes[0]?.id || null);
  }, [episodeFilter, episodes]);
  const selected = visibleEpisodes.find(item => item.id === selectedId) || null;
  async function create(payload) { setBusy(true); setError(""); try { const created = await api(`/api/company/${companyId}/episodes`, { method: "POST", body: payload }); setPlanPreview(null); setShowCreate(false); navigate(`${businessPath(companyId, "episodes")}?episode=${created.id}`, { replace: true }); await load(created.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function previewPlan(payload) { if (payload === null) { setPlanPreview(null); return; } setBusy(true); setError(""); try { const response = await api(`/api/company/${companyId}/episodes/plan-preview`, { method: "POST", body: payload }); setPlanPreview(response); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  function closeCreate() { setShowCreate(false); setPlanPreview(null); setError(""); if (searchParams.get("create") === "1") setSearchParams({}, { replace: true }); }
  async function save(episode, draft) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}`, { method: "PUT", body: { expected_result: draft.expected_result, practice_target_id: draft.practice_target_id ? Number(draft.practice_target_id) : null, preparation: Object.fromEntries(prepFields.map(([key]) => [key, draft[key] || ""])), retrospective: Object.fromEntries(retrospectiveFields.map(([key]) => [key, draft[key] || ""])) } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function updateState(episode, status) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/status`, { method: "POST", body: { status } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function updateCommitment(episode, item, status, blocker_note = "") { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/commitments/${item.id}`, { method: "PATCH", body: { status, blocker_note } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function invite(episode, membershipId) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/participants`, { method: "POST", body: { membership_id: membershipId } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function complete(episode, draft) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}`, { method: "PUT", body: { retrospective: Object.fromEntries(retrospectiveFields.map(([key]) => [key, draft[key] || ""])) } }); await api(`/api/company/${companyId}/episodes/${episode.id}/status`, { method: "POST", body: { status: "COMPLETED" } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  const goToMeetings = episodeId => navigate(`${businessPath(companyId, "meetings")}?episode=${episodeId}`);
  function selectEpisode(episodeId) {
    setSelectedId(episodeId);
    if (window.matchMedia("(max-width: 800px)").matches) window.requestAnimationFrame(() => document.querySelector(".business-episode-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  if (loading && !episodes.length) return <Loader error={error} onRetry={() => load()}/>;
  return <section className="business-episodes" aria-live="polite">
    {showCreate && canCreate ? <PreparationPlanCreate directory={directory} busy={busy} error={error} preview={planPreview} onCancel={closeCreate} onPreview={previewPlan} onCreate={create}/> : episodes.length ? <div className="business-episodes-layout"><aside className="business-episode-list" aria-label="Список рабочих ситуаций"><header><h2>Ситуации</h2><span>{visibleEpisodes.length}</span></header><nav className="business-episode-filter" aria-label="Фильтр ситуаций">{episodeFilters.map(([id, label]) => <button key={id} type="button" aria-pressed={episodeFilter === id} onClick={() => setEpisodeFilter(id)}>{label}</button>)}</nav><div>{visibleEpisodes.length ? visibleEpisodes.map(item => <EpisodeRow key={item.id} episode={item} selected={item.id === selectedId} onSelect={() => selectEpisode(item.id)} />) : <p className="business-episode-list-empty">В этой подборке пока нет ситуаций.</p>}</div></aside><EpisodeDetail episode={selected} assignments={assignments} directory={directory} busy={busy} onSave={save} onState={updateState} onCommitment={updateCommitment} onMeetings={goToMeetings} onStartPractice={start} onComplete={complete} onInvite={invite}/></div> : <EmptyEpisode canCreate={canCreate} onCreate={() => setShowCreate(true)}/>} {error && !showCreate && <p className="business-alert" role="alert">{error}</p>}
  </section>;
}
