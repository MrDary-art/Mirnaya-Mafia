import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
const prepFields = [["goal", "Цель"], ["facts", "Факты"], ["questions", "Уточнить"], ["red_lines", "Не менять"]];
const retrospectiveFields = [["outcome", "Что получилось"], ["what_worked", "Что сработало"], ["next_step", "Следующий шаг"]];
const closedAssignmentStates = new Set(["COMPLETED", "PASSED", "FAILED", "CANCELLED"]);

function EmptyEpisode({ onCreate }) {
  return <section className="business-episode-empty">
    <div aria-hidden="true"><Icon name="target" size={24}/></div>
    <h2>Один разговор — один контекст</h2>
    <p>Подготовка, встреча и следующие шаги остаются в одном эпизоде.</p>
    <button type="button" className="primary-button" onClick={onCreate}>Создать эпизод <Icon name="plus" size={17}/></button>
  </section>;
}

function EpisodeCreate({ assignments, busy, error, onCancel, onCreate }) {
  const [form, setForm] = useState({ title: "", situation_type: "NEGOTIATION", expected_result: "", scheduled_at: "", visibility: "PRIVATE", practice_target_id: "" });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const practices = assignments.filter(item => !closedAssignmentStates.has(item.status));
  return <form className="business-episode-create" onSubmit={event => {
    event.preventDefault();
    onCreate({ ...form, practice_target_id: form.practice_target_id ? Number(form.practice_target_id) : null, scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null });
  }}>
    <header><div><h2>Новый эпизод</h2><p>Соберите важную ситуацию до встречи.</p></div><button type="button" className="business-icon-button" onClick={onCancel} aria-label="Закрыть"><Icon name="x"/></button></header>
    <div className="business-episode-create-grid">
      <label>Название<input autoFocus required value={form.title} onChange={event => set("title", event.target.value)} placeholder="Например, продление договора" /></label>
      <label>Формат<select value={form.situation_type} onChange={event => set("situation_type", event.target.value)}>{Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="is-wide">Ожидаемый результат<textarea value={form.expected_result} onChange={event => set("expected_result", event.target.value)} placeholder="К чему хотите прийти после разговора?" /></label>
      <label>Когда<input type="datetime-local" value={form.scheduled_at} onChange={event => set("scheduled_at", event.target.value)} /></label>
      <label>Видимость<select value={form.visibility} onChange={event => set("visibility", event.target.value)}>{Object.entries(visibility).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {practices.length > 0 && <label className="is-wide">Репетиция<select value={form.practice_target_id} onChange={event => set("practice_target_id", event.target.value)}><option value="">Не связывать</option>{practices.map(item => <option key={item.target_id} value={item.target_id}>{item.title}</option>)}</select></label>}
    </div>
    {error && <p className="business-alert" role="alert">{error}</p>}
    <footer><button type="button" className="subtle-button" onClick={onCancel}>Отмена</button><button className="primary-button" disabled={busy}>{busy ? "Создаём…" : "Создать"} <Icon name="arrow-right" size={17}/></button></footer>
  </form>;
}

function EpisodeRow({ episode, selected, onSelect }) {
  const openCommitments = (episode.commitments || []).filter(item => item.status !== "COMPLETED").length;
  return <button type="button" className={`business-episode-row${selected ? " is-selected" : ""}`} onClick={onSelect} aria-current={selected ? "page" : undefined}>
    <span className="business-episode-row-type">{types[episode.situation_type] || "Эпизод"}</span>
    <span className="business-episode-row-copy"><b>{episode.title}</b><small>{episode.expected_result || states[episode.status]}</small></span>
    <span className="business-episode-row-meta"><em>{states[episode.status] || episode.status}</em>{openCommitments > 0 && <i>{openCommitments}</i>}</span>
  </button>;
}

function EpisodeDetail({ episode, assignments, busy, onSave, onState, onCommitment, onMeetings, onStartPractice, onComplete }) {
  const [draft, setDraft] = useState({});
  useEffect(() => setDraft({
    expected_result: episode?.expected_result || "", practice_target_id: episode?.practice?.target_id || "",
    ...(episode?.preparation || {}), ...(episode?.retrospective || {}),
  }), [episode?.id, episode?.updated_at]);
  if (!episode) return <div className="business-episode-detail-empty"><Icon name="target" size={24}/><p>Выберите эпизод слева.</p></div>;
  const full = episode.access === "full";
  const canEdit = Boolean(episode.can_edit);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const practice = episode.practice;
  const practices = assignments.filter(item => !closedAssignmentStates.has(item.status));
  const nextAction = canEdit && episode.status === "PREPARING" ? ["READY", "Готово к встрече"] : canEdit && episode.status === "READY" ? ["MEETING", "Создать встречу"] : null;
  const canClose = canEdit && ["ACTIVE", "PROTOCOL_REVIEW"].includes(episode.status);
  return <article className="business-episode-detail">
    <header className="business-episode-detail-head"><div><span>{types[episode.situation_type] || "Рабочий эпизод"}</span><h2>{episode.title}</h2><p>{episode.expected_result || "Ожидаемый результат ещё не указан."}</p></div><em>{states[episode.status] || episode.status}</em></header>
    <dl className="business-episode-facts"><div><dt>Видимость</dt><dd>{visibility[episode.visibility]}</dd></div><div><dt>Когда</dt><dd>{episode.scheduled_at ? formatDate(episode.scheduled_at) : "Не назначено"}</dd></div><div><dt>Участники</dt><dd>{episode.participant_count}</dd></div></dl>
    {full && <section className="business-episode-preparation"><header><div><h3>Подготовка</h3><p>Личные заметки видны только вам.</p></div></header><label className="business-episode-result">Ожидаемый результат<textarea disabled={!canEdit} value={draft.expected_result || ""} onChange={event => update("expected_result", event.target.value)} placeholder="Что должно измениться после разговора?" /></label><div>{prepFields.map(([key, label]) => <label key={key}>{label}<textarea disabled={!canEdit} value={draft[key] || ""} onChange={event => update(key, event.target.value)} placeholder="Кратко" /></label>)}</div>{canEdit && <footer><button type="button" className="subtle-button" disabled={busy} onClick={() => onSave(episode, draft)}>Сохранить</button>{nextAction && (nextAction[0] === "MEETING" ? <button type="button" className="primary-button" onClick={() => onMeetings(episode.id)}>Создать встречу <Icon name="arrow-right" size={17}/></button> : <button type="button" className="primary-button" disabled={busy} onClick={() => onState(episode, nextAction[0])}>{nextAction[1]} <Icon name="arrow-right" size={17}/></button>)}</footer>}</section>}
    {!full && <p className="business-episode-summary-note"><Icon name="lock" size={16}/>Личные заметки владельца скрыты. Здесь — общий ход и следующие шаги.</p>}
    {full && <section className="business-episode-related business-episode-practice"><header><h3>Репетиция</h3></header>{practice ? <div><span><b>{practice.title}</b><small>{statusLabels[practice.status] || practice.status}{practice.deadline ? ` · до ${formatDate(practice.deadline)}` : ""}</small></span>{!closedAssignmentStates.has(practice.status) && <button type="button" className="subtle-button" onClick={() => onStartPractice(practice.target_id)}>{practice.status === "IN_PROGRESS" ? "Продолжить" : "Начать"}</button>}</div> : canEdit && practices.length ? <label className="business-episode-practice-picker">Связать назначенную практику<select value={draft.practice_target_id || ""} onChange={event => update("practice_target_id", event.target.value)}><option value="">Не выбрана</option>{practices.map(item => <option key={item.target_id} value={item.target_id}>{item.title}</option>)}</select><button type="button" className="subtle-button" disabled={busy} onClick={() => onSave(episode, draft)}>Сохранить</button></label> : <p>Назначенной репетиции пока нет.</p>}</section>}
    <section className="business-episode-related"><header><h3>Встречи и решения</h3>{full && <button type="button" className="subtle-button" onClick={() => onMeetings(episode.id)}>Открыть встречи</button>}</header>{episode.meetings?.length ? <div>{episode.meetings.map(meeting => <button type="button" key={meeting.id} onClick={() => onMeetings(episode.id)}><span><b>{meeting.title}</b><small>{meeting.scheduled_at ? formatDate(meeting.scheduled_at) : "Без даты"}</small></span><em>{states[meeting.status] || meeting.status}</em></button>)}</div> : <p>Встреча ещё не назначена.</p>}</section>
    <section className="business-episode-related"><header><h3>Обязательства</h3></header>{episode.commitments?.length ? <div>{episode.commitments.map(item => <div key={item.id} className={`business-episode-commitment is-${item.status.toLowerCase()}`}><span><b>{item.title}</b><small>{item.owner_name || "Исполнитель не назначен"}{item.due_at ? ` · до ${formatDate(item.due_at)}` : ""}{item.blocker_note ? ` · ${item.blocker_note}` : ""}</small></span>{item.is_mine && item.status !== "COMPLETED" && <span className="business-episode-commitment-actions"><button type="button" className="subtle-button" disabled={busy} onClick={() => onCommitment(episode, item, "COMPLETED")}>Готово</button><button type="button" className="subtle-button" disabled={busy} onClick={() => onCommitment(episode, item, "BLOCKED", "Нужна помощь")}>Нужна помощь</button></span>}<em>{item.status === "COMPLETED" ? "Готово" : item.status === "BLOCKED" ? "Блокер" : "В работе"}</em></div>)}</div> : <p>Подтверждённые обязательства появятся после публикации итога встречи.</p>}</section>
    {full && (episode.meetings?.length || episode.status === "COMPLETED") && <section className="business-episode-retrospective"><header><div><h3>Итог</h3><p>Короткая фиксация перед завершением.</p></div>{episode.status === "COMPLETED" && <em>Завершён</em>}</header>{retrospectiveFields.map(([key, label]) => <label key={key}>{label}<textarea disabled={!canEdit || episode.status === "COMPLETED"} value={draft[key] || ""} onChange={event => update(key, event.target.value)} placeholder="Кратко" /></label>)}{canEdit && episode.status !== "COMPLETED" && <footer><button type="button" className="subtle-button" disabled={busy} onClick={() => onSave(episode, draft)}>Сохранить итог</button>{canClose && <button type="button" className="primary-button" disabled={busy} onClick={() => onComplete(episode, draft)}>Завершить эпизод <Icon name="check" size={17}/></button>}</footer>}</section>}
  </article>;
}

export default function WorkEpisodes({ data, start }) {
  const companyId = data.company.id;
  const navigate = useNavigate();
  const assignments = data.assignments || [];
  const [episodes, setEpisodes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("active");
  async function load(preferred) {
    setLoading(true);
    try {
      const value = await api(`/api/company/${companyId}/episodes`);
      setEpisodes(value);
      setSelectedId(current => preferred || (value.some(item => item.id === current) ? current : value[0]?.id || null));
    } catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [companyId]);
  const visible = useMemo(() => episodes.filter(item => filter === "all" || (filter === "active" ? !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(item.status) : ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(item.status))), [episodes, filter]);
  const selected = episodes.find(item => item.id === selectedId) || null;
  async function create(payload) { setBusy(true); setError(""); try { const created = await api(`/api/company/${companyId}/episodes`, { method: "POST", body: payload }); setShowCreate(false); await load(created.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function save(episode, draft) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}`, { method: "PUT", body: { expected_result: draft.expected_result, practice_target_id: draft.practice_target_id ? Number(draft.practice_target_id) : null, preparation: Object.fromEntries(prepFields.map(([key]) => [key, draft[key] || ""])), retrospective: Object.fromEntries(retrospectiveFields.map(([key]) => [key, draft[key] || ""])) } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function updateState(episode, status) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/status`, { method: "POST", body: { status } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function updateCommitment(episode, item, status, blocker_note = "") { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/commitments/${item.id}`, { method: "PATCH", body: { status, blocker_note } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function complete(episode, draft) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}`, { method: "PUT", body: { retrospective: Object.fromEntries(retrospectiveFields.map(([key]) => [key, draft[key] || ""])) } }); await api(`/api/company/${companyId}/episodes/${episode.id}/status`, { method: "POST", body: { status: "COMPLETED" } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  const goToMeetings = episodeId => navigate(`${businessPath(companyId, "meetings")}?episode=${episodeId}`);
  if (loading && !episodes.length) return <Loader error={error} onRetry={() => load()}/>;
  return <section className="business-episodes" aria-live="polite">
    <header className="business-episodes-head"><div><h2>Рабочие эпизоды</h2><p>Ситуация, репетиция, встреча и обязательства — в одном месте.</p></div><button type="button" className="primary-button" onClick={() => { setError(""); setShowCreate(true); }}><Icon name="plus" size={17}/>Создать</button></header>
    {showCreate ? <EpisodeCreate assignments={assignments} busy={busy} error={error} onCancel={() => { setShowCreate(false); setError(""); }} onCreate={create}/> : episodes.length ? <div className="business-episodes-layout"><aside className="business-episode-list"><nav aria-label="Фильтр эпизодов">{[["active", "В работе"], ["done", "Завершённые"], ["all", "Все"]].map(([id, label]) => <button type="button" key={id} className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</nav><div>{visible.length ? visible.map(item => <EpisodeRow key={item.id} episode={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)}/>) : <Empty>В этой группе пока ничего нет.</Empty>}</div></aside><EpisodeDetail episode={selected} assignments={assignments} busy={busy} onSave={save} onState={updateState} onCommitment={updateCommitment} onMeetings={goToMeetings} onStartPractice={start} onComplete={complete}/></div> : <EmptyEpisode onCreate={() => setShowCreate(true)}/>} {error && !showCreate && <p className="business-alert" role="alert">{error}</p>}
  </section>;
}
