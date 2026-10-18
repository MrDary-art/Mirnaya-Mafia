import { useState } from "react";
import { api } from "../api.js";
import { useEffect, Loader, Notice } from "./shared.jsx";

export function ManagerOverview({ data }) {
  const id = data.company.id;
  const [overview, setOverview] = useState(null), [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const results = await Promise.allSettled([api(`/api/company/${id}/analytics`), api(`/api/company/${id}/employees`), api(`/api/company/${id}/programs`), api(`/api/company/${id}/cohorts`)]);
      const [analyticsResult, employeesResult, programsResult, cohortsResult] = results;
      if (analyticsResult.status === "rejected" || employeesResult.status === "rejected") throw analyticsResult.reason || employeesResult.reason;
      setOverview({ analytics: analyticsResult.value, employees: employeesResult.value, programs: programsResult.status === "fulfilled" ? programsResult.value : [], cohorts: cohortsResult.status === "fulfilled" ? cohortsResult.value : [] });
    }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { setOverview(null); load(); }, [id]);
  if (!overview) return <Loader error={error} onRetry={load} />;
  const { analytics, employees, programs, cohorts } = overview;
  const activePeople = employees.filter(person => person.status === "ACTIVE");
  const newPeople = activePeople.filter(person => person.joined_at && Date.now() - new Date(person.joined_at).getTime() < 30 * 86400000).length;
  const activePrograms = programs.filter(program => ["PUBLISHED", "ACTIVE"].includes(program.status));
  const completion = analytics.assigned ? Math.round(analytics.completed * 100 / analytics.assigned) : null;
  return <div className="business-overview-page space-y-6">
    <section className="business-overview-metrics glass rounded-3xl p-5"><dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[["Активные сотрудники", activePeople.length], ["Новые за 30 дней", newPeople], ["Опубликованные программы", activePrograms.length], ["Учебные команды", cohorts.length]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-2 text-2xl font-bold tabular-nums">{value}</dd></div>)}</dl></section>
    {analytics.overdue > 0 && <Notice tone="red">Просрочено назначений: {analytics.overdue}.</Notice>}
    <section className="business-overview-learning glass rounded-3xl p-5"><h3 className="text-xl font-bold">Ход обучения</h3><dl className="mt-5 grid gap-4 sm:grid-cols-3">{[["Назначено", analytics.assigned], ["Завершено", analytics.completed], ["Доля завершения", completion == null ? "Нет назначений" : `${completion}%`]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd></div>)}</dl><p className="mt-4 text-sm text-slate-400">{analytics.data_note}</p></section>
  </div>;
}

