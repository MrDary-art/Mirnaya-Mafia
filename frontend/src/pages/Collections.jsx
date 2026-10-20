import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import PostStream from "../components/feed/PostStream.jsx";
import "../components/feed/feed.css";
import { CollectionForm, CollectionTile } from "../components/feed/CollectionPicker.jsx";
import { StoryDialog, StoryError, StoryIcon } from "../components/features/stories/StoryPrimitives.jsx";

const scopes = [["mine", "Мои подборки"], ["bookmarks", "Закладки"], ["followed", "Сохранённые подборки"], ["public", "Открыть новое"]];
export default function Collections({ embedded = false }) {
  const [params, setParams] = useSearchParams();
  const scope = scopes.some(([id]) => id === params.get("scope")) ? params.get("scope") : "mine";
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [saving, setSaving] = useState(false), [formError, setFormError] = useState("");
  const version = useRef(0), lock = useRef(false);
  async function load(next = null) {
    if (scope === "bookmarks") { setLoading(false); return; }
    const current = ++version.current; setLoading(true); setError("");
    try {
      const result = await api(`/api/social/collections?scope=${scope}${next ? `&cursor=${next}` : ""}`);
      if (current !== version.current) return;
      setItems(previous => next ? [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))] : result.items);
      setCursor(result.next_cursor);
    } catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { setItems([]); setCursor(null); load(); return () => { version.current++; }; }, [scope]);
  async function create(body) {
    if (lock.current) return;
    lock.current = true; setSaving(true); setFormError("");
    try { const result = await api("/api/social/collections", { method: "POST", body }); setCreating(false); setParams(previous => { const next = new URLSearchParams(previous); next.set("scope", "mine"); if (embedded) next.set("section", "collections"); return next; }); if (scope === "mine") setItems(previous => [result, ...previous]); }
    catch (failure) { setFormError(failure.message); }
    finally { lock.current = false; setSaving(false); }
  }
  const selectScope = id => setParams(previous => { const next = new URLSearchParams(previous); next.set("scope", id); if (embedded) next.set("section", "collections"); return next; });
  return <section className={`arena-collections-page arena-collections-overview${embedded ? " is-embedded" : ""}`}>
    {!embedded && <Link className="arena-collection-back" to="/feed">← В сообщество</Link>}
    <section className="arena-collections-surface">
      <header className="arena-collections-heading"><div><span className="arena-collections-kicker">Подборки</span><h1>Полезное остаётся с вами</h1><p>Сохраняйте публикации и сценарии по темам.</p></div><button className="arena-collection-button is-primary" onClick={() => { setCreating(true); setFormError(""); }}><StoryIcon name="plus" />Создать подборку</button></header>
      <nav className="arena-collections-tabs" aria-label="Подборки">{scopes.map(([id, label]) => <button key={id} aria-current={scope === id ? "page" : undefined} onClick={() => selectScope(id)}>{label}</button>)}</nav>
      <div className="arena-collections-content">
        {scope === "bookmarks" ? <PostStream saved emptyTitle="Закладок пока нет" emptyText="Нажмите на закладку под публикацией — она появится здесь. Сохранённое видно только вам." /> : <>
        <StoryError error={error} onRetry={() => load()} />
        <div className="arena-collections-grid">{items.map(item => <CollectionTile key={item.id} item={item} />)}</div>
        {loading && <div className="arena-collection-loading" role="status">Загружаем материалы…</div>}
        {!loading && !error && !items.length && <div className="arena-collection-empty"><StoryIcon name="bookmark" size={40} /><h2>{scope === "mine" ? "Начните свою подборку" : scope === "followed" ? "Ваши находки появятся здесь" : "Здесь появится опыт сообщества"}</h2><p>{scope === "mine" ? "Создайте тему, а затем добавляйте публикации из сообщества и сценарии из каталога." : "Публичные подборки собирают участники сообщества."}</p>{!embedded && <Link to="/feed" className="arena-collection-button">Открыть сообщество</Link>}</div>}
        {cursor !== null && <button className="arena-collection-button" disabled={loading} onClick={() => load(cursor)}>Показать ещё</button>}
        </>}
      </div>
    </section>
    {creating && <StoryDialog title="Новая подборка" onClose={() => { if (!saving) setCreating(false); }}><div className="arena-collections-modal"><StoryError error={formError} /><CollectionForm busy={saving} onSubmit={create} /></div></StoryDialog>}
  </section>;
}
