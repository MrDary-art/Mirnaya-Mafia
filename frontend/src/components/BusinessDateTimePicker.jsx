import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function parseDateTime(value, dateOnly) {
  const pattern = dateOnly
    ? /^(\d{4})-(\d{2})-(\d{2})$/
    : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
  const match = typeof value === "string" && value.match(pattern);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    dateOnly ? 0 : Number(match[4]),
    dateOnly ? 0 : Number(match[5]),
  );
}

function dateValue(date) {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { day, dateTime: `${day}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` };
}

function sameDay(left, right) {
  return Boolean(left && right) && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export default function BusinessDateTimePicker({
  label = "Дата и время",
  value,
  onChange,
  required = false,
  minDate,
  maxDaysAhead,
  className = "",
  dateOnly = false,
}) {
  const root = useRef(null);
  const labelId = useId();
  const selected = parseDateTime(value, dateOnly);
  const [isOpen, setIsOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(selected?.getFullYear() ?? new Date().getFullYear(), selected?.getMonth() ?? new Date().getMonth(), 1));
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(cursor);
  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => index < firstWeekday || index >= firstWeekday + daysInMonth ? null : new Date(cursor.getFullYear(), cursor.getMonth(), index - firstWeekday + 1));
  const today = new Date();
  const maxDate = maxDaysAhead == null ? null : new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDaysAhead, 23, 59);
  const minimum = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;

  useEffect(() => {
    if (selected) setCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [value, dateOnly]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutside = event => { if (!root.current?.contains(event.target)) setIsOpen(false); };
    const closeOnEscape = event => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const emit = next => {
    const nextValue = dateValue(next);
    onChange(dateOnly ? nextValue.day : nextValue.dateTime);
  };
  const updateDate = day => {
    const source = selected || new Date();
    setCursor(new Date(day.getFullYear(), day.getMonth(), 1));
    emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), dateOnly ? 0 : selected ? source.getHours() : 9, dateOnly ? 0 : selected ? source.getMinutes() : 0));
    if (dateOnly) setIsOpen(false);
  };
  const updateTime = (unit, nextValue) => {
    const next = new Date(selected || new Date(cursor.getFullYear(), cursor.getMonth(), 1, 9, 0));
    if (unit === "hours") next.setHours(Number(nextValue));
    else next.setMinutes(Number(nextValue));
    emit(next);
  };
  const disabled = day => Boolean((minimum && day < minimum) || (maxDate && day > maxDate));
  const pickerDescription = dateOnly ? "выбор даты" : "выбор даты и времени";
  const selectedLabel = selected && new Intl.DateTimeFormat("ru-RU", dateOnly
    ? { day: "numeric", month: "long", year: "numeric" }
    : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(selected);

  return <div className={`business-date-field ${className}`.trim()} ref={root}>
    <span id={labelId}>{label}</span>
    <div className="business-date-picker">
      <button type="button" className="business-date-trigger" aria-labelledby={labelId} aria-haspopup="dialog" aria-expanded={isOpen} aria-required={required || undefined} onClick={() => setIsOpen(open => !open)}>
        <span>{selectedLabel || (dateOnly ? "Выберите дату" : "Выберите дату и время")}</span>
        <Icon name="calendar-days" size={18}/>
      </button>
      {isOpen && <div className="business-calendar-popover" role="dialog" aria-label={`${label}: ${pickerDescription}`}>
        <header><button type="button" aria-label="Предыдущий месяц" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Icon name="arrow-left" size={17}/></button><b>{monthName}</b><button type="button" aria-label="Следующий месяц" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><Icon name="arrow-right" size={17}/></button></header>
        {!dateOnly && <div className="business-calendar-time"><Icon name="clock" size={16}/><span>Время</span><select aria-label="Час" value={selected ? String(selected.getHours()).padStart(2, "0") : "09"} onChange={event => updateTime("hours", event.target.value)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={String(hour).padStart(2, "0")}>{String(hour).padStart(2, "0")}</option>)}</select><i>:</i><select aria-label="Минуты" value={selected ? String(selected.getMinutes()).padStart(2, "0") : "00"} onChange={event => updateTime("minutes", event.target.value)}>{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={String(minute).padStart(2, "0")}>{String(minute).padStart(2, "0")}</option>)}</select></div>}
        <div className="business-calendar-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="business-calendar-days">{days.map((day, index) => day ? <button key={day.toISOString()} type="button" disabled={disabled(day)} className={sameDay(day, selected) ? "is-selected" : sameDay(day, today) ? "is-today" : ""} onClick={() => updateDate(day)}>{day.getDate()}</button> : <span key={`empty-${index}`} />)}</div>
      </div>}
    </div>
  </div>;
}
