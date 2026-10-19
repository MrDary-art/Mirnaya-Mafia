import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { businessPath } from "../business/navigation.js";

const objectives = [
  ["CLIENT_NEGOTIATIONS", "Сложные переговоры с клиентом"],
  ["INTERNAL_ALIGNMENT", "Согласование внутри команды"],
  ["LEADERSHIP_CONVERSATIONS", "Разговоры руководителей"],
  ["CUSTOM", "Свой фокус"],
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
  return Math.min(pilot.duration_days, Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1));
}

export function PilotBrief({ data, compact = false }) {
  const pilot = companyPilot(data);
  if (!pilot) return null;
  const day = pilotDay(pilot);
  return <aside className={`business-pilot-brief${compact ? " is-compact" : ""}`} aria-label="Текущий фокус команды">
    <div className="business-pilot-brief-copy"><strong>{pilot.objective_label || "Фокус команды"}</strong><small>{pilot.success_metric_label || "Результат периода"}</small></div>
    {day && <span>День {day} из {pilot.duration_days}</span>}
  </aside>;
}

export function PilotCommandCenter({ data }) {
  const companyId = data.company.id;
  const pilot = companyPilot(data);
  const [overview, setOverview] = useState(null);
  useEffect(() => {
    if (!pilot) { setOverview(null); return undefined; }
    let current = true;
    api(`/api/company/${companyId}/pilot/overview`).then(value => { if (current) setOverview(value); }).catch(() => { if (current) setOverview(null); });
    return () => { current = false; };
  }, [companyId, pilot?.updated_at]);
  if (!pilot) return null;
  const actions = [
    ["Ситуации", overview ? overview.episodes.total : "—", businessPath(companyId, "episodes")],
    ["Репетиции", overview ? overview.episodes.practice_linked : "—", `${businessPath(companyId, "learning")}?view=manage`],
    ["Обязательства", overview ? `${overview.commitments.completed}/${overview.commitments.total}` : "—", businessPath(companyId, "meetings")],
  ];
  return <section className="business-pilot-command" aria-labelledby="pilot-command-title">
    <header><div><h2 id="pilot-command-title">Фокус команды</h2><p>{pilot.success_metric_label || "Результат периода"}</p></div><Link to={businessPath(companyId, "onboarding")}>Настроить</Link></header>
    <div className="business-pilot-actions-list">{actions.map(([label, value, to]) => <Link key={label} to={to}><span>{label}</span><b>{value}</b><Icon name="arrow-right" size={17}/></Link>)}</div>
  </section>;
}

export function PilotOnboarding({ data, reload }) {
  const companyId = data.company.id;
  const navigate = useNavigate();
  const existing = companyPilot(data);
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
    api(`/api/company/${companyId}/departments`).then(value => { if (current) setDepartments(value || []); }).catch(cause => { if (current) setError(cause.message); }).finally(() => { if (current) setLoadingDepartments(false); });
    return () => { current = false; };
  }, [companyId]);
  async function save(event) {
    event.preventDefault();
    if (form.objective === "CUSTOM" && form.custom_objective.trim().length < 3) { setError("Укажите фокус команды."); return; }
    if (form.target_type === "DEPARTMENT" && !form.department_id) { setError("Выберите подразделение."); return; }
    setBusy(true); setError("");
    try {
      await api(`/api/company/${companyId}/pilot`, { method: "PUT", body: { ...form, department_id: form.target_type === "DEPARTMENT" ? Number(form.department_id) : null, duration_days: Number(form.duration_days) } });
      await reload();
      navigate(businessPath(companyId), { replace: true });
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <form className="business-pilot-onboarding" onSubmit={save}>
    <header><div><h1>{existing ? "Фокус команды" : "Настройте фокус команды"}</h1><p>Выберите, какой рабочий навык команда будет развивать в ближайший период. Эта настройка помогает руководителю выбрать общий приоритет и отслеживать результат.</p></div></header>
    <div className="business-pilot-stage">
      <label className="business-pilot-field">Фокус<select value={form.objective} onChange={event => setForm(current => ({ ...current, objective: event.target.value }))}>{objectives.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {form.objective === "CUSTOM" && <label className="business-pilot-field">Свой фокус<input autoFocus value={form.custom_objective} onChange={event => setForm(current => ({ ...current, custom_objective: event.target.value }))} maxLength="120" placeholder="Например, переговоры о сроках поставки" /></label>}
      <div className="business-pilot-form-grid">
        <label className="business-pilot-field">Группа<select value={form.target_type} onChange={event => setForm(current => ({ ...current, target_type: event.target.value }))}><option value="COMPANY">Вся компания</option><option value="DEPARTMENT">Подразделение</option></select></label>
        {form.target_type === "DEPARTMENT" && <label className="business-pilot-field">Подразделение<select disabled={loadingDepartments} value={form.department_id} onChange={event => setForm(current => ({ ...current, department_id: event.target.value }))}><option value="">Выберите подразделение</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label className="business-pilot-field">Срок<select value={form.duration_days} onChange={event => setForm(current => ({ ...current, duration_days: event.target.value }))}><option value="14">2 недели</option><option value="28">4 недели</option><option value="42">6 недель</option><option value="56">8 недель</option></select></label>
        <label className="business-pilot-field">Результат<select value={form.success_metric} onChange={event => setForm(current => ({ ...current, success_metric: event.target.value }))}>{metrics.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>
      {error && <p className="business-alert" role="alert">{error}</p>}
    </div>
    <footer className="business-pilot-actions"><Link className="subtle-button" to={businessPath(companyId)}>Отмена</Link><button type="submit" className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : existing ? "Сохранить" : "Сохранить фокус"}<Icon name="arrow-right" size={17}/></button></footer>
  </form>;
}
