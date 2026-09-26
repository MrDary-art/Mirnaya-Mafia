import Icon from "../components/Icon.jsx";
import "./room-waiting.css";
import BookingActions, { moscowDate } from "../components/BookingActions.jsx";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiStream, downloadPrivate } from "../api.js";
import ReportDocument from "../components/ReportDocument.jsx";
import RoomLobby from "../components/RoomLobby.jsx";
import RoomResults from "../components/RoomResults.jsx";
import { useSpeechQueue } from "../components/useSpeechQueue.js";
import { UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import VoiceConversation from "../components/VoiceConversation.jsx";
import PeerCall from "../components/PeerCall.jsx";
import ChatBubble, { RecordingBubble } from "../components/LiveChatBubble.jsx";

function timeLeft(deadline, fallback = 15) {
  if (!deadline) return `${String(fallback).padStart(2, "0")}:00`;
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const phaseText = { scheduled: "Запись сохранена", cancelled: "Отменена", expired: "Время прошло", lobby: "Подготовка", active: "В разговоре", feedback: "Обратная связь", processing: "Готовим отчёт", finished: "Завершено" };

export default function Room() {
  const { id } = useParams(); const nav = useNavigate();
  const [room, setRoom] = useState(null); const [session, setSession] = useState(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [clock, setClock] = useState("15:00"); const [draft, setDraft] = useState(null); const [recording, setRecording] = useState(false);
  const [devicesReady, setDevicesReady] = useState(false); const [recordingConsent, setRecordingConsent] = useState(false);
  const [feedback, setFeedback] = useState({ outcome: "", peer_feedback: "", self_reflection: "", usefulness: 5, technical_issues: "", repeat_together: true, share_with_peer: false, publish_team_result: false });
  const streaming = useRef(false);
  const [voicePhase, setVoicePhase] = useState("idle");
  const [speak, setSpeak] = useState(true);
  const [connection, setConnection] = useState("Проверка связи");
  const speech = useSpeechQueue(speak, setError);
  const peerFlush = useRef(null);
  const locked = busy || voicePhase !== "idle";

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
  useEffect(() => { const tick = () => setClock(timeLeft(room?.attempt_started_at && !room?.done ? room?.attempt_deadline : room?.deadline, room?.duration_minutes)); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [room?.deadline, room?.attempt_deadline, room?.attempt_started_at, room?.done, room?.duration_minutes]);
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
    if (!text.trim() || locked) return; setBusy(true); setError(""); const submitted = text.trim();
    let generated = "";
    let spoken = "";
    try {
      if (room.mode === "duel" && session) {
        streaming.current = true; setDraft({ source: "text", userText: submitted, status: "sending", aiText: "" }); setText("");
        await apiStream(`/api/sessions/${session.id}/turn-stream`, { body: { text: submitted, speak }, onEvent: async (event) => {
          if (event.type === "accepted") setDraft((current) => current && { ...current, status: "delivered" });
          if (event.type === "reply_delta") {
            generated += event.text;
            setDraft((current) => current && { ...current, status: "delivered", aiText: generated });
          }
          if (event.type === "sentence_audio") {
            const prefix = spoken ? `${spoken} ` : "";
            speech.enqueue(event.text, event.wav);
            spoken = `${prefix}${event.text}`;
          }
          if (event.type === "audio_error") {
            setError(event.message);
            setDraft((current) => current && { ...current, aiText: generated.trim() });
          }
          if (event.type === "done") {
            await speech.drain();
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
  async function beginAttempt() {
    setBusy(true); setError("");
    try { setRoom(await api(`/api/rooms/${id}/attempt/start`, { method: "POST" })); await reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function finish() { if (locked) return; setBusy(true); try { await peerFlush.current?.(); setRoom(await api(`/api/rooms/${id}/finish`, { method: "POST" })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function submitFeedback(status) { setBusy(true); try { setRoom(await api(`/api/rooms/${id}/feedback`, { method: "POST", body: { ...feedback, status } })); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  if (!room) return <div className={error ? "product-error" : "product-loading"} role={error ? "alert" : "status"}>{error ? <>Не удалось открыть комнату: {error} <button onClick={() => reload().catch((failure) => setError(failure.message))}>Повторить</button></> : "Открываем комнату…"}</div>;
  const lobby = room.phase === "lobby"; const active = room.phase === "active"; const done = room.done;
  const messages = room.mode === "human" ? room.messages : session?.messages; const ownReport = room.your_report;
  const waiting = active && room.mode === "duel" && (done || (room.duel_window_minutes && !room.attempt_started_at));
  const deviceCanReady = room.mode === "duel" || devicesReady;

  return <div className="arena-room-page mx-auto max-w-7xl space-y-5" data-room-phase={room.phase} data-room-team-complete={room.phase === "finished" && Boolean(room.team_result?.complete)}>
    <header className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/15 text-2xl text-cyan-200"><Icon name={room.mode === "human" ? "users" : "bot"} size={26} /></div><div className="min-w-[220px] flex-1"><div className="text-xs uppercase tracking-[.2em] text-cyan-300">{room.mode === "human" ? "ПЕРЕГОВОРЫ ЛЮДЕЙ" : "ДВА ИНТЕРВЬЮ С ИИ"}</div><h1 className="mt-1 text-2xl font-bold">{room.scenario?.title || room.problem}</h1><p className="mt-1 line-clamp-1 text-sm text-slate-400">{room.problem}</p></div><span className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">{waiting ? (done ? "Интервью завершено" : "Можно начать") : phaseText[room.phase] || room.phase}</span>{active && <div className="rounded-2xl border border-white/10 px-4 py-2 text-right"><div className="text-xs text-slate-400">{room.duel_window_minutes ? (room.attempt_started_at && !done ? "На вашу попытку" : "До закрытия окна") : "Осталось"}</div><div className="font-mono text-2xl font-bold text-cyan-200">{clock}</div></div>}</header>
    {room.phase === "scheduled" && <section className="room-waiting-panel"><div className="eyebrow">ВРЕМЯ ЗАБРОНИРОВАНО</div><h2>{moscowDate(room.scheduled_at)}</h2><p>Ваша запись сохранена. Вход в лобби откроется {moscowDate(room.entry_opens_at)}, за 15 минут до встречи. Ссылки появятся в профиле автоматически.</p><p>{room.guest_id ? `${room.peer_name} уже принял приглашение.` : "Можно заранее пригласить второго участника — его запись будет на то же время."}</p><BookingActions room={room} onCancelled={reload}/><button className="primary-button mt-5" onClick={()=>nav("/profile")}>Мои записи в профиле</button></section>}
    {["cancelled","expired"].includes(room.phase) && <section className="room-waiting-panel"><h2>{room.phase === "cancelled" ? "Запись отменена" : "Время встречи прошло"}</h2><p>Эта встреча больше не занимает место в расписании.</p><button className="primary-button mt-5" onClick={()=>nav("/rooms")}>Выбрать новое время</button></section>}
    {lobby && <div className="booking-date-banner"><small>Встреча по расписанию</small><b>{moscowDate(room.scheduled_at)}</b><p>Проверка устройств доступна сейчас. Разговор начнётся в назначенное время после готовности обоих участников.</p><BookingActions room={room} onCancelled={reload}/></div>}
    {room.mode === "human" && ["lobby", "active"].includes(room.phase) && <PeerCall room={room} ready={room.ready} busy={busy} onReady={() => setReady(true)} onTranscript={reload} onConnection={setConnection} flushRef={peerFlush} onDeviceReady={({ transportReady, recordingConsent: consent }) => { setDevicesReady(transportReady); setRecordingConsent(consent); }} />}

    {lobby && <RoomLobby room={room} busy={busy} canReady={deviceCanReady} onReady={() => setReady(!room.ready)} />}

    {waiting && <section className="room-waiting-panel"><span className="eyebrow">{done ? "ВАША ПОПЫТКА СОХРАНЕНА" : "НЕЗАВИСИМОЕ ИНТЕРВЬЮ"}</span><h2>{done ? "Ваша попытка завершена" : "Начните, когда будете готовы"}</h2><p>{done ? "Ваш личный разбор готовится независимо. Сравнение появится после второй попытки. Можно закрыть страницу и вернуться из истории." : `На ваше интервью — до ${room.duration_minutes} минут. Общее окно закрывается в ${new Date(room.deadline).toLocaleTimeString("ru-RU", {timeZone:"Europe/Moscow", hour:"2-digit", minute:"2-digit"})} МСК; все ответы нужно отправить до этого времени.`}</p><ParticipantProgress room={room}/>{!done && <button className="primary-button" disabled={busy} onClick={beginAttempt}>{busy ? "Открываем интервью…" : "Начать моё собеседование"}</button>}</section>}
    {active && !waiting && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="glass min-w-0 rounded-3xl p-5"><div className="flex items-center justify-between border-b border-white/10 pb-4"><div><div className="text-sm text-slate-400">Вы · {room.your_name}</div><div className="text-lg font-semibold">{room.your_role}</div></div><div className="text-right text-sm text-slate-400">{room.mode === "human" ? room.peer_name : "ИИ интервьюер"}<div className="text-emerald-300">{room.mode === "human" ? connection : session?.ai_provider === "offline" ? "ИИ недоступен" : "Учебное интервью"}</div></div></div>
        {room.mode === "duel" && <div role="status" className={`live-chat-presence mt-3 ${draft || recording ? "busy" : ""}`}><span className="live-chat-presence-dot" />{draft ? "ИИ формирует ответ" : "ИИ слушает вас"}</div>}
        <div className="live-chat-log mt-4 h-[390px] overflow-y-auto rounded-2xl p-4" aria-live="polite">{(messages || []).map((m, i) => { const own = room.mode === "human" ? m.user_id === room.your_id : m.sender === "player"; return <ChatBubble key={m.id || i} own={own} label={own ? "Вы" : room.mode === "human" ? room.peer_name : "ИИ интервьюер"} text={m.text} delivered={own} />; })}{draft && <ChatBubble own label="Вы" text={draft.userText || "Распознаю вашу речь…"} status={draft.status} voice={draft.source === "voice"} />}{draft && <ChatBubble label="ИИ интервьюер" text={draft.aiText} loading={!draft.aiText} activity={draft.aiText ? "Отвечает" : "Обдумывает ответ"} />}{recording && <RecordingBubble />}{(!messages || !messages.length) && <p className="text-center text-slate-500">Разговор начался. Следуйте своей роли и цели.</p>}</div>
        {!done && <>
          <div className="live-chat-composer">
            <textarea rows={1} aria-label="Реплика в комнате" placeholder="Напишите реплику…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <button type="button" aria-label="Отправить реплику" disabled={locked || !text.trim()} onClick={send}>↗</button>
          </div>
          {room.mode === "duel" && session && <VoiceConversation sessionId={session.id} disabled={busy} speechEnabled={speak} onPhase={setVoicePhase} onStreamEvent={onVoiceEvent} onActivity={setRecording} onTurn={async (result) => { streaming.current = false; if (result?.finished) setRoom(await api(`/api/rooms/${id}/finish`, { method: "POST" })); await reload(); setDraft(null); }} />}
          <button onClick={finish} disabled={locked} className="mt-4 text-sm text-rose-200 underline underline-offset-4">{room.mode === "duel" ? "Завершить моё интервью" : "Завершить встречу"}</button>
        </>}
        {done && <p className="mt-4 rounded-2xl bg-cyan-300/10 p-4 text-cyan-100">Ваша часть завершена. Ожидаем завершения второго собеседования; затем отчёт откроется автоматически.</p>}</section>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><h2 className="font-semibold">Личная задача</h2><p className="mt-3 text-sm leading-relaxed text-slate-300">{room.your_brief}</p></div>{room.mode === "duel" && <div className="glass rounded-3xl p-5"><h2 className="mb-3 font-semibold">Ход интервью</h2><p>Ответов: {session?.messages?.filter(item => item.sender === "player").length || 0}. Критерии: соответствие вопросу, примеры, обоснование и ваш вклад.</p><label className="practice-check"><input type="checkbox" checked={speak} onChange={e => setSpeak(e.target.checked)} />Озвучка ответа</label></div>}</aside>
    </div>}

    {["feedback","processing","finished"].includes(room.phase) && <details className="room-feedback"><summary>Обратная связь · необязательно</summary><section className="glass mx-auto max-w-3xl rounded-3xl p-7"><div className="eyebrow">ПОСЛЕ ВСТРЕЧИ</div><h2 className="mt-2 text-3xl font-bold">Зафиксируйте результат</h2><p className="mt-2 text-slate-400">Расскажите о впечатлениях. Разбор готовится независимо от этой формы.</p><div className="mt-6 grid gap-4"><label className="text-sm text-slate-400">Чем закончилась встреча?<input className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-white" value={feedback.outcome} onChange={(e) => setFeedback({ ...feedback, outcome: e.target.value })} /></label><label className="text-sm text-slate-400">Что у вас получилось?<textarea className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-white" rows={3} value={feedback.self_reflection} onChange={(e) => setFeedback({ ...feedback, self_reflection: e.target.value })} /></label><label className="text-sm text-slate-400">Обратная связь партнёру<textarea className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-white" rows={3} value={feedback.peer_feedback} onChange={(e) => setFeedback({ ...feedback, peer_feedback: e.target.value })} /></label><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={feedback.share_with_peer} onChange={(e) => setFeedback({ ...feedback, share_with_peer: e.target.checked })} />Показать отзыв партнёру</label>{room.ranked && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={feedback.publish_team_result} onChange={(e) => setFeedback({ ...feedback, publish_team_result: e.target.checked })} />Опубликовать командный результат</label>}</div><div className="flex gap-3"><button className="primary-button" disabled={busy} onClick={() => submitFeedback("submitted")}>Сохранить обратную связь</button><button className="subtle-button" disabled={busy} onClick={() => submitFeedback("skipped")}>Пропустить</button></div></div></section></details>}
    {room.phase === "processing" && <section className="glass mx-auto max-w-2xl rounded-3xl p-8 text-center"><div className={`mx-auto h-12 w-12 rounded-full border-2 border-cyan-300/20 border-t-cyan-300 ${room.processing_status === "failed" ? "" : "animate-spin"}`} /><h2 className="mt-5 text-2xl font-bold">Зал ожидания</h2><p className="mt-3 text-slate-300">{room.mode === "duel" ? "Оба интервью завершены. ИИ сравнивает ответы и готовит общий вердикт и два личных разбора." : "Разговор завершён. ИИ готовит каждому участнику разбор его ответов."}</p><ParticipantProgress room={room}/><p className="mt-2 text-cyan-200">{{ queued: "Ставим анализ в очередь", analyzing: "Анализируем разговор", building_report: "Собираем рекомендации", failed: "Не удалось подготовить отчёт" }[room.processing_status] || "Обрабатываем материалы"}</p><p className="mt-2 text-sm text-slate-400">Страница обновится автоматически. Её можно закрыть и вернуться позже.</p>{room.processing_status === "failed" && <button className="primary-button mt-5" onClick={() => api(`/api/rooms/${room.id}/processing/retry`, { method: "POST" }).then(reload).catch((e) => setError(e.message))}>Повторить анализ</button>}</section>}
    {waiting && done && (ownReport ? <ReportDocument report={ownReport} sessionMeta={session} /> : <section className="practice-status-panel"><h2>Готовим личный разбор</h2><p>Ваши ответы сохранены. Сравнение ожидает вторую попытку.</p>{room.personal_report_status === "failed" && <button className="subtle-button" onClick={() => api(`/api/sessions/${room.your_session_id}/report/retry`, {method:"POST"}).then(reload).catch(e=>setError(e.message))}>Повторить анализ</button>}</section>)}
    {room.mode === "duel" && active && !done && <p className="room-exam-note">Учебное соревнование: одинаковые условия, самостоятельные ответы. Ментор недоступен обоим участникам.</p>}
    {room.recording?.status === "ready" && <button className="subtle-button" onClick={()=>downloadPrivate(`/api/rooms/${room.id}/recordings/${room.recording.id}/download`,`my-recording-${room.id}.webm`).catch(e=>setError(e.message))}>Скачать мою запись</button>}
    {room.phase === "finished" && <RoomResults room={room} onRetry={() => nav(`/rooms?repeat=${room.id}`)} onReturn={() => nav("/profile")} onCompareRetry={() => api(`/api/rooms/${room.id}/processing/retry`, {method:"POST"}).then(reload).catch(e=>setError(e.message))} />}
    {error && <div role="alert" className="product-error">{error}</div>}
  </div>;
}

function ParticipantProgress({room}) {
  return <div className="room-participant-progress">{Object.entries(room.participants || {}).map(([uid, item])=><div key={uid}><b>{item.display_name}{Number(uid) === room.your_id ? " · вы" : ""}</b><span>{room.mode === "human" && ["processing", "finished"].includes(room.phase) ? "Разговор завершён" : item.completion_reason === "not_started" ? "Не прошёл в отведённый час" : item.done ? "Попытка завершена" : item.attempt_started_at ? "Проходит собеседование" : "Ещё не начал"}</span></div>)}</div>;
}
