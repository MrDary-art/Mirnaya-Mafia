import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, apiStream } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import VoiceConversation from "../components/VoiceConversation.jsx";
import PeerCall from "../components/PeerCall.jsx";
import ChatBubble, { VoiceBars } from "../components/LiveChatBubble.jsx";
import { createTypewriter } from "../components/typewriter.js";

function timeLeft(deadline) {
  if (!deadline) return "15:00";
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Room() {
  const { id } = useParams();
  const [room, setRoom] = useState(null);
  const [session, setSession] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("15:00");
  const [draft, setDraft] = useState(null);
  const [recording, setRecording] = useState(false);
  const streaming = useRef(false);

  async function reload() {
    const data = await api(`/api/rooms/${id}`);
    setRoom(data);
    if (data.mode === "duel" && data.your_session_id && !streaming.current) setSession(await api(`/api/sessions/${data.your_session_id}`));
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
    const poll = window.setInterval(() => reload().catch((e) => setError(e.message)), 2000);
    return () => window.clearInterval(poll);
  }, [id]);
  useEffect(() => {
    const tick = () => setClock(timeLeft(room?.deadline));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [room?.deadline]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    const submitted = text.trim();
    const writer = createTypewriter((visible) => setDraft((current) => current && { ...current, aiText: visible }));
    try {
      if (room.mode === "duel" && session) {
        streaming.current = true;
        setDraft({ source: "text", userText: submitted, status: "sending", aiText: "" });
        setText("");
        await apiStream(`/api/sessions/${session.id}/turn-stream`, {
          body: { text: submitted },
          onEvent: async (event) => {
            if (event.type === "accepted") setDraft((current) => current && { ...current, status: "sent" });
            if (event.type === "reply_delta") { writer.push(event.text); setDraft((current) => current && { ...current, status: "delivered" }); }
            if (event.type === "done") { await writer.flush(); streaming.current = false; await reload(); setDraft(null); }
          },
        });
      } else await api(`/api/rooms/${id}/message`, { method: "POST", body: { text: submitted } });
      setText("");
      await reload();
    } catch (e) { streaming.current = false; setDraft(null); setText(submitted); setError(e.message); } finally { writer.stop(); setBusy(false); }
  }

  function onVoiceEvent(event) {
    if (event.type === "voice_pending") { streaming.current = true; setDraft({ source: "voice", userText: "", status: "transcribing", aiText: "" }); }
    if (event.type === "transcript_delta") setDraft((current) => current && { ...current, userText: `${current.userText} ${event.text}`.trim() });
    if (event.type === "transcript_done") setDraft((current) => current && { ...current, userText: event.text, status: "sending" });
    if (event.type === "accepted") setDraft((current) => current && { ...current, status: "sent" });
    if (event.type === "reply_delta") setDraft((current) => current && { ...current, status: "delivered" });
    if (event.type === "spoken_progress") setDraft((current) => current && { ...current, aiText: event.text });
    if (event.type === "silence") { streaming.current = false; setDraft(null); }
    if (event.type === "voice_error") { streaming.current = false; setDraft((current) => current && { ...current, status: "error" }); }
  }

  async function finish() {
    setBusy(true); setError("");
    try { setRoom(await api(`/api/rooms/${id}/finish`, { method: "POST" })); await reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!room) return <div className="text-slate-400">Открываем комнату… {error}</div>;
  const waiting = room.status === "waiting";
  const done = room.done || room.status === "finished";
  const messages = room.mode === "human" ? room.messages : session?.messages;
  const ownReport = room.reports?.[String(room.your_id)];
  const peerReport = room.reports?.[String(room.peer_id)];
  const verdict = room.comparison?.verdicts?.[String(room.your_id)];

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-2xl text-cyan-200">{room.mode === "human" ? "◉" : "✦"}</div>
      <div className="min-w-[220px] flex-1"><div className="text-xs uppercase tracking-[.2em] text-cyan-300">{room.mode === "human" ? "ПАРНЫЕ ПЕРЕГОВОРЫ" : "ПАРНОЕ СОБЕСЕДОВАНИЕ С ИИ"}</div><h1 className="mt-1 text-2xl font-bold">{room.problem}</h1></div>
      <div className="rounded-2xl border border-white/10 px-4 py-2 text-right"><div className="text-xs text-slate-400">Осталось</div><div className="font-mono text-2xl font-bold text-cyan-200">{clock}</div></div>
    </div>
    {waiting && <div className="glass rounded-3xl p-6"><h2 className="text-xl font-bold">Ждём второго участника</h2><p className="mt-2 text-slate-400">Передайте ему код. Отсчёт начнётся после подключения.</p><div className="mt-4 inline-block select-all rounded-2xl bg-cyan-300/10 px-5 py-3 font-mono text-xl tracking-widest text-cyan-200">{room.code}</div></div>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className="glass min-w-0 rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><div><div className="text-sm text-slate-400">Вы · {room.your_name}</div><div className="text-lg font-semibold">{room.your_role || "Кандидат"}</div></div><div className="text-right"><div className="text-sm text-slate-400">Собеседник</div><div className="text-lg font-semibold">{room.peer_name || "Ожидаем"}</div></div></div>
        {room.mode === "human" && room.status === "active" && !done && <PeerCall room={room} onTranscript={reload} />}
        <div className="mt-5 h-[370px] space-y-4 overflow-y-auto rounded-2xl bg-slate-950/50 p-4" aria-live="polite">
          {(messages || []).map((m, i) => {
            const own = room.mode === "human" ? m.user_id === room.your_id : m.sender === "player";
            return <ChatBubble key={m.id || i} own={own} label={own ? "Вы" : room.mode === "human" ? room.peer_name : "ИИ интервьюер"} text={m.text} delivered={own} />;
          })}
          {draft && <ChatBubble own label="Вы" text={draft.userText || "Расшифровываю голос…"} status={draft.status} voice={draft.source === "voice"} />}
          {draft && <ChatBubble label="ИИ интервьюер" text={draft.aiText} loading={!draft.aiText} />}
          {recording && <div className="flex justify-end"><div className="flex items-center gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-cyan-100"><VoiceBars /><span>Голос записывается</span><span className="voice-dots">•••</span></div></div>}
          {(!messages || !messages.length) && <p className="text-center text-slate-500">Начните разговор. Цель уже известна собеседнику.</p>}
        </div>
        {room.status === "active" && !done && <><div className="mt-4 flex gap-3"><textarea className="min-h-20 flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/70 p-4 outline-none focus:border-cyan-300/50" placeholder="Ваша реплика…" value={text} onChange={(e) => setText(e.target.value)} /><button className="primary-button self-end" disabled={busy || !text.trim()} onClick={send}>Отправить ↗</button></div>{room.mode === "duel" && session && <VoiceConversation sessionId={session.id} onStreamEvent={onVoiceEvent} onActivity={setRecording} onTurn={async () => { streaming.current = false; await reload(); setDraft(null); }} />}</>}
        {room.status === "active" && !done && <button onClick={finish} disabled={busy} className="mt-5 text-sm text-rose-200 underline underline-offset-4">Завершить свою попытку</button>}
        {done && room.status !== "finished" && <p className="mt-5 rounded-2xl bg-cyan-300/10 p-4 text-cyan-200">Вы закончили. Ожидаем второго участника или окончания 15 минут.</p>}
        {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
      </section>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><h2 className="font-semibold">Ваше задание</h2><p className="mt-3 text-sm leading-relaxed text-slate-300">{room.your_brief || room.goal}</p><div className="mt-4 text-xs text-slate-500">Код комнаты: <span className="select-all font-mono text-slate-300">{room.code}</span></div></div>{room.mode === "human" && room.metrics && <div className="glass rounded-3xl p-5"><h2 className="mb-3 font-semibold">Динамика переговоров</h2><MetricsBar metrics={room.metrics} /></div>}{room.mode === "duel" && session?.metrics && <div className="glass rounded-3xl p-5"><h2 className="mb-3 font-semibold">Ваш прогресс</h2><MetricsBar metrics={session.metrics} /></div>}{room.mode === "duel" && session?.messages?.some((m) => m.sender === "player" && m.analysis?.comment) && <div className="glass rounded-3xl p-5"><div className="text-xs uppercase tracking-widest text-violet-300">РАЗБОР ОТВЕТА</div><p className="mt-2 text-sm text-slate-200">{session.messages.filter((m) => m.sender === "player" && m.analysis?.comment).at(-1)?.analysis.comment}</p></div>}</aside>
    </div>
    {room.status === "finished" && <div className="glass rounded-3xl p-6"><div className="text-xs uppercase tracking-widest text-cyan-300">ИТОГИ ПРАКТИКИ</div><h2 className={`mt-2 text-3xl font-extrabold ${verdict === "НЕ ПРИНЯТ" ? "text-rose-300" : ""}`}>{verdict || (room.comparison?.winner_user_id === room.your_id ? "СИЛЬНЕЙШАЯ ПОЗИЦИЯ" : "ПРАКТИКА ЗАВЕРШЕНА")}</h2><p className="mt-2 text-slate-400">{room.comparison?.reason}</p><div className="mt-6 grid gap-4 md:grid-cols-2">{[[ownReport, "Ваш разбор"], [peerReport, `Разбор: ${room.peer_name}`]].map(([r, title]) => r && <div key={title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm text-slate-300">{r.summary || r.verdict}</p><div className="mt-3 text-sm text-cyan-200">Confidence: {r.metrics?.confidence}</div>{(r.mistakes || []).length > 0 && <><h4 className="mt-4 font-semibold">Что можно было сказать лучше</h4><div className="mt-2 space-y-3">{r.mistakes.map((item, i) => <div key={i} className="border-l-2 border-rose-300/50 pl-3 text-sm"><div className="text-slate-400">{item.chosen}</div><div className="mt-1 text-rose-200">{item.what}</div><div className="mt-1 text-emerald-200">Лучше: {item.alternative}</div></div>)}</div></>}<h4 className="mt-4 font-semibold">Следующие шаги</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-300">{(r.recommendations || []).map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}</div></div>}
  </div>;
}
