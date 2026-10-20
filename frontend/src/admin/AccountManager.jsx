import {useEffect, useState, useRef} from "react";
import {api} from "../api.js";
import PageHeader from "../design/PageHeader.jsx";
import "./management.css";

export function Pagination({page, setPage, total, limit}) {
  return <div className="am-pagination"><span>Всего: {total} · Страница {page} из {Math.max(1, Math.ceil(total/limit))}</span><button disabled={page <= 1} onClick={()=>setPage(p=>p-1)}>Назад</button><button disabled={page*limit >= total} onClick={()=>setPage(p=>p+1)}>Далее</button></div>;
}
export function PageSize({limit, onChange}) {
  return <label>Показывать по<select value={limit} onChange={e=>onChange(Number(e.target.value))}>{[20,50,100,200].map(n=><option key={n} value={n}>{n} человек</option>)}</select></label>;
}
const actions = {password:"Сменить пароль",stars:"Изменить звёзды",ban:"Заблокировать",unban:"Снять блокировку",delete:"Удалить аккаунт",restore:"Восстановить аккаунт"};
export default function AccountManager() {
  const [q,setQ]=useState(""),[page,setPage]=useState(1),[limit,setLimit]=useState(20),[deleted,setDeleted]=useState(false);
  const [data,setData]=useState(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[revision,setRevision]=useState(0);
  const [selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false);
  const actionPanel=useRef(null);
  useEffect(()=>{if(draft)actionPanel.current?.scrollIntoView({block:"start",behavior:"smooth"});},[draft?.action,selected?.id]);
  useEffect(()=>{let active=true;setData(null);setError("");api(`/api/admin/management/users?${new URLSearchParams({q,page,limit,deleted})}`).then(v=>active&&setData(v)).catch(e=>active&&setError(e.message));return()=>{active=false};},[q,page,limit,deleted,revision]);
  function open(user,action){setSelected(user);setError("");setMessage("");setDraft({action,reason:"",password:"",passwordConfirm:"",amount:0,hours:24,confirmation:"",operation_id:crypto.randomUUID()});}
  async function submit(e){e.preventDefault();setBusy(true);setError("");try{const body={...draft};delete body.passwordConfirm;if(!body.password)delete body.password;await api(`/api/admin/management/users/${selected.id}`,{method:"POST",body});setMessage(`${actions[draft.action]}: выполнено для @${selected.username}.`);setDraft(null);setSelected(null);setRevision(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="installation-admin"><PageHeader title="Управление пользователями"/>
    {error&&<p className="ia-error" role="alert">{error}</p>}{message&&<p className="ia-notice" role="status">{message}</p>}
    {draft&&<section ref={actionPanel} className="ia-panel am-action" aria-label="Действие с аккаунтом"><form onSubmit={submit}><header><div><h2>{actions[draft.action]}</h2><p>{selected.name} · @{selected.username}</p></div><button type="button" disabled={busy} onClick={()=>{setDraft(null);setSelected(null);}}>Отмена</button></header>
      {draft.action==="password"&&<><label>Новый пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/><small>От 12 символов. Предыдущие сеансы входа будут закрыты.</small></label><label>Повторите новый пароль<input type="password" autoComplete="new-password" required value={draft.passwordConfirm} onChange={e=>setDraft({...draft,passwordConfirm:e.target.value})}/></label>{draft.passwordConfirm&&draft.password!==draft.passwordConfirm&&<p role="status">Пароли не совпадают.</p>}</>}
      {draft.action==="stars"&&<label>Количество звёзд (минус — списание)<input type="number" required min={-1000000} max={1000000} value={draft.amount} onChange={e=>setDraft({...draft,amount:Number(e.target.value)})}/><small>Сейчас: {selected.stars} ★</small></label>}
      {draft.action==="ban"&&<label>Срок блокировки<select value={draft.hours} onChange={e=>setDraft({...draft,hours:Number(e.target.value)})}>{[[1,"1 час"],[24,"1 день"],[168,"7 дней"],[720,"30 дней"]].map(([n,label])=><option key={n} value={n}>{label}</option>)}</select></label>}
      {draft.action==="delete"&&<><p>Аккаунт исчезнет из рабочего списка, вход и участие в компаниях будут закрыты. История и отчёты сохранятся. Восстановление не возвращает прежний пароль и членство.</p><label>Введите логин для подтверждения<input required value={draft.confirmation} onChange={e=>setDraft({...draft,confirmation:e.target.value})}/></label></>}
      {draft.action==="restore"&&<p>После восстановления задайте новый пароль. Членство в компаниях восстанавливается отдельно.</p>}
      <label>Причина действия<textarea required minLength={5} maxLength={1500} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label><button className={draft.action==="delete"?"am-danger":""} disabled={busy|| (draft.action==="password"&&draft.password!==draft.passwordConfirm)|| (draft.action==="stars"&&!draft.amount) || (draft.action==="delete"&&draft.confirmation!==selected.username)}>{busy?"Сохраняем…":"Подтвердить"}</button>
    </form></section>}
    <section className="ia-panel"><div className="am-filters"><label className="am-search">Найти по имени или логину<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></label><PageSize limit={limit} onChange={v=>{setLimit(v);setPage(1);}}/><label>Аккаунты<select value={String(deleted)} onChange={e=>{setDeleted(e.target.value==="true");setPage(1);}}><option value="false">Действующие</option><option value="true">Удалённые</option></select></label></div>
      {!data?<p role="status">Загрузка…</p>:<><div className="ia-table"><table><thead><tr>{["Пользователь","Звёзды","Состояние","Регистрация · московское время","Управление"].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{data.items.map(u=><tr key={u.id}><td><b>{u.name}</b><small className="am-secondary">@{u.username}</small></td><td>{u.stars} ★</td><td><span className={`am-badge ${u.ban||u.deleted?"is-warning":""}`}>{u.deleted?"Удалён":u.is_admin?"Администратор":u.ban?"Заблокирован":"Активен"}</span>{u.ban&&<small className="am-secondary">До {new Date(u.ban.until).toLocaleString("ru-RU")}</small>}</td><td>{u.created_at?new Date(u.created_at+"Z").toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"}):"—"}</td><td>{u.is_admin?<span>Защищён</span>:<div className="am-actions">{(u.deleted?["restore"]:["password","stars",u.ban?"unban":"ban","delete"]).map(a=><button key={a} className={a==="delete"?"am-danger":""} onClick={()=>open(u,a)}>{actions[a]}</button>)}</div>}</td></tr>)}</tbody></table></div>{!data.items.length&&<p>Пользователей не найдено.</p>}<Pagination {...{page,setPage,limit,total:data.total}}/></>}
    </section>
  </div>;
}
