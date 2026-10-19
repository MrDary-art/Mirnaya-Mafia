import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { feedApi } from "./feedApi.js";
import { FeedAvatar, FeedDialog, FeedError, FeedIcon, nameOf, timeOf } from "./FeedPrimitives.jsx";
import { PrivateMedia } from "./PostMedia.jsx";
import "./stories-bar.css";

function SaveHighlight({ story, onClose, onSaved, onBusy }) {
  const [items, setItems] = useState([]), [selected, setSelected] = useState("");
  const [title, setTitle] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { let live = true; feedApi.highlights(story.author.id).then((result) => { if (live) setItems(result.items || []); }).catch((failure) => { if (live) setError(failure.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [story.author.id]);
  async function save(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    try {
      const existing = items.find((item) => String(item.id) === selected);
      if (existing) await feedApi.updateHighlight(existing.id, { story_ids: [...new Set([...existing.story_ids, story.id])] });
      else await feedApi.createHighlight({ title: title.trim(), story_ids: [story.id], cover_media_id: story.media?.id || null });
      window.dispatchEvent(new Event("arena:social-highlights-changed")); onSaved();
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <form className="arena-social-story-subpanel" onSubmit={save}><h3>Сохранить в актуальном</h3><p>История останется на вашей стене. Её аудитория и настройки приватности не изменятся.</p>{loading ? <p role="status">Загружаем подборки…</p> : <><label className="arena-social-story-field">Подборка<select value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}><option value="">Новая подборка</option>{items.map((item) => <option key={item.id} value={item.id} disabled={item.story_ids.length >= 30 && !item.story_ids.includes(story.id)}>{item.title}</option>)}</select></label>{!selected && <label className="arena-social-story-field">Название<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} disabled={busy} required placeholder="Например, рабочие моменты" /></label>}</>}<FeedError error={error} /><div className="arena-social-story-form-footer"><button type="button" className="arena-feed-text-button" disabled={busy} onClick={onClose}>Назад</button><button className="arena-feed-button is-primary" disabled={busy || loading || (!selected && !title.trim())}>{busy ? "Сохраняем…" : "Сохранить"}</button></div></form>;
}

export default function StoryViewer({ stories, initialIndex = 0, highlightId = null, onClose, onChanged }) {
  const [queue, setQueue] = useState(stories), [index, setIndex] = useState(initialIndex);
  const [story, setStory] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [held, setHeld] = useState(false), [visible, setVisible] = useState(!document.hidden), [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0), [reload, setReload] = useState(0), [panel, setPanel] = useState("");
  const [reply, setReply] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [viewers, setViewers] = useState(null), [viewersLoading, setViewersLoading] = useState(false);
  const request = useRef(0), previousId = useRef(null), actionLock = useRef(false), canvas = useRef(null), elapsed = useRef(0), callbacks = useRef({ onClose, onChanged });
  callbacks.current = { onClose, onChanged };
  const id = queue[index]?.id;
  const isVideo = story?.media?.kind?.toLowerCase() === "video";
  const squareMedia = !isVideo && !story?.text && story?.media?.width > 0 && story.media.width === story.media.height;
  const expiryLabel = story?.expires_at ? new Date(story.expires_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  const duration = Math.min(45000, Math.max(8000, 8000 + (story?.text.length || 0) * 35));
  const stopped = paused || held || !visible || !ready || loading || Boolean(panel) || busy;
  function close() { if (actionLock.current || ((reply.trim() || panel === "save") && !window.confirm("Закрыть историю? Неотправленный ответ и несохранённые изменения будут потеряны."))) return; callbacks.current.onClose(); }
  function move(delta) {
    if (actionLock.current || ((reply.trim() || panel === "save") && !window.confirm("Перейти к другой истории без сохранения ответа или подборки?"))) return;
    if (index + delta >= queue.length) { close(); return; }
    if (index + delta < 0) return;
    setIndex((value) => value + delta);
  }
  useEffect(() => {
    const ticket = ++request.current; setLoading(true); setError("");
    if (previousId.current !== id) {
      previousId.current = id; setStory(null); setReady(false); setNotice(""); setReply(""); setPanel(""); setViewers(null); setViewersLoading(false); setHeld(false); setProgress(0); elapsed.current = 0;
    }
    if (!id) { setError("Эта история больше недоступна."); setLoading(false); return undefined; }
    const read = highlightId ? feedApi.highlight(highlightId).then((result) => { const item = result.items.find((entry) => entry.id === id); if (!item) throw new Error("История больше не доступна в этой подборке."); return item; }) : feedApi.story(id);
    read.then((result) => { if (request.current !== ticket) return; setStory(result); if (!result.media) setReady(true); }).catch((failure) => { if (request.current === ticket) { setStory(null); setReady(false); setError(failure.message); } }).finally(() => { if (request.current === ticket) setLoading(false); });
    return () => { request.current += 1; };
  }, [id, highlightId, reload]);
  useEffect(() => {
    const visibility = () => { setVisible(!document.hidden); if (document.hidden) canvas.current?.querySelector("video")?.pause(); else setReload((value) => value + 1); };
    const refresh = () => setReload((value) => value + 1);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("arena:feed-access-changed", refresh); window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("arena:feed-access-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!story || !ready || !visible) return undefined;
    let active = true;
    feedApi.viewStory(story.id).catch((failure) => { if (active) { setStory(null); setError(failure.message); } });
    return () => { active = false; };
  }, [story?.id, ready, visible]);
  useEffect(() => {
    if (!story || story.is_highlight) return undefined;
    const timer = window.setTimeout(() => setReload((value) => value + 1), Math.max(500, new Date(story.expires_at).getTime() - Date.now() + 250));
    return () => clearTimeout(timer);
  }, [story?.id, story?.expires_at]);
  useEffect(() => {
    if (stopped || isVideo || !story) return undefined;
    let previous = performance.now();
    const timer = window.setInterval(() => { const current = performance.now(); elapsed.current += current - previous; previous = current; setProgress(Math.min(1, elapsed.current / duration)); if (elapsed.current >= duration) { clearInterval(timer); if (index + 1 < queue.length) setIndex((value) => value + 1); else callbacks.current.onClose(); } }, 100);
    return () => clearInterval(timer);
  }, [stopped, isVideo, story?.id, duration, index, queue.length]);
  useEffect(() => { if (stopped) canvas.current?.querySelector("video")?.pause(); }, [stopped]);
  function togglePause() {
    const video = canvas.current?.querySelector("video");
    if (isVideo && video) { if (video.paused) { setPaused(false); video.play().catch(() => setError("Не удалось запустить видео. Используйте кнопку воспроизведения на самом видео.")); } else { video.pause(); setPaused(true); } }
    else setPaused((value) => !value);
  }
  async function loadViewers(more = false) {
    if (viewersLoading) return;
    const currentId = story.id, ticket = request.current; setViewersLoading(true); setError(""); setPanel("viewers"); setPaused(true);
    try { const result = await feedApi.viewers(currentId, { cursor: more ? viewers?.next_cursor : undefined }); if (ticket === request.current) setViewers((previous) => more ? { ...result, items: [...previous.items, ...result.items] } : result); }
    catch (failure) { if (ticket === request.current) setError(failure.message); }
    finally { if (ticket === request.current) setViewersLoading(false); }
  }
  async function sendReply(event) {
    event.preventDefault(); if (!reply.trim() || actionLock.current) return;
    const ticket = request.current; actionLock.current = true; setBusy(true); setError(""); setPaused(true);
    try { await feedApi.replyStory(story.id, reply.trim()); if (ticket === request.current) { setReply(""); setNotice("Ответ отправлен в личные сообщения."); } }
    catch (failure) { if (ticket === request.current) setError(failure.message); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function remove() {
    if (actionLock.current || !window.confirm("Удалить историю? Она исчезнет и из актуального.")) return;
    actionLock.current = true; setBusy(true); setPaused(true); setError("");
    try {
      await feedApi.removeStory(story.id); window.dispatchEvent(new Event("arena:social-stories-changed")); window.dispatchEvent(new Event("arena:social-highlights-changed")); callbacks.current.onChanged?.();
      const next = queue.filter((item) => item.id !== story.id);
      if (!next.length) callbacks.current.onClose(); else { setQueue(next); setIndex(Math.min(index, next.length - 1)); }
    } catch (failure) { setError(failure.message); }
    finally { actionLock.current = false; setBusy(false); }
  }
  return <FeedDialog title={highlightId ? "Актуальное" : "Истории"} subtitle={`${index + 1} из ${queue.length}`} onClose={close}>
    <div className="arena-social-story-viewer" onFocusCapture={() => setPaused(true)} onKeyDown={(event) => { if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT|VIDEO/.test(event.target.tagName)) return; if (event.key === "ArrowRight") { event.preventDefault(); move(1); } if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } if (event.code === "Space" && event.target.tagName !== "BUTTON") { event.preventDefault(); togglePause(); } }}>
      <div className="arena-social-story-progress" aria-hidden="true">{queue.map((item, position) => <span key={item.id}><i style={{ transform: `scaleX(${position < index ? 1 : position === index ? progress : 0})` }} /></span>)}</div>
      {loading && !story ? <div className="arena-social-story-loading-stage" role="status">Загружаем историю…</div> : story && <>
        <header className="arena-social-story-viewer-author" data-square-story={squareMedia || undefined}><FeedAvatar author={story.author} company={story.company} /><div><Link to={story.company?.path || story.author.path}>{story.company?.name || nameOf(story.author)}</Link><time dateTime={story.created_at}>{timeOf(story.created_at)}{story.is_highlight ? " · В актуальном" : ` · до ${expiryLabel}`}</time></div><button className="arena-feed-icon-button" type="button" aria-label={paused ? "Продолжить просмотр" : "Пауза"} title={paused ? "Продолжить просмотр" : "Пауза"} aria-pressed={paused} onClick={togglePause}><FeedIcon name={paused ? "play" : "pause"} /></button></header>
        <div ref={canvas} className={`arena-social-story-stage arena-social-story-bg-${story.background}${story.media ? " has-media" : ""}`} onPointerDown={(event) => { if (!event.target.closest("button, video, input, a")) setHeld(true); }} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onPointerLeave={() => setHeld(false)} onPlayCapture={() => setPaused(false)} onPauseCapture={() => { if (isVideo) setPaused(true); }} onTimeUpdateCapture={(event) => { if (event.target.tagName === "VIDEO" && event.target.duration) setProgress(event.target.currentTime / event.target.duration); }}>
          {story.media && <PrivateMedia key={`${story.id}-${reload}`} media={story.media} full eager onReady={() => setReady(true)} onEnded={() => { if (!panel && !busy) move(1); }} />}
          {story.text && <p className={story.text.length > 240 ? "is-long" : ""}>{story.text}</p>}
        </div>
        <div className="arena-social-story-status"><span>{paused ? "На паузе" : isVideo ? "Видео управляется плеером" : "Удерживайте, чтобы остановить"}</span><span>{story.is_highlight ? "Сохранено автором" : `Доступна до ${expiryLabel}`}</span></div>
        {!panel && <>
          <div className="arena-social-story-owner-actions">{story.views_count !== undefined && <button className="arena-feed-text-button" onClick={() => loadViewers()}><FeedIcon name="eye" size={18} />{story.views_count} просмотров</button>}{story.views_count !== undefined && <button className="arena-feed-text-button" onClick={() => { setPanel("save"); setPaused(true); }}><FeedIcon name="bookmark" size={18} />В актуальное</button>}{story.can_delete && <button className="arena-feed-icon-button" aria-label="Удалить историю" onClick={remove} disabled={busy}><FeedIcon name="trash" size={18} /></button>}</div>
          {story.can_reply && <form className="arena-social-story-reply" onSubmit={sendReply}><label><span className="arena-feed-sr-only">Ответ на историю в личные сообщения</span><input value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1000} disabled={busy} placeholder="Ответить в личные сообщения…" /></label><button className="arena-feed-icon-button" disabled={busy || !reply.trim()} aria-label="Отправить ответ"><FeedIcon name="send" /></button></form>}
          {!story.can_reply && story.views_count === undefined && <p className="arena-social-story-helper">Автор ограничил ответы в личных сообщениях.</p>}
        </>}
        {panel === "save" && <SaveHighlight story={story} onBusy={(value) => { actionLock.current = value; setBusy(value); }} onClose={() => setPanel("")} onSaved={() => { setPanel(""); setNotice("История сохранена в актуальном."); }} />}
        {panel === "viewers" && <section className="arena-social-story-subpanel"><div className="arena-social-story-section-title"><h3>Кто посмотрел</h3><button className="arena-feed-text-button" onClick={() => setPanel("")}>Назад</button></div><p>Этот список виден только вам. Один человек учитывается один раз.</p>{viewers?.items.map((item) => <Link className="arena-social-story-viewer-person" to={item.user.path} key={item.user.id}><FeedAvatar author={item.user} /><span>{nameOf(item.user)}<small>{timeOf(item.viewed_at)}</small></span></Link>)}{!viewersLoading && viewers?.items.length === 0 && <p>Пока никто не посмотрел эту историю.</p>}{viewersLoading && <p role="status">Загружаем просмотры…</p>}{viewers?.next_cursor && <button className="arena-feed-button" disabled={viewersLoading} onClick={() => loadViewers(true)}>Ещё просмотры</button>}</section>}
      </>}
      <FeedError error={error} retry={!story && !loading ? () => setReload((value) => value + 1) : undefined} />
      {notice && <p className="arena-social-story-notice" role="status"><FeedIcon name="check" size={18} />{notice}</p>}
      <nav className="arena-social-story-navigation" aria-label="Навигация по историям"><button className="arena-feed-button" type="button" disabled={index === 0 || busy} onClick={() => move(-1)}><FeedIcon name="left" />Назад</button><button className="arena-feed-button" type="button" disabled={busy} onClick={() => move(1)}>{index + 1 < queue.length ? "Дальше" : "Закрыть"}<FeedIcon name="right" /></button></nav>
    </div>
  </FeedDialog>;
}
