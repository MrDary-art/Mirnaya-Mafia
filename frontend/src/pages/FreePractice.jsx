import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, apiStream } from "../api.js";
import VoiceConversation from "../components/VoiceConversation.jsx";
import { useSpeechQueue } from "../components/useSpeechQueue.js";
import MentorChat from "../components/MentorChat.jsx";
import ChatBubble, { RecordingBubble } from "../components/LiveChatBubble.jsx";
import MetricsBar, { MetricsExplanation } from "../MetricsBar.jsx";
import Icon from "../components/Icon.jsx";
import { TwinDuelBrief, TwinDuelSidebar } from "../components/TwinDuelContext.jsx";
import { businessPracticePath } from "../business/navigation.js";
import "./conversation.css";
import "./twin-duel.css";

export default function FreePractice() {
  const [params] = useSearchParams();
  const { id, companyId } = useParams();
  const sessionId = id || params.get("session");
  return sessionId ? <Conversation id={sessionId} /> : <Navigate to={companyId ? `${businessPracticePath(companyId, "ai")}/prepare` : "/ai/prepare"} replace />;
}

function Conversation({id}) {
  const nav = useNavigate();
  const { companyId } = useParams();
  const reportPath = companyId ? `/business/${companyId}/report/${id}` : `/report/${id}`;
  const location = useLocation();
  const [session,setSession] = useState(null), [error,setError] = useState("");
  const [text,setText] = useState(location.state?.conversationDraft || ""), [busy,setBusy] = useState(false), [draft,setDraft] = useState(null);
  const [confirmFinish,setConfirmFinish] = useState(false);
  const [recording,setRecording] = useState(false), [voicePhase,setVoicePhase] = useState("idle");
  const [speak,setSpeak] = useState(() => localStorage.getItem("arena_speech_enabled") !== "false");
  const [mentorBusy,setMentorBusy] = useState(false), [newMessages,setNewMessages] = useState(false);
  const speech = useSpeechQueue(speak,setError);
  const log = useRef(null), follow = useRef(true), stream = useRef(null);
  const composerInput = useRef(null);
  const duel = session?.settings?.twin_duel;
  const answered = session?.messages?.filter(message => message.sender === "player").length || 0;
  const locked = busy || mentorBusy || voicePhase !== "idle";
  useEffect(() => { localStorage.setItem("arena_speech_enabled",String(speak)); },[speak]);
  async function reload() {
    const data = await api(`/api/sessions/${id}`);
    if (data.status === "finished" || data.status === "processing") {nav(reportPath,{replace:true});return;}
    setSession(data);
  }
  useEffect(() => {reload().catch(e=>setError(e.message)); return () => stream.current?.abort();},[id]);
  useEffect(() => {
    if (!log.current) return;
    if (duel && answered === 0 && !draft && !recording) {log.current.scrollTop=0;return;}
    if (follow.current) jumpToLatest(); else setNewMessages(true);
  },[session?.messages?.length,draft?.aiText,draft?.userText,recording]);
  useEffect(() => {
    if (!duel || !composerInput.current) return;
    composerInput.current.style.height = "auto";
    composerInput.current.style.height = `${Math.min(composerInput.current.scrollHeight, 160)}px`;
  }, [text, Boolean(duel)]);
  useEffect(() => {
    if (!duel) return;
    const syncMobileFollow = () => {
      if (!window.matchMedia("(max-width: 600px)").matches || !composerInput.current) return;
      const bounds = composerInput.current.getBoundingClientRect();
      follow.current = bounds.top < window.innerHeight && bounds.bottom > 0;
    };
    window.addEventListener("scroll", syncMobileFollow, {passive:true});
    return () => window.removeEventListener("scroll", syncMobileFollow);
  }, [Boolean(duel)]);
  function jumpToLatest() {
    if (!log.current) return;
    follow.current = true;
    if (duel && window.matchMedia("(max-width: 600px)").matches) composerInput.current?.scrollIntoView({block:"end"});
    else log.current.scrollTop = log.current.scrollHeight;
    setNewMessages(false);
  }
  function showSituation() {
    if (!log.current) return;
    follow.current = false;
    const heading = log.current.querySelector("h2");
    if (window.matchMedia("(max-width: 600px)").matches) heading?.scrollIntoView({block:"start"});
    else log.current.scrollTop = 0;
    heading?.focus({preventScroll:true});
  }
  async function send(finishAfter=false) {
    if (!text.trim() || locked) return;
    follow.current = true;
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
      if(result?.finished) nav(reportPath); else if(finishAfter===true) {await api(`/api/sessions/${id}/finish`,{method:"POST"});nav(reportPath);} else await reload();
      setDraft(null);
    } catch(e) {if(e.name!=="AbortError"){setError(e.message);if(!accepted)setText(submitted);await reload().catch(()=>{});setDraft(null);}}
    finally {setBusy(false);}
  }
  async function finish(discardDraft=false) {
    if (locked) return;
    if (text.trim() && discardDraft!==true) {setConfirmFinish(true);return;}
    setConfirmFinish(false);
    setBusy(true);setError("");speech.stop();
    try {await api(`/api/sessions/${id}/finish`,{method:"POST"});nav(reportPath);}
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
  const settings=session.settings || {}, questions=settings.practice_plan?.questions || settings.interview_questions || [], brief=settings.practice_plan?.brief;
  const activity=recording ? "Записывается ваша реплика" : voicePhase==="transcribing" ? "Распознаём голос" : draft?.aiText ? "ИИ отвечает" : draft ? "ИИ думает" : "В разговоре";
  const opponentName = duel ? (settings.practice_plan?.opponent_role || session.opponent_role || "Собеседник") : "ИИ";
  return <div className={`practice-page conversation-page${duel ? " twin-duel-page" : ""}`}><header className="conversation-heading"><div>{duel ? <><h1>Дуэль с цифровым двойником</h1><p className="twin-introduction">Проведите переговоры и сравните результат со своими лучшими практиками.</p></> : <><span className="eyebrow">ПРАКТИКА С ИИ</span><h1 title={settings.problem}>{settings.title || settings.problem || "Деловой разговор"}</h1><div className="conversation-goal-row"><p className="conversation-goal"><b>Ваша задача:</b> {brief?.player_task || session.goal}</p><MetricsExplanation mode={session.mode} scoring={session.scoring} inline /></div>{questions.length>0 && <small>Вопрос {Math.min(answered+1,questions.length)} из {questions.length} · структурированная практика</small>}</>}</div><button className="subtle-button" disabled={locked} onClick={finish}>{duel ? "Завершить дуэль" : "Завершить и получить разбор"}</button></header>
    {confirmFinish && <section className="practice-review" role="alertdialog" aria-labelledby="finish-title"><h2 id="finish-title">Остался неотправленный ответ</h2><p>Отправить его перед завершением? Тогда он попадёт в разбор.</p><div className="practice-actions"><button className="primary-button" onClick={()=>{setConfirmFinish(false);send(true);}}>Отправить и завершить</button><button className="subtle-button" onClick={()=>finish(true)}>Завершить без черновика</button><button className="subtle-button" onClick={()=>setConfirmFinish(false)}>Продолжить разговор</button></div></section>}
    <div className="conversation-layout"><section className="conversation-main" aria-label={duel ? "Переговоры с цифровым двойником" : "Разговор с ИИ"}><div className="conversation-presence"><div>{duel && <span className="twin-opponent-avatar"><Icon name="bot" size={22}/></span>}<div className="twin-presence-copy"><b>{opponentName}{duel && <span className="twin-ai-label">ИИ</span>}</b><p role="status">{duel && activity === "В разговоре" ? "Ожидает ваш ответ" : activity}</p></div></div><div className="conversation-tools">{duel && <button type="button" className="twin-situation-link" aria-label="Показать ситуацию" onClick={showSituation}><Icon name="book-open" size={18}/><span>Ситуация</span></button>}<button type="button" className="conversation-audio-toggle" aria-label="Озвучивание ответов ИИ" aria-pressed={speak} onClick={()=>setSpeak(v=>!v)}><Icon name={speak?"volume-2":"volume-x"} size={18}/><span>{speak?"Озвучка включена":"Озвучка выключена"}</span></button></div></div>
      <div ref={log} className="live-chat-log conversation-log" onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;if(follow.current)setNewMessages(false);}}>
        {duel && <TwinDuelBrief session={session}/>}
        {session.messages?.map((m,index)=><ChatBubble key={m.id || index} own={m.sender==="player"} label={m.sender==="player" ? "Вы" : opponentName} text={m.text} delivered={m.sender==="player"}/>)}
        {draft && <ChatBubble own label="Вы" text={draft.userText || "Распознаём запись…"} status={draft.status} voice={draft.source==="voice"}/>}
        {draft && draft.status!=="transcribing" && <ChatBubble label={opponentName} text={draft.aiText} loading={!draft.aiText} activity={activity}/>}
        {recording && <RecordingBubble/>}
      </div>
      {newMessages && <button className="conversation-new" onClick={jumpToLatest}>К новым сообщениям <Icon name="arrow-right" size={16}/></button>}
      {duel && <div className="twin-composer-label"><label htmlFor={`conversation-reply-${id}`}>Ваш ответ</label><span>{text.length} / 2000</span></div>}
      <div className="conversation-composer"><div className="live-chat-composer"><textarea ref={composerInput} id={`conversation-reply-${id}`} maxLength={2000} rows={2} disabled={locked} aria-label="Ваш ответ" placeholder={duel ? "Предложение или вопрос…" : "Напишите ответ…"} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><button type="button" aria-label="Отправить ответ" title="Отправить ответ" disabled={locked||!text.trim()} onClick={send}><Icon name="send" size={20}/></button></div>
      <VoiceConversation compact sessionId={id} disabled={busy || mentorBusy} speechEnabled={speak} onActivity={setRecording} onPhase={setVoicePhase} onStreamEvent={voiceEvent} onTurn={async result=>{if(result?.finished)nav(reportPath);else await reload();setDraft(null);}}/></div>
      {duel && <p className="twin-composer-help">Enter — отправить · Shift + Enter — новая строка</p>}
      {error && <p role="alert" className="product-error">{error}</p>}{session.ai_provider==="offline"&&<p className="product-error">ИИ сейчас недоступен. Разговор сохранён; можно повторить позже или завершить с имеющимися данными.</p>}
    </section><aside className="conversation-context" aria-label={duel ? "Показатели и условия дуэли" : "Условия разговора"}>{duel ? <TwinDuelSidebar session={session} answered={answered}/> : <><MetricsBar metrics={session.metrics} mode={session.mode} scoring={session.scoring} coverage={session.metrics_coverage} showExplanation={false}/><details className="conversation-brief-details"><summary>Задача и условия</summary><h2>{brief?.player_task ? "Ваша задача" : "Ваша цель"}</h2><p>{brief?.player_task || session.goal}</p><h3>Ваша роль</h3><p>{session.role}</p>{!["Собеседник","ИИ","Оппонент"].includes(settings.practice_plan?.opponent_role || session.opponent_role) && <><h3>Роль ИИ</h3><p>{settings.practice_plan?.opponent_role || session.opponent_role}</p></>}{brief&&<div className="practice-brief"><h3>Карта разговора</h3><p><b>Ситуация</b>{brief.situation}</p><p><b>Задача ИИ</b>{brief.opponent_goal}</p><p><b>Удачный исход</b>{brief.success}</p><p><b>Промежуточный итог</b>{brief.partial}</p><p><b>Неудачный исход</b>{brief.failure}</p></div>}{settings.constraints&&<><h3>Ограничения</h3><p>{settings.constraints}</p></>}{questions.length>0&&<><h3>Критерии</h3><ul>{settings.practice_plan?.criteria?.map(c=><li key={c}>{c}</li>)}</ul></>}</details></>}
    </aside>{!settings.twin_duel && settings.corporate_policy?.hints_allowed !== false && <details className="conversation-mentor"><summary>Сова-ментор <span>Помощь с разговором</span></summary><MentorChat sessionId={id} disabled={busy || voicePhase !== "idle"} onBusyChange={setMentorBusy}/></details>}</div></div>;
}
