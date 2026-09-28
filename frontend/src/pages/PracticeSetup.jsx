import PageHeader from "../design/PageHeader.jsx";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

const initial = { display_name:"", role:"", opponent_role:"", problem:"", goal:"", constraints:"", target_company:"", target_position:"", preparation_level:"начальный", vacancy_description:"", difficulty:"medium", ghost:false, chaos:false, hidden_goal:false, timer:null, tone:"деловой" };
const behavior = [["easy","Спокойный","Даёт время сформулировать ответ, мягко уточняет."],["medium","Деловой","Задаёт уточнения, ждёт аргументов и конкретных предложений."],["hard","Требовательный","Возражает, проверяет детали и не принимает первое предложение без оснований."],["brutal","Напряжённый","Оспаривает слабые аргументы, сохраняет деловые границы."]];

export default function PracticeSetup() {
  const [params] = useSearchParams();
  const retryId = params.get("retry");
  const { user } = useAuth();
  const nav = useNavigate();
  const [kind, setKind] = useState(params.get("kind") === "job" ? "job" : "custom");
  const [form, setForm] = useState({...initial, display_name:user?.display_name || user?.username || ""});
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(Boolean(retryId));
  const [error, setError] = useState(""), [elapsed, setElapsed] = useState(0);
  const set = (key, value) => { setReview(false); setForm(current => ({...current,[key]:value})); };
  useEffect(() => {
    if (!retryId) return;
    let alive = true;
    api(`/api/sessions/${retryId}`).then(data => { if (alive) { setForm({...initial,...data.settings}); setKind(data.settings.practice_kind === "job_interview" ? "job" : "custom"); } }).catch(e => setError(e.message)).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retryId]);
  useEffect(() => { if (!busy) return; setElapsed(0); const timer = setInterval(() => setElapsed(n => n+1),1000); return () => clearInterval(timer); },[busy]);
  const interview = kind === "job";
  const filled = key => String(form[key] || "").trim();
  const valid = filled("display_name") && (interview ? filled("target_position") : filled("problem") && filled("role") && filled("opponent_role") && filled("goal"));
  async function submit(event) {
    event.preventDefault(); if (!valid || busy) return;
    if (!review) {setReview(true); requestAnimationFrame(() => document.getElementById("practice-review")?.scrollIntoView({behavior:"smooth",block:"center"})); return;}
    setBusy(true); setError("");
    try {
      const payload = {...form, mode:"online", practice_kind:interview ? "job_interview" : null};
      if (interview) Object.assign(payload, {role:"Кандидат", opponent_role:"Интервьюер", problem:`Учебное собеседование: ${form.target_position}${form.target_company ? `, ${form.target_company}` : ""}`, goal:`Показать подготовку к роли «${form.target_position}» на уровне «${form.preparation_level}»`});
      const session = await api("/api/sessions",{method:"POST",body:payload});
      nav(`/practice?session=${session.id}`);
    } catch(e) {setError(e.message); setBusy(false);}
  }
  const field = (key,label,placeholder="",wide=false,multiline=false,required=false) => <label className={wide ? "wide" : ""}>{label}{multiline ? <textarea rows={3} maxLength={key === "vacancy_description" ? 4000 : 1500} required={required} value={form[key] || ""} onChange={e=>set(key,e.target.value)} placeholder={placeholder}/> : <input maxLength={key === "display_name" ? 60 : 120} required={required} value={form[key] || ""} onChange={e=>set(key,e.target.value)} placeholder={placeholder}/>}</label>;
  if (loading) return <p role="status">Возвращаем условия предыдущей попытки…</p>;
  return <div className="practice-page"><PageHeader eyebrow="Практика с ИИ · Подготовка" title={interview ? "Потренируйте ответы на собеседовании" : "Какой разговор хотите отработать?"} description="Заполните три коротких блока. Перед запуском проверьте условия — они станут основой будущего разбора." actions={<Link className="subtle-button" to="/ai/guide">Как это работает →</Link>} />
    <div className="practice-kind-tabs" role="group" aria-label="Формат практики"><button aria-pressed={!interview} onClick={()=>{setKind("custom");setReview(false);}}>Переговоры</button><button aria-pressed={interview} onClick={()=>{setKind("job");setReview(false);}}>Учебное собеседование</button></div>
    <form onSubmit={submit} className="practice-setup-form">
      <fieldset disabled={busy}><legend>Ситуация</legend><div className="practice-fields">{field("display_name","Как к вам обращаться","Ваше имя",true,false,true)}{interview ? <>{field("target_position","Должность","Например, учитель математики",false,false,true)}<label>Уровень подготовки<select value={form.preparation_level} onChange={e=>set("preparation_level",e.target.value)}>{["начальный","средний","продвинутый"].map(x=><option key={x}>{x}</option>)}</select></label>{field("target_company","Компания · необязательно","Можно оставить пустым",true)}{field("vacancy_description","Описание вакансии · необязательно","Обязанности, требования, технологии",true,true)}</> : <>{field("problem","Что произошло?","Заказчик добавил требования, а дата запуска осталась прежней",true,true,true)}{field("role","Ваша роль","Руководитель проекта",false,false,true)}{field("opponent_role","Кто собеседник?","Заказчик",false,false,true)}</>}</div></fieldset>
      <fieldset disabled={busy}><legend>{interview ? "Задача интервью" : "Желаемый результат"}</legend>{interview ? <div className="practice-criteria"><p>Проверим соответствие вопросу, конкретность примеров, обоснование и собственный вклад. Для начинающих подходят учебные задачи.</p><p>План: 10–15 вопросов, обычно 15–25 минут. Название компании задаёт контекст, вопросы не выдаются за её реальную программу отбора.</p></div> : <div className="practice-fields">{field("goal","Чего хотите добиться?","Перенести окончательный запуск на неделю",true,true,true)}</div>}<div className="practice-fields">{field("constraints","Какие условия важно сохранить? · необязательно","Без увеличения бюджета; в пятницу показать основные функции",true,true)}</div></fieldset>
      <fieldset disabled={busy}><legend>Условия тренировки</legend><div className="practice-behavior">{behavior.map(([value,title,description])=><label key={value}><input type="radio" name="difficulty" value={value} checked={form.difficulty===value} onChange={()=>set("difficulty",value)}/><span><b>{title}</b><small>{description}</small></span></label>)}</div><p className="practice-criteria"><b>Ментор доступен по запросу.</b> Отдельный текстовый чат можно активировать во время тренировки. Помощь будет отмечена в разборе без штрафа.</p><details><summary>Дополнительные условия</summary><label className="practice-check"><input type="checkbox" checked={form.chaos} onChange={e=>set("chaos",e.target.checked)}/><span>Неожиданные события — собеседник может сообщить о новом обстоятельстве. Исходные факты сохраняются.</span></label><label className="practice-check"><input type="checkbox" checked={form.hidden_goal} onChange={e=>set("hidden_goal",e.target.checked)}/><span>Скрытый интерес — выясните дополнительный мотив другой стороны вопросами.</span></label><p>Стиль общения — деловой. Голос и текст доступны в самом разговоре.</p></details></fieldset>
      {review && <section id="practice-review" className="practice-review"><span className="eyebrow">ПРОВЕРЬТЕ ПЕРЕД НАЧАЛОМ</span><h2>{interview ? form.target_position : form.problem}</h2><p>{interview ? `Уровень: ${form.preparation_level}. ${form.target_company ? `Компания: ${form.target_company}.` : ""}` : `Вы — ${form.role}. Собеседник — ${form.opponent_role}.`}</p><p><b>Задача:</b> {interview ? "Показать подготовку и обосновать ответы примерами" : form.goal}</p>{form.constraints && <p><b>Ограничения:</b> {form.constraints}</p>}<p>{"Помощь ментора — по запросу"} · {behavior.find(x=>x[0]===form.difficulty)?.[1]}</p></section>}
      {error && <p className="product-error" role="alert">{error}</p>}<div className="practice-actions"><button className="primary-button" disabled={!valid || busy} type="submit">{review ? "Начать разговор" : "Проверить условия"} →</button>{review && <button type="button" className="subtle-button" disabled={busy} onClick={()=>setReview(false)}>Изменить условия</button>}</div>
    </form>{busy && <div className="practice-loading-overlay" role="dialog" aria-modal="true" aria-labelledby="preparing-title"><div><span className="practice-pending"><i/>Подготовка тренировки</span><h2 id="preparing-title">Собираем план разговора</h2><p>Учитываем вашу задачу, роли и условия. Готовим первый вопрос.</p><small>Прошло {elapsed} с. Время зависит от ответа ИИ.</small></div></div>}
  </div>;
}
