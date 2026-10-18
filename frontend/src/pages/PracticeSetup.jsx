import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

const initial = { role:"", problem:"", goal:"", difficulty:"medium", chaos:false, hidden_goal:false };
const behavior = [["easy","Спокойный","Даёт время сформулировать ответ, мягко уточняет."],["medium","Деловой","Задаёт уточнения, ждёт аргументов и конкретных предложений."],["hard","Требовательный","Возражает, проверяет детали и не принимает первое предложение без оснований."],["brutal","Напряжённый","Оспаривает слабые аргументы, сохраняет деловые границы."]];

export default function PracticeSetup() {
  const [params] = useSearchParams();
  const { companyId } = useParams();
  const retryId = params.get("retry");
  const { user } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const savedDraft = location.state?.practiceDraft;
  const [form, setForm] = useState(() => Object.fromEntries(Object.keys(initial).map((key) => [key, savedDraft?.form?.[key] ?? initial[key]])));
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(Boolean(retryId && !savedDraft));
  const [error, setError] = useState(""), [elapsed, setElapsed] = useState(0);
  const set = (key, value) => setForm(current => ({...current,[key]:value}));
  useEffect(() => {
    if (!retryId || savedDraft) return;
    let alive = true;
    api(`/api/sessions/${retryId}`).then(data => { if (alive) setForm(Object.fromEntries(Object.keys(initial).map((key) => [key, data.settings?.[key] ?? initial[key]]))); }).catch(e => setError(e.message)).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retryId, savedDraft]);
  useEffect(() => { if (!busy) return; setElapsed(0); const timer = setInterval(() => setElapsed(n => n+1),1000); return () => clearInterval(timer); },[busy]);
  const filled = key => String(form[key] || "").trim();
  const valid = filled("problem") && filled("role") && filled("goal");
  async function submit(event) {
    event.preventDefault(); if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const payload = {
        ...form,
        mode:"online",
        display_name:user?.display_name || user?.username || "",
        opponent_role:"Собеседник",
      };
      const session = await api("/api/sessions",{method:"POST",body:payload});
      nav(companyId ? `/business/${encodeURIComponent(companyId)}/dialogue/${session.id}` : `/practice?session=${session.id}`);
    } catch(e) {setError(e.message); setBusy(false);}
  }
  const field = (key,label,placeholder="",wide=false,multiline=false) => <label className={wide ? "wide" : ""}>{label}{multiline ? <textarea rows={3} maxLength={1500} required disabled={busy} value={form[key] || ""} onChange={e=>set(key,e.target.value)} placeholder={placeholder}/> : <input maxLength={key === "role" ? 120 : 1500} required disabled={busy} value={form[key] || ""} onChange={e=>set(key,e.target.value)} placeholder={placeholder}/>}</label>;
  if (loading) return <p role="status">Возвращаем условия предыдущей попытки…</p>;
  return <div className="practice-page"><h1 className="sr-only">Подготовка к переговорам</h1>
    <form onSubmit={submit} className="practice-setup-form">
      <section className="practice-setup-section" aria-label="Параметры разговора"><div className="practice-fields practice-context-fields">{field("problem","Описание ситуации","Заказчик добавил требования, а дата запуска осталась прежней",true,true)}{field("role","Ваша роль","Руководитель проекта")}{field("goal","Желаемый результат","Перенести окончательный запуск на неделю")}</div></section>
      <section className="practice-setup-section practice-training-section" aria-labelledby="practice-training-title"><h2 id="practice-training-title">Условия тренировки</h2>
        <div className="practice-behavior">{behavior.map(([value,title,description])=><label key={value}><input disabled={busy} type="radio" name="difficulty" value={value} checked={form.difficulty===value} onChange={()=>set("difficulty",value)}/><span><b>{title}</b><small>{description}</small></span></label>)}</div>
        <div className="practice-extra-heading"><h2 id="practice-extra-title">Дополнительные условия</h2></div>
        <div className="practice-extra-options" role="group" aria-labelledby="practice-extra-title">
          <label><input disabled={busy} type="checkbox" checked={form.chaos} onChange={e=>set("chaos",e.target.checked)}/><span><b>Неожиданные события</b><small>Собеседник может сообщить о новом обстоятельстве. Исходные факты сохранятся.</small></span></label>
          <label><input disabled={busy} type="checkbox" checked={form.hidden_goal} onChange={e=>set("hidden_goal",e.target.checked)}/><span><b>Скрытый интерес</b><small>Выясните дополнительный мотив другой стороны с помощью вопросов.</small></span></label>
        </div>
      </section>
      {error && <p className="product-error" role="alert">{error}</p>}<div className="practice-actions"><button className="primary-button" disabled={!valid || busy} type="submit">Начать тренировку →</button></div>
    </form>{busy && <div className="practice-loading-overlay" role="dialog" aria-modal="true" aria-labelledby="preparing-title"><div><span className="practice-pending"><i/>Подготовка тренировки</span><h2 id="preparing-title">Собираем план разговора</h2><p>Учитываем вашу задачу, роли и условия. Готовим первый вопрос.</p><small>Прошло {elapsed} с. Время зависит от ответа ИИ.</small></div></div>}
  </div>;
}
