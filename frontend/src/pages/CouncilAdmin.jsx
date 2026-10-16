import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./decision-council.css";

export default function CouncilAdmin() {
  const { user, ready } = useAuth();
  const [meetings, setMeetings] = useState([]), [error, setError] = useState("");
  const [moderators, setModerators] = useState([]), [candidate, setCandidate] = useState("");
  const [when, setWhen] = useState(""), [organizer, setOrganizer] = useState("");
  const [plays, setPlays] = useState(false), [busy, setBusy] = useState(false);
  async function load() { try { setMeetings(await api("/api/admin/council")); setModerators(await api("/api/admin/council/moderators")); } catch (reason) { setError(reason.message); } }
  useEffect(() => { if (user?.is_admin && !user.must_change_password) load(); }, [user?.is_admin, user?.must_change_password]);
  if (!ready) return <p>Проверяем доступ…</p>;
  if (!user?.is_admin || user.must_change_password) return <Navigate to="/admin" replace />;
  async function publish(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/admin/council", { method: "POST", body: { scheduled_at: new Date(`${when}:00+03:00`).toISOString(), organizer_username: organizer, organizer_plays: plays } });
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function cancel(id) {
    setBusy(true); setError("");
    try { await api(`/api/admin/council/${id}/cancel`, { method: "POST" }); await load(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function appoint(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/admin/council/moderators", { method: "POST", body: { username: candidate } }); setCandidate(""); await load(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  async function revoke(id) {
    setBusy(true); setError("");
    try { await api(`/api/admin/council/moderators/${id}`, { method: "DELETE" }); await load(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  return <main className="council-public council-page"><Link to="/admin">← Администрирование</Link><section className="council-panel"><span className="council-kicker">♛ КОМАНДА ОРГАНИЗАТОРОВ</span><h1>Модераторы совета</h1><p>Назначенный аккаунт получает корону, может открывать регистрацию и управлять своими встречами. Отзыв назначения сразу закрывает эти полномочия.</p><form className="council-invite" onSubmit={appoint}><label>Логин аккаунта<input required value={candidate} onChange={e => setCandidate(e.target.value)} placeholder="Например, maria_sales" /></label><button className="council-button" disabled={busy}>Назначить модератором</button></form><div className="council-moderation-list">{moderators.map(person => <article key={person.id}><b>♛ {person.name} <small>@{person.username}</small></b><button disabled={busy} onClick={() => revoke(person.id)}>Снять полномочия</button></article>)}</div></section><section className="council-panel"><h1>Открытое расписание совета</h1><p>Назначайте общие слоты минимум за 72 часа. Для проведения нужен отдельный игровой аккаунт организатора; администратор сайта не участвует в игре.</p>{error && <p role="alert">{error}</p>}<form onSubmit={publish} className="council-create-form"><label>Дата и время · МСК<input type="datetime-local" required value={when} onChange={e => setWhen(e.target.value)} /></label><label>Логин организатора<select required value={organizer} onChange={e => setOrganizer(e.target.value)}><option value="">Выберите модератора</option>{moderators.map(person => <option key={person.id} value={person.username}>{person.name} · @{person.username}</option>)}</select></label><label>Функция организатора<select value={plays ? "player" : "facilitator"} onChange={e => setPlays(e.target.value === "player")}><option value="facilitator">Ведущий без игровой роли</option><option value="player">Участник игры</option></select></label><button className="council-button" disabled={busy}>Опубликовать встречу</button></form></section><section className="council-panel"><h2>Назначенные встречи</h2>{meetings.map(meeting => <article className="council-report-episode" key={meeting.id}><b>{new Date(meeting.scheduled_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</b><p>{meeting.confirmed} подтвердили · {meeting.status}</p><Link to={`/council/info/${meeting.id}`}>Открытые условия</Link>{!["active", "finished", "cancelled"].includes(meeting.status) && <button disabled={busy} onClick={() => cancel(meeting.id)}>Отменить встречу</button>}</article>)}{!meetings.length && <p>Открытых встреч пока нет.</p>}</section></main>;
}
