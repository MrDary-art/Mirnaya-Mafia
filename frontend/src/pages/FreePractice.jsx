import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import VoiceConversation from "../components/VoiceConversation.jsx";

export default function FreePractice() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessionFromUrl = params.get("session");
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionFromUrl));
  const bottom = useRef(null);
  const [form, setForm] = useState({
    display_name: "", role: "Участник переговоров", opponent_role: "Собеседник", problem: "", goal: "", tone: "нейтральный",
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!sessionFromUrl) return;
    setLoadingSession(true);
    api(`/api/sessions/${sessionFromUrl}`).then((data) => {
      if (data.status === "finished") { nav(`/report/${data.id}`, { replace: true }); return; }
      setSession(data);
      setForm((current) => ({ ...current, ...data.settings }));
    }).catch((e) => setError(e.message)).finally(() => setLoadingSession(false));
  }, [sessionFromUrl]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [session?.messages?.length]);

  async function reload(id) {
    setSession(await api(`/api/sessions/${id}`));
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const created = await api("/api/sessions", {
        method: "POST",
        body: { ...form, mode: "online" },
      });
      await reload(created.id);
      nav(`/practice?session=${created.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/sessions/${session.id}/message`, { method: "POST", body: { text } });
      setText("");
      if (result.finished) { nav(`/report/${session.id}`); return; }
      await reload(session.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await api(`/api/sessions/${session.id}/finish`, { method: "POST" });
      nav(`/report/${session.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (loadingSession) return <div className="text-slate-400">Открываем разговор…</div>;
  if (!session) return <div className="mx-auto max-w-5xl space-y-6">
    <header><div className="eyebrow">ЛИЧНЫЙ ТРЕНАЖЁР</div><h1 className="mt-2 text-4xl font-extrabold">Подготовим ваш разговор</h1><p className="mt-3 max-w-2xl text-slate-400">Опишите задачу один раз. ИИ войдёт в роль собеседника и начнёт с вашей ситуации.</p></header>
    <div className="glass grid gap-6 rounded-3xl p-6 lg:grid-cols-[1.4fr_0.6fr]">
      <div className="grid gap-4 sm:grid-cols-2">
        {[["display_name", "Как к вам обращаться"], ["role", "Ваша роль"], ["opponent_role", "Роль собеседника"], ["tone", "Манера общения"]].map(([key, label]) => <label key={key} className="text-sm text-slate-400">{label}<input className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300/60" value={form[key]} onChange={(event) => set(key, event.target.value)} /></label>)}
        <label className="text-sm text-slate-400 sm:col-span-2">Ситуация<textarea rows={2} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300/60" placeholder="Что произошло и что важно для собеседника?" value={form.problem} onChange={(event) => set("problem", event.target.value)} /></label>
        <label className="text-sm text-slate-400 sm:col-span-2">Желаемый результат<textarea rows={2} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300/60" placeholder="Какой итог вы хотите получить?" value={form.goal} onChange={(event) => set("goal", event.target.value)} /></label>
        <button disabled={busy || !form.display_name?.trim() || !form.problem.trim() || !form.goal.trim()} onClick={start} className="primary-button justify-self-start sm:col-span-2">Войти в разговор →</button>
      </div>
      <aside className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[.04] p-5"><div className="text-2xl text-cyan-200">◉</div><h2 className="mt-3 font-bold">Как пройдёт сессия</h2><ol className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300"><li>1. Собеседник начнёт диалог по вашей теме.</li><li>2. Говорите голосом или пишите. Метрики обновляются после каждой реплики.</li><li>3. После завершения получите конкретный разбор и варианты лучших формулировок.</li></ol></aside>
    </div>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
  </div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-2xl text-cyan-200">✦</div><div className="min-w-[240px] flex-1"><div className="text-xs uppercase tracking-[.2em] text-cyan-300">РАЗГОВОР С ИИ</div><h1 className="mt-1 text-2xl font-bold">{session.settings?.problem || form.problem}</h1></div><button disabled={busy} className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-slate-200" onClick={finish}>Завершить и получить отчёт</button></header>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className="glass min-w-0 rounded-3xl p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><div className="text-sm text-slate-400">Собеседник</div><div className="font-semibold">{session.opponent_role}</div></div><div role="status" className={`rounded-full px-3 py-1 text-xs ${session.ai_provider === "offline" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>{session.ai_provider === "offline" ? "ИИ недоступен" : session.ai_provider ? `● ${session.ai_provider === "gigachat" ? "GigaChat" : session.ai_provider}` : "● Готов к разговору"}</div></div>
        <div className="mt-4 h-[min(54vh,540px)] min-h-80 space-y-4 overflow-y-auto rounded-2xl bg-slate-950/50 p-4" aria-live="polite">
          {session.messages?.map((message, index) => <div key={index} className={`flex ${message.sender === "player" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.sender === "player" ? "bg-cyan-300/15" : "bg-white/[.07]"}`}><div className="mb-1 text-xs uppercase tracking-wider text-slate-400">{message.sender === "player" ? "Вы" : session.opponent_role}</div><div className="whitespace-pre-wrap leading-relaxed">{message.text}</div></div></div>)}<div ref={bottom} />
        </div>
        <div className="mt-4 flex items-end gap-3"><textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} className="min-h-20 flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/70 p-4 outline-none focus:border-cyan-300/50" placeholder="Напишите реплику… Enter — отправить, Shift+Enter — новая строка" /><button disabled={busy || !text.trim()} onClick={send} className="primary-button">{busy ? "Отправляем…" : "Отправить ↗"}</button></div>
        <VoiceConversation sessionId={session.id} onTurn={(result) => result?.finished ? nav(`/report/${session.id}`) : reload(session.id)} />
        {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
        {session.ai_provider === "offline" && <p className="mt-2 text-sm text-rose-300">{session.ai_error}</p>}
      </section>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><h2 className="mb-3 font-semibold">Ваш прогресс</h2><MetricsBar metrics={session.metrics} /><p className="mt-4 text-xs text-slate-400">Оценка меняется после каждого вашего ответа.</p></div>{session.messages?.some((m) => m.sender === "player" && m.analysis?.comment) && <div className="glass rounded-3xl p-5"><div className="text-xs uppercase tracking-widest text-violet-300">РАЗБОР ПОСЛЕДНЕЙ РЕПЛИКИ</div><p className="mt-2 text-sm leading-relaxed text-slate-200">{session.messages.filter((m) => m.sender === "player" && m.analysis?.comment).at(-1)?.analysis.comment}</p></div>}<div className="glass rounded-3xl p-5"><h2 className="font-semibold">Ваша цель</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{session.goal}</p><div className="mt-4 text-xs text-slate-500">Роль: {session.role}</div></div></aside>
    </div>
  </div>;
}
