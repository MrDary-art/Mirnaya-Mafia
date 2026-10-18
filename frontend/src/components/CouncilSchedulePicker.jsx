import { useEffect, useState } from "react";
import { api } from "../api";
import {moscowDay, slotStamp, reservationWindow, upcomingSlots, withinReservation, reservationLabel, clockLabel} from './councilSchedule.mjs';
import "./council-composer.css";

export function councilDateValid(value, now = Date.now()) {
  if (!value) return false;
  const end=Date.parse(moscowDay(now)+'T00:00:00+03:00')+14*86400000;
  const chosen=Date.parse(value+':00+03:00');
  return chosen>=now+15*60000&&chosen<end;
}

export default function CouncilSchedulePicker({value,onChange,capacity=4,duration=30,onAvailabilityChange}) {
  const [now,setNow]=useState(Date.now()),[response,setResponse]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const today=moscowDay(now),requestedDay=value.split('T')[0];
  const day=requestedDay>=today?requestedDay:today,time=requestedDay===day?(value.split('T')[1]||''):'';
  const key=`${day}/${capacity}/${duration}`;
  const slots=response?.key===key?response.slots:null;
  const valid=Boolean(slots?.some(slot=>slot.time===time&&slot.available)&&councilDateValid(value,now));
  const selection=valid?reservationWindow(day,time,duration):null;
  useEffect(()=>{onAvailabilityChange?.(valid);},[valid,onAvailabilityChange]);
  useEffect(()=>{
    let stale=false;setError('');
    api(`/api/council/availability?day=${day}&capacity=${capacity}&duration=${duration}`)
      .then(data=>{if(!stale)setResponse({key,slots:data.slots,busy:data.busy_intervals||[]});})
      .catch(e=>{if(!stale){setResponse(null);setError(e.message);}});
    return()=>{stale=true;};
  },[day,capacity,duration,now,key]);
  const days=Array.from({length:14},(_,i)=>new Date(Date.parse(today+'T12:00:00+03:00')+i*86400000));
  const visible=upcomingSlots(slots||[],day,now);
  return <fieldset className="council-calendar"><legend>Дата и время · МСК</legend>
    <div className="council-calendar-days">{days.map(date=>{
      const d=moscowDay(date),label=date.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',weekday:'long',day:'numeric',month:'long'});
      const continues=selection&&withinReservation(d,'00:00',selection)&&d!==day;
      return <button key={d} type="button" aria-label={label} aria-pressed={d===day} className={continues?'is-reservation-day':''} onClick={()=>onChange(d+'T')}><small>{date.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',weekday:'short'})}</small><b>{date.getUTCDate()}</b><span>{date.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',month:'short'})}</span></button>;
    })}</div>
    <div className="council-slot-legend"><span>Свободно</span><span>Занято</span><span>Выбранный резерв</span></div>
    {error?<p role="alert">{error}</p>:!slots?<p role="status">Проверяем время…</p>:!visible.length?<p className="council-no-slots">На сегодня время закончилось. Выберите другой день.</p>:<div className="council-time-slots" aria-label="Выберите начало встречи">{visible.map(slot=>{
      const inRange=withinReservation(day,slot.time,selection);
      const stamp=slotStamp(day,slot.time);
      const occupied=response.busy?.some(span=>stamp>=Date.parse(span.start)&&stamp<Date.parse(span.end));
      const label=inRange?'Выбрано':slot.available?'Свободно':occupied?'Занято':'Не помещается';
      return <button key={slot.time} type="button" disabled={!slot.available} aria-pressed={valid&&slot.time===time} className={`${slot.available?'is-free':occupied?'is-busy':'is-unavailable'}${inRange?' is-reserved-range':''}`} title={inRange?`Выбрано ${reservationLabel(selection)}`:`${slot.time} — ${slot.reason}`} onClick={()=>onChange(day+'T'+slot.time)}><b>{slot.time}</b><small>{label}</small></button>;
    })}</div>}
    {response?.key===key&&response.busy?.some(span=>Date.parse(span.end)>now)&&<div className="council-busy-periods" aria-label="Занятые интервалы">{response.busy.filter(span=>Date.parse(span.end)>now).map(span=><span key={span.start}>Занято {clockLabel(Date.parse(span.start))} — {clockLabel(Date.parse(span.end))}</span>)}</div>}
    <div className={`council-reserve-summary${valid?' has-selection':''}`} role="status">{valid?<><span>Выбран резерв · {new Date(selection.start).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long'})}</span><strong>{reservationLabel(selection)} <small>МСК</small></strong><span>{duration} минут · {capacity} участников</span></>:<span>Выберите начало встречи. Резерв — {duration} минут.</span>}</div>
  </fieldset>;
}
