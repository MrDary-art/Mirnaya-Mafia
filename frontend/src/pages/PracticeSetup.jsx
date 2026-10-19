import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import PracticeHeader from "../components/PracticeHeader.jsx";
import { SmileyIcon } from "@phosphor-icons/react/dist/csr/Smiley";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/csr/Briefcase";
import { TargetIcon } from "@phosphor-icons/react/dist/csr/Target";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";

const initial = { role:"", problem:"", goal:"", difficulty:"medium", chaos:false, hidden_goal:false };
const behavior = [["easy","Спокойный","Мягко уточняет",SmileyIcon],["medium","Деловой","Ждёт аргументы",BriefcaseIcon],["hard","Требовательный","Проверяет детали",TargetIcon],["brutal","Напряжённый","Оспаривает доводы",WarningCircleIcon]];
const roleOptions = ["Руководитель проекта", "Сотрудник", "Клиент", "Кандидат", "Руководитель", "Предприниматель"];

export default function PracticeSetup() {
  const [params] = useSearchParams();
  const { companyId } = useParams();
  const retryId = params.get("retry");
  const { user } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const savedDraft = location.state?.practiceDraft;
  const [form, setForm] = useState(() => Object.fromEntries(Object.keys(initial).map((key) => [key, savedDraft?.form?.[key] ?? initial[key]])));
  const [customRole, setCustomRole] = useState(() => Boolean(savedDraft?.form?.role && !roleOptions.includes(savedDraft.form.role)));
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(Boolean(retryId && !savedDraft));
  const [error, setError] = useState(""), [elapsed, setElapsed] = useState(0);
  const set = (key, value) => setForm(current => ({...current,[key]:value}));
  useEffect(() => {
    if (!retryId || savedDraft) return;
    let alive = true;
    api(`/api/sessions/${retryId}`).then(data => { if (alive) { setForm(Object.fromEntries(Object.keys(initial).map((key) => [key, data.settings?.[key] ?? initial[key]]))); setCustomRole(Boolean(data.settings?.role && !roleOptions.includes(data.settings.role))); } }).catch(e => setError(e.message)).finally(() => { if (alive) setLoading(false); });
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
  const header = companyId ? <h1 className="sr-only">Подготовка к переговорам</h1> : <PracticeHeader title="Практика с ИИ" line="Ваша ситуация. Ваша стратегия." description="Опишите разговор, выберите роль и желаемый результат. Настройте собеседника и переходите к практике." image="ai" />;
  if (loading) return <div className={`practice-page${companyId ? "" : " practice-forest"}`}>{header}<p role="status">Возвращаем условия предыдущей попытки…</p></div>;
  return <div className={`practice-page${companyId ? "" : " practice-forest"}`}>{header}
    <form onSubmit={submit} className="practice-setup-form">
      <section className="practice-setup-section" aria-label="Параметры разговора">{!companyId && <h2>Ваша ситуация</h2>}<div className="practice-fields practice-context-fields">{field("problem","Описание ситуации","Заказчик добавил требования, а дата запуска осталась прежней",true,true)}
        <label>Ваша роль<select required disabled={busy} value={customRole ? "custom" : form.role} onChange={event => { const value = event.target.value; setCustomRole(value === "custom"); set("role", value === "custom" ? "" : value); }}><option value="">Выберите роль</option>{roleOptions.map(role => <option key={role} value={role}>{role}</option>)}<option value="custom">Своя роль…</option></select>{customRole && <input autoFocus required maxLength={120} disabled={busy} value={form.role} onChange={event => set("role", event.target.value)} placeholder="Напишите свою роль" />}</label>
        {field("goal","Желаемый результат","Перенести окончательный запуск на неделю")}</div></section>
      <section className="practice-setup-section practice-training-section" aria-labelledby="practice-training-title"><h2 id="practice-training-title">Условия тренировки</h2>
        <div className="practice-behavior">{behavior.map(([value,title,description,Icon])=><label className={`practice-behavior-${value}`} key={value}><input disabled={busy} type="radio" name="difficulty" value={value} checked={form.difficulty===value} onChange={()=>set("difficulty",value)}/><span className="practice-option-icon" aria-hidden="true"><Icon size={20}/></span><span><b>{title}</b><small>{description}</small></span></label>)}</div>
        <div className="practice-extra-heading"><h2 id="practice-extra-title">Дополнительные условия</h2></div>
        <div className="practice-extra-options" role="group" aria-labelledby="practice-extra-title">
          <label><input disabled={busy} type="checkbox" checked={form.chaos} onChange={e=>set("chaos",e.target.checked)}/><span className="practice-option-icon" aria-hidden="true"><ArrowsClockwiseIcon size={20}/></span><span><b>Неожиданные события</b><small>В разговоре появится новое обстоятельство.</small></span></label>
          <label><input disabled={busy} type="checkbox" checked={form.hidden_goal} onChange={e=>set("hidden_goal",e.target.checked)}/><span className="practice-option-icon" aria-hidden="true"><MagnifyingGlassIcon size={20}/></span><span><b>Скрытый интерес</b><small>Узнайте мотив собеседника вопросами.</small></span></label>
        </div>
      </section>
      {error && <p className="product-error" role="alert">{error}</p>}<div className="practice-actions"><button className="primary-button" disabled={!valid || busy} type="submit">Начать тренировку →</button></div>
    </form>{busy && <div className="practice-generation-notice" role="status" aria-live="polite"><span className="practice-pending"><i />Генерируем тренировку…</span><small>Учитываем вашу ситуацию · {elapsed} с</small></div>}
  </div>;
}
