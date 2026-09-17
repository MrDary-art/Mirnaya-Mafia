import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";

export default function Play() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [coach, setCoach] = useState("");
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState("");
  const [left, setLeft] = useState(null);
  const [guess, setGuess] = useState(0);
  const chosen = useRef(null);

  async function load() {
    const s = await api(`/api/sessions/${id}`);
    setData(s);
    const t = s.settings?.timer;
    setLeft(t || null);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, [id]);

  useEffect(() => {
    if (!left || !data || data.status !== "active") return undefined;
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

  async function submit(optionId, timeout = false, usedHint = false) {
    if (!optionId || busy) return;
    setBusy(true);
    try {
      const res = await api(`/api/sessions/${id}/choice`, {
        method: "POST",
        body: { option_id: optionId, timeout, used_hint: usedHint },
      });
      setCoach(res.coach || "");
      if (res.finished) {
        if (data?.settings?.hidden_goal) {
          await api(`/api/sessions/${id}/guess`, { method: "POST", body: { index: Number(guess) } });
        }
        nav(`/report/${id}`);
        return;
      }
      setData(res.session);
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
      setLeft(msgs.settings?.timer || null);
      chosen.current = null;
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
      const msgs = await api(`/api/sessions/${id}`);
      setData(msgs);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="text-slate-400">Загрузка сцены…</div>;

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
          </div>
          {data.settings?.timer ? (
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
        {data.status === "active" && data.step && (
          <div className="mt-4 grid gap-3">
            {data.step.options.map((o) => (
              <button
                key={o.id}
                disabled={busy}
                onClick={() => submit(o.id, false, false)}
                onMouseEnter={() => {
                  chosen.current = o.id;
                }}
                className="glass rounded-2xl p-4 text-left hover:border-cyan-300/40 hover:shadow-neon"
              >
                {o.text}
                {data.settings?.ghost && data.settings?.skill === "новичок" && o.hint && (
                  <div className="mt-2 text-xs text-violet-200">{o.hint}</div>
                )}
              </button>
            ))}
          </div>
        )}
        {data.mode === "online" && data.status === "active" && (
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-2xl bg-black/30 p-3 ring-1 ring-white/10"
              placeholder="Свободная реплика (если LLM недоступен — офлайн-ответ)"
              value={free}
              onChange={(e) => setFree(e.target.value)}
            />
            <button onClick={sendFree} className="rounded-2xl bg-cyan-400 px-4 font-semibold text-slate-950">
              Сказать
            </button>
          </div>
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
