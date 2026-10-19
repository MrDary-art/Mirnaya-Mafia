import { useEffect, useState } from "react";
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
const participationStates = { INVITED: "Ждёт ответа", ACCEPTED: "Участвует", DECLINED: "Отказался" };
const prepFields = [["goal", "Цель"], ["facts", "Факты"], ["questions", "Уточнить"], ["red_lines", "Не менять"]];
const retrospectiveFields = [["outcome", "Что получилось"], ["what_worked", "Что сработало"], ["next_step", "Следующий шаг"]];
const closedAssignmentStates = new Set(["COMPLETED", "PASSED", "FAILED", "CANCELLED"]);

function EmptyEpisode({ onCreate }) {
  return <section className="business-episode-empty">
    <div aria-hidden="true"><Icon name="target" size={24}/></div>
    <h2>Рабочих ситуаций пока нет</h2>
    <p>Создайте эпизод для важной ситуации.</p>
    <button type="button" className="primary-button" onClick={onCreate}>Создать ситуацию <Icon name="plus" size={17}/></button>
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
      <label className="is-wide">Ожидаемый результат<textarea value={form.expected_result} onChange={event => set("expected_result", event.target.value)} placeholder="К чему хотите прийти после разговора?" /></label>
      <label>Когда<input type="datetime-local" value={form.scheduled_at} onChange={event => set("scheduled_at", event.target.value)} /></label>
      <label>Видимость<select value={form.visibility} onChange={event => set("visibility", event.target.value)}>{Object.entries(visibility).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {practices.length > 0 && <label className="is-wide">Репетиция<select value={form.practice_target_id} onChange={event => set("practice_target_id", event.target.value)}><option value="">Не связывать</option>{practices.map(item => <option key={item.target_id} value={item.target_id}>{item.title}</option>)}</select></label>}
    </div>
    {form.visibility !== "PRIVATE" && directory.length > 0 && <fieldset className="business-episode-participants"><legend>Участники</legend><div>{directory.map(person => <label key={person.membership_id}><input type="checkbox" checked={form.participant_ids.includes(person.membership_id)} onChange={() => toggleParticipant(person.membership_id)} /><span><b>{person.name}</b><small>{[person.job_title, person.department].filter(Boolean).join(" · ") || "Сотрудник"}</small></span></label>)}</div></fieldset>}
    {error && <p className="business-alert" role="alert">{error}</p>}
    <footer><button type="button" className="subtle-button" onClick={onCancel}>Отмена</button><button className="primary-button" disabled={busy}>{busy ? "Создаём…" : "Создать"} <Icon name="arrow-right" size={17}/></button></footer>
  </form>;
}

function EpisodeRow({ episode, selected, onSelect }) {
  const openCommitments = (episode.commitments || []).filter(item => item.status !== "VERIFIED").length;
  return <button type="button" className={`business-episode-row${selected ? " is-selected" : ""}`} onClick={onSelect} aria-current={selected ? "page" : undefined}>
    <span className="business-episode-row-copy"><b>{episode.title}</b><small>{episode.expected_result || states[episode.status]}</small></span>
    <span className="business-episode-row-meta"><em>{states[episode.status] || episode.status}</em>{openCommitments > 0 && <i>{openCommitments}</i>}</span>
  </button>;
}

function EpisodeParticipants({ episode, directory, busy, onInvite }) {
  const [membershipId, setMembershipId] = useState("");
  const participantIds = new Set((episode.participants || []).map(item => item.membership_id));
  const participantIdsKey = [...participantIds].join(",");
  useEffect(() => setMembershipId(""), [episode.id, participantIdsKey]);
  if (episode.visibility === "PRIVATE") return null;
  const available = directory.filter(person => !participantIds.has(person.membership_id));
  return <section className="business-episode-related business-episode-members">
    <header><h3>Участники</h3></header>
    <div className="business-episode-member-list">{(episode.participants || []).map(person => <div key={person.membership_id}><span><b>{person.name}</b><small>{person.role === "OWNER" ? "Создатель" : "Участник"}</small></span><em className={`is-${person.status.toLowerCase()}`}>{person.role === "OWNER" ? "Владелец" : participationStates[person.status] || person.status}</em></div>)}</div>
    {available.length > 0 && <form onSubmit={event => { event.preventDefault(); if (membershipId) onInvite(episode, Number(membershipId)); }}><select aria-label="Пригласить сотрудника" value={membershipId} onChange={event => setMembershipId(event.target.value)}><option value="">Добавить сотрудника</option>{available.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select><button type="submit" className="subtle-button" disabled={!membershipId || busy}>Пригласить <Icon name="plus" size={15}/></button></form>}
  </section>;
}

function EpisodeDetail({ episode, assignments, directory, busy, onSave, onState, onCommitment, onMeetings, onStartPractice, onComplete, onParticipation, onInvite }) {
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
  const nextAction = canEdit && episode.status === "PREPARING" ? ["READY", "Готово к встрече"] : null;
  const canClose = canEdit && episode.status === "ACTIVE";
  const participationPending = episode.participation?.status === "INVITED";
  return <article className="business-episode-detail">
    <header className="business-episode-detail-head"><div><h2>{episode.title}</h2>{episode.expected_result && <p>{episode.expected_result}</p>}</div><em>{states[episode.status] || episode.status}</em></header>
    <dl className="business-episode-facts"><div><dt>Когда</dt><dd>{episode.scheduled_at ? formatDate(episode.scheduled_at) : "Не назначено"}</dd></div><div><dt>Участники</dt><dd>{episode.participant_count}</dd></div><div><dt>Доступ</dt><dd>{visibility[episode.visibility]}</dd></div></dl>
    {participationPending ? <section className="business-episode-invitation"><div><span><Icon name="users" size={18}/></span><div><h3>Приглашение в эпизод</h3></div></div><footer><button type="button" className="subtle-button" disabled={busy} onClick={() => onParticipation(episode, "DECLINED")}>Отклонить</button><button type="button" className="primary-button" disabled={busy} onClick={() => onParticipation(episode, "ACCEPTED")}>Принять <Icon name="check" size={17}/></button></footer></section> : <>
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEpisodeId = searchParams.get("episode");
  const assignments = data.assignments || [];
  const [episodes, setEpisodes] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(() => searchParams.get("create") === "1");
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
  useEffect(() => { if (searchParams.get("create") === "1") setShowCreate(true); }, [searchParams]);
  useEffect(() => {
    let current = true;
    api(`/api/company/${companyId}/directory`).then(value => { if (current) setDirectory(value.filter(person => person.membership_id !== data.membership?.id)); }).catch(() => { if (current) setDirectory([]); });
    return () => { current = false; };
  }, [companyId, data.membership?.id]);
  const selected = episodes.find(item => item.id === selectedId) || null;
  async function create(payload) { setBusy(true); setError(""); try { const created = await api(`/api/company/${companyId}/episodes`, { method: "POST", body: payload }); setShowCreate(false); navigate(`${businessPath(companyId, "episodes")}?episode=${created.id}`, { replace: true }); await load(created.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  function closeCreate() { setShowCreate(false); setError(""); if (searchParams.get("create") === "1") setSearchParams({}, { replace: true }); }
  async function save(episode, draft) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}`, { method: "PUT", body: { expected_result: draft.expected_result, practice_target_id: draft.practice_target_id ? Number(draft.practice_target_id) : null, preparation: Object.fromEntries(prepFields.map(([key]) => [key, draft[key] || ""])), retrospective: Object.fromEntries(retrospectiveFields.map(([key]) => [key, draft[key] || ""])) } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function updateState(episode, status) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/status`, { method: "POST", body: { status } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function updateCommitment(episode, item, status, blocker_note = "") { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/commitments/${item.id}`, { method: "PATCH", body: { status, blocker_note } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function respondToInvitation(episode, status) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/participation`, { method: "POST", body: { status } }); await load(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function invite(episode, membershipId) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}/participants`, { method: "POST", body: { membership_id: membershipId } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function complete(episode, draft) { setBusy(true); setError(""); try { await api(`/api/company/${companyId}/episodes/${episode.id}`, { method: "PUT", body: { retrospective: Object.fromEntries(retrospectiveFields.map(([key]) => [key, draft[key] || ""])) } }); await api(`/api/company/${companyId}/episodes/${episode.id}/status`, { method: "POST", body: { status: "COMPLETED" } }); await load(episode.id); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  const goToMeetings = episodeId => navigate(`${businessPath(companyId, "meetings")}?episode=${episodeId}`);
  if (loading && !episodes.length) return <Loader error={error} onRetry={() => load()}/>;
  return <section className="business-episodes" aria-live="polite">
    <header className="business-episodes-head"><button type="button" className="primary-button" onClick={() => { setError(""); setShowCreate(true); }}><Icon name="plus" size={17}/>Новая ситуация</button></header>
    {showCreate ? <EpisodeCreate assignments={assignments} directory={directory} busy={busy} error={error} onCancel={closeCreate} onCreate={create}/> : episodes.length ? <div className="business-episodes-layout"><aside className="business-episode-list"><div>{episodes.map(item => <EpisodeRow key={item.id} episode={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}</div></aside><EpisodeDetail episode={selected} assignments={assignments} directory={directory} busy={busy} onSave={save} onState={updateState} onCommitment={updateCommitment} onMeetings={goToMeetings} onStartPractice={start} onComplete={complete} onParticipation={respondToInvitation} onInvite={invite}/></div> : <EmptyEpisode onCreate={() => setShowCreate(true)}/>} {error && !showCreate && <p className="business-alert" role="alert">{error}</p>}
  </section>;
}
