import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, apiBinary } from "../api";
import "./decision-council.css";

export default function CouncilCallPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const frame = useRef(null);
  const [access, setAccess] = useState({ loading: true, consent: null, entered: false, error: "" });
  const [busy, setBusy] = useState(false);
  const [council, setCouncil] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    setAccess({ loading: true, consent: null, entered: false, error: "" });
    Promise.all([api("/api/council/permissions"), api(`/api/council/${meetingId}`)])
      .then(async ([, council]) => {
        setCouncil(council);
        if (!council.preparation_call || !council.business_meeting_id || !council.company_id) {
          if (active) setAccess({ loading: false, consent: null, entered: true, error: "" });
          return;
        }
        const meeting = await api(`/api/company/${council.company_id}/meetings/${council.business_meeting_id}`);
        const recordingConsent = meeting.consent_required && meeting.consent_purposes.some(item => item.id === "TRANSCRIPT_ANALYSIS");
        const consent = recordingConsent && !["ACCEPTED", "DECLINED"].includes(meeting.my_consent_preferences?.TRANSCRIPT_ANALYSIS)
          ? { companyId: council.company_id, meetingId: council.business_meeting_id, title: meeting.title }
          : null;
        if (active) setAccess({ loading: false, consent, entered: !consent, error: "" });
      })
      .catch(error => { if (active) setAccess({ loading: false, consent: null, entered: false, error: error.message }); });
    return () => { active = false; };
  }, [meetingId, user?.id]);

  async function enter(accepted) {
    setBusy(true);
    try {
      await api(`/api/company/${access.consent.companyId}/meetings/${access.consent.meetingId}/consent`, {
        method: "POST", body: { accepted, purposes: ["TRANSCRIPT_ANALYSIS"] },
      });
      setAccess(current => ({ ...current, entered: true, error: "" }));
    } catch (error) {
      setAccess(current => ({ ...current, error: error.message }));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || user && access.loading) return <main className="council-page"><p role="status">Проверяем доступ к звонку…</p></main>;
  if (!user) return <main className="council-page"><h1>Войдите в аккаунт компании</h1><Link to="/login">Войти</Link></main>;
  if (access.error && !access.consent) return <main className="council-page"><section className="council-panel" role="alert"><h1>Звонок недоступен</h1><p>{access.error}</p><Link to="/app">Вернуться</Link></section></main>;
  if (!access.entered && access.consent) return <main className="council-page council-call-consent"><section className="council-panel" aria-labelledby="call-consent-title">
    <span className="council-kicker">ПЕРЕД ТЕСТОВЫМ СОЗВОНОМ</span>
    <h1 id="call-consent-title">Запись и анализ речи</h1>
    <p>При включённом микрофоне ваша речь может быть записана и расшифрована для черновика отчёта по встрече «{access.consent.title}». Камера не записывается. Черновик видит руководитель; участникам отчёт отправляется после его проверки.</p>
    <p>Вы можете участвовать со звуком или видео без записи собственной речи. В этом случае ваши устные реплики не попадут в автоматический разбор.</p>
    {access.error && <p role="alert">{access.error}</p>}
    <div className="council-action-row"><button type="button" className="council-button" disabled={busy} onClick={() => enter(true)}>Согласен на запись и анализ</button><button type="button" className="council-button council-button--outline" disabled={busy} onClick={() => enter(false)}>Войти без записи</button></div>
    <p><Link to={`/business/${access.consent.companyId}/meetings?meeting=${access.consent.meetingId}`}>Назад к встрече</Link></p>
  </section></main>;

  const base = `/api/council-runtime/${meetingId}`;
  function connect() {
    const win = frame.current.contentWindow;
    win.councilBridge = {
      request: (action, body) => api(base + (action ? `/${action}` : ""), { method: body ? "POST" : "GET", body }),
      upload: (id, blob) => apiBinary(`${base}/audio/${id}`, blob, { method: "POST" }),
      complete: ({ ended } = {}) => navigate(ended && council?.business_meeting_id && council?.company_id ? `/business/${council.company_id}/meetings?meeting=${council.business_meeting_id}` : council?.company_id ? `/business/${council.company_id}/council/${meetingId}` : `/council/${meetingId}`, { replace: true }),
    };
    win.dispatchEvent(new win.Event("council-ready"));
  }
  return <iframe ref={frame} title="Групповой звонок Совета решений" src={`/council-call/index.html?meeting=${meetingId}`} onLoad={connect} allow="camera; microphone; display-capture; autoplay" style={{ position: "fixed", inset: 0, width: "100%", height: "100dvh", border: 0, zIndex: 1000, background: "#e7f1ec" }} />;
}
