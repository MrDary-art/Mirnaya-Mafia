import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { StoryError, StoryIcon } from "../components/features/stories/StoryPrimitives.jsx";
import "../components/feed/collections.css";

const labels = { SOCIAL_LIKE: "Вашу публикацию оценили", SOCIAL_COMMENT: "Новый комментарий к вашей публикации", SOCIAL_COMMENT_REPLY: "Вам ответили в обсуждении", SOCIAL_MENTION: "Вас упомянули в публикации", SOCIAL_FOLLOW: "На вас подписались", SOCIAL_REPOST: "Вашей публикацией поделились", SOCIAL_COLLECTION_FOLLOW: "Вашу подборку сохранили" };
const categories = [["all", "Все"], ["reactions", "Реакции"], ["replies", "Ответы"], ["follows", "Подписки"]];
const categoryFor = type => ["SOCIAL_LIKE", "SOCIAL_REPOST"].includes(type) ? "reactions" : ["SOCIAL_FOLLOW", "SOCIAL_COLLECTION_FOLLOW"].includes(type) ? "follows" : "replies";
export default function SocialNotifications() {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [category, setCategory] = useState("all"), [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState(null), [preferenceError, setPreferenceError] = useState("");
  const preferenceLock = useRef(false), [savingPreferences, setSavingPreferences] = useState(false);
  const version = useRef(0), lock = useRef(false);
  const navigate = useNavigate();
  const changed = () => window.dispatchEvent(new CustomEvent("arena:notifications-changed"));
  async function load() {
    const current = ++version.current; setLoading(true); setError("");
    try { const result = await api("/api/social/notifications"); if (current === version.current) setItems(result.filter(item => item.type.startsWith("SOCIAL_"))); }
    catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { let alive = true; load(); api("/api/social/preferences").then(result => { if (alive) setPreferences(result); }).catch(failure => { if (alive) setPreferenceError(failure.message); }); return () => { alive = false; version.current++; }; }, []);
  async function preference(key, checked) {
    if (preferenceLock.current) return;
    preferenceLock.current = true; setSavingPreferences(true); setPreferenceError("");
    try { setPreferences(await api("/api/social/preferences", { method: "PUT", body: { ...preferences, [key]: checked } })); }
    catch (failure) { setPreferenceError(failure.message); }
    finally { preferenceLock.current = false; setSavingPreferences(false); }
  }
  async function open(item) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await api(`/api/social/notifications/${item.id}/read`, { method: "POST" }); setItems(previous => previous.map(old => old.id === item.id ? { ...old, read: true } : old)); changed(); if (item.payload.path?.startsWith("/") && !item.payload.path.startsWith("//")) navigate(item.payload.path); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function readAll() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await api("/api/social/notifications/read-all", { method: "POST" }); setItems(previous => previous.map(item => ({ ...item, read: true }))); changed(); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  const visible = items.filter(item => category === "all" || categoryFor(item.type) === category);
  return <section className="arena-collections-page"><Link className="arena-collection-back" to="/feed">← В ленту</Link><header className="arena-collections-heading"><div><h1>Продолжение разговора</h1><p>Ответы, реакции и новые связи в сообществе.</p></div><button className="arena-collection-button" onClick={readAll} disabled={busy || loading || !items.some(item => !item.read)}>Прочитать всё</button></header>
    <nav className="arena-collections-tabs" aria-label="Категории уведомлений">{categories.map(([id, label]) => <button key={id} aria-current={category === id ? "page" : undefined} onClick={() => setCategory(id)}>{label}</button>)}</nav><StoryError error={error} onRetry={load} />
    {loading && <p role="status">Загружаем уведомления…</p>}
    <div className="arena-collection-items">{visible.map(item => <article className={`arena-notification${item.read ? " is-read" : ""}`} key={item.id}><StoryIcon name={categoryFor(item.type) === "reactions" ? "heart" : categoryFor(item.type) === "follows" ? "plus" : "comment"} /><div><b>{labels[item.type] || "Новое событие в сообществе"}</b><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</time>{item.payload.available === false && <p>Публикация больше недоступна.</p>}</div><button className="arena-collection-button" disabled={busy || item.read && !item.payload.path} onClick={() => open(item)}>{item.payload.path ? "Открыть" : item.read ? "Прочитано" : "Прочитать"}</button></article>)}</div>
    {!loading && !error && !visible.length && <div className="arena-collection-empty"><StoryIcon name="comment" size={40} /><h2>Здесь пока тихо</h2><p>Когда ваш разговор продолжат, уведомление появится здесь.</p><Link to="/feed" className="arena-collection-button">Вернуться в ленту</Link></div>}
    <details className="arena-notification-preferences"><summary>Какие уведомления получать</summary><p>Изменения применяются к новым событиям. Счётчик личных сообщений настраивается отдельно от событий сообщества.</p><StoryError error={preferenceError} />{preferences && <fieldset disabled={savingPreferences}>{Object.entries({ likes: "Оценки публикаций", comments: "Комментарии и ответы", follows: "Новые подписчики и сохранения подборок", reposts: "Репосты", mentions: "Упоминания", stories: "Ответы на истории" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={preferences[key]} onChange={event => preference(key, event.target.checked)} />{label}</label>)}</fieldset>}</details>
  </section>;
}
