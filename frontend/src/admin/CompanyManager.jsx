import {useEffect,useState,useRef} from "react";
import {api} from "../api.js";
import PageHeader from "../design/PageHeader.jsx";
import "../pages/installation-admin.css";
import "./management.css";

export default function CompanyManager(){
  const [list,setList]=useState(null),[q,setQ]=useState(""),[id,setId]=useState(null),[company,setCompany]=useState(null);
  const [tab,setTab]=useState("members"),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState(null),[reason,setReason]=useState("");
  const actionForm=useRef(null);
  useEffect(()=>{if(draft)actionForm.current?.scrollIntoView({block:"center",behavior:"smooth"});},[draft?.action,draft?.username]);
  useEffect(()=>{let active=true;api(`/api/admin/management/companies?q=${encodeURIComponent(q)}`).then(v=>active&&setList(v)).catch(e=>active&&setError(e.message));return()=>{active=false};},[q,revision]);
  useEffect(()=>{setCompany(null);setDraft(null);setReason("");if(!id)return;let active=true;api(`/api/admin/management/companies/${id}`).then(v=>active&&setCompany(v)).catch(e=>active&&setError(e.message));return()=>{active=false};},[id,revision]);
  function prepare(action,values={}){setDraft({action,...values});setReason("");setError("");setMessage("");}
  async function submit(e){e.preventDefault();setBusy(true);setError("");try{await api(`/api/admin/management/companies/${id}`,{method:"POST",body:{...draft,reason}});setMessage("Изменения сохранены в журнале.");setDraft(null);setRevision(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="installation-admin"><PageHeader title="Управление компаниями"/>{error&&<p role="alert" className="ia-error">{error}</p>}{message&&<p role="status" className="ia-notice">{message}</p>}
    <div className="am-company-grid"><aside className="ia-panel am-company-list"><label>Поиск компании<input type="search" value={q} onChange={e=>setQ(e.target.value)}/></label>{list===null?<p>Загрузка…</p>:!list.length?<p>Компаний не найдено.</p>:list.map(c=><button key={c.id} aria-pressed={id===c.id} onClick={()=>{setId(c.id);setMessage("");setError("");}}><b>{c.name}</b><small>{c.status==="ARCHIVED"?"В архиве":"Участников: "+c.members} · #{c.id}</small></button>)}</aside>
    <section className="ia-panel">{!id?<p>Выберите компанию для управления.</p>:!company?<p role="status">Загрузка компании…</p>:<><div className="am-company-head"><h2>{company.name}</h2><span className="am-badge">{company.status==="ARCHIVED"?"Архив":"Действующая"}</span></div><nav className="admin-local-tabs" aria-label="Управление компанией">{[["members","Участники и роли"],["name","Название"],["status","Архив"]].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>{setTab(key);setDraft(null);}}>{label}</button>)}</nav>
    {tab==="members"&&<><button disabled={busy} onClick={()=>prepare("member",{username:"",role:"EMPLOYEE"})}>Добавить пользователя</button><div className="ia-table"><table><thead><tr><th>Участник</th><th>Роль</th><th>Действия</th></tr></thead><tbody>{company.members.map(m=><tr key={m.id}><td><b>{m.name}</b><small className="am-secondary">@{m.username}{m.status==="INVITED"?" · Приглашён":""}</small></td><td>{company.roles[m.role]||m.role}</td><td><div className="am-actions"><button onClick={()=>prepare("member",{username:m.username,role:m.role})}>Изменить роль</button><button className="am-danger" onClick={()=>prepare("remove_member",{username:m.username})}>Удалить</button></div></td></tr>)}</tbody></table></div></>}
    {tab==="name"&&<><p>Текущее название: <b>{company.name}</b></p>{company.name_lock&&<p className="ia-notice">Название закреплено администрацией. Владелец сможет изменить его после обращения на почту создателей и снятия запрета администратором.<br/>Причина: {company.name_lock.reason}</p>}<div className="am-actions"><button onClick={()=>prepare("rename",{name:company.name})}>Переименовать и запретить изменение</button>{company.name_lock&&<button onClick={()=>prepare("unlock_name")}>Разрешить владельцу менять название</button>}</div></>}
    {tab==="status"&&<><p>Архивирование закрывает доступ к компании, сохраняя её данные.</p><button onClick={()=>prepare(company.status==="ARCHIVED"?"restore":"archive")}>{company.status==="ARCHIVED"?"Восстановить компанию":"Перенести в архив"}</button></>}
    {draft&&<form ref={actionForm} className="am-company-form ia-panel am-action" onSubmit={submit}><header><h3>{{member:"Участник и роль",remove_member:"Удаление участника",rename:"Новое название",unlock_name:"Снять запрет смены названия",archive:"Архивировать компанию",restore:"Восстановить компанию"}[draft.action]}</h3><button type="button" disabled={busy} onClick={()=>setDraft(null)}>Отмена</button></header>
      {draft.action==="rename"&&<label>Название<input required minLength={2} maxLength={180} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>}
      {draft.action==="member"&&<div className="am-filters"><label>Точный логин пользователя<input required value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></label><label>Роль<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}>{Object.entries(company.roles).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>}
      {draft.action==="remove_member"&&<p>Удалить @{draft.username} из компании? Доступ закроется, связи подчинения с этим участником будут сняты. Отчёты сохранятся.</p>}
      <label>Причина действия<textarea required minLength={5} maxLength={1500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy}>{busy?"Сохраняем…":"Подтвердить изменение"}</button>
    </form>}</>}</section></div>
  </div>;
}
