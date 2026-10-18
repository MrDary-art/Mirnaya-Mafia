import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./installation-admin.css";
import "../admin/management.css";

const statuses = { NEW:"Новая", QUALIFIED:"Подтверждена", CONTACTED:"Связались", PROPOSAL:"Предложение", WON:"Сделка", LOST:"Закрыта" };

export default function BusinessLeads() {
  const {user,ready}=useAuth();
  const [data,setData]=useState(null), [status,setStatus]=useState(""), [q,setQ]=useState(""), [drafts,setDrafts]=useState({});
  const [error,setError]=useState(""), [message,setMessage]=useState(""), [busy,setBusy]=useState(false);
  const load=()=>api(`/api/admin/business/leads?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`).then(value=>{setData(value);setDrafts(Object.fromEntries(value.items.map(item=>[item.id,{status:item.status,internal_note:item.internal_note,next_action_at:item.next_action_at?.slice(0,16)||""}])))}).catch(cause=>setError(cause.message));
  useEffect(()=>{if(user?.is_admin)load();},[user?.is_admin,status,q]);
  async function save(item){setBusy(true);setError("");try{await api(`/api/admin/business/leads/${item.id}`,{method:"PUT",body:{...drafts[item.id],next_action_at:drafts[item.id].next_action_at||null,assign_to_me:true}});setMessage("Заявка обновлена.");await load();}catch(cause){setError(cause.message);}finally{setBusy(false);}}
  if(!ready)return <p role="status">Загружаем…</p>;
  if(!user)return <Navigate to="/login?next=%2Fadmin%2Fbusiness-leads" replace/>;
  if(!user.is_admin)return <Navigate to="/app" replace/>;
  return <main className="installation-admin"><header><div><Link to="/admin">← Администрирование</Link><h1>Корпоративные заявки</h1></div></header>
    {error&&<p className="ia-notice" role="alert">{error}</p>}{message&&<p className="ia-notice" role="status">{message}</p>}
    <section className="ia-panel"><div className="ia-toolbar admin-leads-toolbar"><label>Поиск<input type="search" value={q} onChange={event=>setQ(event.target.value)} placeholder="Компания, имя или почта"/></label><label>Статус<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">Все</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div><p>Всего: {data?.total||0}</p></section>
    {data?.items.map(item=>{const draft=drafts[item.id];return <article className="ia-panel" key={item.id}><h2>{item.company}</h2><p><b>{item.name}</b> · <a href={`mailto:${item.email}`}>{item.email}</a></p><p>{item.message||"Описание задачи не добавлено."}</p><div className="ia-toolbar"><label>Статус<select value={draft.status} onChange={event=>setDrafts({...drafts,[item.id]:{...draft,status:event.target.value}})}>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Следующее действие<input type="datetime-local" value={draft.next_action_at} onChange={event=>setDrafts({...drafts,[item.id]:{...draft,next_action_at:event.target.value}})}/></label></div><label>Внутренняя заметка<textarea rows="3" value={draft.internal_note} onChange={event=>setDrafts({...drafts,[item.id]:{...draft,internal_note:event.target.value}})}/></label><button disabled={busy} onClick={()=>save(item)}>Сохранить</button></article>})}
    {data&&!data.items.length&&<section className="ia-panel"><p>Заявок по этим условиям нет.</p></section>}
  </main>;
}
