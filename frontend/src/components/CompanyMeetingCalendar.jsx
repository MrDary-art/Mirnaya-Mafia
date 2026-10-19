import BusinessDateTimePicker from "./BusinessDateTimePicker.jsx";

export default function CompanyMeetingCalendar({ value, onChange }) {
  const selected = value ? new Date(value) : null;
  const localValue = selected && !Number.isNaN(selected.getTime())
    ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}T${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`
    : "";
  return <BusinessDateTimePicker label="Дата и время" value={localValue} minDate={new Date()} maxDaysAhead={90} onChange={next => onChange(next ? new Date(next).toISOString() : "")} />;
}
