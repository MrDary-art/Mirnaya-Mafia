import { useEffect, useState } from "react";
import { api } from "../api.js";
import { metricLabels, formatDate, Loader, Notice } from "./shared.jsx";

export function AttemptReport({ data, attempt, initiallyOpen = false, hideToggle = false }) {
  const [opened, setOpened] = useState(false), [result, setResult] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    if (!initiallyOpen) return;
    let active = true;
    setOpened(true);
    api(`/api/company/${data.company.id}/attempts/${attempt.id}/report`).then(value => { if (active) setResult(value); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [initiallyOpen, data.company.id, attempt.id]);
  async function open() {
    if (opened) { setOpened(false); return; }
    setOpened(true); setError("");
    if (result && result.report_status !== "awaiting_release") return;
    try { setResult(await api(`/api/company/${data.company.id}/attempts/${attempt.id}/report`)); }
    catch (cause) { setError(cause.message); }
  }
  const report = result?.report || {};
  const verdict = typeof report.verdict === "string" ? report.verdict : report.verdict?.summary || report.verdict?.title;
  return <section className="business-attempt-report">
    {!hideToggle && <button type="button" className="subtle-button" aria-expanded={opened} onClick={open}>{opened ? "Скрыть разбор" : "Открыть разбор"}</button>}
    {opened && <div className="business-attempt-report-panel">
      {error && <Notice tone="red">{error}</Notice>}
      {!result && !error && <Loader />}
      {result?.report_status === "awaiting_release" && <Notice>{result.message || "Результат ожидает публикации руководителем."}{result.release_at && <> Дата открытия: {formatDate(result.release_at)}.</>}</Notice>}
      {result && result.report_status !== "awaiting_release" && <>
        <h4>{report.scenario_title || attempt.assignment_title || "Результат попытки"}</h4>
        <dl className="business-attempt-score-grid">{[["Итог", result.score], ["Результат Arena", result.arena_score], ["KPI компании", result.company_score]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null ? "Не оценивалось" : `${value} / 100`}</dd></div>)}</dl>
        {verdict && <p className="business-attempt-verdict">{verdict}</p>}
        <dl className="business-attempt-metric-grid">{Object.entries(result.metrics || {}).map(([metric, value]) => <div key={metric}><dt>{metricLabels[metric] || metric}</dt><dd>{value == null ? "Нет данных" : `${value} / 100`}</dd></div>)}</dl>
        {result.kpi_results?.length > 0 && <section className="business-attempt-kpis"><h5>Критерии компании</h5><div>{result.kpi_results.map((kpi, index) => <article key={kpi.id || index}><b>{kpi.name}</b><p>{!kpi.available ? "Нет данных для оценки" : `${kpi.passed ? "Критерий выполнен" : "Критерий не выполнен"} · ${kpi.score} / 100`}</p>{kpi.note && <small>{kpi.note}</small>}</article>)}</div></section>}
        <p className="business-attempt-report-note">Завершено: {formatDate(result.completed_at)}. Оценки относятся к этой корпоративной попытке.</p>
        {attempt.session_id && <a className="subtle-button" href={`${data.business_base || ""}/report/${attempt.session_id}`}>Полный личный разбор</a>}
      </>}
    </div>}
  </section>;
}
