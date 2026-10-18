import { useEffect, useRef, useState } from "react";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { api } from "../api.js";

export default function MentorChat({ sessionId, disabled = false, onBusyChange, example = false }) {
  const [messages,setMessages]=useState([]), [text,setText]=useState("");
  const [busy,setBusy]=useState(false), [loading,setLoading]=useState(!example), [error,setError]=useState("");
  const log=useRef(null), request=useRef(null), follow=useRef(true), scrollPosition=useRef(0);
  const [reveal,setReveal]=useState(null);
  useEffect(()=>{if(!reveal)return;const timer=setInterval(()=>setReveal(current=>!current || current.count>=current.length ? null : {...current,count:Math.min(current.length,current.count+38)}),85);return()=>clearInterval(timer);},[reveal?.index]);
  useEffect(()=>{if(example)return;let alive=true;api(`/api/sessions/${sessionId}/mentor`).then(data=>{if(alive)setMessages(data.messages||[]);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[sessionId,example]);
  useEffect(()=>{if(log.current&&follow.current)log.current.scrollTo({top:log.current.scrollHeight,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});},[messages.length,busy,reveal?.count]);
  function receive(next){setMessages(next);const last=next.length-1;if(next[last]?.role==="assistant"&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)setReveal({index:last,count:0,length:next[last].text.length});}
  async function send(value="") {
    if(busy||disabled)return;
    if(example){setMessages(current=>[...current,{role:"user",text:value||"Попросить сову помочь"},{role:"assistant",text:value ? "Пример совета: сначала выясните, что обязательно должно быть готово в пятницу. Тогда можно предложить поэтапный запуск. Как вы сформулировали бы этот вопрос своими словами?" : "Добрый вечер! Сегодня я прилетела вам помочь! Расскажите, в чём проблема? Чем хотите, чтобы я вам помогла?"}]);setText("");return;}
    if(!request.current || request.current.text!==value)request.current={text:value,request_id:crypto.randomUUID()};
    setBusy(true);onBusyChange?.(true);setError("");
    try {const data=await api(`/api/sessions/${sessionId}/mentor`,{method:"POST",body:request.current});receive(data.messages||[]);setText("");request.current=null;}
    catch(e){setError(e.message);} finally{setBusy(false);onBusyChange?.(false);}
  }
  return <section className="mentor-panel" aria-label="Ментор"><header><span className="mentor-mark"><img src="/assets/owl/generated/owl-folded.png" alt="Сова-ментор"/></span><div><h2>Ментор</h2></div>{messages.length>0&&<span className="mentor-active">Рядом</span>}</header>
    {!messages.length ? <div className="mentor-welcome"><p>Ожидает активации.</p><button className="primary-button" disabled={disabled||busy||loading} onClick={()=>send()}>{busy ? "Изучает разговор…" : loading ? "Открываем ментора…" : "Попросить сову помочь"}</button><small className="mentor-note"><InfoIcon size={16} aria-hidden="true"/><span>Использование помощи будет учитываться при детальном разборе итога.</span></small></div> : <>
      <div className="mentor-log" ref={log} onScroll={e=>{const el=e.currentTarget;if(el.scrollHeight-el.scrollTop-el.clientHeight<90)follow.current=true;else if(el.scrollTop<scrollPosition.current-1)follow.current=false;scrollPosition.current=el.scrollTop;}} role="log" aria-label="Сообщения ментора">{messages.map((message,i)=>message.role==="user"&&(message.activation||message.text==="Помогите разобраться с этой тренировкой")?null:<div key={i} className={`mentor-message ${message.role}`}><small>{message.role==="user" ? "Вы" : "Ментор"}</small><p>{reveal?.index===i?message.text.slice(0,reveal.count):message.text}</p></div>)}{busy&&<div className="mentor-thinking" role="status"><span/>Ментор изучает вопрос…</div>}</div>
      <form className="mentor-composer" onSubmit={e=>{e.preventDefault();if(text.trim())send(text.trim());}}><label className="sr-only" htmlFor="mentor-question">Введите вопрос</label><textarea id="mentor-question" rows={2} maxLength={1500} value={text} onChange={e=>setText(e.target.value)} disabled={disabled||busy} placeholder="Введите вопрос…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(text.trim())send(text.trim());}}}/><button aria-label="Отправить вопрос ментору" disabled={disabled||busy||!text.trim()}>↗</button></form>
    </>}{error&&<p role="alert" className="product-error">{error}</p>}</section>;
}
