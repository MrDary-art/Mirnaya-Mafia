import { useEffect, useRef, useState } from "react";
import "./bookings.css";

export default function WeekBooking({ value, duration, availability, onChange, description = "Занятые интервалы учтены по вашему расписанию.", maxDaysAhead, exactTime = false }) {
  const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  const now = new Date(availability?.now || Date.now());
  const moscowDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = new Date(`${moscowDate}T00:00:00Z`);
  const maxWeek = maxDaysAhead == null ? 1 : Math.floor((((today.getUTCDay() + 6) % 7) + maxDaysAhead) / 7);
  const latest = maxDaysAhead == null ? Infinity : now.getTime() + maxDaysAhead * 86400000;
  const [week, setWeek] = useState(0);
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return date; });
  const selectedKey = value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : moscowDate;
  const [activeDay, setActiveDay] = useState(selectedKey);
  const selectedTime = value ? new Date(value).toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).split(":") : ["09", "00"];
  const [hour, setHour] = useState(selectedTime[0]);
  const [minute, setMinute] = useState(selectedTime[1]);
  const dayListRef = useRef(null);
  useEffect(() => {
    const list = dayListRef.current;
    if (!list) return undefined;
    const revealSelected = () => {
      const selected = list.querySelector('[aria-pressed="true"]');
      if (!selected) return;
      const listRect = list.getBoundingClientRect();
      const dayRect = selected.getBoundingClientRect();
      list.scrollLeft += dayRect.left - listRect.left - (listRect.width - dayRect.width) / 2;
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeDay, week]);
  const booked = (availability?.booked || []).map((item) => ({ start: new Date(item.start).getTime(), end: new Date(item.end).getTime() }));
  const slots = [];
  for (let minutes = 9 * 60; minutes <= 22 * 60; minutes += 30) slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  const chosen = value ? new Date(value).getTime() : null;
  const exactDate = new Date(`${activeDay}T${hour}:${minute}:00+03:00`);
  const exactStamp = exactDate.getTime();
  const exactUnavailable = exactStamp <= now.getTime() || exactStamp > latest || booked.some((item) => exactStamp < item.end && exactStamp + duration * 60000 > item.start);
  function moveWeek(next) { const bounded = Math.max(0, Math.min(maxWeek, next)); setWeek(bounded); const first = new Date(today); first.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + bounded * 7); setActiveDay((first < today ? today : first).toISOString().slice(0, 10)); }
  return <div className="booking-calendar rounded-3xl p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><b className="text-white">Дата и время по Москве</b>{description && <p className="mt-1 text-xs text-slate-400">{description}</p>}</div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Предыдущая неделя" disabled={week === 0} className="subtle-button px-3 py-2" onClick={() => moveWeek(week - 1)}>←</button>
        <button type="button" aria-label="Следующая неделя" disabled={week === maxWeek} className="subtle-button px-3 py-2" onClick={() => moveWeek(week + 1)}>→</button>
        {value && <button type="button" className="subtle-button px-3 py-2 text-xs" onClick={() => onChange("")}>Сбросить</button>}
      </div>
    </div>
    <div ref={dayListRef} className="booking-day-list mt-4 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Выберите день">
      {days.map((day, index) => {
        const key = day.toISOString().slice(0, 10);
        const unavailable = day < today || new Date(`${key}T00:00:00+03:00`).getTime() > latest;
        return <button type="button" key={key} disabled={unavailable} aria-pressed={activeDay === key} aria-label={day.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} onClick={() => setActiveDay(key)} className="booking-day min-w-[78px] flex-1 px-1 py-3 text-center transition">
          <span className="block text-xs uppercase">{weekdays[index]}</span><b className="mt-1 block text-lg">{day.getUTCDate()}</b><small>{day.toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" })}</small>
        </button>;
      })}
    </div>
    {exactTime ? <div className="booking-exact-time">
      <p className="booking-exact-date" aria-live="polite">{new Date(`${activeDay}T00:00:00Z`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
      <div className="booking-time-controls">
        <label>Часы<select aria-label="Часы встречи" value={hour} onChange={(event) => setHour(event.target.value)}>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <span aria-hidden="true">:</span>
        <label>Минуты<select aria-label="Минуты встречи" value={minute} onChange={(event) => setMinute(event.target.value)}>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button type="button" className="primary-button" disabled={exactUnavailable} onClick={() => onChange(exactDate.toISOString())}>Выбрать</button>
      </div>
    </div> : <div className="mt-4 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6" role="group" aria-label="Выберите время">
      {slots.map((time) => {
        const iso = new Date(`${activeDay}T${time}:00+03:00`).toISOString();
        const stamp = new Date(iso).getTime();
        const past = stamp <= now.getTime();
        const taken = booked.some((item) => stamp < item.end && stamp + duration * 60000 > item.start) && stamp !== chosen;
        return <button type="button" key={time} disabled={past || taken} aria-pressed={stamp === chosen} title={taken ? "Пересекается с вашей встречей" : past ? "Время прошло" : "Забронировать"} onClick={() => onChange(iso)} className={`booking-slot px-2 py-2 text-sm ${taken ? "line-through" : ""}`}>{time}</button>;
      })}
    </div>}
    {value && <p className="mt-4 text-sm text-lime-200">Выбрано: {new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} МСК</p>}
  </div>;
}
