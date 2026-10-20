import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import CouncilParticipantPicker from "./CouncilParticipantPicker";
import CouncilSchedulePicker, { councilDateValid } from "./CouncilSchedulePicker";
import "./council-authoring-ui.css";
import "./council-flow.css";

const modes = [
  ["call", "Рабочая встреча", "Обсудить свою задачу. Звонок, общая доска и отчёт.", "2–8 человек"],
  ["contract-social-v1", "Готовая игра", "«Контракт на кону»: четыре роли и разные интересы.", "4 игрока"],
  ["classic", "Свой сценарий", "Подготовить личные роли и провести учебные переговоры.", "4–20 игроков"],
];

export default function CouncilComposer({ permissions, initialCompany, basePath = "/council", initialMode = "call", episodeId = null, initialWhen = "", allowGames = true }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const company = Number(initialCompany || permissions.companies[0]?.id);
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState(1);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [episode, setEpisode] = useState(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [roles, setRoles] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [organizerPlays, setOrganizerPlays] = useState(true);
  const [duration, setDuration] = useState(30);
  const [when, setWhen] = useState(initialWhen);
  const [now, setNow] = useState(!initialWhen);
  const [scheduleValid, setScheduleValid] = useState(false);
  const [packets, setPackets] = useState([]);
  const [notice, setNotice] = useState("");
  const isCall = mode === "call";
  const plays = isCall || mode !== "classic" && organizerPlays;
  const maxGuests = isCall ? 7 : (mode === "classic" ? capacity : 4) - Number(plays);
  const steps = mode === "classic" ? ["Встреча", "Роли", "Проверка"] : ["Встреча", "Проверка"];

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api(`/api/company/${company}/employees?active_only=true`),
      episodeId ? api(`/api/company/${company}/episodes/${episodeId}`) : Promise.resolve(null),
    ]).then(([directory, linked]) => {
      if (!active) return;
      const available = directory.filter(person => person.user_id !== user.id && person.status === "ACTIVE").map(person => ({ ...person, id: person.user_id }));
      setPeople(available);
      if (linked) {
        setEpisode(linked); setMode("call");
        setTitle(`Обсуждение: ${linked.title}`); setGoal(linked.expected_result || linked.brief || "");
        const ids = new Set((linked.participants || []).filter(person => person.status !== "DECLINED").map(person => person.membership_id));
        setSelected(available.filter(person => ids.has(person.membership_id)).slice(0, 7).map(person => person.id));
      }
    }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company, episodeId, user.id]);

  function changeMode(value) {
    setMode(value); setError(""); setPackets([]); setStep(1);
    setSelected([]); setNow(value === "call"); setScheduleValid(false);
  }
  function valid() {
    if (title.trim().length < 3) return "Напишите название — минимум 3 символа.";
    if (!selected.length) return "Выберите хотя бы одного сотрудника.";
    if (!isCall && selected.length !== maxGuests) return `Для этого формата выберите ${maxGuests} сотрудников.`;
    if (!(isCall && now) && (!scheduleValid || !councilDateValid(when))) return "Выберите доступные дату и время.";
    if (mode === "classic" && (goal.trim().length < 10 || roles.trim().length < 10)) return "Опишите задачу и интересы ролей — минимум 10 символов в каждом поле.";
    return "";
  }
  async function next(event) {
    event.preventDefault();
    const problem = valid();
    if (problem) { setError(problem); return; }
    setError("");
    if (mode !== "classic") { setStep(2); return; }
    setBusy(true);
    try {
      const result = await api("/api/council/draft", { method: "POST", body: { title, goal, roles, capacity } });
      setPackets(result.packets); setNotice(result.notice); setStep(2);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function publish(event) {
    event.preventDefault();
    const problem = valid();
    if (problem) { setError(problem); setStep(1); return; }
    setBusy(true); setError("");
    try {
      let id;
      if (isCall) {
        const result = await api(`/api/company/${company}/meetings`, { method: "POST", body: {
          kind: "PREPARATION_CALL", title: title.trim(), description: episode?.brief || goal.trim(),
          agenda: goal.trim() ? [goal.trim()] : [], duration_minutes: duration,
          membership_ids: people.filter(person => selected.includes(person.id)).map(person => person.membership_id),
          episode_id: episodeId, scheduled_at: now ? new Date().toISOString() : new Date(`${when}:00+03:00`).toISOString(),
        } });
        id = result.council_meeting_id;
      } else {
        const result = await api("/api/council", { method: "POST", body: {
          title: title.trim(), goal, game_mode: mode, capacity: mode === "classic" ? capacity : 4,
          packets: mode === "classic" ? packets : [], reservation_minutes: duration,
          scheduled_at: new Date(`${when}:00+03:00`).toISOString(), company_id: company,
          visibility: "private", audience: "invited", participant_ids: selected, organizer_plays: plays,
        } });
        id = result.id;
      }
      navigate(`${basePath}/${id}`);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="council-setup" aria-label="Создание Совета решений">
    <header className="council-flow-heading"><div><span className="council-kicker">НОВАЯ ВСТРЕЧА</span><h2>Соберите команду</h2><p>Одна комната для разговора. Один отчёт после встречи.</p></div><Link to={basePath}>Отмена</Link></header>
    <ol className="council-setup-steps" aria-label="Шаги создания">{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    {error && <p className="council-note council-note--error" role="alert">{error}</p>}
    {loading ? <p role="status">Загружаем команду…</p> : step === 1 ? <form className="council-setup-form" onSubmit={next}>
      {!episodeId && allowGames && <fieldset className="council-format-picker"><legend>Что хотите провести?</legend>{modes.map(([value, label, description, count]) => <label key={value} className={mode === value ? "is-selected" : ""}><input type="radio" name="council-format" checked={mode === value} onChange={() => changeMode(value)}/><span><b>{label}</b><small>{description}</small><em>{count}</em></span></label>)}</fieldset>}
      {episode && <p className="council-note">Из рабочей ситуации «{episode.title}». Тема и участники уже подставлены — проверьте их.</p>}
      <label>Название встречи<input required minLength={3} maxLength={180} value={title} onChange={event => setTitle(event.target.value)} placeholder="Например, согласование сроков запуска" /></label>
      <label>{mode === "classic" ? "Задача и условия" : "Что нужно обсудить"}<textarea required={mode === "classic"} maxLength={3000} value={goal} onChange={event => setGoal(event.target.value)} placeholder="К какому решению нужно прийти?" /></label>
      {mode === "classic" && <><label>Количество игроков<select value={capacity} onChange={event => { setCapacity(Number(event.target.value)); setSelected([]); }}>{Array.from({length:17}, (_,index) => index + 4).map(count => <option key={count}>{count}</option>)}</select></label><label>Роли и их интересы<textarea required minLength={10} maxLength={6000} value={roles} onChange={event => setRoles(event.target.value)} placeholder="По одной роли на строку: кто участвует, чего хочет, какие есть ограничения." /></label></>}
      {mode === "contract-social-v1" && <label className="council-check"><input type="checkbox" checked={organizerPlays} onChange={event => { setOrganizerPlays(event.target.checked); setSelected([]); }}/><span>Я участвую в игре. Иначе буду отдельным ведущим.</span></label>}
      <div><h3>Кого пригласить</h3><p>{plays ? "Вы уже включены в состав." : "Вы — ведущий без игровой роли."} {isCall ? "Добавьте от 1 до 7 сотрудников." : `Выберите ещё ${maxGuests} сотрудников.`}</p><CouncilParticipantPicker people={people} selected={selected} onChange={setSelected} capacity={maxGuests}/></div>
      <div className="council-setup-time"><h3>Когда встречаемся?</h3>{isCall && <div className="council-time-choice"><button type="button" aria-pressed={now} onClick={() => setNow(true)}>Сейчас</button><button type="button" aria-pressed={!now} onClick={() => setNow(false)}>Запланировать</button></div>}
        <label>Продолжительность<select value={duration} onChange={event => setDuration(Number(event.target.value))}>{[15,30,45,60,90].map(value => <option value={value} key={value}>{value} минут</option>)}</select></label>
        {isCall && now ? <p>Комната будет доступна сразу. Вы начнёте встречу, когда команда будет готова.</p> : <CouncilSchedulePicker value={when} onChange={setWhen} capacity={isCall ? selected.length + 1 : capacity} duration={duration} onAvailabilityChange={setScheduleValid}/>}
      </div>
      <footer className="council-setup-actions"><span>Запись речи — только после выбора участника при входе в рабочий созвон.</span><button className="council-button" disabled={busy || !people.length}>{busy ? "Готовим…" : mode === "classic" ? "Подготовить роли" : "Проверить встречу"}</button></footer>
    </form> : mode === "classic" && step === 2 ? <form className="council-setup-form" onSubmit={event => { event.preventDefault(); setStep(3); }}>
      <h3>Проверьте личные роли</h3><p>{notice || "Измените предложенные формулировки перед приглашением команды."}</p>
      <div className="council-role-drafts">{packets.map((packet, index) => <details key={packet.key} open><summary>{index + 1}. {packet.name}</summary>{[["name","Название"],["goal","Цель"],["private_facts","Закрытые факты — по одному на строку"],["limits","Ограничения — по одному на строку"],["can_offer","Что может предложить"],["ask","Что нужно выяснить"]].map(([key,label]) => <label key={key}>{label}<textarea required value={Array.isArray(packet[key]) ? packet[key].join("\n") : packet[key]} onChange={event => setPackets(current => current.map((item,i) => i === index ? {...item,[key]: ["private_facts","limits"].includes(key) ? event.target.value.split("\n") : event.target.value} : item))}/></label>)}</details>)}</div>
      <footer className="council-setup-actions"><button type="button" onClick={() => setStep(1)}>Назад</button><button className="council-button">Проверить встречу</button></footer>
    </form> : <form className="council-setup-form" onSubmit={publish}>
      <h3>{title}</h3><p>{goal || "Обсудить рабочие вопросы команды."}</p>
      <dl className="council-confirmation"><div><dt>Формат</dt><dd>{modes.find(item => item[0] === mode)?.[1]}</dd></div><div><dt>Начало</dt><dd>{isCall && now ? "Комната откроется сразу" : `${when.replace("T"," в ")} · МСК`}</dd></div><div><dt>Продолжительность</dt><dd>{duration} минут</dd></div><div><dt>Участники</dt><dd>{user.display_name || user.username} — {plays ? "ведущий и участник" : "ведущий"}<br/>{people.filter(person => selected.includes(person.id)).map(person => person.name).join(", ")}</dd></div></dl>
      <p className="council-note">После создания откроется страница встречи с кнопкой запуска. После звонка записи будут расшифрованы, а черновик отчёта появится у руководителя для проверки.</p>
      <footer className="council-setup-actions"><button type="button" disabled={busy} onClick={() => setStep(mode === "classic" ? 2 : 1)}>Назад</button><button className="council-button" disabled={busy}>{busy ? "Создаём…" : "Создать встречу"}</button></footer>
    </form>}
  </section>;
}
