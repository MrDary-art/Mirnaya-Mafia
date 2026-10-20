export default function MeetingSummaryText({ text, label = "Показать полный текст" }) {
  if (!text) return <p>Краткий итог не сформирован.</p>;
  return text.length > 800 ? <details className="meeting-long-text"><summary>{label}</summary><p>{text}</p></details> : <p>{text}</p>;
}
