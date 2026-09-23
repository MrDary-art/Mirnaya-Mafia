import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiSpeech, apiStream } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import VoiceConversation from "../components/VoiceConversation.jsx";
import ChatBubble, { RecordingBubble } from "../components/LiveChatBubble.jsx";
import { createTypewriter } from "../components/typewriter.js";

export default function FreePractice() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessionFromUrl = params.get("session");
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionFromUrl));
  const bottom = useRef(null);
  const speech = useRef(null);
  const speechRequest = useRef(0);
  const speakEnabledRef = useRef(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [form, setForm] = useState({
    display_name: "", role: "Участник переговоров", opponent_role: "Собеседник", problem: "", goal: "", tone: "нейтральный",
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [recording, setRecording] = useState(false);
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
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [draft?.userText, draft?.aiText, recording]);
  useEffect(() => () => stopSpeech(), []);

  function stopSpeech() {
    speechRequest.current += 1;
    if (speech.current) {
      speech.current.audio.pause();
      URL.revokeObjectURL(speech.current.url);
      speech.current.finish?.();
      speech.current = null;
    }
    setSpeaking(false);
  }

  function toggleSpeech() {
    const next = !speakEnabledRef.current;
    speakEnabledRef.current = next;
    setSpeakEnabled(next);
    if (!next) stopSpeech();
  }

  async function speakReply(reply) {
    if (!speakEnabledRef.current || !reply?.trim()) return;
    const requestId = speechRequest.current;
    try {
      const blob = await apiSpeech(`/api/sessions/${session.id}/speak`, reply);
      if (!speakEnabledRef.current || requestId !== speechRequest.current) return;
      stopSpeech();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setSpeaking(true);
      await new Promise((resolve, reject) => {
        speech.current = { audio, url, finish: resolve };
        audio.onended = () => { if (speech.current?.audio === audio) stopSpeech(); };
        audio.onerror = () => { if (speech.current?.audio === audio) { setError("Не удалось воспроизвести ответ"); stopSpeech(); } };
        audio.play().catch(reject);
      });
    } catch (exc) {
      stopSpeech();
      setError(`Озвучивание недоступно: ${exc.message}`);
    }
  }

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
    const submitted = text.trim();
    stopSpeech();
    setBusy(true);
    setError("");
    setText("");
    setDraft({ source: "text", userText: submitted, status: "sending", aiText: "", aiStatus: "waiting" });
    const writer = createTypewriter((visible) => setDraft((current) => current && { ...current, aiText: visible, aiStatus: "generating" }));
    try {
      await apiStream(`/api/sessions/${session.id}/turn-stream`, {
        body: { text: submitted },
        onEvent: async (event) => {
          if (event.type === "accepted") setDraft((current) => current && { ...current, status: "delivered" });
          if (event.type === "reply_delta") { writer.push(event.text); setDraft((current) => current && { ...current, status: "delivered" }); }
          if (event.type === "done") {
            await writer.flush();
            const reply = event.result.reply || event.result.session?.free_reply;
            if (event.result.finished) {
              if (speakEnabledRef.current && reply) await speakReply(reply);
              nav(`/report/${session.id}`);
              return;
            }
            await reload(session.id);
            setDraft(null);
            if (speakEnabledRef.current && reply) void speakReply(reply);
          }
        },
      });
    } catch (e) {
      setError(e.message);
      setText(submitted);
      setDraft(null);
    } finally {
      writer.stop();
      setBusy(false);
    }
  }

  function onVoiceEvent(event) {
    if (event.type === "voice_pending") setDraft({ source: "voice", userText: "", status: "transcribing", aiText: "", aiStatus: "waiting" });
    if (event.type === "transcript_delta") setDraft((current) => current && { ...current, userText: `${current.userText} ${event.text}`.trim() });
    if (event.type === "transcript_done") setDraft((current) => current && { ...current, userText: event.text, status: "sent" });
    if (event.type === "accepted") setDraft((current) => current && { ...current, status: "delivered" });
    if (event.type === "reply_delta") setDraft((current) => current && { ...current, status: "delivered", aiStatus: "generating" });
    if (event.type === "spoken_progress") setDraft((current) => current && { ...current, aiText: event.text, aiStatus: "speaking" });
    if (event.type === "silence") setDraft(null);
    if (event.type === "voice_error") setDraft((current) => current && { ...current, status: "error" });
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

  const opponentActivity = recording ? "Слушаю вашу реплику" : draft?.aiText ? (draft.aiStatus === "speaking" ? "Говорит голосом" : "Пишет ответ") : draft?.status === "transcribing" ? "Распознаю голос" : draft?.status === "sending" ? "Получает сообщение" : draft ? "Думает над ответом" : "В разговоре";

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-2xl text-cyan-200">✦</div><div className="min-w-[240px] flex-1"><div className="text-xs uppercase tracking-[.2em] text-cyan-300">РАЗГОВОР С ИИ</div><h1 className="mt-1 text-2xl font-bold">{session.settings?.problem || form.problem}</h1></div><button disabled={busy} className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-slate-200" onClick={finish}>Завершить и получить отчёт</button></header>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className="glass min-w-0 rounded-3xl p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><div className="font-semibold">{session.opponent_role}</div><div role="status" className={`live-chat-presence ${draft || recording ? "busy" : ""}`}><span className="live-chat-presence-dot" />{opponentActivity}{draft && !draft.aiText && draft.status !== "transcribing" ? <span className="live-typing"><span /><span /><span /></span> : null}</div></div><div className={`rounded-full px-3 py-1 text-xs ${session.ai_provider === "offline" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>{session.ai_provider === "offline" ? "ИИ недоступен" : session.ai_provider ? session.ai_provider === "gigachat" ? "GigaChat" : session.ai_provider : "На связи"}</div></div>
        <div className="live-chat-log live-chat-log-practice mt-4 overflow-y-auto rounded-2xl p-4" aria-live="polite">
          {session.messages?.map((message, index) => <ChatBubble key={index} own={message.sender === "player"} label={message.sender === "player" ? "Вы" : session.opponent_role} text={message.text} delivered={message.sender === "player"} />)}
          {draft?.userText || draft?.source === "voice" ? <ChatBubble own label="Вы" text={draft.userText || "Распознаю вашу речь…"} status={draft.status} voice={draft.source === "voice"} activity={draft.status === "transcribing" ? "Слова появятся здесь по мере расшифровки" : null} /> : null}
          {draft && (draft.source !== "voice" || draft.status === "delivered" || draft.aiText) && <ChatBubble label={session.opponent_role} text={draft.aiText} loading={!draft.aiText} activity={draft.aiText ? draft.aiStatus === "speaking" ? "Ответ звучит сейчас" : "Ответ появляется по мере генерации" : opponentActivity} />}
          {recording && <RecordingBubble />}
          <div ref={bottom} />
        </div>
        <div className="live-chat-composer"><textarea rows={1} aria-label="Ваша реплика" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Напишите реплику…" /><button type="button" aria-label="Отправить реплику" disabled={busy || !text.trim()} onClick={send}>↗</button></div>
        <button type="button" aria-pressed={speakEnabled} onClick={toggleSpeech} className="mt-3 rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200">{speakEnabled ? "🔊 Озвучивание ответов включено" : "🔇 Озвучивать ответы ИИ"}</button>
        {speaking && <span role="status" className="ml-3 text-sm text-cyan-200">Воспроизведение…</span>}
        <VoiceConversation sessionId={session.id} onStreamEvent={onVoiceEvent} onActivity={(active) => { if (active) stopSpeech(); setRecording(active); }} onTurn={async (result) => { if (result?.finished) { nav(`/report/${session.id}`); return; } await reload(session.id); setDraft(null); }} />
        {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
        {session.ai_provider === "offline" && <p className="mt-2 text-sm text-rose-300">{session.ai_error}</p>}
      </section>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><h2 className="mb-3 font-semibold">Ваш прогресс</h2><MetricsBar metrics={session.metrics} /><p className="mt-4 text-xs text-slate-400">Оценка меняется после каждого вашего ответа.</p></div>{session.messages?.some((m) => m.sender === "player" && m.analysis?.comment) && <div className="glass rounded-3xl p-5"><div className="text-xs uppercase tracking-widest text-violet-300">РАЗБОР ПОСЛЕДНЕЙ РЕПЛИКИ</div><p className="mt-2 text-sm leading-relaxed text-slate-200">{session.messages.filter((m) => m.sender === "player" && m.analysis?.comment).at(-1)?.analysis.comment}</p></div>}<div className="glass rounded-3xl p-5"><h2 className="font-semibold">Ваша цель</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{session.goal}</p><div className="mt-4 text-xs text-slate-500">Роль: {session.role}</div></div></aside>
    </div>
  </div>;
}
