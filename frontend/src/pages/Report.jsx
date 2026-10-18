import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, downloadPrivate } from "../api.js";
import ReportDocument from "../components/ReportDocument.jsx";
import { businessPracticePath } from "../business/navigation.js";

export default function Report() {
  const { id, companyId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  useEffect(() => {
    let alive = true, timer;
    setError("");
    async function load() {
      try {
        const [result, meta] = await Promise.all([api(`/api/sessions/${id}/report`), api(`/api/sessions/${id}`)]);
        if (!alive) return;
        setSession(meta); setReport(result);
        if (["queued", "processing"].includes(result.report_status)) timer = setTimeout(load, 1800);
      } catch (cause) { if (alive) setError(cause.message); }
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, revision]);
  async function retryReport() {
    setRetrying(true); setError("");
    try { await api(`/api/sessions/${id}/report/retry`, { method: "POST" }); setRevision(value => value + 1); }
    catch (cause) { setError(cause.message); }
    finally { setRetrying(false); }
  }
  async function repeat() {
    if (companyId && session?.settings?.corporate?.assignment_id) {
      try {
        const result = await api(`/api/company/${companyId}/assignments/${session.settings.corporate.assignment_id}/start`,{method:"POST"});
        nav(`/business/${companyId}/play/${result.session_id}`,{state:{returnTo:`/business/${companyId}/assignments`}});
      } catch(cause) { setError(cause.message); }
      return;
    }
    const returnTo = companyId ? `/business/${encodeURIComponent(companyId)}/report/${id}` : `/report/${id}`;
    const state = { returnTo, returnState: location.state };
    if (session?.mode === "online") nav(companyId ? `${businessPracticePath(companyId, "ai")}/prepare?retry=${id}` : `/ai/prepare?retry=${id}`, { state });
    else nav(companyId ? `${businessPracticePath(companyId, "scenarios")}/setup?preset=${encodeURIComponent(session?.scenario_id || "")}` : `/setup?preset=${encodeURIComponent(session?.scenario_id || "")}`, { state });
  }
  const awaitingRelease = report?.report_status === "awaiting_release";
  if (!report || report.report_status) return <section className="practice-status-panel" role="status">
    <span className="eyebrow">ВАШ РАЗГОВОР</span>
    <h1>{error ? "Не удалось открыть разбор" : awaitingRelease ? "Результат ожидает публикации" : report?.report_status === "failed" ? "Разговор сохранён. Анализ нужно повторить" : "Разговор сохранён. Готовим разбор"}</h1>
    <p>{error || (report?.message === "Разговор сохранён. Готовим разбор" ? "Проверяем последовательность реплик и связываем выводы с вашими ответами. Можно закрыть страницу: результат останется в истории." : report?.message) || "Проверяем последовательность реплик и связываем выводы с вашими ответами. Можно закрыть страницу: результат останется в истории."}</p>
    <div className="practice-actions">{error ? <button className="primary-button" onClick={() => setRevision(value => value + 1)}>Повторить загрузку</button> : awaitingRelease ? <button className="primary-button" onClick={() => setRevision(value => value + 1)}>Проверить публикацию</button> : report?.report_status === "failed" ? <button className="primary-button" disabled={retrying} onClick={retryReport}>Повторить анализ</button> : <span className="practice-pending"><i />Подготавливаем разбор</span>}<Link className="subtle-button" to={companyId ? `/business/${companyId}/results` : "/history"}>{companyId ? "К результатам" : "В историю"}</Link></div>
  </section>;
  return <div className="report-page">
    {error && <p role="alert" className="business-alert">{error}</p>}
    {report.analysis_refresh_warning && <p role="status" className="business-alert">{report.analysis_refresh_warning}</p>}
    {session?.mode === "online" && <section className="practice-review"><p>Составьте расширенный отчёт по сохранённой беседе: он проверит цитаты, правила оценки и рекомендации. Результат игры и награды не начисляются повторно.</p><button className="subtle-button" disabled={retrying} onClick={retryReport}>{retrying?"Составляем отчёт…":"Составить более детальный отчёт"}</button></section>}
    <ReportDocument
      report={report}
      sessionMeta={session}
      onRetry={repeat}
      nextActionsOnly={session?.mode === "scenario"}
      {...(session?.mode !== "scenario" && {
        onReturn: () => nav(companyId ? `/business/${companyId}/results` : "/history"),
        pdfLoading,
        onDownloadPdf: async () => {
          setPdfLoading(true);
          try { await downloadPrivate(`/api/sessions/${id}/report/pdf`, `arena-report-${id}.pdf`); }
          catch (reason) { setError(reason.message); }
          finally { setPdfLoading(false); }
        },
      })}
    />
  </div>;
}
