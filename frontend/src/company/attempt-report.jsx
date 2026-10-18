import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { metricLabels, formatDate, Loader, Notice } from "./shared.jsx";

export function AttemptReport({ data, attempt, initiallyOpen = false }) {
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
  const [saved, setSaved] = useState(null), [saving, setSaving] = useState(false);
  async function saveArchive() {
    setSaving(true); setError("");
    try { setSaved(await api(`/api/company/${data.company.id}/attempts/${attempt.id}/archive`, { method: "POST" })); }
    catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }
  const report = result?.report || {};
  const verdict = typeof report.verdict === "string" ? report.verdict : report.verdict?.summary || report.verdict?.title;
  return <div className="mt-3"><button type="button" className="subtle-button" aria-expanded={opened} onClick={open}>{opened ? "Свернуть разбор" : "Открыть корпоративный разбор"}</button>{opened && <div className="mt-4 space-y-4 rounded-2xl border border-white/10 p-4">{error && <Notice tone="red">{error}</Notice>}{!result && !error && <Loader />}{result?.report_status === "awaiting_release" && <Notice>{result.message || "Результат ожидает публикации руководителем."}{result.release_at && <> Дата открытия: {formatDate(result.release_at)}.</>}</Notice>}{result && result.report_status !== "awaiting_release" && <><h4 className="text-lg font-bold">{report.scenario_title || attempt.assignment_title || "Результат попытки"}</h4><dl className="grid gap-3 sm:grid-cols-3">{[["Итог", result.score], ["Результат Arena", result.arena_score], ["KPI компании", result.company_score]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-1 text-xl font-bold">{value == null ? "Не оценивалось" : `${value} / 100`}</dd></div>)}</dl>{verdict && <p className="text-slate-300">{verdict}</p>}<dl className="grid gap-3 sm:grid-cols-2">{Object.entries(result.metrics || {}).map(([metric, value]) => <div key={metric}><dt className="text-sm text-slate-400">{metricLabels[metric] || metric}</dt><dd className="mt-1">{value == null ? "Нет данных" : `${value} / 100`}</dd></div>)}</dl>{result.kpi_results?.length > 0 && <section><h5 className="font-bold">Критерии компании</h5><div className="mt-3 space-y-3">{result.kpi_results.map((kpi, index) => <div key={kpi.id || index} className="rounded-xl bg-white/5 p-3"><b>{kpi.name}</b><p className="mt-1 text-sm">{!kpi.available ? "Нет данных для оценки" : `${kpi.passed ? "Критерий выполнен" : "Критерий не выполнен"} · ${kpi.score} / 100`}</p>{kpi.note && <p className="mt-1 text-xs text-slate-400">{kpi.note}</p>}</div>)}</div></section>}<p className="text-xs text-slate-400">Завершено: {formatDate(result.completed_at)}. Оценки относятся к этой корпоративной попытке.</p>{result.membership_id === data.membership.id && <div className="profile-results-actions"><button className="subtle-button" disabled={saving || Boolean(saved)} onClick={saveArchive}>{saving ? "Сохраняем…" : saved ? "Сохранено в архиве" : "Сохранить отчёт в мой архив"}</button>{saved && <Link className="subtle-button" to={`/business/${data.company.id}/profile?view=tools&record=${saved.id}`}>Открыть запись в архиве</Link>}</div>}{(attempt.session_id || result.session_id) && result.membership_id === data.membership.id && <a className="subtle-button inline-flex" href={`${data.business_base || ""}/report/${attempt.session_id || result.session_id}`}>Полный личный разбор</a>}</>}</div>}</div>;
}
