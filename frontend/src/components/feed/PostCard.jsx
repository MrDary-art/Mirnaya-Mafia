import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { feedApi, mergePost, postChanged, postRemoved } from "./feedApi.js";
import { AUDIENCES, FeedAuthor, FeedAvatar, FeedDialog, FeedError, FeedIcon, LinkedContent, nameOf, numberOf, SafePostText } from "./FeedPrimitives.jsx";
import PostMedia from "./PostMedia.jsx";
import PostComments from "./PostComments.jsx";
import PostComposer from "./PostComposer.jsx";
import ShareDialog from "./ShareDialog.jsx";
import FollowButton from "./FollowButton.jsx";
import ReportDialog from "./ReportDialog.jsx";
import CollectionPicker from "./CollectionPicker.jsx";

function Likers({ id, onClose }) {
  const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const generation = useRef(0);
  async function load(next = null) { const version = ++generation.current; setLoading(true); setError(""); try { const result = await feedApi.likers(id, { cursor: next, limit: 30 }); if (version !== generation.current) return; setItems((previous) => next ? [...previous, ...result.items] : result.items); setCursor(result.next_cursor); } catch (failure) { if (version === generation.current) setError(failure.message); } finally { if (version === generation.current) setLoading(false); } }
  useEffect(() => { load(); return () => { generation.current += 1; }; }, [id]);
  return <FeedDialog title="Кому понравилось" onClose={onClose}><FeedError error={error} retry={() => load()} /><div className="arena-feed-people-list">{items.map((person) => <Link key={person.id} to={person.path}><FeedAvatar author={person} /><span>{nameOf(person)}</span></Link>)}</div>{!loading && !items.length && !error && <p className="arena-feed-muted">Нет открытых для вас профилей с этой реакцией.</p>}{loading && <p role="status">Загружаем…</p>}{cursor !== null && <button className="arena-feed-button" onClick={() => load(cursor)} disabled={loading}>Показать ещё</button>}</FeedDialog>;
}

export default function PostCard({ post: incoming, initialComments = false, compact = false }) {
  const { user } = useAuth();
  const [post, setPost] = useState(incoming); const [expanded, setExpanded] = useState(false); const [comments, setComments] = useState(initialComments);
  const [modal, setModal] = useState(null); const [busy, setBusy] = useState(null); const [error, setError] = useState(""); const [removed, setRemoved] = useState(false);
  const lock = useRef(false); const menu = useRef(null); const commentsRef = useRef(null);
  useEffect(() => { setPost(incoming); setRemoved(false); }, [incoming]);
  useEffect(() => {
    const changed = (event) => { if (event.detail.post.id === incoming.id) setPost((current) => mergePost(current, event.detail.post, event.detail.fields)); };
    const deleted = (event) => { if (event.detail.id === incoming.id) setRemoved(true); };
    const followed = (event) => { const { id, following, company } = event.detail; setPost((current) => ((company && current.company?.id === id) || (!company && !current.company && current.author.id === id)) ? { ...current, viewer_state: { ...current.viewer_state, following_author: following } } : current); };
    const outside = (event) => { if (menu.current?.open && !menu.current.contains(event.target)) menu.current.open = false; };
    const escape = event => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; if (menu.current.contains(document.activeElement)) menu.current.querySelector("summary")?.focus(); } };
    window.addEventListener("arena:feed-post-changed", changed); window.addEventListener("arena:feed-post-removed", deleted); window.addEventListener("arena:feed-follow-changed", followed); document.addEventListener("click", outside); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("arena:feed-post-changed", changed); window.removeEventListener("arena:feed-post-removed", deleted); window.removeEventListener("arena:feed-follow-changed", followed); document.removeEventListener("click", outside); document.removeEventListener("keydown", escape); };
  }, [incoming.id]);
  async function mutate(key, task) { if (lock.current) return; lock.current = true; setBusy(key); setError(""); if (menu.current) menu.current.open = false; try { await task(); } catch (failure) { setError(failure.message); } finally { lock.current = false; setBusy(null); } }
  function toggleLike() {
    const fields = ["viewer_state.liked", "counts.likes"];
    mutate("like", async () => {
      const old = post; const liked = !post.viewer_state.liked;
      postChanged({ ...post, viewer_state: { ...post.viewer_state, liked }, counts: { ...post.counts, likes: Math.max(0, post.counts.likes + (liked ? 1 : -1)) } }, fields);
      try { const result = await feedApi.like(post.id, liked); postChanged(result, fields); }
      catch (failure) { postChanged(old, fields); throw failure; }
    });
  }
  function toggleBookmark() {
    const old = post; const bookmarked = !post.viewer_state.bookmarked;
    mutate("bookmark", async () => {
      postChanged({ ...post, viewer_state: { ...post.viewer_state, bookmarked } }, ["viewer_state.bookmarked"]);
      try { await feedApi.bookmark(post.id, bookmarked); window.dispatchEvent(new CustomEvent("arena:feed-bookmark-committed", { detail: { id: post.id, bookmarked } })); }
      catch (failure) { postChanged(old, ["viewer_state.bookmarked"]); throw failure; }
    });
  }
  function update(body) { mutate("update", async () => { postChanged(await feedApi.update(post.id, body)); }); }
  function openModal(value) { if (menu.current) menu.current.open = false; setModal(value); }
  function showComments() { setComments((value) => !value); }
  if (removed === "hidden") return <div className="arena-feed-removed" role="status"><FeedIcon name="check" size={18} /><span>Публикация скрыта из вашего сообщества.</span><button type="button" className="arena-feed-text-button" disabled={busy !== null} onClick={() => mutate("unhide", async () => { await feedApi.hide(post.id, false); setRemoved(null); })}>Отменить</button></div>;
  if (removed) return <div className="arena-feed-removed" role="status"><FeedIcon name="check" size={18} />{removed === "author" ? "Публикации автора больше не показываются." : "Публикация удалена."}</div>;
  if (modal === "edit") return <PostComposer editing={post} onCancel={() => setModal(null)} onCreated={() => setModal(null)} initiallyOpen />;
  const original = post.repost_original;
  const canFollow = post.company || post.author.id !== user?.id;
  const isDraft = post.status === "DRAFT";
  return <article className={`arena-feed-post${compact ? " is-compact" : ""}`} data-post-id={post.id}>
    {post.pinned && <div className="arena-feed-pinned"><FeedIcon name="pin" size={14} />Закреплённая публикация</div>}
    <header className="arena-feed-post-header"><FeedAuthor author={post.author} company={post.company} date={post.published_at || post.created_at}><span className="arena-feed-audience-label" title={AUDIENCES[post.audience]}><FeedIcon name={post.audience === "PUBLIC" ? "globe" : "lock"} size={12} />{isDraft ? "Черновик · только вам" : post.audience === "COMPANY_INTERNAL" ? "Внутри компании" : post.viewer_state.can_edit ? AUDIENCES[post.audience] : ""}</span></FeedAuthor>{canFollow && !isDraft && <FollowButton id={post.company?.id || post.author.id} following={post.viewer_state.following_author} company={Boolean(post.company)} onError={setError} compact />}<details className="arena-feed-post-menu" ref={menu}><summary aria-label="Действия с публикацией"><FeedIcon name="more" size={24} /></summary><div>{post.viewer_state.can_edit && <><button onClick={() => openModal("edit")} disabled={busy !== null}><FeedIcon name="edit" size={17} />Редактировать</button><button onClick={() => update({ pinned: !post.pinned })} disabled={busy !== null}><FeedIcon name="pin" size={17} />{post.pinned ? "Открепить" : "Закрепить на стене"}</button><button onClick={() => update({ comments_enabled: !post.comments_enabled })} disabled={busy !== null}><FeedIcon name="comment" size={17} />{post.comments_enabled ? "Отключить комментарии" : "Разрешить комментарии"}</button></>}{!isDraft && <button onClick={() => openModal("collection")}><FeedIcon name="bookmark" size={17} />Добавить в подборку</button>}{post.viewer_state.can_delete ? <button className="is-danger" onClick={() => openModal("delete")} disabled={busy !== null}><FeedIcon name="trash" size={17} />Удалить публикацию</button> : <><button onClick={() => openModal("report")}><FeedIcon name="flag" size={17} />Пожаловаться</button>{!post.company && <button disabled={busy !== null} onClick={() => mutate("mute", async () => { await feedApi.mute(post.author.id, true); setRemoved(true); window.dispatchEvent(new CustomEvent("arena:feed-author-muted", { detail: { id: post.author.id } })); })}><FeedIcon name="close" size={17} />Не показывать этого автора</button>}</>}</div></details></header>
    <div className="arena-feed-post-body">{post.body && <><p className="arena-feed-post-text"><SafePostText text={!expanded && post.body.length > 650 ? `${post.body.slice(0, 650)}…` : post.body} /></p>{post.body.length > 650 && <button className="arena-feed-expand" onClick={() => setExpanded((value) => !value)}>{expanded ? "Свернуть" : "Показать полностью"}</button>}</>}<LinkedContent content={post.linked_content} /></div>
    <PostMedia media={post.media} />
    {original && <div className="arena-feed-repost-original">{original.available === false ? <div className="arena-feed-source-unavailable"><FeedIcon name="lock" size={24} /><b>Исходная публикация недоступна</b><p>Автор удалил её или изменил доступ.</p></div> : <><FeedAuthor author={original.author} company={original.company} date={original.published_at || original.created_at} /><p className="arena-feed-post-text"><SafePostText text={original.body?.length > 400 ? `${original.body.slice(0, 400)}…` : original.body} /></p><LinkedContent content={original.linked_content} /><PostMedia media={original.media} /><Link className="arena-feed-source-link" to={`/feed/post/${original.id}`}>Открыть оригинал <FeedIcon name="right" size={16} /></Link></>}</div>}
    {post.poll && <section className="arena-feed-poll" aria-label="Опрос"><h3>Как вы считаете?</h3>{post.poll.options.map((option) => { const percent = post.poll.total_votes ? Math.round(option.votes / post.poll.total_votes * 100) : 0; return <button key={option.id} type="button" className={post.poll.voted_option_id === option.id ? "is-selected" : ""} disabled={busy !== null || isDraft} onClick={() => mutate("vote", async () => postChanged(await feedApi.vote(post.id, option.id), ["poll"]))} aria-pressed={post.poll.voted_option_id === option.id}>{post.poll.voted_option_id && <span className="arena-feed-vote-bar" style={{ width: `${percent}%` }} />}<span>{post.poll.voted_option_id === option.id && <FeedIcon name="check" size={15} />}{option.text}</span>{post.poll.voted_option_id && <strong>{percent}%</strong>}</button>; })}<small>{numberOf(post.poll.total_votes)} голосов · {post.poll.voted_option_id ? "Вы можете изменить ответ" : "Выберите один ответ"}</small></section>}
    <FeedError error={error} />
    {isDraft ? <div className="arena-feed-draft-footer"><p>Этот черновик виден только вам.</p><button className="arena-feed-button is-primary" onClick={() => update({ status: "PUBLISHED" })} disabled={busy !== null}>Опубликовать <FeedIcon name="send" size={17} /></button></div> : <><footer className="arena-feed-post-actions"><div><button className={post.viewer_state.liked ? "is-liked" : ""} onClick={toggleLike} disabled={busy !== null} aria-label={`${post.viewer_state.liked ? "Убрать лайк" : "Нравится"}: ${post.counts.likes}`} aria-pressed={post.viewer_state.liked}><FeedIcon name="heart" size={22} filled={post.viewer_state.liked} /><span>{numberOf(post.counts.likes)}</span></button><button onClick={showComments} aria-expanded={comments} aria-label={`Комментарии: ${post.counts.comments}`}><FeedIcon name="comment" size={22} /><span>{numberOf(post.counts.comments)}</span></button><button onClick={() => setModal("share")} aria-label={`Поделиться публикацией. Репостов: ${post.counts.reposts}`}><FeedIcon name="share" size={23} /><span>{numberOf(post.counts.reposts)}</span></button></div><button className={post.viewer_state.bookmarked ? "is-saved" : ""} onClick={toggleBookmark} disabled={busy !== null} aria-label={post.viewer_state.bookmarked ? "Убрать из сохранённого" : "Сохранить публикацию"} aria-pressed={post.viewer_state.bookmarked}><FeedIcon name="bookmark" size={22} filled={post.viewer_state.bookmarked} /></button></footer><div className="arena-feed-post-meta"><button type="button" onClick={() => setModal("likes")}>Кому понравилось</button><Link to={`/feed/post/${post.id}`}>Открыть публикацию <FeedIcon name="right" size={13} /></Link></div>{comments && <div ref={commentsRef}><PostComments post={post} /></div>}</>}
    {modal === "share" && <ShareDialog post={post} onClose={() => setModal(null)} />}{modal === "collection" && <CollectionPicker postId={post.id} onClose={() => setModal(null)} onSaved={() => { postChanged({ ...post, viewer_state: { ...post.viewer_state, bookmarked: true } }, ["viewer_state.bookmarked"]); }} />}{modal === "report" && <ReportDialog targetType="POST" targetId={post.id} onClose={() => setModal(null)} />}{modal === "likes" && <Likers id={post.id} onClose={() => setModal(null)} />}{modal === "delete" && <FeedDialog title="Удалить публикацию?" onClose={() => setModal(null)}><p className="arena-feed-muted">Запись исчезнет из сообщества и вашей стены. В репостах и сообщениях появится отметка, что оригинал недоступен.</p><FeedError error={error} /><div className="arena-feed-dialog-actions"><button className="arena-feed-button" onClick={() => setModal(null)} disabled={busy !== null}>Оставить</button><button className="arena-feed-button is-danger" disabled={busy !== null} onClick={() => mutate("delete", async () => { await feedApi.remove(post.id); postRemoved(post.id); setModal(null); })}>{busy === "delete" ? "Удаляем…" : "Удалить"}</button></div></FeedDialog>}
  </article>;
}
