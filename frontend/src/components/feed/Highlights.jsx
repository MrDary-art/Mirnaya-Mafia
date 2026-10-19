import { useEffect, useRef, useState } from "react";
import { feedApi } from "./feedApi.js";
import { FeedDialog, FeedError, FeedIcon, timeOf } from "./FeedPrimitives.jsx";
import { PrivateMedia } from "./PostMedia.jsx";
import StoryViewer from "./StoryViewer.jsx";
import "./stories-bar.css";

function HighlightEditor({ userId, editing, onClose, onSaved }) {
  const [title, setTitle] = useState(editing?.title || "");
  const [selected, setSelected] = useState(editing?.story_ids || []);
  const [cover, setCover] = useState(editing?.cover?.id || "");
  const [position, setPosition] = useState(editing?.position || 0);
  const [available, setAvailable] = useState(editing?.items || []), [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const live = useRef(true), lock = useRef(false), loadingRef = useRef(false);
  const changed = title !== (editing?.title || "") || JSON.stringify(selected) !== JSON.stringify(editing?.story_ids || []) || String(cover) !== String(editing?.cover?.id || "") || position !== (editing?.position || 0);
  async function load(more = false) {
    if (loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setError("");
    try {
      const result = await feedApi.stories({ user_id: userId, limit: 40, cursor: more ? cursor : undefined });
      if (live.current) { setAvailable((previous) => [...previous, ...result.items.filter((item) => !previous.some((old) => old.id === item.id))]); setCursor(result.next_cursor); }
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { loadingRef.current = false; if (live.current) setLoading(false); }
  }
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [userId]);
  function close() { if (!lock.current && (!changed || window.confirm("Закрыть без сохранения изменений в актуальном?"))) onClose(); }
  function toggle(id) { setSelected((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]); const item = available.find((value) => value.id === id); if (item?.media?.id === Number(cover)) setCover(""); }
  function move(index, delta) { setSelected((previous) => { const values = [...previous]; [values[index], values[index + delta]] = [values[index + delta], values[index]]; return values; }); }
  async function save(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const payload = { title: title.trim(), story_ids: selected, cover_media_id: Number(cover) || null, position: Number(position) };
      const result = editing ? await feedApi.updateHighlight(editing.id, payload) : await feedApi.createHighlight(payload);
      window.dispatchEvent(new Event("arena:social-highlights-changed")); onSaved(result);
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  const chosen = selected.map((id) => available.find((item) => item.id === id)).filter(Boolean);
  return <FeedDialog title={editing ? "Изменить актуальное" : "Новое актуальное"} subtitle="Сохраните свои истории на стене" onClose={close}>
    <form className="arena-social-story-highlight-editor" onSubmit={save}>
      <label className="arena-social-story-field">Название<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={100} disabled={busy} /></label>
      <p className="arena-social-story-helper">Выберите до 30 своих историй. Новые можно добавить, пока они доступны в течение 30 дней. Ранее сохранённые остаются здесь после истечения срока.</p>
      <fieldset className="arena-social-story-select-list" disabled={busy}><legend>Истории · выбрано {selected.length} / 30</legend>{available.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={busy || (!selected.includes(item.id) && selected.length >= 30)} onChange={() => toggle(item.id)} /><span>{item.text || (item.media?.kind === "VIDEO" ? "Видеоистория" : "Фотоистория")}<small>{timeOf(item.created_at)}{item.is_highlight ? " · Сохранена" : ""}</small></span></label>)}</fieldset>
      {loading && <p role="status">Загружаем ваши истории…</p>}{!loading && !available.length && <p className="arena-social-story-helper">Сначала опубликуйте историю. Затем вернитесь сюда или нажмите «В актуальное» при просмотре.</p>}{cursor && <button type="button" className="arena-feed-text-button" disabled={loading} onClick={() => load(true)}>Ещё мои истории</button>}
      {chosen.length > 1 && <section className="arena-social-story-order"><h3>Порядок историй</h3>{chosen.map((item, index) => <div key={item.id}><span>{item.text || `История от ${timeOf(item.created_at)}`}</span><button type="button" className="arena-feed-icon-button" aria-label={`Переместить историю ${index + 1} раньше`} disabled={busy || index === 0} onClick={() => move(index, -1)}><FeedIcon name="left" size={18} /></button><button type="button" className="arena-feed-icon-button" aria-label={`Переместить историю ${index + 1} позже`} disabled={busy || index === chosen.length - 1} onClick={() => move(index, 1)}><FeedIcon name="right" size={18} /></button></div>)}</section>}
      <label className="arena-social-story-field">Обложка<select value={cover} disabled={busy} onChange={(event) => setCover(event.target.value)}><option value="">Без фотообложки</option>{chosen.filter((item) => item.media).map((item) => <option value={item.media.id} key={item.id}>{item.text.slice(0, 70) || `Медиа от ${timeOf(item.created_at)}`}</option>)}</select></label>
      <label className="arena-social-story-field">Позиция на стене<input type="number" min={0} max={1000} step={1} value={position} onChange={(event) => setPosition(event.target.value)} disabled={busy} required /><small>Подборки с меньшим числом показываются раньше.</small></label>
      <FeedError error={error} /><div className="arena-social-story-form-footer"><button type="button" className="arena-feed-text-button" onClick={close} disabled={busy}>Отмена</button><button className="arena-feed-button is-primary" disabled={busy || !title.trim() || !selected.length}>{busy ? "Сохраняем…" : "Сохранить актуальное"}</button></div>
    </form>
  </FeedDialog>;
}

export default function Highlights({ userId, isSelf = false }) {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [editing, setEditing] = useState(null), [viewer, setViewer] = useState(null), [busy, setBusy] = useState(null);
  const request = useRef(0), lock = useRef(false);
  async function load() {
    if (!userId) { setLoading(false); return; }
    const ticket = ++request.current; setLoading(true); setError("");
    try { const result = await feedApi.highlights(userId); if (ticket === request.current) setItems(result.items || []); }
    catch (failure) { if (ticket === request.current) setError(failure.message); }
    finally { if (ticket === request.current) setLoading(false); }
  }
  useEffect(() => {
    setItems([]); setEditing(null); setViewer(null); load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener("arena:social-highlights-changed", refresh); window.addEventListener("arena:feed-access-changed", refresh); window.addEventListener("focus", refresh);
    return () => { request.current += 1; window.removeEventListener("arena:social-highlights-changed", refresh); window.removeEventListener("arena:feed-access-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [userId]);
  async function remove(item) {
    if (lock.current || !window.confirm(`Удалить «${item.title}» из актуального? Сами истории не удалятся, но истории старше 30 дней перестанут быть доступны вне других подборок.`)) return;
    lock.current = true; setBusy(item.id); setError("");
    try { await feedApi.removeHighlight(item.id); setItems((previous) => previous.filter((value) => value.id !== item.id)); window.dispatchEvent(new Event("arena:social-highlights-changed")); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(null); }
  }
  return <section className="arena-social-story-highlights" aria-label="Актуальное из историй"><div className="arena-social-story-section-title"><h2>Актуальное</h2>{isSelf && <button className="arena-feed-text-button" onClick={() => setEditing({})}><FeedIcon name="plus" size={18} />Добавить</button>}</div><div className="arena-social-story-highlight-strip">{items.map((item) => <article className="arena-social-story-highlight-tile" key={item.id}><button className="arena-social-story-highlight-open" onClick={() => setViewer(item)} disabled={!item.items.length} aria-label={`Открыть актуальное: ${item.title}`}><span className="arena-social-story-highlight-cover">{item.cover ? <PrivateMedia media={{ ...item.cover, kind: "IMAGE", url: item.cover.thumbnail_url || item.cover.url }} /> : <FeedIcon name="bookmark" size={28} />}</span><b>{item.title}</b><small>{item.items.length} историй</small></button>{item.can_edit && <div className="arena-social-story-highlight-tools"><button className="arena-feed-icon-button" aria-label={`Изменить актуальное: ${item.title}`} disabled={busy !== null} onClick={() => setEditing(item)}><FeedIcon name="edit" size={17} /></button><button className="arena-feed-icon-button" aria-label={`Удалить актуальное: ${item.title}`} disabled={busy !== null} onClick={() => remove(item)}><FeedIcon name="trash" size={17} /></button></div>}</article>)}</div>{loading && !items.length && <p role="status" className="arena-social-story-helper">Загружаем актуальное…</p>}{!loading && !items.length && !error && <p className="arena-social-story-helper">{isSelf ? "Сохраняйте важные истории, чтобы они оставались на стене дольше суток." : "Автор пока не сохранил доступные вам истории."}</p>}<FeedError error={error} retry={load} />{editing && <HighlightEditor key={editing.id || "new"} userId={userId} editing={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}{viewer && <StoryViewer stories={viewer.items} highlightId={viewer.id} onClose={() => setViewer(null)} onChanged={load} />}</section>;
}
