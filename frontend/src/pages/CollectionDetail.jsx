import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { CollectionForm } from "../components/feed/CollectionPicker.jsx";
import { StoryDialog, StoryError, StoryIcon } from "../components/features/stories/StoryPrimitives.jsx";

export default function CollectionDetail() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false);
  const lock = useRef(false), version = useRef(0), routeId = useRef(collectionId);
  routeId.current = collectionId;
  function applyCollection(next) { if (String(next.id) !== routeId.current) return false; setCollection(next); return true; }
  async function load() {
    const current = ++version.current; setLoading(true); setError("");
    try { const result = await api(`/api/social/collections/${collectionId}`); if (current === version.current) setCollection(result); }
    catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { setCollection(null); setEditing(false); setDeleting(false); load(); return () => { version.current++; }; }, [collectionId]);
  async function action(task) {
    if (lock.current) return;
    const currentRoute = collectionId;
    lock.current = true; setBusy(true); setError("");
    try { await task(); } catch (failure) { if (routeId.current === currentRoute) setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  function reorder(index, direction) {
    const ordered = [...collection.items];
    [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    action(async () => applyCollection(await api(`/api/social/collections/${collection.id}/reorder`, { method: "POST", body: { item_ids: ordered.map(item => item.id) } })));
  }
  return <section className="arena-collections-page arena-collection-detail">
    <Link className="arena-collection-back" to="/collections">← Все подборки</Link>
    <StoryError error={error} onRetry={!busy ? load : undefined} />
    {loading && <p role="status">Открываем подборку…</p>}
    {collection && <><header className="arena-collections-heading arena-collection-detail-hero"><div><span className="arena-collection-audience"><StoryIcon name="bookmark" size={18} />{collection.audience === "PRIVATE" ? "Личная подборка" : "Публичная подборка"}</span><h1>{collection.title}</h1>{collection.description && <p>{collection.description}</p>}<div className="arena-collection-meta"><Link to={collection.author.path}>{collection.author.display_name || collection.author.username}</Link><span>{collection.items_count} материалов</span></div></div><div className="arena-collection-actions">{collection.can_edit ? <><button className="arena-collection-button" disabled={busy} onClick={() => setEditing(true)}>Изменить</button><button className="arena-collection-button" disabled={busy} onClick={() => setDeleting(true)}>Удалить подборку</button></> : <button className="arena-collection-button is-primary" aria-pressed={collection.followed} disabled={busy} onClick={() => action(async () => { const result = await api(`/api/social/collections/${collection.id}/follow`, { method: collection.followed ? "DELETE" : "POST" }); setCollection(previous => previous?.id === collection.id ? { ...previous, followed: result.followed } : previous); })}>{collection.followed ? "Убрать из сохранённых" : "Сохранить подборку себе"}</button>}</div></header>
      <div className="arena-collection-items">{collection.items.map((item, index) => <article key={item.id} className="arena-collection-item">
        <div><small>{item.scenario ? "Сценарий Арены" : item.post?.company?.name || item.post?.author?.display_name || item.post?.author?.username || "Публикация"}</small><h2>{item.scenario?.title || item.post?.body?.slice(0, 160) || item.post?.linked_content?.title || (item.available ? "Материал Арены" : "Материал недоступен")}</h2>{item.available ? <Link className="arena-collection-button" to={item.scenario?.path || `/feed/post/${item.post.id}`}>{item.scenario ? "Пройти сценарий" : "Открыть публикацию"}<StoryIcon name="arrow" size={18} /></Link> : <p>Автор изменил доступ или удалил публикацию.</p>}</div>
        {collection.can_edit && <div className="arena-collection-order"><button disabled={busy || index === 0} aria-label="Переместить материал выше" onClick={() => reorder(index, -1)}><StoryIcon name="up" /></button><button disabled={busy || index === collection.items.length - 1} aria-label="Переместить материал ниже" onClick={() => reorder(index, 1)}><StoryIcon name="down" /></button><button disabled={busy} aria-label="Удалить из этой подборки" onClick={() => action(async () => { await api(`/api/social/collections/${collection.id}/items/${item.id}`, { method: "DELETE" }); setCollection(previous => previous?.id === collection.id ? { ...previous, items_count: Math.max(0, previous.items_count - Number(item.available)), items: previous.items.filter(old => old.id !== item.id) } : previous); })}><StoryIcon name="close" /></button></div>}
      </article>)}</div>
      {!collection.items.length && <div className="arena-collection-empty"><StoryIcon name="bookmark" size={40} /><h2>Соберите первый материал</h2><p>Добавляйте публикации из сообщества или сценарии из каталога. Удаление из подборки не убирает материал из сохранённого.</p><Link className="arena-collection-button is-primary" to="/feed">Найти в сообществе</Link><Link className="arena-collection-button" to="/scenarios">Выбрать сценарий</Link></div>}
      {editing && <StoryDialog title="Изменить подборку" onClose={() => { if (!busy) setEditing(false); }}><div className="arena-collections-modal"><StoryError error={error} /><CollectionForm initial={collection} busy={busy} onSubmit={body => action(async () => { if (applyCollection(await api(`/api/social/collections/${collection.id}`, { method: "PATCH", body }))) setEditing(false); })} /></div></StoryDialog>}
      {deleting && <StoryDialog title="Удалить подборку?" onClose={() => { if (!busy) setDeleting(false); }}><div className="arena-collections-modal"><p>Будет удалена только подборка «{collection.title}». Исходные публикации, сценарии и личные закладки останутся.</p><StoryError error={error} /><div className="arena-collection-actions"><button className="arena-collection-button" disabled={busy} onClick={() => setDeleting(false)}>Оставить</button><button className="arena-collection-button is-danger" disabled={busy} onClick={() => action(async () => { await api(`/api/social/collections/${collection.id}`, { method: "DELETE" }); if (routeId.current === String(collection.id)) navigate("/collections", { replace: true }); })}>{busy ? "Удаляем…" : "Удалить подборку"}</button></div></div></StoryDialog>}
    </>}
  </section>;
}
