import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, downloadPrivate } from "../api.js";
import ReportDocument from "../components/ReportDocument.jsx";
import { ArenaShareEntry } from "../components/feed/ArenaShares.jsx";

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
    const state = { returnTo: `/report/${id}`, returnState: location.state };
    if (session?.mode === "online") nav(`/ai/prepare?retry=${id}`, { state });
    else nav(`/setup?preset=${encodeURIComponent(session?.scenario_id || "")}`, { state });
  }
  const awaitingRelease = report?.report_status === "awaiting_release";
  if (!report || report.report_status) return <section className="practice-status-panel" role="status">
    <span className="eyebrow">ВАШ РАЗГОВОР</span>
    <h1>{error ? "Не удалось открыть разбор" : awaitingRelease ? "Результат ожидает публикации" : report?.report_status === "failed" ? "Разговор сохранён. Анализ нужно повторить" : "Разговор сохранён. Готовим разбор"}</h1>
    <p>{error || report?.message || "Проверяем последовательность реплик и связываем выводы с вашими ответами. Можно закрыть страницу: результат останется в истории."}</p>
    <div className="practice-actions">{error ? <button className="primary-button" onClick={() => setRevision(value => value + 1)}>Повторить загрузку</button> : awaitingRelease ? <button className="primary-button" onClick={() => setRevision(value => value + 1)}>Проверить публикацию</button> : report?.report_status === "failed" ? <button className="primary-button" disabled={retrying} onClick={retryReport}>Повторить анализ</button> : <span className="practice-pending"><i />Подготавливаем разбор</span>}<Link className="subtle-button" to={companyId ? `/business/${companyId}/results` : "/history"}>{companyId ? "К результатам" : "В историю"}</Link></div>
  </section>;
  return <div className="report-page">
    {session?.mode === "online" && report.narrative?.source === "transcript" && <section className="practice-review"><p>Разговор сохранён. Можно ещё раз запросить подробный разбор у ИИ.</p><button disabled={retrying} className="subtle-button" onClick={retryReport}>{retrying ? "Запрашиваем…" : "Повторить анализ"}</button>{error && <p role="alert">{error}</p>}</section>}
    {error && <p role="alert" className="business-alert">{error}</p>}
    <ReportDocument report={report} sessionMeta={session} onRetry={repeat} onReturn={() => nav(companyId ? `/business/${companyId}/results` : "/history")} pdfLoading={pdfLoading} onDownloadPdf={async () => { setPdfLoading(true); try { await downloadPrivate(`/api/sessions/${id}/report/pdf`, `arena-report-${id}.pdf`); } catch (reason) { setError(reason.message); } finally { setPdfLoading(false); } }} />
    {session?.mode === "scenario" && <div className="mt-5"><Link className="primary-button inline-flex items-center gap-2" to={companyId ? `/business/${companyId}/report/${id}/ideal-dialogue` : `/report/${id}/ideal-dialogue`}>Разобрать альтернативный ход сценария <span aria-hidden="true">↗</span></Link>{!companyId && <div className="arena-report-share"><ArenaShareEntry kind="RESULT" contentId={id}>Поделиться фактом прохождения</ArenaShareEntry><p>В ленту можно добавить название сценария и отметку о завершении. Реплики и подробный отчёт останутся личными.</p></div>}</div>}
  </div>;
}
