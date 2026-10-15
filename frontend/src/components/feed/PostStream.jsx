import { useEffect, useRef, useState } from "react";
import { feedApi, mergePost } from "./feedApi.js";
import { FeedEmpty, FeedError, FeedIcon, FeedSkeleton } from "./FeedPrimitives.jsx";
import PostCard from "./PostCard.jsx";

export default function PostStream({ scope = "for_you", userId = null, companyId = null, kind = "posts", query = "", saved = false, refresh = 0, created = null, emptyTitle, emptyText, emptyAction }) {
  const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null); const [loading, setLoading] = useState(true); const [moreLoading, setMoreLoading] = useState(false); const [error, setError] = useState(""); const [moreError, setMoreError] = useState(""); const [retry, setRetry] = useState(0);
  const generation = useRef(0); const loadingRef = useRef(false); const sentinel = useRef(null); const itemsRef = useRef(items); itemsRef.current = items;
  const signature = JSON.stringify({ scope, userId, companyId, kind, query, saved, refresh, retry });
  const changedDuringLoad = useRef(new Map());
  const changeSequence = useRef(0);
  const removedIds = useRef(new Set()); const unavailableIds = useRef(new Set()); const mutedAuthors = useRef(new Set()); const createdDuringLoad = useRef(new Map()); const revalidation = useRef(0);
  function reconcile(rows, mergeChanges = true) {
    return rows.map(item => { const change = mergeChanges && changedDuringLoad.current.get(item.id); return change ? mergePost(item, change.post, change.fields) : item; }).filter(item => !removedIds.current.has(item.id) && !unavailableIds.current.has(item.id) && !["HIDDEN", "DELETED"].includes(item.status) && !(mutedAuthors.current.has(item.author.id) && ["for_you", "popular"].includes(scope) && !userId));
  }
  async function request(next = null) {
    const options = { cursor: next, limit: 15, q: query || undefined };
    if (saved) return feedApi.saved(options);
    if (userId) return feedApi.wall(userId, { ...options, kind });
    return feedApi.list({ ...options, scope: companyId ? "company" : scope, company_id: companyId });
  }
  useEffect(() => {
    const version = ++generation.current; setLoading(true); setItems([]); setCursor(null); setError(""); setMoreError(""); setMoreLoading(false); loadingRef.current = false; changedDuringLoad.current.clear(); createdDuringLoad.current.clear(); unavailableIds.current.clear();
    request().then((result) => { if (version !== generation.current) return; const rows = result.pinned_post ? [result.pinned_post, ...result.items.filter((item) => item.id !== result.pinned_post.id)] : result.items; const added = [...createdDuringLoad.current.values()].filter(item => !rows.some(row => row.id === item.id)); setItems(reconcile([...added, ...rows])); setCursor(result.next_cursor); }).catch((failure) => { if (version === generation.current) setError(failure.message); }).finally(() => { if (version === generation.current) setLoading(false); });
    return () => { generation.current += 1; };
  }, [signature]);
  useEffect(() => {
    const changed = (event) => {
      const { post, fields } = event.detail; const previous = changedDuringLoad.current.get(post.id);
      const merged = previous ? mergePost(previous.post, post, fields) : post;
      changedDuringLoad.current.set(post.id, { post: merged, fields: !fields || (previous && !previous.fields) ? undefined : [...new Set([...(previous?.fields || []), ...fields])], sequence: ++changeSequence.current });
      setItems((current) => reconcile(current.map(item => item.id === post.id ? mergePost(item, post, fields) : item), false));
    };
    const removed = (event) => { removedIds.current.add(event.detail.id); createdDuringLoad.current.delete(event.detail.id); setItems((previous) => previous.filter((item) => item.id !== event.detail.id)); };
    const bookmark = event => { if (saved && !event.detail.bookmarked) removed(event); };
    const muted = (event) => { mutedAuthors.current.add(event.detail.id); if (["for_you", "popular"].includes(scope) && !userId) setItems((previous) => previous.filter((item) => item.author.id !== event.detail.id)); };
    const followed = (event) => {
      const { id, following, company } = event.detail;
      itemsRef.current.filter((item) => company ? item.company?.id === id : !item.company && item.author.id === id).forEach((item) => changed({ detail: { post: { ...item, viewer_state: { ...item.viewer_state, following_author: following } }, fields: ["viewer_state.following_author"] } }));
    };
    const revalidate = async () => {
      const version = generation.current; const sequence = changeSequence.current; const requestId = ++revalidation.current;
      const checked = itemsRef.current.slice(0, 20);
      const results = await Promise.allSettled(checked.map((item) => feedApi.post(item.id)));
      if (version !== generation.current || requestId !== revalidation.current) return;
      const changes = new Map(), unavailable = new Set();
      results.forEach((result, index) => {
        if (result.status === "fulfilled") { const change = changedDuringLoad.current.get(result.value.id); changes.set(result.value.id, change?.sequence > sequence ? mergePost(result.value, change.post, change.fields) : result.value); }
        else if (result.reason?.message === "Публикация недоступна") unavailable.add(checked[index].id);
      });
      unavailable.forEach(id => unavailableIds.current.add(id));
      setItems((previous) => reconcile(previous.map((item) => changes.get(item.id) || item), false));
    };
    window.addEventListener("arena:feed-post-changed", changed); window.addEventListener("arena:feed-post-removed", removed); window.addEventListener("arena:feed-bookmark-committed", bookmark); window.addEventListener("arena:feed-author-muted", muted); window.addEventListener("arena:feed-follow-changed", followed); window.addEventListener("focus", revalidate); window.addEventListener("arena:feed-access-changed", revalidate);
    return () => { window.removeEventListener("arena:feed-post-changed", changed); window.removeEventListener("arena:feed-post-removed", removed); window.removeEventListener("arena:feed-bookmark-committed", bookmark); window.removeEventListener("arena:feed-author-muted", muted); window.removeEventListener("arena:feed-follow-changed", followed); window.removeEventListener("focus", revalidate); window.removeEventListener("arena:feed-access-changed", revalidate); revalidation.current += 1; };
  }, [scope, userId, saved]);
  useEffect(() => {
    if (!created || saved) return;
    if (userId && created.author.id !== Number(userId)) return;
    if (userId && created.company) return;
    if (companyId && created.company?.id !== Number(companyId)) return;
    if (!userId && !companyId && created.status === "DRAFT") return;
    // Search and specialised walls are server-filtered; do not inject an unrelated local result.
    if (query.trim() || kind !== "posts" || (!userId && !companyId && scope !== "for_you")) { setRetry(value => value + 1); return; }
    createdDuringLoad.current.set(created.id, created);
    setItems((previous) => reconcile([created, ...previous.filter((item) => item.id !== created.id)], false));
  }, [created, userId, companyId, saved, query, kind, scope]);
  const loadMore = async () => {
    if (loadingRef.current || !cursor || loading) return;
    const version = generation.current; loadingRef.current = true; setMoreLoading(true); setMoreError("");
    try { const result = await request(cursor); if (version !== generation.current) return; const incoming = reconcile(result.items); setItems((previous) => reconcile([...previous, ...incoming.filter((item) => !previous.some((entry) => entry.id === item.id))], false)); setCursor(result.next_cursor); }
    catch (failure) { if (version === generation.current) setMoreError(failure.message); }
    finally { if (version === generation.current) { loadingRef.current = false; setMoreLoading(false); } }
  };
  const nextRef = useRef(loadMore); nextRef.current = loadMore;
  useEffect(() => {
    if (!cursor || loading || moreError) return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) nextRef.current(); }, { rootMargin: "240px" });
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [cursor, loading, moreError]);
  return <div className="arena-feed-stream" aria-busy={loading}>{loading ? <><FeedSkeleton /><FeedSkeleton /></> : error ? <FeedError error={error} retry={() => setRetry((value) => value + 1)} /> : items.length ? <>{items.map((post) => <PostCard key={post.id} post={post} />)}<div className="arena-feed-load-more" ref={sentinel}>{moreError && <FeedError error={moreError} retry={loadMore} />}{cursor ? <button className="arena-feed-button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? "Загружаем публикации…" : "Показать ещё"}<FeedIcon name="plus" size={17} /></button> : <p>Вы прочитали все доступные публикации.</p>}</div></> : <FeedEmpty title={emptyTitle || "Разговор начинается с вас"} action={emptyAction}>{emptyText || "Поделитесь опытом, задайте вопрос или расскажите о полезном сценарии."}</FeedEmpty>}</div>;
}
