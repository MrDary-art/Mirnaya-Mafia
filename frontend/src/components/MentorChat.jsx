import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function MentorChat({ sessionId, disabled = false, onBusyChange, example = false }) {
  const [messages,setMessages]=useState([]), [text,setText]=useState("");
  const [busy,setBusy]=useState(false), [loading,setLoading]=useState(!example), [error,setError]=useState("");
  const log=useRef(null), request=useRef(null);
  useEffect(()=>{if(example)return;let alive=true;api(`/api/sessions/${sessionId}/mentor`).then(data=>{if(alive)setMessages(data.messages||[]);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[sessionId,example]);
  useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight;},[messages.length,busy]);
  async function send(value="") {
    if(busy||disabled)return;
    if(example){setMessages(current=>[...current,{role:"user",text:value||"Активировать помощь"},{role:"assistant",text:value ? "Пример совета: сначала выясните, что обязательно должно быть готово в пятницу. Тогда можно предложить поэтапный запуск. Как вы сформулировали бы этот вопрос своими словами?" : "Ваша цель — согласовать реалистичный срок, сохранив бюджет. Заказчик настаивает на пятнице. Чем помочь: разобраться в его интересах, подобрать аргумент или проверить вашу формулировку?"}]);setText("");return;}
    if(!request.current || request.current.text!==value)request.current={text:value,request_id:crypto.randomUUID()};
    setBusy(true);onBusyChange?.(true);setError("");
    try {const data=await api(`/api/sessions/${sessionId}/mentor`,{method:"POST",body:request.current});setMessages(data.messages||[]);setText("");request.current=null;}
    catch(e){setError(e.message);} finally{setBusy(false);onBusyChange?.(false);}
  }
  return <section className="mentor-panel" aria-label="Чат с ментором"><header><span className="mentor-mark" aria-hidden="true">М</span><div><h2>Ментор</h2><small>Ваш преподаватель · только текст</small></div>{messages.length>0&&<span className="mentor-active">Рядом</span>}</header>
    {!messages.length ? <div className="mentor-welcome"><h3>Разобраться, а не угадать</h3><p>Ментор прочитает задачу и ход разговора. Поможет понять вопрос, выбрать подход и собрать аргументы.</p><button className="primary-button" disabled={disabled||busy||loading} onClick={()=>send()}>{busy ? "Изучает разговор…" : loading ? "Открываем ментора…" : "Активировать помощь"}</button><small>В разборе отметим работу с поддержкой. Это часть обучения и не штраф.</small></div> : <>
      <div className="mentor-log" ref={log} role="log" aria-label="Сообщения ментора">{messages.map((message,i)=><div key={i} className={`mentor-message ${message.role}`}><small>{message.role==="user" ? "Вы · личный вопрос" : "Ментор"}</small><p>{message.text}</p></div>)}{busy&&<div className="mentor-thinking" role="status"><span/>Ментор изучает вопрос…</div>}</div>
      <form className="mentor-composer" onSubmit={e=>{e.preventDefault();if(text.trim())send(text.trim());}}><label className="sr-only" htmlFor="mentor-question">Вопрос ментору</label><textarea id="mentor-question" rows={2} maxLength={1500} value={text} onChange={e=>setText(e.target.value)} disabled={disabled||busy} placeholder="Спросите о подходе или формулировке…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(text.trim())send(text.trim());}}}/><button aria-label="Отправить вопрос ментору" disabled={disabled||busy||!text.trim()}>↗</button></form><small className="mentor-private">Личный чат: собеседник не видит эти сообщения.</small>
    </>}{error&&<p role="alert" className="product-error">{error}</p>}</section>;
}
