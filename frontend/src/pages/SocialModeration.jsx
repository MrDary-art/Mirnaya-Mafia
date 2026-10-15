import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import { StoryError } from "../components/features/stories/StoryPrimitives.jsx";
import "../components/feed/collections.css";

export default function SocialModeration() {
  const { user, ready } = useAuth();
  const [items, setItems] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [status, setStatus] = useState("pending");
  const version = useRef(0), lock = useRef(false);
  async function load() {
    const current = ++version.current; setLoading(true); setError("");
    try { const result = await api(`/api/admin/social/reports?status=${status}`); if (current === version.current) setItems(result.items); }
    catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { if (user?.is_admin) load(); return () => { version.current++; }; }, [user?.is_admin, status]);
  async function moderate(item, action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await api(`/api/admin/social/reports/${item.id}/moderate`, { method: "POST", body: { action } }); setNotice(action === "hide" ? "Материал скрыт. Прямые ссылки и вложения также недоступны читателям." : action === "restore" ? "Материал восстановлен с прежними правами доступа." : "Жалоба рассмотрена."); await load(); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!ready) return <p role="status">Загружаем редакцию…</p>;
  if (!user) return <Navigate to="/login?next=%2Fadmin%2Fsocial" replace />;
  if (!user.is_admin) return <Navigate to="/feed" replace />;
  return <main className="arena-collections-page arena-social-moderation"><Link className="arena-collection-back" to="/admin">← Администрирование</Link><header className="arena-collections-heading"><div><h1>Редакция сообщества</h1><p>Сигналы о публикациях, комментариях и историях. Данные заявителей не раскрываются.</p></div><button className="arena-collection-button" disabled={loading || busy} onClick={load}>Обновить</button></header><StoryError error={error} onRetry={load} />{notice && <p role="status" className="arena-collection-success">{notice}</p>}{loading && <p role="status">Загружаем обращения…</p>}
    <nav className="arena-collections-tabs" aria-label="Статус обращений">{[["pending", "Ожидают решения"], ["resolved", "Рассмотренные"], ["all", "Все"]].map(([id, label]) => <button key={id} aria-current={status === id ? "page" : undefined} onClick={() => setStatus(id)}>{label}</button>)}</nav>
    <div className="arena-collection-items">{items.map(item => <article className="arena-moderation-report" key={item.id}><small>{({ POST: "Публикация", COMMENT: "Комментарий", STORY: "История" })[item.target_type]} · №{item.target_id} · {new Date(item.created_at).toLocaleString("ru-RU")}</small><h2>Причина обращения</h2><p>{item.reason}</p><blockquote>{item.target_text || "Материал удалён"}</blockquote><div className="arena-collection-actions">{item.target_status === "HIDDEN" ? <button className="arena-collection-button" disabled={busy} onClick={() => moderate(item, "restore")}>Восстановить материал</button> : item.target_status !== "DELETED" && <button className="arena-collection-button is-danger" disabled={busy} onClick={() => moderate(item, "hide")}>Скрыть материал</button>}{item.status === "PENDING" && <button className="arena-collection-button" disabled={busy} onClick={() => moderate(item, "dismiss")}>Закрыть обращение</button>}</div></article>)}</div>{!loading && !error && !items.length && <div className="arena-collection-empty"><h2>В этой очереди нет обращений</h2><p>Сигналы участников появятся здесь.</p></div>}
  </main>;
}
