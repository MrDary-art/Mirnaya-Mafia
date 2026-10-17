import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import VoiceConversation from "../components/VoiceConversation.jsx";
import Icon from "../components/Icon.jsx";
import "./scenario-scroll.css";

export default function Play() {
  const { id, companyId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [coach, setCoach] = useState("");
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState("");
  const [left, setLeft] = useState(null);
  const [guess, setGuess] = useState(0);
  const [chaosEvent, setChaosEvent] = useState(null);
  const [chaosResponse, setChaosResponse] = useState(null);
  const [error, setError] = useState("");
  const [scenarioDetails, setScenarioDetails] = useState(null);
  const chosen = useRef(null);
  const chatRef = useRef(null);
  const followLatest = useRef(true);
  const [unread, setUnread] = useState(false);

  function showLatest() {
    followLatest.current = true;
    setUnread(false);
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }

  function onChatScroll() {
    const chat = chatRef.current;
    if (!chat) return;
    followLatest.current = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
    if (followLatest.current) setUnread(false);
  }

  async function load() {
    const s = await api(`/api/sessions/${id}`);
    setData(s);
    const t = s.settings?.timer;
    setLeft(t || null);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!data?.scenario_id || data.mode !== "scenario") return undefined;
    let active = true;
    api("/api/scenarios").then((items) => {
      if (active) setScenarioDetails(items.find((item) => item.id === data.scenario_id) || null);
    }).catch(() => {
      if (active) setScenarioDetails(null);
    });
    return () => { active = false; };
  }, [data?.mode, data?.scenario_id]);

  useEffect(() => {
    if (!left || !data || data.mode !== "scenario" || data.status !== "active") return undefined;
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          submit(chosen.current || data.step?.options?.[0]?.id, true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [data?.step?.id, Boolean(data?.settings?.timer)]);

  useLayoutEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    if (followLatest.current) chat.scrollTop = chat.scrollHeight;
    else setUnread(true);
  }, [data?.messages]);

  async function submit(optionId, timeout = false, usedHint = false) {
    if (!optionId || busy) return;
    followLatest.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await api(`/api/sessions/${id}/choice`, {
        method: "POST",
        body: { option_id: optionId, timeout, used_hint: usedHint },
      });
      
      // Проверка на событие хаоса
      if (res.chaos_event && data?.settings?.chaos) {
        setChaosEvent(res.chaos_event);
        setChaosResponse(null);
        setBusy(false);
        return;
      }
      
      setCoach(res.coach || "");
      if (res.finished) {
        if (data?.settings?.hidden_goal) {
          await api(`/api/sessions/${id}/guess`, { method: "POST", body: { index: Number(guess) } });
        }
        nav(companyId ? `/business/${companyId}/report/${id}` : `/report/${id}`, { state: { returnTo: location.state?.returnTo } });
        return;
      }
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
      setLeft(msgs.settings?.timer || null);
      chosen.current = null;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  
  async function handleChaosResponse(choiceIndex) {
    if (!chaosEvent || busy) return;
    setBusy(true);
    try {
      const res = await api(`/api/sessions/${id}/chaos-response`, {
        method: "POST",
        body: { event_type: chaosEvent.type, choice_index: choiceIndex },
      });
      setChaosEvent(null);
      setChaosResponse(null);
      setCoach(res.coach || "");
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
      setLeft(msgs.settings?.timer || null);
      chosen.current = null;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendFree() {
    if (!free.trim()) return;
    setBusy(true);
    try {
      const res = await api(`/api/sessions/${id}/message`, { method: "POST", body: { text: free } });
      setFree("");
      setCoach(res.coach || "");
      if (res.finished) {
        nav(companyId ? `/business/${companyId}/report/${id}` : `/report/${id}`, { state: location.state });
        return;
      }
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishSession() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (data?.settings?.hidden_goal) {
        await api(`/api/sessions/${id}/guess`, { method: "POST", body: { index: Number(guess) } });
      }
      await api(`/api/sessions/${id}/finish`, { method: "POST" });
      nav(companyId ? `/business/${companyId}/report/${id}` : `/report/${id}`, { state: { returnTo: location.state?.returnTo } });
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  }

  if (!data && error) return <div className="glass report-load-state" role="alert"><h1>Сценарий не открылся</h1><p>{error}</p><button className="primary-button" onClick={() => { setError(""); load().catch((cause) => setError(cause.message)); }}>Повторить</button></div>;
  if (!data) return <div className="text-slate-400">Загрузка сцены…</div>;
  if (data.mode === "online") return <Navigate to={companyId ? `/business/${companyId}/dialogue/${id}` : `/practice?session=${id}`} replace />;

  const hasAnswered = data.status === "active" && Number(data.state?.turns || 0) > 0;

  // Модальное окно события хаоса
  if (chaosEvent && data?.settings?.chaos) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="glass max-w-md rounded-3xl p-6">
          <div className="mb-4 flex items-center gap-2 text-2xl font-bold text-rose-300"><Icon name="zap" size={25} /> {chaosEvent.title}</div>
          <p className="mb-6 text-slate-300">{chaosEvent.description}</p>
          <div className="space-y-3">
            {chaosEvent.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleChaosResponse(i)}
                disabled={busy}
                className="w-full rounded-2xl border border-white/15 p-4 text-left hover:border-rose-300/40 hover:bg-rose-500/10"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="play-workspace grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
      <section className="play-conversation">
        {data.mode === "scenario" && data.settings?.timer ? <div className={`play-session-timer${left < 8 ? " is-urgent" : ""}`}>{left} с</div> : null}
        <div className="scenario-transcript-frame">
        <div ref={chatRef} onScroll={onChatScroll} role="log" aria-label="История переговоров" aria-live="polite" aria-relevant="additions" tabIndex={0} className="scenario-transcript glass space-y-3 overflow-y-auto rounded-3xl p-5">
          {(data.messages || []).map((m, i) => (
            <div key={i} className={`max-w-[90%] rounded-2xl px-4 py-3 ${m.sender === "player" ? "ml-auto bg-lime-400/15" : "bg-white/5"}`}>
              <div className="text-xs uppercase tracking-wide text-slate-500">{m.sender === "player" ? "Вы" : data.opponent_role}</div>
              <div>{m.text}</div>
            </div>
          ))}
        </div>
        {unread && <button type="button" className="scenario-new-messages" onClick={showLatest}>Новые сообщения ↓</button>}
        </div>
        <div className="scenario-turn-status" role="status">{busy ? "Отправляем ответ…" : ""}</div>
        {coach && data.settings?.ghost && (
          <div className="mt-3 rounded-2xl border border-lime-400/30 bg-lime-500/10 px-4 py-3 text-sm text-lime-100">
            Тренер-призрак: {coach}
          </div>
        )}
        {data.mode === "scenario" && data.status === "active" && data.step && (
          <div className="scenario-choices mt-4 grid gap-3" aria-label="Варианты ответа" aria-busy={busy}>
            {data.step.options.map((o) => (
              <button
                key={o.id}
                disabled={busy}
                onClick={() => submit(o.id, false, false)}
                onMouseEnter={() => {
                  chosen.current = o.id;
                }}
                className="glass rounded-2xl p-4 text-left hover:border-lime-300/40 hover:shadow-neon"
              >
                {o.text}
                {data.settings?.ghost && data.settings?.skill === "новичок" && o.hint && (
                  <div className="mt-2 text-xs text-lime-200">{o.hint}</div>
                )}
              </button>
            ))}
          </div>
        )}
        {data.mode === "online" && data.status === "active" && (
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-2xl bg-black/30 p-3 ring-1 ring-white/10"
              placeholder="Ваша реплика для переговоров"
              value={free}
              onChange={(e) => setFree(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendFree(); }}
            />
            <button onClick={sendFree} disabled={busy} className="rounded-2xl bg-lime-400 px-4 font-semibold text-slate-950 disabled:opacity-50">
              {busy ? "Отправка…" : "Сказать"}
            </button>
          </div>
        )}
        {data.mode === "online" && data.status === "active" && (
          <VoiceConversation sessionId={id} onTurn={(result) => result?.finished ? nav(companyId ? `/business/${companyId}/report/${id}` : `/report/${id}`, { state: location.state }) : load()} />
        )}
        {data.settings?.hidden_goal && data.hidden_options && (
          <div className="mt-4 glass rounded-2xl p-4 text-sm">
            <div className="mb-2 text-slate-400">Скрытая цель оппонента (выбор зачтётся в финале)</div>
            <select className="w-full rounded-xl bg-black/30 p-2" value={guess} onChange={(e) => setGuess(e.target.value)}>
              {data.hidden_options.map((opt, i) => (
                <option key={i} value={i}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
        {hasAnswered && (
          <div className="play-finish-row">
            <button
              type="button"
              className="primary-button play-finish-action"
              disabled={busy}
              onClick={finishSession}
              aria-label="Завершить тренировку и перейти к выводам"
            >
              {busy ? "Завершаем…" : "Завершить"}
            </button>
          </div>
        )}
        {error && <p className="play-error" role="alert">{error}</p>}
      </section>
      <aside className="play-sidebar space-y-4">
        <section className="glass play-scenario-briefing" aria-labelledby="play-scenario-title">
          <header>
            <span>Сценарий</span>
            <h2 id="play-scenario-title">{data.title}</h2>
            <p>Условия остаются перед глазами во время переговоров.</p>
          </header>
          <dl>
            <div><dt>Ваша роль</dt><dd>{data.role}</dd></div>
            <div><dt>Длительность</dt><dd>{scenarioDetails?.minutes ? `≈ ${scenarioDetails.minutes} минут` : "Время не указано"}</dd></div>
            <div className="play-scenario-briefing-wide"><dt>Ситуация</dt><dd>{data.context}</dd></div>
            <div className="play-scenario-briefing-wide"><dt>Ваша цель</dt><dd>{data.goal}</dd></div>
          </dl>
        </section>
        <MetricsBar metrics={data.metrics} />
      </aside>
    </div>
  );
}
