import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";

type Activity={id:string;type:"scenario"|"learning"|"ai"|"room";title:string;state:"active"|"finished";createdAt:string;href:string};
const labels={scenario:"Миссия",learning:"Обучение",ai:"ИИ-диалог",room:"Комната 1×1"};
export default function ActivityHistory(){
  const [type,setType]=useState("all"),[state,setState]=useState("all"),[items,setItems]=useState<Activity[]>([]),[error,setError]=useState("");
  useEffect(()=>{let live=true;api<Activity[]>(`/me/activity?type=${type}&state=${state}`).then(value=>{if(live){setItems(value);setError("");}}).catch(error=>{if(live)setError(error.message)});return()=>{live=false};},[type,state]);
  return <div className="page"><Link className="back-link" to="/progress">← Прогресс</Link><span className="kicker">ВСЕ ЗАНЯТИЯ</span><h1>История активности</h1><p className="lead">Миссии, учебные попытки, ИИ-разговоры и комнаты из вашего аккаунта.</p><div className="filter-row"><label className="field-label">Формат<select value={type} onChange={event=>setType(event.target.value)}><option value="all">Все</option>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field-label">Состояние<select value={state} onChange={event=>setState(event.target.value)}><option value="all">Все</option><option value="active">В процессе</option><option value="finished">Завершено</option></select></label></div>{error&&<p className="error" role="alert">{error}</p>}{items.length?items.map(item=><Link className="history-item" to={item.href} key={`${item.type}-${item.id}`}><span><strong>{item.title}</strong><small>{labels[item.type]} · {new Date(item.createdAt).toLocaleString("ru-RU")} · {item.state==="active"?"Продолжить":"Завершено"}</small></span><span>→</span></Link>):!error&&<div className="empty">По этим фильтрам занятий пока нет.</div>}</div>;
}
