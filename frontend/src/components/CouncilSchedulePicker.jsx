import { useEffect, useState } from "react";
import { api } from "../api";
import "./council-composer.css";

export function councilDateValid(value, now = Date.now()) {
  if (!value) return false;
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  const end = Date.parse(today + "T00:00:00+03:00") + 14 * 86400000;
  const chosen = Date.parse(value + ":00+03:00");
  return chosen >= now + 15 * 60000 && chosen < end;
}

export default function CouncilSchedulePicker({ value, onChange, capacity = 4, duration = 30 }) {
  const [now, setNow] = useState(Date.now()), [slots, setSlots] = useState(null), [error, setError] = useState("");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  const day = value.split("T")[0] || today, time = value.split("T")[1] || "";
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(today + "T12:00:00+03:00") + i * 86400000));
  useEffect(() => {
    let stale=false;setSlots(null);setError("");
    api(`/api/council/availability?day=${day}&capacity=${capacity}&duration=${duration}`).then(data=>{if(!stale)setSlots(data.slots);}).catch(e=>{if(!stale)setError(e.message);});
    return ()=>{stale=true;};
  }, [day,capacity,duration,now]);
  return <fieldset className="council-calendar"><legend>Дата и время встречи · МСК</legend><p>Начало минимум через 15 минут. Проверяем весь резерв: {duration} минут для {capacity} участников.</p>
    <div className="council-calendar-days">{days.map(d => {
      const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
      const label = d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", weekday: "short", day: "numeric", month: "long" });
      return <button type="button" key={date} aria-label={label} aria-pressed={date === day} onClick={() => onChange(date+"T")}><small>{d.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" })}</small><b>{d.getUTCDate()}</b><span>{d.toLocaleDateString("ru-RU", { month: "short", timeZone: "Europe/Moscow" })}</span></button>;
    })}</div>
    <div className="council-slot-legend"><span>● Свободно</span><span>▧ Занято / недоступно</span></div>
    {error?<p role="alert">{error} Время нельзя выбрать до проверки сервера.</p>:!slots?<p role="status">Проверяем свободные интервалы…</p>:<div className="council-time-slots" aria-label="Свободное и занятое время">{slots.map(slot=><button key={slot.time} type="button" disabled={!slot.available} aria-pressed={slot.time===time} title={`${slot.reason}: ${duration} минут, ${capacity} участников`} className={slot.available?"is-free":"is-busy"} onClick={()=>onChange(day+"T"+slot.time)}><b>{slot.time}</b><small>{slot.reason}</small></button>)}</div>}
    <input aria-label="Выбранное время" required type="text" readOnly className="council-selected-time" value={slots?.some(s=>s.time===time&&s.available)&&councilDateValid(value,now)?`${day} в ${time} МСК`:""} placeholder="Выберите свободный интервал" />
  </fieldset>;
}
