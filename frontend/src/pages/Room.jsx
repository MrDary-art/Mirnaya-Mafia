import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiStream, downloadPrivate } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import VoiceConversation, { playEncodedSpeech } from "../components/VoiceConversation.jsx";
import PeerCall from "../components/PeerCall.jsx";
import ChatBubble, { RecordingBubble } from "../components/LiveChatBubble.jsx";

function timeLeft(deadline, fallback = 15) {
  if (!deadline) return `${String(fallback).padStart(2, "0")}:00`;
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const phaseText = { lobby: "Лобби", active: "В разговоре", feedback: "Обратная связь", processing: "Готовим отчёт", finished: "Завершено" };

export default function Room() {
  const { id } = useParams(); const nav = useNavigate();
  const [room, setRoom] = useState(null); const [session, setSession] = useState(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [clock, setClock] = useState("15:00"); const [draft, setDraft] = useState(null); const [recording, setRecording] = useState(false);
  const [devicesReady, setDevicesReady] = useState(false); const [recordingConsent, setRecordingConsent] = useState(false);
  const [feedback, setFeedback] = useState({ outcome: "", peer_feedback: "", self_reflection: "", usefulness: 5, technical_issues: "", repeat_together: true, share_with_peer: false, publish_team_result: false });
  const streaming = useRef(false);

  async function reload() {
    let data = await api(`/api/rooms/${id}`);
    if (data.mode === "duel" && data.your_session_id && !streaming.current) {
      const ownSession = await api(`/api/sessions/${data.your_session_id}`);
      setSession(ownSession);
      if (data.phase === "active" && !data.done && ownSession.status !== "active") {
        data = await api(`/api/rooms/${id}/finish`, { method: "POST" });
      }
    }
    setRoom(data);
  }
  useEffect(() => { reload().catch((e) => setError(e.message)); const poll = window.setInterval(() => reload().catch(() => {}), 2500); return () => window.clearInterval(poll); }, [id]);
  useEffect(() => { const tick = () => setClock(timeLeft(room?.deadline, room?.duration_minutes)); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [room?.deadline, room?.duration_minutes]);
  useEffect(() => {
    if (!["active", "feedback", "processing", "finished"].includes(room?.phase)) return undefined;
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => window.cancelAnimationFrame(frame);
  }, [room?.phase]);

  async function setReady(next = true) {
    setBusy(true); setError("");
    try { setRoom(await api(`/api/rooms/${id}/ready`, { method: "POST", body: { ready: next, transport_ready: room.mode === "duel" ? true : devicesReady, recording_consent: recordingConsent } })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function send() {
    if (!text.trim() || busy) return; setBusy(true); setError(""); const submitted = text.trim();
    let generated = "";
    let spoken = "";
    try {
      if (room.mode === "duel" && session) {
        streaming.current = true; setDraft({ source: "text", userText: submitted, status: "sending", aiText: "" }); setText("");
        await apiStream(`/api/sessions/${session.id}/turn-stream`, { body: { text: submitted }, onEvent: async (event) => {
          if (event.type === "accepted") setDraft((current) => current && { ...current, status: "delivered" });
          if (event.type === "reply_delta") {
            generated += event.text;
            setDraft((current) => current && { ...current, status: "delivered" });
          }
          if (event.type === "sentence_audio") {
            const prefix = spoken ? `${spoken} ` : "";
            await playEncodedSpeech(event.text, event.wav, (visible) => {
              setDraft((current) => current && { ...current, aiText: prefix + visible });
            });
            spoken = `${prefix}${event.text}`;
          }
          if (event.type === "audio_error") {
            setError(event.message);
            setDraft((current) => current && { ...current, aiText: generated.trim() });
          }
          if (event.type === "done") {
            if (!spoken) setDraft((current) => current && { ...current, aiText: generated.trim() });
            streaming.current = false;
            if (event.result?.finished) setRoom(await api(`/api/rooms/${id}/finish`, { method: "POST" }));
            await reload();
            setDraft(null);
          }
        }});
      } else { await api(`/api/rooms/${id}/message`, { method: "POST", body: { text: submitted } }); setText(""); await reload(); }
    } catch (e) { streaming.current = false; setDraft(null); setText(submitted); setError(e.message); } finally { setBusy(false); }
  }
  function onVoiceEvent(event) {
    if (event.type === "voice_pending") { streaming.current = true; setDraft({ source: "voice", userText: "", status: "transcribing", aiText: "" }); }
    if (event.type === "transcript_delta") setDraft((current) => current && { ...current, userText: `${current.userText} ${event.text}`.trim() });
    if (event.type === "transcript_done") setDraft((current) => current && { ...current, userText: event.text, status: "sent" });
    if (event.type === "accepted") setDraft((current) => current && { ...current, status: "delivered" });
    if (event.type === "spoken_progress") setDraft((current) => current && { ...current, aiText: event.text });
    if (["silence", "voice_error"].includes(event.type)) { streaming.current = false; if (event.type === "silence") setDraft(null); }
  }
  async function finish() { setBusy(true); try { setRoom(await api(`/api/rooms/${id}/finish`, { method: "POST" })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function submitFeedback(status) { setBusy(true); try { setRoom(await api(`/api/rooms/${id}/feedback`, { method: "POST", body: { ...feedback, status } })); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  if (!room) return <div className={error ? "product-error" : "product-loading"} role={error ? "alert" : "status"}>{error ? <>Не удалось открыть комнату: {error} <button onClick={() => reload().catch((failure) => setError(failure.message))}>Повторить</button></> : "Открываем комнату…"}</div>;
  const lobby = room.phase === "lobby"; const active = room.phase === "active"; const done = room.done;
  const messages = room.mode === "human" ? room.messages : session?.messages; const ownReport = room.your_report;
  const deviceCanReady = room.mode === "duel" || devicesReady;

  return <div className="arena-room-page mx-auto max-w-7xl space-y-5" data-room-phase={room.phase} data-room-team-complete={room.phase === "finished" && Boolean(room.team_result?.complete)}>
    <header className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/15 text-2xl text-cyan-200">{room.mode === "human" ? "◉" : "✦"}</div><div className="min-w-[220px] flex-1"><div className="text-xs uppercase tracking-[.2em] text-cyan-300">{room.mode === "human" ? "ПЕРЕГОВОРЫ ЛЮДЕЙ" : "ДВА ИНТЕРВЬЮ С ИИ"}</div><h1 className="mt-1 text-2xl font-bold">{room.scenario?.title || room.problem}</h1><p className="mt-1 line-clamp-1 text-sm text-slate-400">{room.problem}</p></div><span className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">{phaseText[room.phase] || room.phase}</span>{active && <div className="rounded-2xl border border-white/10 px-4 py-2 text-right"><div className="text-xs text-slate-400">Осталось</div><div className="font-mono text-2xl font-bold text-cyan-200">{clock}</div></div>}</header>
    {room.mode === "human" && ["lobby", "active"].includes(room.phase) && <PeerCall room={room} ready={room.ready} busy={busy} onReady={() => setReady(true)} onTranscript={reload} onDeviceReady={({ transportReady, recordingConsent: consent }) => { setDevicesReady(transportReady); setRecordingConsent(consent); }} />}

    {lobby && <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="glass rounded-3xl p-6"><div className="eyebrow">ЛОББИ</div><h2 className="mt-2 text-2xl font-bold">Проверьте условия и связь</h2><p className="mt-2 text-slate-400">Таймер начнётся, когда наступит назначенное время и оба участника нажмут «Готов».</p>
        {room.mode === "duel" && <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/50 p-5"><b>Приватное собеседование</b><p className="mt-2 text-sm text-slate-400">Ваши ответы и личный отчёт не показываются второму кандидату. Одинаковы только задание, набор вопросов и лимит времени.</p></div>}
      </section>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><h3 className="font-bold">Участники</h3>{Object.entries(room.participants).map(([uid, item]) => <div key={uid} className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 p-3"><span className={`h-2.5 w-2.5 rounded-full ${item.ready ? "bg-emerald-300" : "bg-amber-300"}`} /><div className="min-w-0 flex-1"><b className="block truncate">{item.display_name}</b><small className="text-slate-400">{item.ready ? "Готов" : item.transport_ready ? "Устройства готовы" : "Проверяет условия"}</small></div>{Number(uid) === room.your_id && <span className="text-xs text-cyan-200">Вы</span>}</div>)}</div><div className="glass rounded-3xl p-5"><h3 className="font-bold">Ваша роль</h3><p className="mt-2 text-sm text-slate-300">{room.your_role}</p><p className="mt-3 text-sm leading-relaxed text-slate-400">{room.your_brief}</p></div><div className="glass rounded-3xl p-5"><div className="text-xs text-slate-500">Код приглашения</div><div className="mt-1 select-all font-mono text-xl tracking-widest text-cyan-200">{room.code}</div><div className="mt-4 flex gap-2"><button className="primary-button" disabled={busy || !room.guest_id || !deviceCanReady} onClick={() => setReady(!room.ready)}>{room.ready ? "Отменить готовность" : "Я готов"}</button></div>{!deviceCanReady && <p className="mt-2 text-xs text-amber-200">Сначала проверьте микрофон и камеру.</p>}</div></aside>
    </div>}

    {active && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="glass min-w-0 rounded-3xl p-5"><div className="flex items-center justify-between border-b border-white/10 pb-4"><div><div className="text-sm text-slate-400">Вы · {room.your_name}</div><div className="text-lg font-semibold">{room.your_role}</div></div><div className="text-right text-sm text-slate-400">{room.mode === "human" ? room.peer_name : "ИИ интервьюер"}<div className="text-emerald-300">● Онлайн</div></div></div>
        {room.mode === "duel" && <div role="status" className={`live-chat-presence mt-3 ${draft || recording ? "busy" : ""}`}><span className="live-chat-presence-dot" />{draft ? "ИИ формирует ответ" : "ИИ слушает вас"}</div>}
        <div className="live-chat-log mt-4 h-[390px] overflow-y-auto rounded-2xl p-4" aria-live="polite">{(messages || []).map((m, i) => { const own = room.mode === "human" ? m.user_id === room.your_id : m.sender === "player"; return <ChatBubble key={m.id || i} own={own} label={own ? "Вы" : room.mode === "human" ? room.peer_name : "ИИ интервьюер"} text={m.text} delivered={own} />; })}{draft && <ChatBubble own label="Вы" text={draft.userText || "Распознаю вашу речь…"} status={draft.status} voice={draft.source === "voice"} />}{draft && <ChatBubble label="ИИ интервьюер" text={draft.aiText} loading={!draft.aiText} activity={draft.aiText ? "Отвечает" : "Обдумывает ответ"} />}{recording && <RecordingBubble />}{(!messages || !messages.length) && <p className="text-center text-slate-500">Разговор начался. Следуйте своей роли и цели.</p>}</div>
        {!done && <>
          <div className="live-chat-composer">
            <textarea rows={1} aria-label="Реплика в комнате" placeholder="Напишите реплику…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <button type="button" aria-label="Отправить реплику" disabled={busy || !text.trim()} onClick={send}>↗</button>
          </div>
          {room.mode === "duel" && session && <VoiceConversation sessionId={session.id} onStreamEvent={onVoiceEvent} onActivity={setRecording} onTurn={async (result) => { streaming.current = false; if (result?.finished) setRoom(await api(`/api/rooms/${id}/finish`, { method: "POST" })); await reload(); setDraft(null); }} />}
          <button onClick={finish} disabled={busy} className="mt-4 text-sm text-rose-200 underline underline-offset-4">Завершить тренировку</button>
        </>}
        {done && <p className="mt-4 rounded-2xl bg-cyan-300/10 p-4 text-cyan-100">Ваша часть завершена. Ожидаем завершения второго собеседования; затем отчёт откроется автоматически.</p>}</section>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><h2 className="font-semibold">Личная задача</h2><p className="mt-3 text-sm leading-relaxed text-slate-300">{room.your_brief}</p></div>{(room.metrics || session?.metrics) && <div className="glass rounded-3xl p-5"><h2 className="mb-3 font-semibold">Ваш прогресс</h2><MetricsBar metrics={room.metrics || session.metrics} /></div>}</aside>
    </div>}

    {room.phase === "feedback" && <section className="glass mx-auto max-w-3xl rounded-3xl p-7"><div className="eyebrow">ПОСЛЕ ВСТРЕЧИ</div><h2 className="mt-2 text-3xl font-bold">Зафиксируйте результат</h2><p className="mt-2 text-slate-400">Ответы используются для качества отчёта. Они не меняют игровой счёт.</p><div className="mt-6 grid gap-4"><label className="text-sm text-slate-400">Чем закончилась встреча?<input className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-white" value={feedback.outcome} onChange={(e) => setFeedback({ ...feedback, outcome: e.target.value })} /></label><label className="text-sm text-slate-400">Что у вас получилось?<textarea className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-white" rows={3} value={feedback.self_reflection} onChange={(e) => setFeedback({ ...feedback, self_reflection: e.target.value })} /></label><label className="text-sm text-slate-400">Обратная связь партнёру<textarea className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-white" rows={3} value={feedback.peer_feedback} onChange={(e) => setFeedback({ ...feedback, peer_feedback: e.target.value })} /></label><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={feedback.share_with_peer} onChange={(e) => setFeedback({ ...feedback, share_with_peer: e.target.checked })} />Показать отзыв партнёру</label>{room.ranked && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={feedback.publish_team_result} onChange={(e) => setFeedback({ ...feedback, publish_team_result: e.target.checked })} />Опубликовать командный результат</label>}</div><div className="flex gap-3"><button className="primary-button" disabled={busy} onClick={() => submitFeedback("submitted")}>Отправить и получить отчёт</button><button className="subtle-button" disabled={busy} onClick={() => submitFeedback("skipped")}>Пропустить</button></div></div></section>}
    {room.phase === "processing" && <section className="glass mx-auto max-w-2xl rounded-3xl p-8 text-center"><div className={`mx-auto h-12 w-12 rounded-full border-2 border-cyan-300/20 border-t-cyan-300 ${room.processing_status === "failed" ? "" : "animate-spin"}`} /><h2 className="mt-5 text-2xl font-bold">Готовим личный отчёт</h2><p className="mt-2 text-cyan-200">{{ queued: "Ставим анализ в очередь", analyzing: "Анализируем разговор", building_report: "Собираем рекомендации", failed: "Не удалось подготовить отчёт" }[room.processing_status] || "Обрабатываем материалы"}</p><p className="mt-2 text-sm text-slate-400">Страница обновится автоматически. Её можно закрыть и вернуться позже.</p>{room.processing_status === "failed" && <button className="primary-button mt-5" onClick={() => api(`/api/rooms/${room.id}/processing/retry`, { method: "POST" }).then(reload).catch((e) => setError(e.message))}>Повторить анализ</button>}</section>}
    {room.phase === "finished" && <section className="glass rounded-3xl p-7"><div className="eyebrow">ЛИЧНЫЙ ОТЧЁТ</div><h2 className="mt-2 text-3xl font-bold">Практика завершена</h2>{ownReport ? <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]"><div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5"><h3 className="text-xl font-bold">Ваш разбор</h3><p className="mt-3 leading-relaxed text-slate-300">{ownReport.summary || ownReport.verdict}</p>{(ownReport.mistakes || []).length > 0 && <><h4 className="mt-5 font-bold text-rose-200">Что улучшить</h4><ul className="mt-2 space-y-2 text-sm text-slate-300">{ownReport.mistakes.map((item, i) => <li key={i}>• {item}</li>)}</ul></>}</div><aside className="space-y-4">{ownReport.metrics?.values && <div className="rounded-2xl border border-white/10 p-5"><MetricsBar metrics={ownReport.metrics.values} /></div>}{room.team_result?.complete && <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-5"><div className="text-xs text-cyan-300">КОМАНДНЫЙ РЕЗУЛЬТАТ</div><div className="mt-2 text-3xl font-bold">{room.team_result.score} / {room.team_result.maximum}</div><p className="mt-2 text-xs text-slate-400">Сумма двух независимых результатов. Чужой личный отчёт остаётся приватным.</p></div>}{room.recording?.status === "ready" && <button className="subtle-button w-full" onClick={() => downloadPrivate(`/api/rooms/${room.id}/recordings/${room.recording.id}/download`, `arena-room-${room.id}.webm`).catch((e) => setError(e.message))}>Скачать свою запись</button>}</aside></div> : <p className="mt-4 text-slate-400">Отчёт пока недоступен.</p>}<div className="mt-6 flex gap-3"><button className="primary-button" onClick={() => nav("/rooms")}>Новая встреча</button><button className="subtle-button" onClick={() => nav("/profile")}>В профиль</button></div></section>}
    {error && <div role="alert" className="fixed bottom-5 right-5 z-50 max-w-md rounded-2xl border border-rose-300/20 bg-rose-950/95 p-4 text-rose-200">{error}</div>}
  </div>;
}
