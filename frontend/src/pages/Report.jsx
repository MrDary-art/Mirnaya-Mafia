import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import ReportDocument from "../components/ReportDocument.jsx";

export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [report, setReport] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    api(`/api/sessions/${id}/report`).then((data) => {
      if (cancelled) return;
      setReport(data);
      refresh();
    }).catch((reason) => { if (!cancelled) setError(reason.message); });
    api(`/api/sessions/${id}`).then((data) => { if (!cancelled) setSessionMeta(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  if (!report && error) return <div className="glass report-load-state" role="alert"><h1>Отчёт пока не открылся</h1><p>{error}</p><button className="primary-button" onClick={() => setReloadKey((value) => value + 1)}>Повторить загрузку</button></div>;
  if (!report) return <div className="glass report-load-state" role="status">Открываем ваш разбор…</div>;

  const retryPath = sessionMeta?.settings?.mode === "online" ? "/setup?mode=online" : sessionMeta?.scenario_id ? `/setup?preset=${encodeURIComponent(sessionMeta.scenario_id)}` : null;
  return <ReportDocument
    report={report}
    sessionMeta={sessionMeta}
    onRetry={retryPath ? () => nav(retryPath) : null}
    onReturn={() => nav(location.state?.returnTo || "/")}
  />;
}
