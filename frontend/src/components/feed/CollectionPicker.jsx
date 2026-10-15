import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { StoryDialog, StoryError, StoryIcon } from "../features/stories/StoryPrimitives.jsx";
import "../../pages/stories.css";
import "./collections.css";

export function CollectionForm({ initial, busy, onSubmit }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [audience, setAudience] = useState(initial?.audience || "PRIVATE");
  return <form className="arena-collection-form" onSubmit={event => { event.preventDefault(); if (title.trim()) onSubmit({ title: title.trim(), description: description.trim(), audience }); }}>
    <label>Название<input autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} placeholder="Например, переговоры о карьере" /></label>
    <label>Описание<textarea rows={3} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} placeholder="Что объединяет эти материалы?" /></label>
    <label>Кто увидит подборку<select value={audience} onChange={event => setAudience(event.target.value)} disabled={busy}><option value="PRIVATE">Только я</option><option value="PUBLIC">Все, кому доступен мой профиль</option></select></label>
    <p className="arena-collection-note">Доступ к каждому материалу проверяется отдельно. Публичная подборка не открывает закрытые публикации.</p>
    <button className="arena-collection-button is-primary" disabled={busy || !title.trim()}>{busy ? "Сохраняем…" : initial ? "Сохранить изменения" : "Создать подборку"}</button>
  </form>;
}

export function CollectionTile({ item }) {
  return <Link to={`/collections/${item.id}`} className="arena-collection-tile">
    <div className="arena-collection-tile-cover"><StoryIcon name="bookmark" size={32} /><span>{item.audience === "PRIVATE" ? "Личная подборка" : "Публичная подборка"}</span></div>
    <div><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}<small>{item.items_count} материалов · {item.author?.display_name || item.author?.username}</small></div>
    <StoryIcon name="arrow" />
  </Link>;
}

export default function CollectionPicker({ postId, scenarioId, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState([]);
  const lock = useRef(false);
  const version = useRef(0);
  const target = postId ? { post_id: postId } : { scenario_id: scenarioId };
  async function load(next = null) {
    const current = ++version.current;
    setLoading(true); setError("");
    try {
      const result = await api(`/api/social/collections?scope=mine${next ? `&cursor=${next}` : ""}`);
      if (current !== version.current) return;
      setItems(previous => next ? [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))] : result.items);
      setCursor(result.next_cursor);
    } catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { version.current++; }; }, []);
  async function add(id) {
    if (lock.current || !postId && !scenarioId) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await api(`/api/social/collections/${id}/items`, { method: "POST", body: target }); setSaved(previous => [...previous, id]); onSaved?.(result); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function create(body) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const item = await api("/api/social/collections", { method: "POST", body });
      setItems(previous => [item, ...previous]); setCreating(false);
      const result = await api(`/api/social/collections/${item.id}/items`, { method: "POST", body: target });
      setSaved(previous => [...previous, item.id]); onSaved?.(result);
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <StoryDialog title="Сохранить в подборку" subtitle="Один материал может быть в нескольких подборках." onClose={() => { if (!busy) onClose(); }}>
    <div className="arena-collections-modal"><StoryError error={error} onRetry={!busy ? () => load() : undefined} />
      {loading && <p role="status">Загружаем ваши подборки…</p>}
      {!creating && <><div className="arena-collection-picker">{items.map(item => <button key={item.id} onClick={() => add(item.id)} disabled={busy || saved.includes(item.id)}><StoryIcon name={saved.includes(item.id) ? "check" : "bookmark"} /><span><b>{item.title}</b><small>{saved.includes(item.id) ? "Добавлено" : item.audience === "PRIVATE" ? "Только вы" : "Публичная"}</small></span><StoryIcon name="plus" /></button>)}</div>{!loading && !items.length && <p>Создайте подборку для материалов, к которым хочется вернуться.</p>}{cursor !== null && <button className="arena-collection-button" disabled={loading || busy} onClick={() => load(cursor)}>Ещё подборки</button>}<button className="arena-collection-button" disabled={busy} onClick={() => setCreating(true)}><StoryIcon name="plus" />Новая подборка</button></>}
      {creating && <><CollectionForm busy={busy} onSubmit={create} /><button className="arena-collection-button" disabled={busy} onClick={() => setCreating(false)}>К списку подборок</button></>}
      {saved.length > 0 && <p className="arena-collection-success" role="status">Материал добавлен. <Link to="/collections">Открыть подборки</Link></p>}
    </div>
  </StoryDialog>;
}
