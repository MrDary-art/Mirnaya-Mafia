import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiStream } from "../api.js";
import VoiceConversation from "../components/VoiceConversation.jsx";
import { useSpeechQueue } from "../components/useSpeechQueue.js";
import MentorChat from "../components/MentorChat.jsx";
import ChatBubble, { RecordingBubble } from "../components/LiveChatBubble.jsx";
import MetricsBar from "../MetricsBar.jsx";

export default function FreePractice() {
  const [params] = useSearchParams();
  return params.get("session") ? <Conversation id={params.get("session")} /> : <Navigate to="/ai/prepare" replace />;
}

function Conversation({id}) {
  const nav = useNavigate();
  const [session,setSession] = useState(null), [error,setError] = useState("");
  const [text,setText] = useState(""), [busy,setBusy] = useState(false), [draft,setDraft] = useState(null);
  const [confirmFinish,setConfirmFinish] = useState(false);
  const [recording,setRecording] = useState(false), [voicePhase,setVoicePhase] = useState("idle");
  const [speak,setSpeak] = useState(() => localStorage.getItem("arena_speech_enabled") !== "false");
  const [mentorBusy,setMentorBusy] = useState(false), [newMessages,setNewMessages] = useState(false);
  const speech = useSpeechQueue(speak,setError);
  const log = useRef(null), follow = useRef(true), stream = useRef(null);
  const locked = busy || mentorBusy || voicePhase !== "idle";
  useEffect(() => { localStorage.setItem("arena_speech_enabled",String(speak)); },[speak]);
  async function reload() {
    const data = await api(`/api/sessions/${id}`);
    if (data.status === "finished" || data.status === "processing") {nav(`/report/${id}`,{replace:true});return;}
    setSession(data);
  }
  useEffect(() => {reload().catch(e=>setError(e.message)); return () => stream.current?.abort();},[id]);
  useEffect(() => {
    if (!log.current) return;
    if (follow.current) {log.current.scrollTop=log.current.scrollHeight;setNewMessages(false);} else setNewMessages(true);
  },[session?.messages?.length,draft?.aiText,draft?.userText,recording]);
  async function send(finishAfter=false) {
    if (!text.trim() || locked) return;
    const submitted=text.trim(); setText(""); setBusy(true); setError("");
    setDraft({userText:submitted,aiText:"",status:"sending",source:"text"});
    let generated="", result, accepted=false;
    stream.current=new AbortController();
    try {
      await apiStream(`/api/sessions/${id}/turn-stream`,{body:{text:submitted,speak},signal:stream.current.signal,onEvent:(event)=>{
        if (event.type==="accepted") {accepted=true;setDraft(current=>current&&{...current,status:"delivered"});}
        if (event.type==="reply_delta") {generated+=event.text;setDraft(current=>current&&{...current,aiText:generated});}
        if (event.type==="sentence_audio") speech.enqueue(event.text,event.wav);
        if (event.type==="audio_error") setError(event.message);
        if (event.type==="done") result=event.result;
      }});
      await speech.drain();
      if(result?.finished) nav(`/report/${id}`); else if(finishAfter===true) {await api(`/api/sessions/${id}/finish`,{method:"POST"});nav(`/report/${id}`);} else await reload();
      setDraft(null);
    } catch(e) {if(e.name!=="AbortError"){setError(e.message);if(!accepted)setText(submitted);await reload().catch(()=>{});setDraft(null);}}
    finally {setBusy(false);}
  }
  async function finish(discardDraft=false) {
    if (locked) return;
    if (text.trim() && discardDraft!==true) {setConfirmFinish(true);return;}
    setConfirmFinish(false);
    setBusy(true);setError("");speech.stop();
    try {await api(`/api/sessions/${id}/finish`,{method:"POST"});nav(`/report/${id}`);}
    catch(e) {setError(e.message);setBusy(false);}
  }
  function voiceEvent(event) {
    if(event.type==="voice_pending") {setDraft({userText:"",aiText:"",status:"transcribing",source:"voice"});}
    if(event.type==="transcript_delta") setDraft(current=>current&&{...current,userText:`${current.userText} ${event.text}`.trim()});
    if(event.type==="transcript_done") setDraft(current=>current&&{...current,userText:event.text,status:"sent"});
    if(event.type==="accepted") setDraft(current=>current&&{...current,status:"delivered"});
    if(event.type==="spoken_progress") setDraft(current=>current&&{...current,aiText:event.text});
    if(event.type==="silence") setDraft(null);
    if(event.type==="voice_error") {setError(event.message);setDraft(null);reload().catch(()=>{});}
  }
  if(!session) return <section className="practice-status-panel"><h1>{error ? "Разговор не открылся" : "Открываем разговор…"}</h1>{error&&<><p role="alert">{error}</p><button onClick={()=>reload().catch(e=>setError(e.message))} className="primary-button">Повторить</button></>}</section>;
  const settings=session.settings || {}, questions=settings.practice_plan?.questions || settings.interview_questions || [];
  const answered=session.messages?.filter(m=>m.sender==="player").length || 0;
  const activity=recording ? "Записывается ваша реплика" : voicePhase==="transcribing" ? "Распознаём голос" : draft?.aiText ? "Собеседник отвечает" : draft ? "Собеседник думает" : "В разговоре";
  return <div className="practice-page conversation-page"><header className="conversation-heading"><div><span className="eyebrow">ПРАКТИКА С ИИ</span><h1>{settings.problem || "Деловой разговор"}</h1>{questions.length>0 && <small>Вопрос {Math.min(answered+1,questions.length)} из {questions.length} · учебное интервью</small>}</div><button className="subtle-button" disabled={locked} onClick={finish}>Завершить и получить разбор</button></header>
    {confirmFinish && <section className="practice-review" role="alertdialog" aria-labelledby="finish-title"><h2 id="finish-title">Остался неотправленный ответ</h2><p>Отправить его перед завершением? Тогда он попадёт в разбор.</p><div className="practice-actions"><button className="primary-button" onClick={()=>{setConfirmFinish(false);send(true);}}>Отправить и завершить</button><button className="subtle-button" onClick={()=>finish(true)}>Завершить без черновика</button><button className="subtle-button" onClick={()=>setConfirmFinish(false)}>Продолжить разговор</button></div></section>}
    <div className="conversation-layout"><section className="conversation-main"><div className="conversation-presence"><div><b>{session.opponent_role}</b><p role="status">{activity}</p></div><label><input type="checkbox" checked={speak} onChange={e=>setSpeak(e.target.checked)}/> Озвучка</label></div>
      <div ref={log} className="live-chat-log conversation-log" onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;if(follow.current)setNewMessages(false);}}>
        {session.messages?.map((m,index)=><ChatBubble key={m.id || index} own={m.sender==="player"} label={m.sender==="player" ? "Вы" : session.opponent_role} text={m.text} delivered={m.sender==="player"}/>)}
        {draft && <ChatBubble own label="Вы" text={draft.userText || "Распознаём запись…"} status={draft.status} voice={draft.source==="voice"}/>}
        {draft && draft.status!=="transcribing" && <ChatBubble label={session.opponent_role} text={draft.aiText} loading={!draft.aiText} activity={activity}/>}
        {recording && <RecordingBubble/>}
      </div>
      {newMessages && <button className="conversation-new" onClick={()=>{follow.current=true;log.current.scrollTop=log.current.scrollHeight;setNewMessages(false);}}>К новым сообщениям ↓</button>}
      <div className="live-chat-composer"><textarea maxLength={2000} rows={2} disabled={locked} aria-label="Ваш ответ" placeholder="Напишите ответ…" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><button aria-label="Отправить ответ" disabled={locked||!text.trim()} onClick={send}>↗</button></div>
      <VoiceConversation sessionId={id} disabled={busy || mentorBusy} speechEnabled={speak} onActivity={setRecording} onPhase={setVoicePhase} onStreamEvent={voiceEvent} onTurn={async result=>{if(result?.finished)nav(`/report/${id}`);else await reload();setDraft(null);}}/>
      {error && <p role="alert" className="product-error">{error}</p>}{session.ai_provider==="offline"&&<p className="product-error">ИИ сейчас недоступен. Разговор сохранён; можно повторить позже или завершить с имеющимися данными.</p>}
    </section><aside className="conversation-context"><MetricsBar metrics={session.metrics} /><details open><summary>Задача и условия</summary><h2>Ваша цель</h2><p>{session.goal}</p><h3>Роли</h3><p>Вы — {session.role}. Собеседник — {session.opponent_role}.</p>{settings.constraints&&<><h3>Ограничения</h3><p>{settings.constraints}</p></>}{questions.length>0&&<><h3>Критерии</h3><ul>{settings.practice_plan?.criteria?.map(c=><li key={c}>{c}</li>)}</ul></>}</details>
      <MentorChat sessionId={id} disabled={busy || voicePhase !== "idle"} onBusyChange={setMentorBusy}/>
      <Link to="/ai/guide">Как устроена практика →</Link>
    </aside></div></div>;
}
