import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth.jsx";
import { feedApi } from "./feedApi.js";
import { FeedAvatar, FeedError, FeedIcon, nameOf } from "./FeedPrimitives.jsx";
import StoryComposer from "./StoryComposer.jsx";
import StoryViewer from "./StoryViewer.jsx";
import "./stories-bar.css";

export default function StoriesBar({ userId = null, scope = "all" }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [composer, setComposer] = useState(false), [selected, setSelected] = useState(null);
  const request = useRef(0), lock = useRef(false);
  const self = !userId || String(userId) === String(user?.id);
  async function load(more = false) {
    if (more && lock.current) return;
    const ticket = ++request.current; lock.current = true; setLoading(true); setError("");
    try {
      const result = await feedApi.stories({ scope, user_id: userId, limit: 40, cursor: more ? cursor : undefined });
      if (request.current !== ticket) return;
      setItems((previous) => more ? [...previous, ...result.items.filter((item) => !previous.some((old) => old.id === item.id))] : result.items); setCursor(result.next_cursor);
    } catch (failure) { if (request.current === ticket) setError(failure.message); }
    finally { if (request.current === ticket) { lock.current = false; setLoading(false); } }
  }
  useEffect(() => {
    setItems([]); setSelected(null); load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener("arena:social-stories-changed", refresh);
    window.addEventListener("arena:feed-access-changed", refresh);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => { request.current += 1; lock.current = false; clearInterval(interval); window.removeEventListener("arena:social-stories-changed", refresh); window.removeEventListener("arena:feed-access-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [userId, scope]);
  const groups = [...items.reduce((map, item) => { const key = item.company ? `company-${item.company.id}` : `user-${item.author.id}`; if (!map.has(key)) map.set(key, []); map.get(key).push(item); return map; }, new Map()).values()];
  return <section className="arena-social-story-bar" aria-label="Истории">
    <div className="arena-social-story-section-title"><h2>Истории</h2></div>
    <div className="arena-social-story-strip">
      {self && <button className="arena-social-story-tile is-create" type="button" onClick={() => setComposer(true)}><span className="arena-social-story-ring"><FeedIcon name="plus" size={20} /></span><b>Добавить</b></button>}
      {groups.map((group) => { const item = group[0], unseen = group.some((story) => !story.viewed); return <button type="button" key={item.company ? `c${item.company.id}` : `u${item.author.id}`} className={`arena-social-story-tile${unseen ? " is-unseen" : ""}`} onClick={() => setSelected({ stories: [...group].reverse(), index: Math.max(0, [...group].reverse().findIndex((story) => !story.viewed)) })} aria-label={`${item.company?.name || nameOf(item.author)}: ${group.length} историй${unseen ? ", есть новые" : ", просмотрено"}`}><span className="arena-social-story-ring"><FeedAvatar author={item.author} company={item.company} size="md" /></span><b>{item.company?.name || nameOf(item.author)}</b><small>{unseen ? "Новое" : "Просмотрено"}</small></button>; })}
      {!loading && !items.length && <p className="arena-social-story-strip-empty">Историй пока нет.</p>}
      {loading && !items.length && <span className="arena-social-story-loading" role="status">Загружаем истории…</span>}
      {cursor && <button className="arena-social-story-tile" type="button" disabled={loading} onClick={() => load(true)}><span className="arena-social-story-ring"><FeedIcon name="right" size={26} /></span><b>{loading ? "Загружаем…" : "Ещё истории"}</b></button>}
    </div>
    <FeedError error={error} retry={() => load()} />
    {composer && <StoryComposer onClose={() => setComposer(false)} onCreated={() => load()} />}
    {selected && <StoryViewer stories={selected.stories} initialIndex={selected.index} onClose={() => { setSelected(null); load(); }} onChanged={() => load()} />}
  </section>;
}
