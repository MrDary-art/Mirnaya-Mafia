import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import "./decision-council.css";

export default function CouncilPublic() {
  const { meetingId } = useParams();
  const [meeting, setMeeting] = useState(null), [error, setError] = useState("");
  useEffect(() => { api(`/api/council/public/${meetingId}`, { auth: false }).then(setMeeting).catch(reason => setError(reason.message)); }, [meetingId]);
  return <main className="council-page council-public"><section className="council-panel"><span className="council-kicker">ОТКРЫТАЯ КОМАНДНАЯ ИГРА</span>{error ? <p role="alert">{error}</p> : !meeting ? <p role="status">Загружаем условия…</p> : <><h1>{meeting.title}</h1><p>{meeting.description}</p><p>{new Date(meeting.scheduled_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК · 50 минут</p><p>{meeting.seats_taken} из 4 мест занято. Микрофон нужен для разговора, камера — по желанию.</p><p>Подтвердите участие за 48 часов; решение о проведении — за сутки. Роль откроется за два часа. При неполном составе встреча отменяется без автоматического переноса.</p><ul>{meeting.scenario.roles.map(role => <li key={role.key}><b>{role.name}</b> — {role.preview}</li>)}</ul><Link className="council-button" to={`/council/${meetingId}`}>Войти и записаться</Link></>}<p><Link to="/demo/council">Попробовать короткую демонстрацию без записи →</Link></p></section></main>;
}
