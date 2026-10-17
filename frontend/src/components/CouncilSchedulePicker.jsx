import { useEffect, useState } from "react";

export function councilDateValid(value, now = Date.now()) {
  if (!value) return false;
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  const end = Date.parse(today + "T00:00:00+03:00") + 14 * 86400000;
  const chosen = Date.parse(value + ":00+03:00");
  return chosen >= now + 12 * 3600000 && chosen < end;
}

export default function CouncilSchedulePicker({ value, onChange }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  const day = value.split("T")[0], time = value.split("T")[1] || "";
  const times = Array.from({ length: 48 }, (_, i) => String(Math.floor(i / 2)).padStart(2, "0") + ":" + (i % 2 ? "30" : "00"));
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(today + "T12:00:00+03:00") + i * 86400000));
  function choose(date) {
    const selected = times.includes(time) && councilDateValid(date + "T" + time, now) ? time : times.find(t => councilDateValid(date + "T" + t, now));
    onChange(date + "T" + (selected || ""));
  }
  return <fieldset className="council-calendar"><legend>Дата и время встречи · МСК</legend><p>Ближайшие две недели. Начало — не раньше чем через 12 часов.</p>
    <div className="council-calendar-days">{days.map(d => {
      const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
      const label = d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", weekday: "short", day: "numeric", month: "long" });
      return <button type="button" key={date} aria-label={label} aria-pressed={date === day} disabled={!times.some(t => councilDateValid(date + "T" + t, now))} onClick={() => choose(date)}><small>{d.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" })}</small><b>{d.getUTCDate()}</b><span>{d.toLocaleDateString("ru-RU", { month: "short", timeZone: "Europe/Moscow" })}</span></button>;
    })}</div>
    <label>Время начала<select required disabled={!day} value={time} onChange={e => onChange(day + "T" + e.target.value)}><option value="">Выберите время</option>{times.map(t => <option key={t} value={t} disabled={!councilDateValid(day + "T" + t, now)}>{t}</option>)}</select></label>
    {value && !councilDateValid(value, now) && <p role="alert">Это время уже недоступно. Выберите другую дату или время.</p>}
  </fieldset>;
}
