import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import VoiceConversation from "../components/VoiceConversation.jsx";

export default function Play() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [coach, setCoach] = useState("");
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState("");
  const [left, setLeft] = useState(null);
  const [guess, setGuess] = useState("");
  const [chaosEvent, setChaosEvent] = useState(null);
  const [chaosResponse, setChaosResponse] = useState(null);
  const [hintUsed, setHintUsed] = useState(false);
  const chosen = useRef(null);
  const submitting = useRef(false);
  const hintUsedRef = useRef(false);

  async function load() {
    const s = await api(`/api/sessions/${id}`);
    setData(s);
    setChaosEvent(s.pending_chaos || null);
    setHintUsed(false);
    hintUsedRef.current = false;
    const t = s.settings?.timer;
    setLeft(t ? s.timer_remaining ?? t : null);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, [id]);

  useEffect(() => {
    if (!left || !data || chaosEvent || data.mode !== "scenario" || data.status !== "active") return undefined;
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          window.setTimeout(() => submit(chosen.current || data.step?.options?.[0]?.id, true, hintUsedRef.current), 0);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [data?.step?.id, Boolean(data?.settings?.timer), Boolean(chaosEvent)]);

  async function submit(optionId, timeout = false, usedHint = false) {
    if (!optionId || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (data?.settings?.hidden_goal && guess !== "") {
        await api(`/api/sessions/${id}/guess`, { method: "POST", body: { index: Number(guess) } });
      }
      const res = await api(`/api/sessions/${id}/choice`, {
        method: "POST",
        body: { option_id: optionId, timeout, used_hint: usedHint },
      });
      
      // Проверка на событие хаоса
      if (res.chaos_event && data?.settings?.chaos) {
        setData(res.session);
        setChaosEvent(res.chaos_event);
        setChaosResponse(null);
        setBusy(false);
        return;
      }
      
      setCoach(res.coach || "");
      if (res.finished) {
        nav(`/report/${id}`, { state: { returnTo: location.state?.returnTo } });
        return;
      }
      setData(res.session);
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
      setLeft(msgs.settings?.timer ? msgs.timer_remaining ?? msgs.settings.timer : null);
      chosen.current = null;
      setHintUsed(false);
      hintUsedRef.current = false;
    } catch (e) {
      alert(e.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  
  async function handleChaosResponse(choiceIndex) {
    if (!chaosEvent || busy) return;
    setBusy(true);
    try {
      const res = await api(`/api/sessions/${id}/chaos-response`, {
        method: "POST",
        body: { event_type: chaosEvent.id, choice_index: choiceIndex },
      });
      setChaosEvent(null);
      setChaosResponse(null);
      setCoach(res.coach || "");
      await load();
    } catch (e) {
      alert(e.message);
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
        nav(`/report/${id}`);
        return;
      }
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="text-slate-400">Загрузка сцены…</div>;
  if (data.mode === "online") return <Navigate to={`/practice?session=${id}`} replace />;

  // Модальное окно события хаоса
  if (chaosEvent && data?.settings?.chaos) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="glass max-w-md rounded-3xl p-6">
          <div className="mb-4 text-2xl font-bold text-rose-300">⚡ {chaosEvent.title}</div>
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
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
      <section>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-cyan-300">{data.title}</div>
            <h1 className="text-2xl font-bold">
              {data.role} → {data.opponent_role}
            </h1>
            <p className="mt-1 text-sm text-slate-400">{data.context}</p>
            {data.mode === "online" && data.ai_provider && (
              <p role="status" className={`mt-2 text-sm ${data.ai_provider === "offline" ? "text-rose-300" : "text-emerald-300"}`}>
                {data.ai_provider === "offline" ? `ИИ недоступен: ${data.ai_error || "проверьте настройки"}` : `Ответ получен от ${data.ai_provider === "gigachat" ? "GigaChat" : data.ai_provider === "ollama" ? "Ollama" : "gpt2giga"}`}
              </p>
            )}
            {data.mode === "online" && !data.ai_provider && <p className="mt-2 text-sm text-slate-400">Вступление готово. Подключение ИИ проверится после вашей первой реплики.</p>}
          </div>
          {data.mode === "scenario" && data.settings?.timer ? (
            <div className={`rounded-2xl px-4 py-2 font-bold ${left < 8 ? "bg-rose-500/20 text-rose-200" : "glass"}`}>
              {left}s
            </div>
          ) : null}
        </div>
        <div className="glass max-h-[420px] space-y-3 overflow-y-auto rounded-3xl p-5">
          {(data.messages || []).map((m, i) => (
            <div key={i} className={`max-w-[90%] rounded-2xl px-4 py-3 ${m.sender === "player" ? "ml-auto bg-cyan-400/15" : "bg-white/5"}`}>
              <div className="text-xs uppercase tracking-wide text-slate-500">{m.sender === "player" ? "Вы" : "Оппонент"}</div>
              <div>{m.text}</div>
            </div>
          ))}
        </div>
        {coach && data.settings?.ghost && (
          <div className="mt-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
            Тренер-призрак: {coach}
          </div>
        )}
        {data.mode === "scenario" && data.status === "active" && data.step && (
          <div className="mt-4 grid gap-3">
            {data.settings?.ghost && data.step.coach && <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-3 text-sm"><button type="button" className="text-violet-200" onClick={() => { hintUsedRef.current = true; setHintUsed(true); }}>{hintUsed ? "Подсказка тренера" : "🎭 Попросить подсказку тренера"}</button>{hintUsed && <p className="mt-2 text-slate-200">{data.step.coach}</p>}</div>}
            {data.step.options.map((o) => (
              <button
                key={o.id}
                disabled={busy}
                onClick={() => submit(o.id, false, hintUsed)}
                onMouseEnter={() => {
                  chosen.current = o.id;
                }}
                className="glass rounded-2xl p-4 text-left hover:border-cyan-300/40 hover:shadow-neon"
              >
                {o.text}
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
            <button onClick={sendFree} disabled={busy} className="rounded-2xl bg-cyan-400 px-4 font-semibold text-slate-950 disabled:opacity-50">
              {busy ? "Отправка…" : "Сказать"}
            </button>
          </div>
        )}
        {data.mode === "online" && data.status === "active" && (
          <VoiceConversation sessionId={id} onTurn={(result) => result?.finished ? nav(`/report/${id}`) : load()} />
        )}
        {data.settings?.hidden_goal && data.hidden_options && (
          <div className="mt-4 glass rounded-2xl p-4 text-sm">
            <div className="mb-2 text-slate-400">Скрытая цель оппонента (выбор зачтётся в финале)</div>
            <select className="w-full rounded-xl bg-black/30 p-2" value={guess} onChange={(e) => setGuess(e.target.value)}>
              <option value="">Выберите предполагаемую цель</option>
              {data.hidden_options.map((opt, i) => (
                <option key={i} value={i}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-4 flex gap-3 text-sm">
          <button className="text-slate-400" onClick={() => api(`/api/sessions/${id}/stop`, { method: "POST" }).then(() => nav("/history"))}>
            Остановить
          </button>
        </div>
      </section>
      <aside className="space-y-4">
        <MetricsBar metrics={data.metrics} />
        <div className="glass rounded-3xl p-4 text-sm text-slate-400">
          Цель: {data.goal}
          <div className="mt-2">Режим: {data.mode === "online" ? "онлайн + fallback" : "сценарный офлайн"}</div>
        </div>
      </aside>
    </div>
  );
}
