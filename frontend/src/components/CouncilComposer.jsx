import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import "./council-composer.css";
import CouncilParticipantPicker from "./CouncilParticipantPicker.jsx";
import "./council-authoring-ui.css";
import CouncilSchedulePicker, { councilDateValid } from "./CouncilSchedulePicker";

export default function CouncilComposer({ permissions, initialCompany, basePath = "/council", lockCompany = false, onCreated }) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany || permissions.companies[0]?.id || "");
  const [people, setPeople] = useState([]), [selected, setSelected] = useState([]);
  const [step, setStep] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState("");
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
      const result = await api("/api/council", { method: "POST", body: { ...brief, packets, reservation_minutes:duration, scheduled_at: new Date(`${when}:00+03:00`).toISOString(), company_id: company ? Number(company) : null, visibility: "private", audience, participant_ids: selected, organizer_plays: false } });
      onCreated?.(result);
      navigate(`${basePath}/${result.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="council-composer" id="council-create" aria-labelledby="composer-title">
    <header><h2 id="composer-title">Собрать совет</h2></header>
    <ol className="composer-steps" aria-label="Этапы создания">{["Задача и участники", "Личные карточки", "Проверка и назначение"].map((s,i) => <li key={s} aria-current={step === i+1 ? "step" : undefined}><span>{i+1}</span>{s}</li>)}</ol>
    {error && <p role="alert" className="council-note council-note--error">{error}</p>}
    {step === 1 && <form onSubmit={prepare} className="composer-form">
      {!lockCompany && permissions.companies.length>1 && <label>Компания<select value={company} onChange={e=>setCompany(e.target.value)}>{permissions.companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
      <div className="council-form-pair"><div className="council-capacity-control"><div><label htmlFor="council-capacity">Количество участников</label><output htmlFor="council-capacity">{brief.capacity}<small>человек</small></output></div><input id="council-capacity" type="range" min="4" max="20" step="1" aria-valuetext={`${brief.capacity} участников`} value={brief.capacity} onChange={e=>{const count=Number(e.target.value);field("capacity",count);setSelected(current=>current.slice(0,count));setPackets([]);}}/><div className="council-range-labels"><span>4</span><small>Ведущий — отдельно</small><span>20</span></div></div><label className="council-duration-label">Длительность<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[15,30,45,60,90].map(n=><option key={n} value={n}>{n} минут</option>)}</select></label></div>
      <CouncilSchedulePicker value={when} onChange={setWhen} capacity={brief.capacity} duration={duration} onAvailabilityChange={setScheduleValid}/>
      <div className="council-ai-action"><button type="button" className="council-button" disabled={busy||!scheduleValid} onClick={generateIdea}>{busy?"Генерируем…":"Сгенерировать задачу ИИ"}</button></div>
      {notice && <p role="status" className="council-note">{notice}</p>}
      {company && <><label>Кто может принять участие<select value={audience} onChange={e=>setAudience(e.target.value)}><option value="invited">Выбранные сотрудники</option><option value="company">Все сотрудники компании</option></select></label><CouncilParticipantPicker people={people} selected={selected} onChange={setSelected} capacity={brief.capacity}/></>}
      <label>Задача для команды<textarea required minLength={10} maxLength={4000} value={brief.goal} onChange={e => field("goal",e.target.value)} placeholder="Опишите рабочую ситуацию: что случилось, какое решение нужно принять и какие условия важно соблюсти. Например: команде нужно согласовать сроки запуска и бюджет." /></label>
      <label>Кто участвует в переговорах и чего хочет<textarea required minLength={10} maxLength={6000} value={brief.roles} onChange={e => field("roles",e.target.value)} placeholder="По одной роли на строку: директор — сохранить бюджет; руководитель проекта — успеть к сроку; финансист — проверить расходы. Укажите известные вам ограничения. Остальное ИИ предложит в карточках." /></label>
      <div className="composer-actions">{packets.length === brief.capacity && <button type="button" disabled={busy} onClick={() => { if (councilDateValid(when)) { setError(""); setStep(2); } else setError("Выберите доступную дату и время."); }}>Вернуться к заполненным карточкам</button>}<button className="council-button" disabled={busy||!scheduleValid}>{busy ? "Готовим карточки…" : packets.length ? "Заново подготовить карточки →" : "Подготовить карточки →"}</button></div>
    </form>}
    {step === 2 && <form className="composer-form" onSubmit={e => { e.preventDefault(); setStep(3); }}><p className="council-note">{notice}</p><div className="composer-packets">{packets.map((p,i) => <details key={p.key} open onInvalid={e => { const card = e.target.closest("details"); if (card) card.open = true; }}><summary>{String(i+1).padStart(2,"0")} · {p.name}</summary>{[["name","Название роли"],["goal","Личная цель"],["private_facts","Закрытая информация — по одному факту на строку"],["limits","Ограничения — по одному на строку"],["can_offer","Что можно предложить"],["ask","Что нужно выяснить"]].map(([key,label]) => <label key={key}>{label}<textarea required={["name","goal","private_facts","limits"].includes(key)} maxLength={key==="name" ? 150 : 2000} value={Array.isArray(p[key]) ? p[key].join("\n") : p[key]} onChange={e => setPackets(all => all.map((item,n) => n===i ? {...item,[key]: ["private_facts","limits"].includes(key) ? e.target.value.split("\n") : e.target.value} : item))} /></label>)}</details>)}</div><div className="composer-actions"><button type="button" onClick={() => setStep(1)}>← Изменить замысел</button><button className="council-button">Проверить перед публикацией →</button></div></form>}
    {step === 3 && <form onSubmit={publish} className="composer-form"><h3>{brief.title}</h3><p>{brief.goal}</p><dl><dt>Состав</dt><dd>{brief.capacity} участников и ведущий</dd><dt>Начало</dt><dd>{when.replace("T"," в ")} МСК</dd><dt>Резерв</dt><dd>{duration} минут · {brief.capacity} участников</dd><dt>Кто участвует</dt><dd>{company ? audience === "company" ? "Все действующие сотрудники компании" : "Только приглашённые сотрудники" : "Открытая игра"}</dd></dl><p>{packets.map(p => p.name).join(" · ")}</p><label className="composer-person"><input type="checkbox" required />Я проверил задания: цели и ограничения понятны, информации достаточно для переговоров.</label><div className="composer-actions"><button type="button" onClick={() => setStep(2)}>← Редактировать карточки</button><button className="council-button" disabled={busy}>{busy ? "Публикуем…" : "Назначить встречу и пригласить участников"}</button></div></form>}
  </section>;
}
