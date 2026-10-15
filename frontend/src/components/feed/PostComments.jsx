import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { feedApi, postChanged } from "./feedApi.js";
import { FeedAvatar, FeedError, FeedIcon, nameOf, SafePostText, timeOf } from "./FeedPrimitives.jsx";
import ReportDialog from "./ReportDialog.jsx";

export default function PostComments({ post }) {
  const { user } = useAuth();
  return <CommentsThread key={`${user?.id}:${post.id}`} post={post} draftKey={`arena:feed-comment:v1:${user?.id}:${post.id}`} />;
}

function CommentsThread({ post, draftKey }) {
  const [draft] = useState(() => { try { const value = JSON.parse(sessionStorage.getItem(draftKey)); return value?.version === 1 ? value : null; } catch { return null; } });
  const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null); const [sort, setSort] = useState("new");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(null); const [error, setError] = useState("");
  const [text, setText] = useState(typeof draft?.text === "string" ? draft.text.slice(0, 2000) : ""); const [reply, setReply] = useState(draft?.reply || null); const [editing, setEditing] = useState(null); const [report, setReport] = useState(null);
  const generation = useRef(0); const lock = useRef(false); const input = useRef(null); const editingInput = useRef(null);
  useEffect(() => { try { if (text) sessionStorage.setItem(draftKey, JSON.stringify({ version: 1, text, reply })); else sessionStorage.removeItem(draftKey); } catch {} }, [draftKey, text, reply]);
  async function load(next = null) {
    if (lock.current) return;
    const version = ++generation.current; setLoading(true); setError("");
    try { const result = await feedApi.comments(post.id, { cursor: next, sort, limit: 20 }); if (version !== generation.current) return; setItems((previous) => next ? [...previous, ...result.items.filter((item) => !previous.some((old) => old.id === item.id))] : result.items); setCursor(result.next_cursor); }
    catch (failure) { if (version === generation.current) setError(failure.message); }
    finally { if (version === generation.current) setLoading(false); }
  }
  useEffect(() => { setItems([]); load(); return () => { generation.current += 1; }; }, [post.id, sort]);
  useEffect(() => { if (editing) editingInput.current?.focus(); }, [editing?.id]);
  async function mutate(key, task) {
    if (lock.current || loading) return;
    lock.current = true; setBusy(key); setError("");
    try { await task(); } catch (failure) { setError(failure.message); } finally { lock.current = false; setBusy(null); }
  }
  async function refreshCount() { try { const result = await feedApi.post(post.id); postChanged(result, ["counts.comments"]); } catch {} }
  function submit(event) {
    event.preventDefault(); if (!text.trim()) return;
    mutate("send", async () => { const result = await feedApi.comment(post.id, { text: text.trim(), parent_id: reply?.parent_id || reply?.id || null }); setItems((previous) => [result, ...previous]); setText(""); setReply(null); await refreshCount(); });
  }
  function remove(item) { mutate(item.id, async () => { await feedApi.removeComment(item.id); setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, status: "DELETED", text: "Комментарий удалён", can_edit: false, can_delete: false } : entry)); if (editing?.id === item.id) setEditing(null); if (reply?.id === item.id || reply?.parent_id === item.id) setReply(null); await refreshCount(); }); }
  function like(item) { mutate(item.id, async () => { const result = await feedApi.likeComment(item.id, !item.liked); setItems((previous) => previous.map((entry) => entry.id === result.id ? result : entry)); }); }
  function saveEdit(event) { event.preventDefault(); if (!editing?.text.trim()) return; mutate(editing.id, async () => { const result = await feedApi.editComment(editing.id, editing.text.trim()); setItems((previous) => previous.map((entry) => entry.id === result.id ? result : entry)); setEditing(null); }); }
  function render(item, nested = false) {
    return <article key={item.id} className={`arena-feed-comment${nested ? " is-reply" : ""}`}><Link to={item.author.path}><FeedAvatar author={item.author} /></Link><div><header><Link to={item.author.path}>{nameOf(item.author)}</Link><time dateTime={item.created_at}>{timeOf(item.created_at)}</time></header>{item.parent_id && !items.some((parent) => parent.id === item.parent_id) && <small className="arena-feed-muted">Ответ на комментарий выше в обсуждении</small>}{editing?.id === item.id ? <form className="arena-feed-comment-edit" onSubmit={saveEdit}><label><span className="arena-feed-sr-only">Изменённый комментарий</span><textarea aria-label="Изменённый комментарий" ref={editingInput} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} maxLength={2000} required disabled={busy !== null} /></label><div><button className="arena-feed-button is-primary" disabled={busy !== null || !editing.text.trim()}>Сохранить</button><button type="button" className="arena-feed-text-button" onClick={() => setEditing(null)} disabled={busy !== null}>Отмена</button></div></form> : <p className={item.status === "DELETED" ? "arena-feed-muted" : ""}><SafePostText text={item.text} /></p>}{item.status !== "DELETED" && <div className="arena-feed-comment-actions">{post.viewer_state.can_comment && <button onClick={() => { setReply(item); input.current?.focus(); }} disabled={busy !== null || loading}>Ответить</button>}<button onClick={() => like(item)} aria-pressed={item.liked} aria-label={`${item.liked ? "Убрать лайк" : "Нравится"} комментарию: ${item.likes}`} disabled={busy !== null || loading}><FeedIcon name="heart" size={15} filled={item.liked} />{item.likes}</button>{item.can_edit && <button onClick={() => setEditing({ id: item.id, text: item.text })} disabled={busy !== null || loading}>Изменить</button>}{item.can_delete ? <button onClick={() => remove(item)} disabled={busy !== null || loading}>Удалить</button> : <button onClick={() => setReport(item.id)} aria-label="Пожаловаться на комментарий"><FeedIcon name="flag" size={14} /></button>}</div>}</div></article>;
  }
  const roots = items.filter((item) => !item.parent_id || !items.some((parent) => parent.id === item.parent_id));
  return <section className="arena-feed-comments" aria-label="Комментарии"><header><h3>Обсуждение</h3><label><span className="arena-feed-sr-only">Порядок комментариев</span><select value={sort} disabled={busy !== null} onChange={(event) => setSort(event.target.value)}><option value="new">Сначала новые</option><option value="popular">Популярные на странице</option></select></label></header><FeedError error={error} retry={() => load()} />{loading && !items.length && <p className="arena-feed-muted" role="status">Загружаем обсуждение…</p>}{!loading && !items.length && !error && <p className="arena-feed-muted">Первое слово за вами. Поделитесь своей точкой зрения.</p>}<div>{roots.map((item) => <div key={item.id}>{render(item, Boolean(item.parent_id))}{items.filter((child) => child.parent_id === item.id).map((child) => render(child, true))}</div>)}</div>{cursor !== null && <button className="arena-feed-button" onClick={() => load(cursor)} disabled={loading || busy !== null}>{loading ? "Загружаем…" : "Ещё комментарии"}</button>}
    {post.viewer_state.can_comment ? <form className="arena-feed-comment-composer" onSubmit={submit}>{reply && <div className="arena-feed-reply-to"><span>Ответ для {nameOf(reply.author)}</span><button type="button" className="arena-feed-icon-button" onClick={() => setReply(null)} aria-label="Отменить ответ"><FeedIcon name="close" size={16} /></button></div>}<label><span className="arena-feed-sr-only">Ваш комментарий</span><textarea aria-label="Ваш комментарий" ref={input} value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={2} placeholder="Добавьте свою точку зрения…" disabled={busy === "send"} required /></label><div><span>{text.length} / 2000</span><button className="arena-feed-button is-primary" disabled={loading || busy !== null || !text.trim()}>{busy === "send" ? "Отправляем…" : "Отправить"}<FeedIcon name="send" size={17} /></button></div></form> : <p className="arena-feed-comments-closed"><FeedIcon name="lock" size={17} />Автор отключил новые комментарии.</p>}{report && <ReportDialog targetType="COMMENT" targetId={report} onClose={() => setReport(null)} />}
  </section>;
}
