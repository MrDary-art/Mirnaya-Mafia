import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import ReportDocument from "../components/ReportDocument.jsx";

export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [retrying, setRetrying] = useState(false);
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
  function repeat() {
    if (session?.mode === "online") nav(`/ai/prepare?retry=${id}`);
    else nav(`/setup?preset=${encodeURIComponent(session?.scenario_id || "")}`);
  }
  if (!report || report.report_status) return <section className="practice-status-panel" role="status">
    <span className="eyebrow">ВАШ РАЗГОВОР</span>
    <h1>{report?.report_status === "failed" ? "Разговор сохранён. Анализ нужно повторить" : error ? "Не удалось открыть разбор" : "Разговор сохранён. Готовим разбор"}</h1>
    <p>{error || report?.message || "Проверяем последовательность реплик и связываем выводы с вашими ответами. Можно закрыть страницу: результат останется в истории."}</p>
    <div className="practice-actions">{report?.report_status === "failed" ? <button className="primary-button" disabled={retrying} onClick={retryReport}>Повторить анализ</button> : error ? <button className="primary-button" onClick={() => setRevision(value => value + 1)}>Повторить загрузку</button> : <span className="practice-pending"><i />Подготавливаем разбор</span>}<Link className="subtle-button" to="/history">В историю</Link></div>
  </section>;
  return <div className="report-page">{session?.mode === "online" && report.narrative?.source === "transcript" && <section className="practice-review"><p>Разговор сохранён. Можно ещё раз запросить подробный разбор у ИИ.</p><button disabled={retrying} className="subtle-button" onClick={retryReport}>{retrying ? "Запрашиваем…" : "Повторить анализ"}</button>{error && <p role="alert">{error}</p>}</section>}<ReportDocument report={report} sessionMeta={session} onRetry={repeat} onReturn={() => nav("/history")} />{session?.mode === "scenario" && <Link className="subtle-button mt-5" to={`/report/${id}/ideal-dialogue`}>Разобрать альтернативный ход сценария</Link>}</div>;
}
