import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";

type ErrorItem={sessionId:string;title:string;chosen:string;comment:string;alternative:string|null;answer:string|null};
export default function ErrorTraining(){
  const [items,setItems]=useState<ErrorItem[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({}),[error,setError]=useState(""),[feedback,setFeedback]=useState("");
  useEffect(()=>{api<ErrorItem[]>("/me/errors").then(data=>{setItems(data);setDrafts(Object.fromEntries(data.map(item=>[item.sessionId,item.answer??""])))}).catch(e=>setError(e.message))},[]);
  async function save(sessionId:string){try{const result=await api<{feedback:string}>(`/sessions/${sessionId}/exercise`,"POST",{answer:drafts[sessionId]});setFeedback(result.feedback)}catch(e){setError((e as Error).message)}}
  return <div className="page narrow"><Link className="back-link" to="/progress">← К прогрессу</Link><span className="kicker">ПРАКТИКА ИЗ ОПЫТА</span><h1>Разобрать сложные ходы</h1><p className="lead">Здесь собраны решения из ваших завершённых миссий, которые снизили хотя бы один показатель. Переформулируйте реплику и сравните её с авторским вариантом.</p>{error&&<p className="error" role="alert">{error}</p>}{feedback&&<p className="success" role="status">{feedback}</p>}{items.length?items.map(item=><section className="detail-panel" key={item.sessionId}><span className="card-number">{item.title}</span><h2>Ваш ход</h2><p>{item.chosen}</p><p>{item.comment}</p><label className="field-label">Как скажете теперь?<textarea rows={3} value={drafts[item.sessionId]??""} onChange={e=>setDrafts({...drafts,[item.sessionId]:e.target.value})} maxLength={1000}/></label><button className="button primary" disabled={(drafts[item.sessionId]??"").trim().length<10} onClick={()=>save(item.sessionId)}>Сохранить ответ</button>{item.alternative&&<p><strong>Для сравнения: </strong>{item.alternative}</p>}<Link to={`/sessions/${item.sessionId}/report`}>Открыть полный разбор →</Link></section>):<div className="empty">Пока нет сложных ходов. <Link to="/practice">Начать практику →</Link></div>}</div>;
}
