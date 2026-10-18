import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { api } from "../api";
import "./council-composer.css";
import "./council-social-game.css";
import CouncilParticipantPicker from "./CouncilParticipantPicker.jsx";
import "./council-authoring-ui.css";
import CouncilSchedulePicker, { councilDateValid } from "./CouncilSchedulePicker";

export default function CouncilComposer({ permissions, initialCompany, basePath = "/council", lockCompany = false, onCreated }) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany || permissions.companies[0]?.id || "");
  const [people, setPeople] = useState([]), [selected, setSelected] = useState([]);
  const [step, setStep] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [gameMode, setGameMode] = useState("contract-social-v1");
  const [organizerPlays, setOrganizerPlays] = useState(true);
  const [brief, setBrief] = useState({ title: "Совет Решений", goal: "", roles: "", capacity: 4 });
  const [duration,setDuration] = useState(30);
  const [scheduleValid,setScheduleValid] = useState(false);
  const [audience, setAudience] = useState("invited"), [when, setWhen] = useState("");
  const [packets, setPackets] = useState([]), [notice, setNotice] = useState("");
  useEffect(() => {
    setSelected([]); setPeople([]);
    if (company) api(`/api/council/company/${company}/candidates`).then(setPeople).catch(e => setError(e.message));
  }, [company]);
  function field(key, value) { setBrief(b => ({ ...b, [key]: value })); }
  async function prepare(event) {
    event.preventDefault(); if (!scheduleValid || !councilDateValid(when)) { setError("Выберите дату и время минимум через 15 минут."); setStep(1); return; } setBusy(true); setError("");
    if (gameMode === "contract-social-v1") { setStep(3); setBusy(false); return; }
    try { const result = await api("/api/council/draft", { method: "POST", body: brief }); setPackets(result.packets); setNotice(result.notice); setStep(2); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function generateIdea() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api("/api/council/idea", {method:"POST", body:{capacity:brief.capacity, goal:brief.goal, roles:brief.roles}});
      setBrief(b=>({...b,goal:result.goal,roles:result.roles})); setPackets([]);
      setNotice("ИИ предложил задачу и состав ролей. Проверьте текст ниже, измените детали и подготовьте личные карточки.");
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function publish(event) {
    event.preventDefault(); if (!councilDateValid(when)) { setError("Выбранное время уже недоступно. Укажите новое."); setStep(1); return; } setBusy(true); setError("");
    try {
      const result = await api("/api/council", { method: "POST", body: { ...brief, game_mode:gameMode, capacity:gameMode === "contract-social-v1" ? 4 : brief.capacity, packets:gameMode === "contract-social-v1" ? [] : packets, reservation_minutes:duration, scheduled_at: new Date(`${when}:00+03:00`).toISOString(), company_id: company ? Number(company) : null, visibility: "private", audience, participant_ids: selected, organizer_plays: gameMode !== "classic" && organizerPlays } });
      onCreated?.(result);
      navigate(`${basePath}/${result.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className={`council-composer${expanded ? " is-expanded" : ""}`} id="council-create" aria-labelledby="composer-title">
    <header className="council-composer-header"><div><h2 id="composer-title">Собрать совет</h2></div><button className="council-composer-toggle" type="button" aria-expanded={expanded} aria-controls="council-composer-body" onClick={() => setExpanded(value => !value)}><span>{expanded ? "Свернуть" : "Открыть форму"}</span><CaretDownIcon size={20} weight="bold" aria-hidden="true" /></button></header>
    <div id="council-composer-body" className="council-composer-body" hidden={!expanded}>
    <ol className="composer-steps" aria-label="Этапы создания">{(gameMode === "classic" ? [1,2,3] : [1,3]).map((stage,i) => <li key={stage} aria-current={step === stage ? "step" : undefined}><span>{i+1}</span>{["Задача и участники", "Личные карточки", "Проверка и назначение"][stage-1]}</li>)}</ol>
    {error && <p role="alert" className="council-note council-note--error">{error}</p>}
    {step === 1 && <form onSubmit={prepare} className="composer-form">
      {!lockCompany && permissions.companies.length>1 && <label>Компания<select value={company} onChange={e=>setCompany(e.target.value)}>{permissions.companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
      <div className="social-case-picker"><label>Во что играем<select value={gameMode} onChange={e=>{setGameMode(e.target.value);setPackets([]);setStep(1);if(e.target.value!=="classic"){field("capacity",4);setSelected(v=>v.slice(0,4));}}}><option value="contract-social-v1">Контракт на кону · готовая игра</option><option value="classic">Свой сценарий · редактор карточек</option></select></label><p>{gameMode !== "classic" ? "Четыре роли, личные интересы, закрытая вторая вводная и поворот событий. Несколько рабочих сделок с разной ценой для команды. 15–20 минут и разбор." : "Задайте собственные роли и ограничения. Итог проверяет ведущий."}</p></div><div className="council-form-pair"><div className="council-capacity-control"><div><label htmlFor="council-capacity">Количество участников</label><output htmlFor="council-capacity">{brief.capacity}<small>{gameMode === "classic" ? brief.capacity === 4 ? "участника" : "участников" : "игрока"}</small></output></div>{gameMode === "classic" ? <><input id="council-capacity" type="range" min="4" max="20" step="1" aria-valuetext={`${brief.capacity} участников`} value={brief.capacity} onChange={e=>{const count=Number(e.target.value);field("capacity",count);setSelected(current=>current.slice(0,count));setPackets([]);}}/><div className="council-range-labels"><span>4</span><small>Ведущий — отдельно</small><span>20</span></div></> : <p className="council-range-labels">Четыре роли · {organizerPlays ? "вы играете в команде" : "ведущий отдельно"}</p>}</div><label className="council-duration-label">Длительность<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[15,30,45,60,90].map(n=><option key={n} value={n}>{n} минут</option>)}</select></label></div>
      <CouncilSchedulePicker value={when} onChange={setWhen} capacity={brief.capacity} duration={duration} onAvailabilityChange={setScheduleValid}/>
      {gameMode === "classic" && <div className="council-ai-action"><button type="button" className="council-button" disabled={busy||!scheduleValid} onClick={generateIdea}>{busy?"Генерируем…":"Сгенерировать задачу ИИ"}</button></div>}
      {notice && <p role="status" className="council-note">{notice}</p>}
      {gameMode !== "classic" && <label className="composer-person"><input type="checkbox" checked={organizerPlays} onChange={e=>{setOrganizerPlays(e.target.checked);setSelected(v=>v.slice(0,e.target.checked?3:4));}}/>Я играю одну из четырёх ролей. Отдельный ведущий не нужен.</label>}{company && <><label>Кто может принять участие<select value={audience} onChange={e=>setAudience(e.target.value)}><option value="invited">Выбранные сотрудники</option><option value="company">Все сотрудники компании</option></select></label><CouncilParticipantPicker people={people} selected={selected} onChange={setSelected} capacity={brief.capacity - Number(gameMode !== "classic" && organizerPlays)}/></>}
      {gameMode === "classic" && <><label>Задача для команды<textarea required minLength={10} maxLength={4000} value={brief.goal} onChange={e => field("goal",e.target.value)} placeholder="Опишите рабочую ситуацию: что случилось, какое решение нужно принять и какие условия важно соблюсти. Например: команде нужно согласовать сроки запуска и бюджет." /></label>
      <label>Кто участвует в переговорах и чего хочет<textarea required minLength={10} maxLength={6000} value={brief.roles} onChange={e => field("roles",e.target.value)} placeholder="По одной роли на строку: директор — сохранить бюджет; руководитель проекта — успеть к сроку; финансист — проверить расходы. Укажите известные вам ограничения. Остальное ИИ предложит в карточках." /></label></>}
      <div className="composer-actions">{packets.length === brief.capacity && <button type="button" disabled={busy} onClick={() => { if (councilDateValid(when)) { setError(""); setStep(2); } else setError("Выберите доступную дату и время."); }}>Вернуться к заполненным карточкам</button>}<button className="council-button" disabled={busy||!scheduleValid}>{busy ? "Готовим карточки…" : gameMode !== "classic" ? "Проверить встречу →" : packets.length ? "Заново подготовить карточки →" : "Подготовить карточки →"}</button></div>
    </form>}
    {step === 2 && <form className="composer-form" onSubmit={e => { e.preventDefault(); setStep(3); }}><p className="council-note">{notice}</p><div className="composer-packets">{packets.map((p,i) => <details key={p.key} open onInvalid={e => { const card = e.target.closest("details"); if (card) card.open = true; }}><summary>{String(i+1).padStart(2,"0")} · {p.name}</summary>{[["name","Название роли"],["goal","Личная цель"],["private_facts","Закрытая информация — по одному факту на строку"],["limits","Ограничения — по одному на строку"],["can_offer","Что можно предложить"],["ask","Что нужно выяснить"]].map(([key,label]) => <label key={key}>{label}<textarea required={["name","goal","private_facts","limits"].includes(key)} maxLength={key==="name" ? 150 : 2000} value={Array.isArray(p[key]) ? p[key].join("\n") : p[key]} onChange={e => setPackets(all => all.map((item,n) => n===i ? {...item,[key]: ["private_facts","limits"].includes(key) ? e.target.value.split("\n") : e.target.value} : item))} /></label>)}</details>)}</div><div className="composer-actions"><button type="button" onClick={() => setStep(1)}>← Изменить замысел</button><button className="council-button">Проверить перед публикацией →</button></div></form>}
    {step === 3 && <form onSubmit={publish} className="composer-form"><h3>{gameMode === "classic" ? brief.title : "Контракт на кону"}</h3><p>{gameMode === "classic" ? brief.goal : "Сохраните контракт: договоритесь о сроках, объёме и деньгах. Личные карточки откроются участникам после сбора команды."}</p><dl><dt>Состав</dt><dd>{brief.capacity} игрока{gameMode === "classic" || !organizerPlays ? " и отдельный ведущий" : ", включая вас"}</dd><dt>Начало</dt><dd>{when.replace("T"," в ")} МСК</dd><dt>Резерв</dt><dd>{duration} минут · {brief.capacity} участников</dd><dt>Кто участвует</dt><dd>{company ? audience === "company" ? "Все действующие сотрудники компании" : "Только приглашённые сотрудники" : "Открытая игра"}</dd></dl><p>{gameMode === "classic" ? packets.map(p => p.name).join(" · ") : "Руководитель проекта · клиент · производство · финансы"}</p><label className="composer-person"><input type="checkbox" required />Я проверил состав и время встречи; участники получат закрытые личные роли.</label><div className="composer-actions"><button type="button" onClick={() => setStep(gameMode === "classic" ? 2 : 1)}>← Изменить встречу</button><button className="council-button" disabled={busy}>{busy ? "Публикуем…" : "Назначить встречу и пригласить участников"}</button></div></form>}
    </div>
  </section>;
}
