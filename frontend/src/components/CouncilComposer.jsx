import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import "./council-composer.css";
import CouncilSchedulePicker, { councilDateValid } from "./CouncilSchedulePicker";

export default function CouncilComposer({ permissions, initialCompany, basePath = "/council", lockCompany = false }) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany || permissions.companies[0]?.id || "");
  const [people, setPeople] = useState([]), [selected, setSelected] = useState([]);
  const [step, setStep] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [brief, setBrief] = useState({ title: "", goal: "", roles: "", capacity: 4 });
  const [audience, setAudience] = useState("invited"), [when, setWhen] = useState("");
  const [packets, setPackets] = useState([]), [notice, setNotice] = useState("");
  useEffect(() => {
    setSelected([]); setPeople([]);
    if (company) api(`/api/council/company/${company}/candidates`).then(setPeople).catch(e => setError(e.message));
  }, [company]);
  function field(key, value) { setBrief(b => ({ ...b, [key]: value })); }
  async function prepare(event) {
    event.preventDefault(); if (!councilDateValid(when)) { setError("Выберите дату и время минимум через 12 часов."); setStep(1); return; } setBusy(true); setError("");
    try { const result = await api("/api/council/draft", { method: "POST", body: brief }); setPackets(result.packets); setNotice(result.notice); setStep(2); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function publish(event) {
    event.preventDefault(); if (!councilDateValid(when)) { setError("Выбранное время уже недоступно. Укажите новое."); setStep(1); return; } setBusy(true); setError("");
    try {
      const result = await api("/api/council", { method: "POST", body: { ...brief, packets, scheduled_at: new Date(`${when}:00+03:00`).toISOString(), company_id: company ? Number(company) : null, visibility: "private", audience, participant_ids: selected, organizer_plays: false } });
      navigate(`${basePath}/${result.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="council-composer" aria-labelledby="composer-title">
    <header><span className="council-kicker">ВСТРЕЧА ВАШЕЙ КОМАНДЫ</span><h2 id="composer-title">Собрать совет</h2><p>Вы знаете свою команду. Задайте ситуацию, проверьте задания и пригласите участников.</p></header>
    <ol className="composer-steps" aria-label="Этапы создания">{["Замысел и состав", "Личные карточки", "Проверка и публикация"].map((s,i) => <li key={s} aria-current={step === i+1 ? "step" : undefined}><span>{i+1}</span>{s}</li>)}</ol>
    {error && <p role="alert" className="council-note council-note--error">{error}</p>}
    {step === 1 && <form onSubmit={prepare} className="composer-form">
      <label>Где пройдёт игра<select value={company} disabled={lockCompany} onChange={e => setCompany(e.target.value)}>{permissions.companies.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <label>Количество участников<input type="number" min="4" max="20" value={brief.capacity} onChange={e => field("capacity", Number(e.target.value))} required /></label><small>От 4 до 20 человек. Ведущий не занимает игровое место.</small><CouncilSchedulePicker value={when} onChange={setWhen} />
      {company && <><label>Кто увидит встречу<select value={audience} onChange={e => setAudience(e.target.value)}><option value="invited">Только выбранные сотрудники</option><option value="company">Все сотрудники компании</option></select></label><fieldset><legend>Пригласить участников · {selected.length} из {brief.capacity}</legend>{people.length ? people.map(p => <label className="composer-person" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={!selected.includes(p.id) && selected.length >= brief.capacity} onChange={e => setSelected(v => e.target.checked ? [...v,p.id] : v.filter(id => id !== p.id))} />{p.name} <small>@{p.username}</small></label>) : <p>В компании пока нет других действующих сотрудников. Их можно пригласить позже.</p>}</fieldset></>}
      <label>Название встречи<input required minLength={3} maxLength={180} value={brief.title} onChange={e => field("title",e.target.value)} placeholder="Например, новый график поставок" /></label>
      <label>Ситуация и общая цель<textarea required minLength={10} maxLength={4000} value={brief.goal} onChange={e => field("goal",e.target.value)} placeholder="Что произошло? О чём команде нужно договориться? Какие условия нельзя нарушить?" /></label>
      <label>Роли и интересы сторон<textarea required minLength={10} maxLength={6000} value={brief.roles} onChange={e => field("roles",e.target.value)} placeholder="По одной роли на строку. Добавьте, чего добивается каждая сторона и что известно только ей." /></label>
      <div className="composer-actions">{packets.length === brief.capacity && <button type="button" disabled={busy} onClick={() => { if (councilDateValid(when)) { setError(""); setStep(2); } else setError("Выберите доступную дату и время."); }}>Вернуться к заполненным карточкам</button>}<button className="council-button" disabled={busy}>{busy ? "Готовим карточки…" : packets.length ? "Заново подготовить карточки →" : "Подготовить карточки →"}</button></div>
    </form>}
    {step === 2 && <form className="composer-form" onSubmit={e => { e.preventDefault(); setStep(3); }}><p className="council-note">{notice}</p><div className="composer-packets">{packets.map((p,i) => <details key={p.key} open onInvalid={e => { const card = e.target.closest("details"); if (card) card.open = true; }}><summary>{String(i+1).padStart(2,"0")} · {p.name}</summary>{[["name","Название роли"],["goal","Личная цель"],["private_facts","Закрытая информация — по одному факту на строку"],["limits","Ограничения — по одному на строку"],["can_offer","Что можно предложить"],["ask","Что нужно выяснить"]].map(([key,label]) => <label key={key}>{label}<textarea required={["name","goal","private_facts","limits"].includes(key)} maxLength={key==="name" ? 150 : 2000} value={Array.isArray(p[key]) ? p[key].join("\n") : p[key]} onChange={e => setPackets(all => all.map((item,n) => n===i ? {...item,[key]: ["private_facts","limits"].includes(key) ? e.target.value.split("\n") : e.target.value} : item))} /></label>)}</details>)}</div><div className="composer-actions"><button type="button" onClick={() => setStep(1)}>← Изменить замысел</button><button className="council-button">Проверить перед публикацией →</button></div></form>}
    {step === 3 && <form onSubmit={publish} className="composer-form"><h3>{brief.title}</h3><p>{brief.goal}</p><dl><dt>Состав</dt><dd>{brief.capacity} участников и ведущий</dd><dt>Начало</dt><dd>{when.replace("T"," в ")} МСК</dd><dt>Видимость</dt><dd>{company ? audience === "company" ? "Все действующие сотрудники компании" : "Только приглашённые сотрудники" : "Открытая игра"}</dd></dl><p>{packets.map(p => p.name).join(" · ")}</p><label className="composer-person"><input type="checkbox" required />Я проверил задания: цели и ограничения понятны, информации достаточно для переговоров.</label><div className="composer-actions"><button type="button" onClick={() => setStep(2)}>← Редактировать карточки</button><button className="council-button" disabled={busy}>{busy ? "Публикуем…" : "Подтвердить и опубликовать"}</button></div></form>}
  </section>;
}
