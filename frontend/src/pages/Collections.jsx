import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { CollectionForm, CollectionTile } from "../components/feed/CollectionPicker.jsx";
import { StoryDialog, StoryError, StoryIcon } from "../components/features/stories/StoryPrimitives.jsx";

const scopes = [["mine", "Мои подборки"], ["followed", "Сохранённые"], ["public", "Открыть новое"]];
export default function Collections() {
  const [params, setParams] = useSearchParams();
  const scope = scopes.some(([id]) => id === params.get("scope")) ? params.get("scope") : "mine";
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [saving, setSaving] = useState(false), [formError, setFormError] = useState("");
  const version = useRef(0), lock = useRef(false);
  async function load(next = null) {
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
    try { const result = await api("/api/social/collections", { method: "POST", body }); setCreating(false); setParams({ scope: "mine" }); if (scope === "mine") setItems(previous => [result, ...previous]); }
    catch (failure) { setFormError(failure.message); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section className="arena-collections-page">
    <Link className="arena-collection-back" to="/feed">← В ленту</Link>
    <header className="arena-collections-heading"><div><h1>Полезное остаётся с вами</h1><p>Собирайте публикации и сценарии вокруг своей следующей задачи.</p></div><button className="arena-collection-button is-primary" onClick={() => { setCreating(true); setFormError(""); }}><StoryIcon name="plus" />Создать подборку</button></header>
    <nav className="arena-collections-tabs" aria-label="Подборки">{scopes.map(([id, label]) => <button key={id} aria-current={scope === id ? "page" : undefined} onClick={() => setParams({ scope: id })}>{label}</button>)}</nav>
    <StoryError error={error} onRetry={() => load()} />
    <div className="arena-collections-grid">{items.map(item => <CollectionTile key={item.id} item={item} />)}</div>
    {loading && <div className="arena-collection-loading" role="status">Загружаем материалы…</div>}
    {!loading && !error && !items.length && <div className="arena-collection-empty"><StoryIcon name="bookmark" size={40} /><h2>{scope === "mine" ? "Начните свою подборку" : scope === "followed" ? "Ваши находки появятся здесь" : "Здесь появится опыт сообщества"}</h2><p>{scope === "mine" ? "Создайте тему, а затем добавляйте публикации из ленты и сценарии из каталога." : "Публичные подборки собирают только настоящие участники. Загляните в ленту или создайте свою."}</p><Link to="/feed" className="arena-collection-button">Открыть ленту</Link></div>}
    {cursor !== null && <button className="arena-collection-button" disabled={loading} onClick={() => load(cursor)}>Показать ещё</button>}
    {creating && <StoryDialog title="Новая подборка" onClose={() => { if (!saving) setCreating(false); }}><div className="arena-collections-modal"><StoryError error={formError} /><CollectionForm busy={saving} onSubmit={create} /></div></StoryDialog>}
  </section>;
}
