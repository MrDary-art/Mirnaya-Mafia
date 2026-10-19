import PageHeader from "../design/PageHeader.jsx";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { businessPracticePath } from "../business/navigation.js";
import { ArenaShareEntry } from "../components/feed/ArenaShares.jsx";

const difficultyLabel = { easy: "Легко", medium: "Средне", hard: "Сложно", expert: "Эксперт", brutal: "Эксперт" };

export default function Scenarios() {
  const nav = useNavigate();
  const { companyId } = useParams();
  const [scenarios, setScenarios] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [completedScenarioIds, setCompletedScenarioIds] = useState(new Set());
  const scenarioBase = companyId ? businessPracticePath(companyId, "scenarios") : "/scenarios";
  const startScenario = (scenarioId) => nav(companyId ? `${scenarioBase}/setup?preset=${scenarioId}` : `/setup?preset=${scenarioId}`);
  async function load() {
    setLoading(true); setError("");
    try {
      const [items, profile] = await Promise.all([api("/api/scenarios"), api("/api/profile").catch(() => null)]);
      setScenarios(items);
      setCompletedScenarioIds(new Set(profile?.unique_scenarios || []));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const orderedScenarios = [...scenarios].sort((left, right) => Number(completedScenarioIds.has(left.id)) - Number(completedScenarioIds.has(right.id)));
  return <div className="scenario-catalog"><PageHeader title="Сценарные переговоры" />
    {loading && <div className="scenario-catalog-grid" role="status" aria-label="Загружаем сценарии">{[1, 2, 3, 4].map((n) => <div key={n} className="scenario-card scenario-card-skeleton animate-pulse" />)}</div>}{error && <div className="mt-6 glass rounded-3xl p-6 text-rose-200">Не удалось загрузить сценарии. <button onClick={load} className="ml-2 text-lime-300 underline">Повторить</button></div>}{!loading && !error && !scenarios.length && <div className="mt-6 glass rounded-3xl p-6 text-slate-300">Сценариев пока нет.</div>}
    <div className="scenario-catalog-grid">{!loading && !error && orderedScenarios.map((s) => { const completed = completedScenarioIds.has(s.id); return <article key={s.id} className={`scenario-card${completed ? " is-completed" : ""}`}><div className="scenario-card-top"><span>{s.category}</span><span>{completed && <b className="scenario-card-status">Пройдено</b>}{s.minutes ? `≈ ${s.minutes} мин · ` : ""}{difficultyLabel[s.difficulty] || s.difficulty}</span></div><h2>{s.title}</h2><p>{s.description || s.context}</p><dl className="scenario-card-roles"><div><dt>Ваша роль</dt><dd>{s.roles?.player || "Не указана"}</dd></div><div><dt>Оппонент</dt><dd>{s.opponent || s.roles?.opponent || "Не указан"}</dd></div></dl><div className="scenario-card-actions"><button type="button" className="scenario-card-open" onClick={() => startScenario(s.id)}>{completed ? "Пройти ещё раз" : "Начать"}</button><ArenaShareEntry kind="SCENARIO" contentId={s.id} iconOnly>Поделиться</ArenaShareEntry></div></article>; })}</div>
  </div>;
}
