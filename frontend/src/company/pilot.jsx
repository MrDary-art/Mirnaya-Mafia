import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { businessPath } from "../business/navigation.js";

const objectives = [
  { id: "CLIENT_NEGOTIATIONS", label: "Сложные переговоры с клиентом", description: "Подготовка, практика и следующий шаг после встречи." },
  { id: "INTERNAL_ALIGNMENT", label: "Согласование внутри команды", description: "Меньше разночтений в важных рабочих решениях." },
  { id: "LEADERSHIP_CONVERSATIONS", label: "Разговоры руководителей", description: "Регулярные 1×1 и трудные управленческие диалоги." },
  { id: "CUSTOM", label: "Свой фокус", description: "Настройте пилот под конкретную рабочую ситуацию." },
];

const metrics = [
  ["CONFIRMED_COMMITMENTS", "Подтверждённые договорённости"],
  ["PREPARED_CONVERSATIONS", "Подготовленные разговоры"],
  ["PRACTICE_COMPLETION", "Завершённая практика"],
  ["TEAM_CONFIDENCE", "Уверенность команды"],
];

export function companyPilot(data) {
  const pilot = data?.company?.settings?.pilot;
  return pilot && typeof pilot === "object" ? pilot : null;
}

function pilotDay(pilot) {
  if (!pilot?.started_at || !pilot?.duration_days) return null;
  const started = new Date(pilot.started_at).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsed = Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1);
  return Math.min(elapsed, Number(pilot.duration_days));
}

export function PilotLaunchCard({ data }) {
  const companyId = data.company.id;
  return <section className="business-pilot-launch">
    <div className="business-pilot-launch-mark" aria-hidden="true"><Icon name="target" size={24}/></div>
    <div>
      <h2>Начните с одного рабочего вызова</h2>
      <p>Выберите ситуацию, соберите группу и задайте понятный результат пилота.</p>
      <ul>
        <li>Один фокус на 2–4 недели</li>
        <li>Практика связана с рабочими встречами</li>
        <li>Руководитель видит только нужные сигналы</li>
      </ul>
    </div>
    <Link className="primary-button" to={businessPath(companyId, "onboarding")}>Запустить пилот <Icon name="arrow-right" size={17}/></Link>
  </section>;
}

export function PilotBrief({ data, compact = false }) {
  const pilot = companyPilot(data);
  if (!pilot) return null;
  const day = pilotDay(pilot);
  const percent = day ? Math.min(100, Math.round(day * 100 / Number(pilot.duration_days))) : 0;
  return <aside className={`business-pilot-brief${compact ? " is-compact" : ""}`} aria-label="Текущий пилот компании">
    <div className="business-pilot-brief-copy">
      <strong>{pilot.objective_label || "Рабочий пилот"}</strong>
      <small>Пилот · {pilot.success_metric_label || "Результат пилота"}</small>
    </div>
    {day && <div className="business-pilot-progress"><b>День {day} из {pilot.duration_days}</b><div aria-label={`Пройдено ${percent}% пилота`}><i style={{ width: `${percent}%` }}/></div></div>}
  </aside>;
}

export function PilotCommandCenter({ data }) {
  const companyId = data.company.id;
  const pilot = companyPilot(data);
  const [overview, setOverview] = useState(null);
  useEffect(() => {
    if (!pilot) { setOverview(null); return undefined; }
    let current = true;
    api(`/api/company/${companyId}/pilot/overview`).then(value => {
      if (current) setOverview(value);
    }).catch(() => { if (current) setOverview(null); });
    return () => { current = false; };
  }, [companyId, pilot?.updated_at]);
  if (!pilot) return null;
  const steps = [
    { label: "Создайте эпизод", detail: overview ? `${overview.episodes.total} из ${overview.scope.members} участников` : "Один важный разговор для группы пилота.", done: (overview?.episodes.total || 0) > 0, to: businessPath(companyId, "episodes") },
    { label: "Свяжите репетицию", detail: overview ? `${overview.episodes.practice_linked} эпизодов с практикой` : "Выберите кейс, который поможет подготовиться.", done: (overview?.episodes.total || 0) > 0 && overview?.episodes.practice_linked === overview?.episodes.total, to: `${businessPath(companyId, "learning")}?view=manage` },
    { label: "Зафиксируйте результат", detail: overview ? `${overview.commitments.completed} из ${overview.commitments.total} обязательств завершено` : pilot.success_metric_label || "Зафиксируйте решение и ответственного.", done: (overview?.commitments.total || 0) > 0 && overview?.commitments.completed === overview?.commitments.total, to: businessPath(companyId, "meetings") },
  ];
  const next = overview?.next_action;
  const nextPath = next?.kind === "EPISODE" ? businessPath(companyId, "episodes") : next?.kind === "PRACTICE" ? `${businessPath(companyId, "learning")}?view=manage` : next?.kind === "MEETING" ? businessPath(companyId, "meetings") : businessPath(companyId, "episodes");
  return <section className="business-pilot-command" aria-labelledby="pilot-command-title">
    <header><div><h3 id="pilot-command-title">Маршрут пилота</h3><p>Эпизод → репетиция → подтверждённый результат.</p></div><Link to={businessPath(companyId, "onboarding")}>Настроить</Link></header>
    <ol>{steps.map((step, index) => <li key={step.label} className={step.done ? "is-done" : ""}><span>{step.done ? <Icon name="check" size={14}/> : index + 1}</span><div><b>{step.label}</b><small>{step.detail}</small></div><Link to={step.to} aria-label={step.label}><Icon name="arrow-right" size={18}/></Link></li>)}</ol>
    {next && <footer className={`business-pilot-signal${next.kind === "BLOCKERS" ? " is-alert" : ""}`}><span><b>{next.label}</b><small>{next.detail}</small></span><Link className="subtle-button" to={nextPath}>Открыть <Icon name="arrow-right" size={16}/></Link></footer>}
  </section>;
}

export function PilotOnboarding({ data, reload }) {
  const companyId = data.company.id;
  const navigate = useNavigate();
  const existing = companyPilot(data);
  const [step, setStep] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({
    objective: existing?.objective || "CLIENT_NEGOTIATIONS",
    custom_objective: existing?.objective === "CUSTOM" ? existing.objective_label || "" : "",
    target_type: existing?.target_type || "COMPANY",
    department_id: existing?.department_id ? String(existing.department_id) : "",
    duration_days: String(existing?.duration_days || 28),
    success_metric: existing?.success_metric || "CONFIRMED_COMMITMENTS",
  }));

  useEffect(() => {
    let current = true;
    api(`/api/company/${companyId}/departments`).then(value => {
      if (current) setDepartments(value || []);
    }).catch(cause => {
      if (current) setError(cause.message);
    }).finally(() => { if (current) setLoadingDepartments(false); });
    return () => { current = false; };
  }, [companyId]);

  const selectedObjective = objectives.find(item => item.id === form.objective);
  const stepValid = step === 0
    ? (form.objective !== "CUSTOM" || form.custom_objective.trim().length >= 3)
    : step === 1
      ? (form.target_type === "COMPANY" || Boolean(form.department_id))
      : step === 2
        ? Number(form.duration_days) >= 7 && Number(form.duration_days) <= 90
        : true;

  function next() {
    setError("");
    if (!stepValid) {
      setError(step === 0 ? "Кратко опишите фокус пилота." : step === 1 ? "Выберите подразделение." : "Выберите срок от 7 до 90 дней.");
      return;
    }
    setStep(current => Math.min(3, current + 1));
  }

  async function launch() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/api/company/${companyId}/pilot`, {
        method: "PUT",
        body: { ...form, department_id: form.target_type === "DEPARTMENT" ? Number(form.department_id) : null, duration_days: Number(form.duration_days) },
      });
      await reload();
      navigate(businessPath(companyId), { replace: true });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  const audienceLabel = form.target_type === "DEPARTMENT"
    ? departments.find(item => String(item.id) === form.department_id)?.name || "Подразделение"
    : "Вся компания";
  const metricLabel = metrics.find(([id]) => id === form.success_metric)?.[1];
  return <section className="business-pilot-onboarding">
    <header>
      <div><h1>{existing ? "Обновите пилот" : "Запустите пилот"}</h1><p>Один рабочий вызов. Понятный результат за несколько недель.</p></div>
      <Link className="subtle-button" to={businessPath(companyId)}>Отмена</Link>
    </header>
    <ol className="business-pilot-steps" aria-label="Этапы настройки пилота">
      {["Фокус", "Группа", "Результат", "Проверка"].map((label, index) => <li key={label} className={index === step ? "is-current" : index < step ? "is-done" : ""}><span>{index + 1}</span>{label}</li>)}
    </ol>
    <div className="business-pilot-stage">
      {step === 0 && <>
        <h2>Что улучшаем первым?</h2>
        <div className="business-pilot-choice-list" role="radiogroup" aria-label="Фокус пилота">
          {objectives.map(item => <button key={item.id} type="button" role="radio" aria-checked={form.objective === item.id} className={form.objective === item.id ? "is-selected" : ""} onClick={() => setForm(current => ({ ...current, objective: item.id }))}><span><b>{item.label}</b><small>{item.description}</small></span><Icon name={form.objective === item.id ? "check" : "arrow-right"} size={18}/></button>)}
        </div>
        {form.objective === "CUSTOM" && <label className="business-pilot-field">Фокус пилота<input autoFocus value={form.custom_objective} onChange={event => setForm(current => ({ ...current, custom_objective: event.target.value }))} maxLength="120" placeholder="Например, переговоры о сроках поставки" /></label>}
      </>}
      {step === 1 && <>
        <h2>Кто участвует?</h2>
        <div className="business-pilot-choice-list business-pilot-choice-list--two" role="radiogroup" aria-label="Группа пилота">
          <button type="button" role="radio" aria-checked={form.target_type === "COMPANY"} className={form.target_type === "COMPANY" ? "is-selected" : ""} onClick={() => setForm(current => ({ ...current, target_type: "COMPANY" }))}><span><b>Вся компания</b><small>Подойдёт для небольшой команды.</small></span><Icon name={form.target_type === "COMPANY" ? "check" : "arrow-right"} size={18}/></button>
          <button type="button" role="radio" aria-checked={form.target_type === "DEPARTMENT"} className={form.target_type === "DEPARTMENT" ? "is-selected" : ""} onClick={() => setForm(current => ({ ...current, target_type: "DEPARTMENT" }))}><span><b>Подразделение</b><small>Запустите на одной рабочей группе.</small></span><Icon name={form.target_type === "DEPARTMENT" ? "check" : "arrow-right"} size={18}/></button>
        </div>
        {form.target_type === "DEPARTMENT" && <label className="business-pilot-field">Подразделение<select disabled={loadingDepartments} value={form.department_id} onChange={event => setForm(current => ({ ...current, department_id: event.target.value }))}><option value="">Выберите подразделение</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </>}
      {step === 2 && <>
        <h2>Как поймём, что пилот работает?</h2>
        <div className="business-pilot-form-grid">
          <label className="business-pilot-field">Срок<select value={form.duration_days} onChange={event => setForm(current => ({ ...current, duration_days: event.target.value }))}><option value="14">2 недели</option><option value="28">4 недели</option><option value="42">6 недель</option><option value="56">8 недель</option></select></label>
          <label className="business-pilot-field">Главный сигнал<select value={form.success_metric} onChange={event => setForm(current => ({ ...current, success_metric: event.target.value }))}>{metrics.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        </div>
      </>}
      {step === 3 && <>
        <h2>Проверьте настройку</h2>
        <dl className="business-pilot-review">
          <div><dt>Фокус</dt><dd>{form.objective === "CUSTOM" ? form.custom_objective : selectedObjective?.label}</dd></div>
          <div><dt>Группа</dt><dd>{audienceLabel}</dd></div>
          <div><dt>Срок</dt><dd>{form.duration_days} дней</dd></div>
          <div><dt>Сигнал</dt><dd>{metricLabel}</dd></div>
        </dl>
        <p className="business-pilot-note">После запуска команда увидит связанные задачи, а руководитель — прогресс без лишней отчётности.</p>
      </>}
      {error && <p className="business-alert" role="alert">{error}</p>}
    </div>
    <footer className="business-pilot-actions"><button type="button" className="subtle-button" disabled={step === 0 || busy} onClick={() => { setError(""); setStep(current => current - 1); }}>Назад</button>{step < 3 ? <button type="button" className="primary-button" onClick={next}>Далее <Icon name="arrow-right" size={17}/></button> : <button type="button" className="primary-button" disabled={busy} onClick={launch}>{busy ? "Запускаем…" : "Запустить пилот"} <Icon name="arrow-right" size={17}/></button>}</footer>
  </section>;
}
