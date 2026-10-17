import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function CouncilUpcoming() {
  const [meeting, setMeeting] = useState(null);
  useEffect(() => { let cancelled = false; api("/api/council/catalog", { auth: false }).then(items => { if (!cancelled) setMeeting(items[0] || null); }).catch(() => {}); return () => { cancelled = true; }; }, []);
  return <div className="council-upcoming"><b>Совет решений</b><p>{meeting ? `${meeting.title} · ${new Date(meeting.scheduled_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} МСК · ${meeting.seats_taken}/${meeting.capacity} места` : "Четыре и более участников, разные вводные и одно общее решение."}</p><Link to={meeting ? `/council/info/${meeting.id}` : "/council"}>{meeting ? "Посмотреть и записаться →" : "Посмотреть встречи →"}</Link></div>;
}
