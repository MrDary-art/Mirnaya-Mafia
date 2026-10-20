import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { businessPath } from "../business/navigation.js";
import { Loader, formatDate } from "./shared.jsx";

const completedEpisodeStates = new Set(["COMPLETED", "CANCELLED", "ARCHIVED"]);
const workSituationManagerRoles = new Set(["COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER", "DEPARTMENT_MANAGER", "TEAM_LEAD"]);
const episodeFilters = [
  ["ACTIVE", "Активные"],
  ["COMPLETED", "Завершённые"],
];
const episodeDeadlineLabel = value => value
  ? `До ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value))}`
  : "Срок не указан";
const episodeDateValue = value => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};
const sortEpisodesByDeadline = (left, right) => {
  const leftDate = episodeDateValue(left.scheduled_at);
  const rightDate = episodeDateValue(right.scheduled_at);
  if (leftDate !== rightDate) return leftDate - rightDate;
  return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime();
};
const calendarWeekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dateTimeValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const readDateTime = value => {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) : null;
};
const sameCalendarDay = (left, right) => Boolean(left && right) && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
const peopleCountLabel = value => {
  const count = Number(value) || 0;
  const remainder = Math.abs(count) % 100;
  const lastDigit = Math.abs(count) % 10;
  const word = remainder >= 11 && remainder <= 14 ? "человек" : lastDigit === 1 ? "человек" : lastDigit >= 2 && lastDigit <= 4 ? "человека" : "человек";
  return `${count} ${word}`;
};

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
    <p>{canCreate ? "Создайте ситуацию для своей команды — добавьте контекст, участников и дату события." : "Когда руководитель добавит вас в рабочую ситуацию, она появится здесь."}</p>
    {canCreate && <button type="button" className="primary-button" onClick={onCreate}>Создать ситуацию <Icon name="plus" size={17}/></button>}
  </section>;
}

function DateTimeField({ label, value, onChange, required = false }) {
  const root = useRef(null);
  const initial = readDateTime(value);
  const [isOpen, setIsOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(initial?.getFullYear() ?? new Date().getFullYear(), initial?.getMonth() ?? new Date().getMonth(), 1));
  const selected = readDateTime(value);
  const labelId = `business-date-${label.toLocaleLowerCase().replace(/\s+/g, "-")}`;
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(cursor);
  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const calendarDays = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => index < firstWeekday || index >= firstWeekday + daysInMonth ? null : new Date(cursor.getFullYear(), cursor.getMonth(), index - firstWeekday + 1));
  const emit = next => onChange({ target: { value: dateTimeValue(next) } });
  const updateDate = day => {
    const source = selected || new Date();
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), selected ? source.getHours() : 9, selected ? source.getMinutes() : 0);
    emit(next);
  };
  const updateTime = (unit, nextValue) => {
    const source = selected || new Date(cursor.getFullYear(), cursor.getMonth(), 1, 9, 0);
    const next = new Date(source);
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
  return <div className="business-date-field" ref={root}><span id={labelId}>{label}</span><div className="business-date-picker"><button type="button" className="business-date-trigger" aria-labelledby={labelId} aria-haspopup="dialog" aria-expanded={isOpen} aria-required={required || undefined} onClick={() => setIsOpen(open => !open)}><span>{selected ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(selected) : "Выберите дату и время"}</span><Icon name="calendar-days" size={18}/></button>{isOpen && <div className="business-calendar-popover" role="dialog" aria-label={`${label}: выбор даты и времени`}><header><button type="button" aria-label="Предыдущий месяц" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Icon name="arrow-left" size={17}/></button><b>{monthName}</b><button type="button" aria-label="Следующий месяц" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><Icon name="arrow-right" size={17}/></button></header><div className="business-calendar-weekdays">{calendarWeekdays.map(day => <span key={day}>{day}</span>)}</div><div className="business-calendar-days">{calendarDays.map((day, index) => day ? <button key={day.toISOString()} type="button" className={sameCalendarDay(day, selected) ? "is-selected" : sameCalendarDay(day, new Date()) ? "is-today" : ""} onClick={() => updateDate(day)}>{day.getDate()}</button> : <span key={`empty-${index}`} />)}</div><div className="business-calendar-time"><Icon name="clock" size={16}/><span>Время</span><select aria-label="Час" value={selected ? String(selected.getHours()).padStart(2, "0") : "09"} onChange={event => updateTime("hours", event.target.value)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={String(hour).padStart(2, "0")}>{String(hour).padStart(2, "0")}</option>)}</select><i>:</i><select aria-label="Минуты" value={selected ? String(selected.getMinutes()).padStart(2, "0") : "00"} onChange={event => updateTime("minutes", event.target.value)}>{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={String(minute).padStart(2, "0")}>{String(minute).padStart(2, "0")}</option>)}</select></div></div>}</div></div>;
}

function PreparationPlanCreate({ directory, directoryLoading, directoryError, onRetryDirectory, busy, error, preview, onCancel, onPreview, onCreate }) {
  const [form, setForm] = useState({ title: "", situation_type: "NEGOTIATION", brief: "", expected_result: "", scheduled_at: "", participant_ids: [], test_call_enabled: false, test_call_at: "", test_call_duration: 30 });
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (directoryLoading || directoryError) return;
    const availableIds = new Set(directory.map(person => person.membership_id));
    if (form.participant_ids.some(id => !availableIds.has(id))) {
      setForm(current => ({ ...current, participant_ids: current.participant_ids.filter(id => availableIds.has(id)) }));
      if (preview) onPreview(null);
    }
  }, [directory, directoryLoading, directoryError, form.participant_ids, preview, onPreview]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const toggle = membershipId => setForm(current => ({ ...current, participant_ids: current.participant_ids.includes(membershipId) ? current.participant_ids.filter(id => id !== membershipId) : [...current.participant_ids, membershipId] }));
  const setParticipants = (membershipIds, selected) => setForm(current => {
    const next = new Set(current.participant_ids);
    membershipIds.forEach(id => selected ? next.add(id) : next.delete(id));
    return { ...current, participant_ids: [...next] };
  });
  const people = directory.filter(person => [person.name, person.job_title, person.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectedIds = new Set(form.participant_ids);
  const selectedVisibleCount = people.filter(person => selectedIds.has(person.membership_id)).length;
  const allVisibleSelected = people.length > 0 && selectedVisibleCount === people.length;
  const departmentGroups = Object.values(directory.reduce((groups, person) => {
    const key = person.department_id ? `department-${person.department_id}` : "without-department";
    if (!groups[key]) groups[key] = { key, name: person.department || "Без подразделения", people: [] };
    groups[key].people.push(person);
    return groups;
  }, {}));
  const payload = () => ({ ...form, visibility: "PARTICIPANTS", create_preparation_plan: true,
    scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    test_call_at: form.test_call_enabled && form.test_call_at ? new Date(form.test_call_at).toISOString() : null });
  const submit = event => { event.preventDefault(); preview ? onCreate(payload()) : onPreview(payload()); };
  return <form className="business-episode-create business-preparation-create" onSubmit={submit}>
    <header><div><h2>{preview ? "План подготовки готов" : "Создать рабочую ситуацию"}</h2><p>{preview ? "Проверьте состав — после запуска команда сразу получит назначения." : "Опишите реальное событие. Арена соберёт подготовку и разошлёт её выбранной команде."}</p></div><button type="button" className="business-icon-button" onClick={onCancel} aria-label="Закрыть"><Icon name="x"/></button></header>
    {!preview ? <>
      <div className="business-episode-create-grid">
        <label className="is-wide">Название<input autoFocus required value={form.title} onChange={event => set("title", event.target.value)} placeholder="Например, защита условий с ключевым клиентом" /></label>
        <label className="is-wide">Контекст события<EpisodeTextarea required value={form.brief} onChange={event => set("brief", event.target.value)} placeholder="Что происходит, почему разговор важен и что команде нужно учесть?" /></label>
        <label className="is-wide">Ожидаемый результат<EpisodeTextarea value={form.expected_result} onChange={event => set("expected_result", event.target.value)} placeholder="К какому решению или следующему шагу нужно прийти?" /></label>
        <DateTimeField label="Дата события" value={form.scheduled_at} onChange={event => set("scheduled_at", event.target.value)} />
        <label className="business-preparation-call-toggle"><input type="checkbox" checked={form.test_call_enabled} onChange={event => set("test_call_enabled", event.target.checked)} /><span><b>Добавить тестовый созвон</b><small>Групповой звонок пройдёт в Совете решений; черновик отчёта проверит руководитель.</small></span></label>
        {form.test_call_enabled && <DateTimeField label="Дата встречи" required value={form.test_call_at} onChange={event => set("test_call_at", event.target.value)} />}
      </div>
      <fieldset className="business-episode-participants business-preparation-team"><legend>Команда</legend><p>Выберите сотрудников, которым нужна подготовка. Вы автоматически участвуете как руководитель.</p><label className="business-episode-participant-search"><Icon name="search" size={17}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти сотрудника" /></label><div className="business-preparation-team-actions"><p aria-live="polite">Выбрано: <b>{form.participant_ids.length}</b></p><div>{people.length > 0 && <button type="button" className="subtle-button" onClick={() => setParticipants(people.map(person => person.membership_id), !allVisibleSelected)}>{allVisibleSelected ? "Снять выбор в списке" : "Выбрать всех в списке"}</button>}{form.participant_ids.length > 0 && <button type="button" className="business-preparation-team-clear" onClick={() => setParticipants(form.participant_ids, false)}>Очистить</button>}</div></div>{departmentGroups.length > 1 && <div className="business-preparation-departments" aria-label="Выбрать подразделение">{departmentGroups.map(group => { const memberIds = group.people.map(person => person.membership_id); const selectedCount = memberIds.filter(id => selectedIds.has(id)).length; const allSelected = selectedCount === memberIds.length; return <button key={group.key} type="button" aria-pressed={allSelected} onClick={() => setParticipants(memberIds, !allSelected)}><span>{group.name}</span><small>{selectedCount}/{memberIds.length}</small></button>; })}</div>}<div className="business-preparation-team-list" aria-busy={directoryLoading}>{directoryLoading ? <div className="business-directory-message" role="status"><span>Загружаем доступных сотрудников…</span></div> : directoryError ? <div className="business-directory-message" role="alert"><span>Не удалось загрузить сотрудников.</span><button type="button" className="subtle-button" onClick={onRetryDirectory}>Повторить</button></div> : people.length ? people.map(person => <label key={person.membership_id}><input type="checkbox" checked={selectedIds.has(person.membership_id)} onChange={() => toggle(person.membership_id)} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>) : <div className="business-directory-message"><span>{query.trim() ? "Сотрудников по этому запросу нет." : "В вашей области пока нет доступных сотрудников."}</span></div>}</div>{form.participant_ids.length === 0 && !directoryLoading && !directoryError && directory.length > 0 && <p className="business-preparation-team-hint">Выберите хотя бы одного сотрудника, чтобы собрать подготовку.</p>}</fieldset>
    </> : <section className="business-preparation-preview" aria-live="polite"><div className="business-preparation-preview-summary"><b>{preview.participant_count}</b><span>участников получат подготовку</span></div><p className="business-preparation-ai-note"><Icon name={preview.plan.generated_by === "ai_recommendation" ? "sparkles" : "info"} size={15}/>{preview.plan.generated_by === "ai_recommendation" ? "ИИ уточнил план и подобрал подходящий сценарий из каталога, если нашёл соответствие." : "План собран офлайн по типу ситуации. ИИ для подбора сейчас не использовался."}</p><div>{preview.plan.items.map(item => <article key={item.key}><span><Icon name={item.kind === "AI_PRACTICE" ? "message-circle" : "book-open"} size={19}/></span><div><b>{item.title}</b><p>{item.description}</p>{item.deadline && <small>До {formatDate(item.deadline)}</small>}</div></article>)}</div>{preview.plan.meeting && <article className="business-preparation-preview-meeting"><span><Icon name="calendar-days" size={19}/></span><div><b>{preview.plan.meeting.title}</b><p>{preview.plan.meeting.scheduled_at ? formatDate(preview.plan.meeting.scheduled_at) : "Время будет назначено позже"}</p></div></article>}</section>}
    {error && <p className="business-alert" role="alert">{error}</p>}
    {form.test_call_enabled && form.participant_ids.length > 7 && <p className="business-preparation-team-hint" role="status">Для тестового созвона выберите не больше 7 сотрудников. Назначения можно выдать большой команде отдельно.</p>}
    <footer><button type="button" className="subtle-button" onClick={onCancel}>Отмена</button>{preview && <button type="button" className="subtle-button" onClick={() => onPreview(null)}>Изменить</button>}<button className="primary-button" disabled={busy || directoryLoading || directoryError || (!preview && (form.participant_ids.length === 0 || form.test_call_enabled && (!form.test_call_at || form.participant_ids.length > 7)))}>{busy ? "Подготавливаем…" : preview ? "Запустить подготовку" : "Собрать подготовку"} <Icon name="arrow-right" size={17}/></button></footer>
  </form>;
}

function EpisodeRow({ episode, selected, onSelect }) {
  return <button type="button" className={`business-episode-row${selected ? " is-selected" : ""}`} onClick={onSelect} aria-current={selected ? "page" : undefined}>
    <span className="business-episode-row-copy"><b>{episode.title}</b><small>{episodeDeadlineLabel(episode.scheduled_at)}</small></span>
  </button>;
}

function EpisodeParticipants({ episode, directory, directoryLoading, directoryError, onRetryDirectory, busy, onInvite, onRemove }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const participantIds = new Set((episode.participants || []).map(item => item.membership_id));
  const participantIdsKey = [...participantIds].join(",");
  useEffect(() => { setIsPickerOpen(false); setQuery(""); }, [episode.id, participantIdsKey]);
  const available = directory.filter(person => !participantIds.has(person.membership_id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingPeople = available.filter(person => [person.name, person.job_title, person.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery));
  const canManageParticipants = Boolean(episode.can_edit) && episode.visibility !== "PRIVATE";
  const canAdd = canManageParticipants && !directoryLoading && !directoryError && available.length > 0;
  const addPerson = async person => {
    const added = await onInvite(episode, person.membership_id);
    if (added) { setIsPickerOpen(false); setQuery(""); }
  };
  const removePerson = person => onRemove(episode, person.membership_id);
  return <section className="business-situation-people">
    <header><div><h3>Участники</h3><p>{peopleCountLabel(episode.participant_count)} в ситуации</p></div>{canAdd && <button type="button" className="business-episode-add-button" aria-label="Добавить участника" title="Добавить участника" aria-expanded={isPickerOpen} onClick={() => setIsPickerOpen(value => !value)}><span aria-hidden="true" /></button>}</header>
    <div className="business-situation-people-list">{(episode.participants || []).map(person => <div key={person.membership_id}><span><b>{person.name}</b><small>{person.role === "OWNER" ? "Создатель" : "Участник"}</small></span><span className="business-situation-person-actions"><em>{person.role === "OWNER" ? "Владелец" : "Участник"}</em>{canManageParticipants && person.role !== "OWNER" && <button type="button" className="business-situation-person-remove" disabled={busy} onClick={() => removePerson(person)} aria-label={`Удалить ${person.name} из ситуации`} title="Удалить участника"><Icon name="x" size={14}/></button>}</span></div>)}</div>
    {canManageParticipants && directoryLoading && <div className="business-directory-message" role="status"><span>Загружаем доступных сотрудников…</span></div>}
    {canManageParticipants && directoryError && <div className="business-directory-message" role="alert"><span>Не удалось загрузить доступных сотрудников.</span><button type="button" className="subtle-button" onClick={onRetryDirectory}>Повторить</button></div>}
    {canManageParticipants && !directoryLoading && !directoryError && !available.length && <div className="business-directory-message"><span>Все доступные сотрудники уже участвуют в ситуации.</span></div>}
    {isPickerOpen && !directoryLoading && !directoryError && <div className="business-situation-person-picker"><label><span className="sr-only">Найти сотрудника</span><Icon name="search" size={17}/><input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти сотрудника" autoComplete="off" /></label>{matchingPeople.length ? <div>{matchingPeople.slice(0, 6).map(person => <button key={person.membership_id} type="button" disabled={busy} onClick={() => addPerson(person)}><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span><span className="business-situation-person-picker-add" aria-hidden="true">Добавить</span></button>)}</div> : <p>Сотрудников по этому запросу нет.</p>}</div>}
  </section>;
}

function EpisodeCompletedSummary({ episode, assignments, onStart }) {
  const description = episode.brief || episode.preparation?.facts || episode.preparation?.goal || episode.expected_result || "Описание не заполнено.";
  const result = episode.retrospective?.outcome || episode.retrospective?.next_step || "Итог ещё не зафиксирован.";
  return <section className="business-episode-completed-summary" aria-label="Итог ситуации">
    <div><h3>Краткое описание</h3><p>{description}</p></div>
    <div><h3>Участники</h3>{episode.participants?.length ? <ul>{episode.participants.map(person => <li key={person.membership_id}>{person.name}</li>)}</ul> : <p>Участники не указаны.</p>}</div>
    <div><h3>Результат</h3><p>{result}</p></div>
    <EpisodePreparationPlan episode={episode} assignments={assignments} onStart={onStart}/>
  </section>;
}

function EpisodePreparationPlan({ episode, assignments, onStart }) {
  const items = episode.plan?.items || [];
  const [sourceOpen, setSourceOpen] = useState(false);
  if (!items.length) return null;
  const generatedByAI = episode.plan.generated_by === "ai_recommendation";
  const sourceLabel = generatedByAI ? "План уточнён ИИ" : "План подобран офлайн";
  return <section className="business-situation-plan" aria-label="План подготовки">
    <header><div><h3>Подготовка к ситуации</h3><p>Подобранные сценарии и практики сохраняются здесь после запуска. Личные назначения также доступны в разделе «Практика».</p></div><button type="button" className="business-situation-plan-ai" aria-expanded={sourceOpen} aria-label={`Подробнее: ${sourceLabel}`} onClick={() => setSourceOpen(value => !value)}><Icon name={generatedByAI ? "sparkles" : "info"} size={15}/><span>{sourceLabel}</span></button></header>
    {sourceOpen && <p className="business-situation-plan-source" role="status">{generatedByAI ? "Рекомендации уточнены ИИ на основе данных ситуации." : "План составлен по правилам сценария и не использует ИИ."}</p>}
    <div className="business-situation-plan-list">{items.map(item => {
      const assignment = assignments.find(entry => entry.id === item.assignment_id);
      return <article key={item.key || item.assignment_id}>
        <span className="business-situation-plan-icon"><Icon name={item.kind === "AI_PRACTICE" ? "message-circle" : "book-open"} size={19}/></span>
        <div><b>{item.title}</b><p>{item.description}</p><small>{item.kind === "AI_PRACTICE" ? "Практика с ИИ" : "Сценарий Арены"}{item.selected_by === "ai" ? " · Подобран ИИ" : ""}{item.deadline ? ` · До ${formatDate(item.deadline)}` : ""}</small></div>
        {assignment?.can_start && <button className="subtle-button" type="button" onClick={() => onStart(assignment.id)}>Начать <Icon name="arrow-right" size={16}/></button>}
        {assignment && !assignment.can_start && <span className="business-situation-plan-status">{["COMPLETED", "PASSED"].includes(assignment.status) ? "Пройдено" : assignment.status === "IN_PROGRESS" ? "В работе" : "Недоступно"}</span>}
      </article>;
    })}</div>
  </section>;
}

function EpisodeTestCall({ episode, onCreateCall, onOpenMeeting, canEdit }) {
  const meetings = episode.meetings || [];
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  useEffect(() => { setIsScheduling(false); setScheduledAt(""); }, [episode.id]);
  const scheduleCall = event => {
    event.preventDefault();
    if (scheduledAt) onCreateCall(episode.id, scheduledAt);
  };
  return <section className="business-situation-test-call">
    <header><div><h3>Тестовый созвон</h3><p>Команда обсуждает подготовку и фиксирует следующие шаги.</p></div>{canEdit && <button type="button" className="business-episode-add-button" aria-label="Добавить тестовый созвон" title="Добавить тестовый созвон" aria-expanded={isScheduling} onClick={() => setIsScheduling(value => !value)}><span aria-hidden="true" /></button>}</header>
    {isScheduling && <form className="business-situation-call-schedule" onSubmit={scheduleCall}><DateTimeField label="Дата и время" required value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /><div><button type="button" className="subtle-button" onClick={() => setIsScheduling(false)}>Отмена</button><button className="primary-button" disabled={!scheduledAt}>Продолжить <Icon name="arrow-right" size={16}/></button></div></form>}
    {meetings.length ? <div className="business-situation-call-list">{meetings.map(meeting => <button key={meeting.id} type="button" onClick={() => onOpenMeeting(meeting.id)}><span><b>{meeting.title}</b><time dateTime={meeting.scheduled_at || undefined}>{meeting.scheduled_at ? formatDate(meeting.scheduled_at) : "Время будет назначено позже"}</time></span><Icon name="arrow-right" size={17}/></button>)}</div> : <p className="business-situation-empty-note">Созвон пока не назначен.</p>}
  </section>;
}

function SituationDetail({ episode, assignments, onStart, directory, directoryLoading, directoryError, onRetryDirectory, busy, onCreateCall, onOpenMeeting, onInvite, onRemove }) {
  const completed = completedEpisodeStates.has(episode.status);
  if (completed) return <article className="business-episode-detail"><header className="business-episode-detail-head"><div><h2>{episode.title}</h2></div><em>Завершена</em></header><EpisodeCompletedSummary episode={episode} assignments={assignments} onStart={onStart}/></article>;
  const description = episode.brief || episode.preparation?.facts || "Описание ситуации не указано.";
  const goal = episode.expected_result || episode.preparation?.goal || "Цель пока не указана.";
  const canEdit = Boolean(episode.can_edit);
  return <article className="business-episode-detail business-situation-detail">
    <header className="business-episode-detail-head"><div><h2>{episode.title}</h2></div><em>Активна</em></header>
    <dl className="business-episode-facts business-situation-facts"><div><dt>Дата события</dt><dd>{episode.scheduled_at ? formatDate(episode.scheduled_at) : "Не назначена"}</dd></div><div><dt>Команда</dt><dd>{peopleCountLabel(episode.participant_count)}</dd></div></dl>
    <section className="business-situation-summary"><div><h3>Описание</h3><p>{description}</p></div><div><h3>Цель</h3><p>{goal}</p></div></section>
    <EpisodePreparationPlan episode={episode} assignments={assignments} onStart={onStart}/>
    <EpisodeTestCall episode={episode} onCreateCall={onCreateCall} onOpenMeeting={onOpenMeeting} canEdit={canEdit}/>
    {episode.access === "full" && <EpisodeParticipants episode={episode} directory={directory} directoryLoading={directoryLoading} directoryError={directoryError} onRetryDirectory={onRetryDirectory} busy={busy} onInvite={onInvite} onRemove={onRemove}/>}
  </article>;
}

function EpisodeDetail({ episode, assignments, onStart, directory, directoryLoading, directoryError, onRetryDirectory, busy, onCreateCall, onOpenMeeting, onInvite, onRemove }) {
  if (!episode) return <div className="business-episode-detail-empty"><Icon name="target" size={24}/><p>Выберите эпизод слева.</p></div>;
  return <SituationDetail episode={episode} assignments={assignments} onStart={onStart} directory={directory} directoryLoading={directoryLoading} directoryError={directoryError} onRetryDirectory={onRetryDirectory} busy={busy} onCreateCall={onCreateCall} onOpenMeeting={onOpenMeeting} onInvite={onInvite} onRemove={onRemove}/>;
}

export default function WorkEpisodes({ data, start, reload }) {
  const companyId = data.company.id;
  const canCreate = Boolean(data.permissions?.manage_team) && workSituationManagerRoles.has(data.membership?.role);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEpisodeId = searchParams.get("episode");
  const [episodes, setEpisodes] = useState([]);
  const [directoryState, setDirectoryState] = useState({ companyId: null, people: [], status: "loading" });
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const directory = directoryState.companyId === companyId ? directoryState.people : [];
  const directoryLoading = directoryState.companyId !== companyId || directoryState.status === "loading";
  const directoryError = directoryState.companyId === companyId && directoryState.status === "error";
  const retryDirectory = () => setDirectoryRetry(value => value + 1);
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
      const sorted = value.slice().sort(sortEpisodesByDeadline);
      const requested = Number(requestedEpisodeId);
      setEpisodes(sorted);
      setSelectedId(current => preferred || (Number.isInteger(requested) && sorted.some(item => item.id === requested) ? requested : sorted.some(item => item.id === current) ? current : sorted[0]?.id || null));
    } catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [companyId, requestedEpisodeId]);
  useEffect(() => { if (canCreate && searchParams.get("create") === "1") setShowCreate(true); }, [canCreate, searchParams]);
  useEffect(() => {
    if (!canCreate) { setDirectoryState({ companyId, people: [], status: "ready" }); return undefined; }
    let current = true;
    setDirectoryState({ companyId, people: [], status: "loading" });
    api(`/api/company/${companyId}/employees?active_only=true`)
      .then(value => { if (current) setDirectoryState({ companyId, people: value.filter(person => person.status === "ACTIVE" && person.membership_id !== data.membership?.id), status: "ready" }); })
      .catch(() => { if (current) setDirectoryState({ companyId, people: [], status: "error" }); });
    return () => { current = false; };
  }, [canCreate, companyId, data.membership?.id, directoryRetry]);
  const visibleEpisodes = episodes.filter(item => episodeFilter === "ACTIVE" ? !completedEpisodeStates.has(item.status) : completedEpisodeStates.has(item.status)).slice().sort(sortEpisodesByDeadline);
  useEffect(() => {
    setSelectedId(current => visibleEpisodes.some(item => item.id === current) ? current : visibleEpisodes[0]?.id || null);
  }, [episodeFilter, episodes]);
  const selected = visibleEpisodes.find(item => item.id === selectedId) || null;
  async function create(payload) { setBusy(true); setError(""); try { const created = await api(`/api/company/${companyId}/episodes`, { method: "POST", body: payload }); setPlanPreview(null); setShowCreate(false); navigate(`${businessPath(companyId, "episodes")}?episode=${created.id}`, { replace: true }); await Promise.all([load(created.id), reload?.()]); } catch (cause) { setError(cause.message); retryDirectory(); } finally { setBusy(false); } }
  async function previewPlan(payload) { if (payload === null) { setPlanPreview(null); return; } setBusy(true); setError(""); try { const response = await api(`/api/company/${companyId}/episodes/plan-preview`, { method: "POST", body: payload }); setPlanPreview(response); } catch (cause) { setError(cause.message); retryDirectory(); } finally { setBusy(false); } }
  function closeCreate() { setShowCreate(false); setPlanPreview(null); setError(""); if (searchParams.get("create") === "1") setSearchParams({}, { replace: true }); }
  async function invite(episode, membershipId) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/participants`, { method: "POST", body: { membership_id: membershipId } }); await load(episode.id); return true; } catch (cause) { setError(cause.message); retryDirectory(); return false; } finally { setBusy(false); } }
  async function removeParticipant(episode, membershipId) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/participants/${membershipId}`, { method: "DELETE" }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  const createTestCall = (episodeId, scheduledAt) => {
    const params = new URLSearchParams({ episode: String(episodeId), create: "1", kind: "PREPARATION_CALL" });
    if (scheduledAt) params.set("scheduled_at", scheduledAt);
    navigate(`${businessPath(companyId, "meetings")}?${params}`);
  };
  const openMeeting = meetingId => navigate(`${businessPath(companyId, "meetings")}?meeting=${meetingId}`);
  function selectEpisode(episodeId) {
    setSelectedId(episodeId);
    if (window.matchMedia("(max-width: 800px)").matches) window.requestAnimationFrame(() => document.querySelector(".business-episode-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function openCreate() {
    setPlanPreview(null);
    setError("");
    setShowCreate(true);
  }
  if (loading && !episodes.length) return <Loader error={error} onRetry={() => load()}/>;
  return <section className="business-episodes" aria-live="polite">
    {canCreate && !showCreate && episodes.length > 0 && <header className="business-episodes-head"><button type="button" className="primary-button" onClick={openCreate}><Icon name="plus" size={17}/>Создать ситуацию</button></header>}
    {showCreate && canCreate ? <PreparationPlanCreate key={companyId} directory={directory} directoryLoading={directoryLoading} directoryError={directoryError} onRetryDirectory={retryDirectory} busy={busy} error={error} preview={planPreview} onCancel={closeCreate} onPreview={previewPlan} onCreate={create}/> : episodes.length ? <div className="business-episodes-layout"><aside className="business-episode-list" aria-label="Список рабочих ситуаций"><header><h2>Ситуации</h2><span>{visibleEpisodes.length}</span></header><nav className="business-episode-filter" aria-label="Фильтр ситуаций">{episodeFilters.map(([id, label]) => <button key={id} type="button" aria-pressed={episodeFilter === id} onClick={() => setEpisodeFilter(id)}>{label}</button>)}</nav><div>{visibleEpisodes.length ? visibleEpisodes.map(item => <EpisodeRow key={item.id} episode={item} selected={item.id === selectedId} onSelect={() => selectEpisode(item.id)} />) : <p className="business-episode-list-empty">В этой подборке пока нет ситуаций.</p>}</div></aside><EpisodeDetail episode={selected} assignments={data.assignments || []} onStart={start} directory={directory} directoryLoading={directoryLoading} directoryError={directoryError} onRetryDirectory={retryDirectory} busy={busy} onCreateCall={createTestCall} onOpenMeeting={openMeeting} onInvite={invite} onRemove={removeParticipant}/></div> : <EmptyEpisode canCreate={canCreate} onCreate={openCreate}/>} {error && !showCreate && <p className="business-alert" role="alert">{error}</p>}
  </section>;
}
