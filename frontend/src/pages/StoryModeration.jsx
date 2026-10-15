import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { storyApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { StoryArtwork, StoryAuthor, StoryDialog, StoryError, StoryGraphPreview, StoryIcon, STORY_STATUS, displayName } from "../components/features/stories/StoryPrimitives.jsx";
import "./stories.css";

const ACTIONS = { publish: "Опубликовать", reject: "Вернуть на доработку", hide: "Скрыть из ленты", dismiss: "Оставить в ленте" };

function ModerationComments({ storyId }) {
  const [items, setItems] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const lock = useRef(false);
  const version = useRef(0);
  async function load(offset = 0) {
    const current = ++version.current; setLoading(true); setError("");
    try { const result = await storyApi.adminComments(storyId, { offset, limit: 20 }); if (current === version.current) { setItems((previous) => offset ? [...previous, ...result.items] : result.items); setNextOffset(result.next_offset); } }
    catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { version.current += 1; }; }, [storyId]);
  async function remove(id) {
    if (lock.current) return;
    lock.current = true; setDeleting(id); setError("");
    try { await storyApi.adminDeleteComment(id); setItems((previous) => previous.filter((item) => item.id !== id)); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setDeleting(null); }
  }
  return <section className="stories-moderation-comments"><h3>Обсуждение</h3><StoryError error={error} onRetry={() => load()} />{loading && <p className="stories-muted" role="status">Загружаем комментарии…</p>}{!loading && !error && !items.length && <p className="stories-muted">Комментариев пока нет.</p>}{items.map((item) => <article key={item.id} className="stories-moderation-comment"><b>{displayName(item.author)}</b><p>{item.text}</p><button className="stories-text-button" disabled={deleting !== null} onClick={() => remove(item.id)}>{deleting === item.id ? "Удаляем…" : "Удалить комментарий"}</button></article>)}{nextOffset !== null && <button className="stories-button stories-button-secondary" disabled={loading} onClick={() => load(nextOffset)}>Ещё комментарии</button>}</section>;
}

export default function StoryModeration() {
  const { user, ready } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState("publish");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const lock = useRef(false);
  const version = useRef(0);
  async function load() {
    const current = ++version.current; setLoading(true); setError("");
    try { const result = await storyApi.moderation(); if (current === version.current) setItems(result.items); }
    catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { if (user?.is_admin) load(); return () => { version.current += 1; }; }, [user?.is_admin]);
  function review(story) { setSelected(story); setAction(story.status === "pending" ? "publish" : "dismiss"); setNote(""); setActionError(""); }
  async function submit(event) {
    event.preventDefault(); if (lock.current || !selected) return;
    lock.current = true; setBusy(true); setActionError("");
    try { await storyApi.moderate(selected.id, action, note.trim()); setSelected(null); setNotice(`«${selected.title}»: ${action === "publish" ? "опубликовано" : action === "reject" ? "возвращено автору" : action === "hide" ? "скрыто из ленты" : "жалобы рассмотрены, история остаётся в ленте"}.`); await load(); }
    catch (failure) { setActionError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!ready) return <div className="stories-page stories-moderation" role="status">Загружаем модерацию…</div>;
  if (!user) return <Navigate to="/login?next=%2Fadmin%2Fstories" replace />;
  if (!user.is_admin) return <div className="stories-page stories-moderation"><div className="stories-state"><StoryIcon name="flag" size={36} /><h1>Этот раздел доступен редакции</h1><p>Ваши публикации и их статус доступны в разделе «Мои истории».</p><Link className="stories-button stories-button-primary" to="/stories?tab=mine">Мои истории <StoryIcon name="arrow" /></Link></div></div>;
  const filtered = items.filter((item) => filter === "all" || (filter === "pending" ? item.status === "pending" : item.reports_count > 0));
  return <div className="stories-page stories-moderation">
    <div className="stories-studio-breadcrumb"><Link to="/admin"><StoryIcon name="arrow" size={17} />Панель администратора</Link><span>Редакция историй</span></div>
    <header className="stories-studio-header"><div><span className="stories-eyebrow">БЕРЕЖНО К ЛЮДЯМ. ВНИМАТЕЛЬНО К СМЫСЛУ.</span><h1>Прежде чем<br /><em>начнётся разговор.</em></h1><p>Проверьте ветки, последствия и обсуждение. Помогите автору сделать историю точнее.</p></div><button className="stories-button stories-button-secondary" onClick={load} disabled={loading}><StoryIcon name="retry" size={18} />Обновить</button></header>
    <nav className="stories-tabs" aria-label="Очередь модерации">{[["all", "Все"], ["pending", "На проверке"], ["reported", "С жалобами"]].map(([id, label]) => <button key={id} className={filter === id ? "is-active" : ""} aria-current={filter === id ? "page" : undefined} onClick={() => setFilter(id)}>{label}</button>)}</nav>
    <StoryError error={error} onRetry={load} />{notice && <p className="stories-success" role="status"><StoryIcon name="check" size={19} />{notice}</p>}
    {loading && <div className="stories-state" role="status">Загружаем очередь…</div>}
    {!loading && !error && !filtered.length && <div className="stories-state"><StoryIcon name="check" size={40} /><h2>В этой очереди пока тихо.</h2><p>Новые истории и сигналы читателей появятся здесь.</p></div>}
    {!loading && <div className="stories-moderation-grid">{filtered.map((story) => <article className="stories-moderation-card" key={story.id}><StoryArtwork story={story} compact /><div className="stories-moderation-card-body"><StoryAuthor author={story.author} /><p>{story.hook}</p><div className="stories-row"><span className={`stories-status stories-status-${story.status}`}>{STORY_STATUS[story.status]}</span>{story.reports_count > 0 && <span className="stories-report-count"><StoryIcon name="flag" size={15} />Сигналов: {story.reports_count}</span>}</div><button className="stories-button stories-button-secondary" onClick={() => review(story)}>Открыть на проверку <StoryIcon name="arrow" size={18} /></button></div></article>)}</div>}
    {selected && <StoryDialog title={selected.title} subtitle={`Автор: ${displayName(selected.author)}`} onClose={() => { if (!busy) setSelected(null); }} wide><div className="stories-dialog-body"><p className="stories-hook">{selected.hook}</p>{selected.reports_count > 0 && <div className="stories-review-note"><b>Сигналов читателей: {selected.reports_count}</b>{(selected.reports || []).map((report, index) => <p key={report.id || index}>{report.reason}</p>)}</div>}<StoryGraphPreview graph={selected.graph} /><ModerationComments storyId={selected.id} /><form className="stories-form stories-moderation-decision" onSubmit={submit}><h3>Решение редакции</h3><label>Действие<select value={action} onChange={(event) => setAction(event.target.value)} disabled={busy}>{(selected.status === "pending" ? ["publish", "reject"] : ["dismiss", "hide"]).map((value) => <option key={value} value={value}>{ACTIONS[value]}</option>)}</select></label><label>Комментарий {(["reject", "hide"].includes(action)) ? "автору (обязательно)" : "(необязательно)"}<textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} maxLength={1000} rows={3} required={["reject", "hide"].includes(action)} minLength={["reject", "hide"].includes(action) ? 3 : undefined} placeholder="Конкретно объясните, что и почему нужно изменить." /></label><StoryError error={actionError} /><button className="stories-button stories-button-primary" disabled={busy || (["reject", "hide"].includes(action) && note.trim().length < 3)}>{busy ? "Сохраняем решение…" : ACTIONS[action]}<StoryIcon name="check" size={18} /></button></form></div></StoryDialog>}
  </div>;
}
