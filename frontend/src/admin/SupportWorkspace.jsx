import {useEffect,useRef,useState} from "react";
import {Link,Navigate,useLocation,useSearchParams} from "react-router-dom";
import {api} from "../api.js";
import {useAuth} from "../auth.jsx";
import PageHeader from "../design/PageHeader.jsx";
import Icon from "../components/Icon.jsx";
import StoryModeration from "../pages/StoryModeration.jsx";
import CommunityStories from "./CommunityStories.jsx";
import Moderation from "../pages/Moderation.jsx";
import {Pagination} from "./AccountManager.jsx";
import "../pages/installation-admin.css";
import "./admin-shell.css";
import "./support-workspace.css";

export const ticketStates={OPEN:"Новое",IN_PROGRESS:"В работе",DEVELOPER:"У разработчика",WAITING_USER:"Ждём подтверждения",CLOSED:"Решено · архив"};
const date=value=>value?new Date(value).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"}):"—";

export default function SupportWorkspace(){
  const {user,ready}=useAuth(),location=useLocation();
  const [params]=useSearchParams();
  const standalone=location.pathname==="/moderation";
  const moderation=location.pathname==="/admin/stories"||(standalone&&params.get("view")==="moderation");
  const [access,setAccess]=useState(null),[error,setError]=useState("");
  useEffect(()=>{if(!user)return;let active=true;api("/api/admin/operations/access").then(v=>active&&setAccess(v)).catch(e=>active&&setError(e.message));return()=>{active=false};},[user?.id]);
  if(!ready)return <p role="status">Загрузка…</p>;
  if(!user)return <Navigate to="/login?next=%2Fmoderation" replace/>;
  const content=<div className="support-workspace installation-admin">{error?<p role="alert" className="ia-error">{error}</p>:!access?<p role="status">Проверяем доступ…</p>:<><PageHeader title={moderation?"Модерация":"Обращения"}/>{moderation?<ModerationSections/>:<TicketInbox access={access}/>}</>}</div>;
  return standalone?<div className="admin-shell"><header className="admin-masthead"><Link className="admin-brand" to="/app"><img src="/assets/arena-owl-logo.png?v=owl-suit" width="32" height="32" alt="" /><span>Арена<span>Пульт модератора</span></span></Link><div/><span>{access?.name||user.username}</span></header><nav className="admin-subnav" aria-label="Разделы поддержки"><Link to="/moderation?view=moderation" aria-current={moderation?"page":undefined}>Модерация</Link><Link to="/moderation" aria-current={!moderation?"page":undefined}>Обращения</Link></nav>{content}</div>:content;
}

function ModerationSections(){
  const [params,setParams]=useSearchParams();const tab=params.get("tab")||"stories";
  return <><nav className="admin-local-tabs" aria-label="Виды модерации">{[["stories","Сюжетные истории"],["community","Истории сообщества"],["rooms","Активные комнаты"]].map(([id,title])=><button key={id} aria-pressed={tab===id} onClick={()=>{const p=new URLSearchParams(params);p.set("tab",id);setParams(p);}}>{title}</button>)}</nav>{tab==="rooms"?<Moderation gamesOnly/>:tab==="community"?<CommunityStories/>:<StoryModeration staffAccess/>}</>;
}

function StaffAvailability({initial}){
  const [available,setAvailable]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(!available)return;const timer=setInterval(()=>api("/api/admin/operations/availability",{method:"PUT",body:{available:true}}).catch(e=>{setError(e.message);setAvailable(false);}),30000);return()=>clearInterval(timer);},[available]);
  async function toggle(){setBusy(true);setError("");try{await api("/api/admin/operations/availability",{method:"PUT",body:{available:!available}});setAvailable(v=>!v);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="support-presence"><div><span className={`support-presence-dot${available?" is-online":""}`}/><b>{available?"На связи":"Не на связи"}</b><span className="support-presence-caption">Приём обращений</span></div><button aria-pressed={available} disabled={busy} onClick={toggle}>{busy?"Сохраняем…":available?"Завершить приём":"Начать приём"}</button>{error&&<p role="alert">{error}</p>}</div>;
}

function TicketInbox({access}){
  const [params]=useSearchParams();
  const [status,setStatus]=useState(params.get("queue")==="developer"?"DEVELOPER":"active"),[source,setSource]=useState(params.get("source")==="COMMUNITY"?"COMMUNITY":"all");
  const [q,setQ]=useState(""),[page,setPage]=useState(1),[data,setData]=useState(null),[ticket,setTicket]=useState(null),[selected,setSelected]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[reply,setReply]=useState(""),[escalating,setEscalating]=useState(false),[note,setNote]=useState("");
  const version=useRef(0),selection=useRef("");
  useEffect(()=>{if(params.get("queue")==="developer"){setStatus("DEVELOPER");setPage(1);}},[params.get("queue")]);
  async function load(quiet=false){const current=++version.current;try{const result=await api(`/api/admin/support/tickets?${new URLSearchParams({status,source,q,page})}`);if(current===version.current){setData(result);if(!quiet)setError("");}}catch(e){if(current===version.current)setError(e.message);}}
  async function loadDetail(id){try{const result=await api(`/api/admin/support/tickets/${id}`);if(selection.current===id)setTicket(result);}catch(e){if(selection.current===id)setError(e.message);}}
  useEffect(()=>{setData(null);load();const timer=setInterval(()=>load(true),10000);return()=>{version.current++;clearInterval(timer);};},[status,source,q,page]);
  useEffect(()=>{if(!selected)return;selection.current=selected;loadDetail(selected);const timer=setInterval(()=>loadDetail(selected),8000);return()=>{clearInterval(timer);selection.current="";};},[selected]);
  function choose(id){if(busy)return;setSelected(id);selection.current=id;setTicket(null);setReply("");setEscalating(false);setNote("");setNotice("");setError("");}
  async function act(action,text=""){if(busy)return;setBusy(true);setError("");setNotice("");try{await api(`/api/admin/support/tickets/${selected}/actions`,{method:"POST",body:{action,text}});if(action==="reply"||action==="resolve")setReply("");setEscalating(false);setNote("");setNotice({claim:"Вы взяли обращение в работу.",release:"Обращение возвращено в очередь.",escalate:"Передано разработчику. Уведомление отправлено администраторам.",reply:"Ответ отправлен.",resolve:"Участник получил запрос на подтверждение. После подтверждения обращение перейдёт в архив."}[action]);await Promise.all([load(true),loadDetail(selected)]);}catch(e){setError(e.message);await loadDetail(selected);}finally{setBusy(false);}}
  async function content(action){setBusy(true);setError("");try{await api(`/api/admin/support/tickets/${selected}/content`,{method:"POST",body:{action}});setNotice(action==="hide"?"Материал скрыт.":action==="restore"?"Материал восстановлен.":"Сигнал рассмотрен. Отправьте участнику результат.");await loadDetail(selected);}catch(e){setError(e.message);}finally{setBusy(false);}}
  const mine=ticket?.assigned_to===access.id;
  const writable=ticket&&mine&&(!ticket.developer_only||access.admin)&&!["WAITING_USER","CLOSED"].includes(ticket.status);
  return <><StaffAvailability initial={access.available}/>{access.admin&&<ModeratorManagement/>}<section className="ia-panel support-filter-panel"><div className="am-filters"><label className="am-search">Найти обращение<input type="search" placeholder="Имя, логин, текст или номер" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></label><label>Очередь<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{[["active","Все активные"],["OPEN","Новые"],["IN_PROGRESS","В работе"],["DEVELOPER","Разработчику"],["WAITING_USER","Ждём пользователя"],["CLOSED","Архив"],["all","Все обращения"]].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Источник<select value={source} onChange={e=>{setSource(e.target.value);setPage(1);}}><option value="all">Все источники</option><option value="SUPPORT">Поддержка</option><option value="COMMUNITY">Сообщество</option></select></label><button disabled={busy} onClick={()=>{load();if(selected)loadDetail(selected);}}>Обновить</button></div></section>
    {error&&<p role="alert" className="ia-error">{error}</p>}{notice&&<p role="status" className="ia-notice">{notice}</p>}
    <div className="support-ticket-layout"><aside className="ia-panel support-ticket-list"><h2>Очередь <small>{data?.total??"…"}</small></h2>{!data?<p role="status">Загрузка…</p>:!data.items.length?<p>В этой очереди пока нет обращений.</p>:data.items.map(t=><button className={`support-ticket-card${t.kind==="COMMUNITY"?" is-community":""}`} key={t.id} aria-pressed={selected===t.id} onClick={()=>choose(t.id)}><span className="support-ticket-source">{t.kind==="COMMUNITY"?"Сообщество":"Поддержка"} · #{t.id.replace(/^legacy-/,"").replace(/^community-/,"C-").slice(-6)}</span><b>{t.name}</b><span>{t.preview}</span><span className="support-ticket-status">{ticketStates[t.status]}</span>{t.assignee&&<small>Занимается: {t.assignee}</small>}<small>{date(t.updated_at)}</small></button>)}{data&&<Pagination {...{page,setPage,total:data.total,limit:20}}/>}</aside>
    <section className={`ia-panel support-ticket-detail${ticket?.kind==="COMMUNITY"?" is-community":""}`}>{!selected?<div className="support-blank"><Icon name="message-circle" size={32}/><h2>Выберите обращение</h2><p>Здесь появятся переписка, ответственный и действия.</p></div>:!ticket?<p role="status">Загрузка обращения…</p>:<><header className="support-ticket-heading"><div><span className="support-ticket-source">{ticket.kind==="COMMUNITY"?"Сообщество":"Поддержка"} · #{ticket.id.replace(/^legacy-/,"").replace(/^community-/,"C-").slice(-6)}</span><h2>{ticket.name}</h2>{ticket.username&&<p>@{ticket.username}</p>}</div><span className="am-badge">{ticketStates[ticket.status]}</span></header>
      <div className="support-ticket-assignee"><Icon name="user" size={18}/><span>{ticket.assignee?`Занимается: ${ticket.assignee}${mine?" (вы)":""}`:"Ответственный пока не назначен"}</span></div>
      {ticket.internal_note&&<div className="support-internal-note"><b>Комментарий для разработчика</b><p>{ticket.internal_note}</p></div>}
      <div className="am-actions support-ticket-controls">{!ticket.assigned_to&&!["WAITING_USER","CLOSED"].includes(ticket.status)&&(!ticket.developer_only||access.admin)&&<button disabled={busy} onClick={()=>act("claim")}>Работаю над ответом</button>}{writable&&<><button disabled={busy} onClick={()=>act("release")}>Вернуть в очередь</button>{!ticket.developer_only&&<button disabled={busy} onClick={()=>setEscalating(v=>!v)}>Передать разработчику</button>}</>}</div>
      {escalating&&<form className="support-escalation" onSubmit={e=>{e.preventDefault();act("escalate",note);}}><label>Что нужно проверить разработчику<textarea required minLength={5} maxLength={4000} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy}>Передать и уведомить</button><button type="button" onClick={()=>setEscalating(false)}>Отмена</button></form>}
      {ticket.content&&<article className="support-reported-content"><h3>Материал сообщества · №{ticket.content.target_id}</h3><p>{ticket.content.reason}</p><blockquote>{ticket.content.text}</blockquote><div className="am-actions">{writable&&<>{ticket.content.status==="HIDDEN"?<button disabled={busy} onClick={()=>content("restore")}>Восстановить материал</button>:ticket.content.status!=="DELETED"&&<button className="am-danger" disabled={busy} onClick={()=>content("hide")}>Скрыть материал</button>}<button disabled={busy} onClick={()=>content("dismiss")}>Рассмотрено без изменений</button></>}</div></article>}
      <div className="support-ticket-thread">{ticket.messages.map(m=><article key={m.id} className={m.staff?"is-staff":""}><small>{m.staff?"Поддержка":"Участник"} · {date(m.at)}</small><p>{m.text}</p></article>)}</div>
      {writable?<form className="support-reply" onSubmit={e=>{e.preventDefault();act(e.nativeEvent.submitter?.value==="resolve"?"resolve":"reply",reply);}}><label>Ответ участнику<textarea required maxLength={4000} value={reply} onChange={e=>setReply(e.target.value)}/></label><div className="am-actions"><button value="reply" disabled={busy||!reply.trim()}>Отправить ответ</button><button value="resolve" disabled={busy||!reply.trim()}>Обращение решено</button></div></form>:<p className="support-readonly">{ticket.status==="CLOSED"?"Обращение закрыто участником и находится в архиве.":ticket.status==="WAITING_USER"?"Участник должен подтвердить решение. До подтверждения тикет остаётся открытым.":ticket.developer_only&&!access.admin?"Передано разработчику. Форма ответа доступна только администраторам.":ticket.assigned_to?"Над ответом уже работает другой сотрудник.":"Возьмите обращение в работу, чтобы ответить."}</p>}
      <details className="support-diagnostics"><summary>Техническая информация · только сотрудникам</summary><Diagnostics value={ticket.diagnostics}/></details>
    </>}</section></div>
  </>;
}

function ModeratorManagement(){
  const [moderators,setModerators]=useState([]),[username,setUsername]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function load(){try{setModerators(await api("/api/admin/council/moderators"));}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  async function appoint(event){event.preventDefault();if(busy)return;setBusy(true);setError("");setNotice("");try{await api("/api/admin/council/moderators",{method:"POST",body:{username}});setUsername("");setNotice("Модератор назначен: он сможет принимать обращения и вести открытые встречи.");await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function revoke(person){if(busy)return;setBusy(true);setError("");setNotice("");try{await api(`/api/admin/council/moderators/${person.id}`,{method:"DELETE"});setNotice(`Права модератора для @${person.username} отозваны.`);await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="ia-panel support-moderator-management"><header><div><h2>Модераторы поддержки</h2><p>Назначьте игровой аккаунт: он сможет принимать обращения, модерировать материалы и вести открытые встречи. Доступ к настройкам и назначению других модераторов остаётся только у администратора.</p></div></header><form onSubmit={appoint}><label>Логин игрового аккаунта<input required value={username} onChange={e=>setUsername(e.target.value)} placeholder="Например, maria_sales" autoComplete="off"/></label><button disabled={busy}>{busy?"Сохраняем…":"Назначить модератором"}</button></form>{error&&<p role="alert" className="ia-error">{error}</p>}{notice&&<p role="status" className="ia-notice">{notice}</p>}<div className="support-moderator-list">{moderators.length?moderators.map(person=><article key={person.id}><span><b>{person.name}</b><small>@{person.username}</small></span><button type="button" disabled={busy} onClick={()=>revoke(person)}>Снять права</button></article>):<p>Модераторы ещё не назначены.</p>}</div></section>;
}

function Diagnostics({value}){return value.legacy?<p>Для этого старого обращения технический снимок не собирался. Новые обращения сохраняют диагностику автоматически.</p>:<><dl><div><dt>Раздел</dt><dd>{value.page||"—"}</dd></div><div><dt>Время снимка</dt><dd>{date(value.captured_at)}</dd></div><div><dt>Браузер</dt><dd>{value.browser||"—"}</dd></div><div><dt>Версия API</dt><dd>{value.api_version||"—"}</dd></div>{Object.entries(value.client||{}).map(([key,v])=><div key={key}><dt>{{language:"Язык",timezone:"Часовой пояс",viewport:"Размер окна"}[key]||key}</dt><dd>{v||"—"}</dd></div>)}</dl><h3>Последние 10 действий перед обращением</h3>{value.actions?.length?<ol>{value.actions.map((e,i)=><li key={i}><small>{date(e.at)}</small><span>{e.action} · {e.method} {e.route} · {e.status}</span></li>)}</ol>:<p>Предыдущие действия в журнале отсутствуют.</p>}</>;}
