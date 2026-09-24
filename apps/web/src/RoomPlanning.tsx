import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";

type Friend={id:string;email:string;relationship:string};
type Invitation={id:string;hostName:string;problem:string;scheduledAt:string|null;durationMinutes:number;mode:string};
function slotOptions(){
  const options:{iso:string;label:string}[]=[];
  const start=new Date();start.setUTCMinutes(start.getUTCMinutes()<30?30:60,0,0);
  for(let i=0;i<7*48;i++){
    const day=new Date(start.getTime()+i*30*60000);
    if(day.getTime()<Date.now()+10*60000||day.getTime()>Date.now()+7*86400000)continue;
    options.push({iso:day.toISOString(),label:new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"long",weekday:"short",hour:"2-digit",minute:"2-digit"}).format(day)+" МСК"});
  }
  return options;
}
export function RoomPlanning(){
  const navigate=useNavigate();
  const [params]=useSearchParams();
  const [friends,setFriends]=useState<Friend[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]);
  const [invitee,setInvitee]=useState(params.get("invitee")??""),[problem,setProblem]=useState(""),[goal,setGoal]=useState(""),[scheduledAt,setScheduledAt]=useState(""),[durationMinutes,setDuration]=useState(30),[error,setError]=useState("");
  useEffect(()=>{api<Friend[]>("/friends").then(rows=>{const accepted=rows.filter(row=>row.relationship==="friends");setFriends(accepted);if(invitee&&!accepted.some(row=>row.id===invitee))setInvitee("")}).catch(e=>setError(e.message));api<Invitation[]>("/rooms/invitations").then(setInvitations).catch(e=>setError(e.message));},[]);
  const slots=slotOptions();
  async function create(){try{const room=await api<{id:string}>("/rooms","POST",{mode:"human",problem,goal,inviteeId:invitee,scheduledAt:scheduledAt||undefined,durationMinutes});navigate(`/rooms/${room.id}`);}catch(e){setError((e as Error).message)}}
  async function accept(id:string){try{const room=await api<{id:string}>(`/rooms/${id}/accept`,"POST");navigate(`/rooms/${room.id}`);}catch(e){setError((e as Error).message)}}
  return <><div className="detail-panel"><h2>Пригласить друга</h2><p>Комната появится во входящих приглашениях друга. Для встречи можно выбрать получасовой интервал по московскому времени.</p><label className="field-label">Друг<select value={invitee} onChange={e=>setInvitee(e.target.value)}><option value="">Выберите друга</option>{friends.map(friend=><option key={friend.id} value={friend.id}>{friend.email}</option>)}</select></label><label className="field-label">Ситуация<textarea value={problem} onChange={e=>setProblem(e.target.value)} maxLength={1000} rows={2}/></label><label className="field-label">Ваша цель<input value={goal} onChange={e=>setGoal(e.target.value)} maxLength={500}/></label><label className="field-label">Когда<select value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}><option value="">Сразу после принятия</option>{slots.map(slot=><option key={slot.iso} value={slot.iso}>{slot.label}</option>)}</select></label><label className="field-label">Длительность<select value={durationMinutes} onChange={e=>setDuration(Number(e.target.value))}><option value={15}>15 минут</option><option value={30}>30 минут</option><option value={60}>60 минут</option></select></label><button className="button primary" disabled={!invitee||problem.trim().length<3||goal.trim().length<3} onClick={create}>Отправить приглашение</button></div><div className="detail-panel"><h2>Входящие приглашения</h2>{invitations.length?invitations.map(item=><div className="history-item" key={item.id}><strong>{item.problem}</strong><span>От {item.hostName}{item.scheduledAt?` · ${new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",dateStyle:"medium",timeStyle:"short"}).format(new Date(item.scheduledAt))} МСК`:" · сразу"}</span><button className="button secondary" onClick={()=>accept(item.id)}>Принять</button></div>):<p>Приглашений пока нет.</p>}</div>{error&&<p className="error" role="alert">{error}</p>}</>;
}
