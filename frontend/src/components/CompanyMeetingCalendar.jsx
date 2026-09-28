import { useRef } from "react";
import Icon from "./Icon.jsx";
import WeekBooking from "./WeekBooking.jsx";

export default function CompanyMeetingCalendar({ value, duration, onChange }) {
  const detailsRef = useRef(null);
  const summaryRef = useRef(null);
  const selected = value ? new Date(value) : null;

  function chooseDate(next) {
    onChange(next);
    if (next) {
      detailsRef.current.open = false;
      summaryRef.current.focus();
    }
  }

  return <details ref={detailsRef} className="company-meeting-calendar" onKeyDown={(event) => {
    if (event.key === "Escape") {
      detailsRef.current.open = false;
      summaryRef.current.focus();
    }
  }}>
    <summary ref={summaryRef}>
      <Icon name="calendar-days" size={22} />
      <span><strong>{selected ? selected.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }) : "Выбрать дату и время"}</strong><small>{selected ? `${selected.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" })} МСК` : "По московскому времени"}</small></span>
      <svg className="company-calendar-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <WeekBooking value={value} duration={duration} onChange={chooseDate} description="" maxDaysAhead={90} exactTime />
  </details>;
}
