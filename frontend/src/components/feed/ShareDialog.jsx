import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { feedApi, postChanged } from "./feedApi.js";
import { AudienceSelect, FeedAvatar, FeedDialog, FeedError, FeedIcon, nameOf } from "./FeedPrimitives.jsx";

export default function ShareDialog({ post, onClose }) {
  const [tab, setTab] = useState("link"); const [texts, setTexts] = useState({ message: "", repost: "" }); const [audience, setAudience] = useState("PUBLIC");
  const text = texts[tab] || "";
  const setText = value => { setTexts(previous => ({ ...previous, [tab]: value })); setNotice(""); };
  const [contacts, setContacts] = useState([]); const [recipient, setRecipient] = useState(""); const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const lock = useRef(false); const linkRef = useRef(null); const url = `${window.location.origin}/feed/post/${post.id}`;
  const [contactsRetry, setContactsRetry] = useState(0);
  useEffect(() => {
    if (tab !== "message") { setLoading(false); return undefined; }
    let cancelled = false; setLoading(true); setError("");
    Promise.all([api("/api/social/friends"), api("/api/social/dialogs")]).then(([friends, dialogs]) => { if (cancelled) return; const map = new Map(); [...friends.filter((person) => person.relationship === "FRIENDS"), ...dialogs].forEach((person) => map.set(person.id, person)); setContacts([...map.values()]); }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, contactsRetry]);
  async function copy() { try { await navigator.clipboard.writeText(url); setNotice("Ссылка скопирована"); } catch { linkRef.current?.focus(); linkRef.current?.select(); setNotice("Ссылка выделена. Скопируйте её сочетанием Ctrl+C или через меню телефона."); } }
  async function submit(event) {
    event.preventDefault(); if (lock.current) return;
    if (tab === "message" && (!recipient || loading || !contacts.some(person => String(person.id) === recipient && person.can_message !== false))) { setError("Получатель недоступен для отправки сообщений. Выберите другой контакт."); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { if (tab === "repost") { await feedApi.repost(post.id, { body: text.trim(), audience }); setNotice("Репост появился на вашей странице."); setTexts(previous => ({ ...previous, repost: "" })); feedApi.post(post.id).then(result => postChanged(result, ["counts.reposts"])).catch(() => {}); } else { await feedApi.share(post.id, { recipient_id: Number(recipient), text: text.trim() }); setTexts(previous => ({ ...previous, message: "" })); window.dispatchEvent(new Event("arena:notifications-changed")); setNotice("Публикация отправлена в личные сообщения."); } }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  function close() { if (lock.current) return; if ((texts.message.trim() || texts.repost.trim()) && !window.confirm("Закрыть без отправки? Набранный текст не будет сохранён.")) return; onClose(); }
  const filtered = contacts.filter((person) => `${nameOf(person)} ${person.username}`.toLowerCase().includes(search.toLowerCase()));
  const recipientUnavailable = tab === "message" && Boolean(recipient) && !contacts.some(person => String(person.id) === recipient && person.can_message !== false);
  return <FeedDialog title="Поделиться публикацией" onClose={close}>
    <nav className="arena-feed-tabs" aria-label="Способ поделиться">{[["link", "Ссылка"], ["message", "Сообщение"], ...(post.viewer_state.can_repost ? [["repost", "На мою стену"]] : [])].map(([id, label]) => <button key={id} className={tab === id ? "is-active" : ""} onClick={() => { setTab(id); setNotice(""); setError(""); }} disabled={busy}>{label}</button>)}</nav>
    <FeedError error={error} retry={tab === "message" && !busy ? () => setContactsRetry(value => value + 1) : undefined} />
    {notice && <p className="arena-feed-notice" role="status"><FeedIcon name="check" size={18} />{notice}</p>}
    {tab === "link" ? <div className="arena-feed-form"><p className="arena-feed-muted">Ссылка откроется только у тех, кому автор разрешил просмотр.</p><label>Ссылка<input ref={linkRef} readOnly value={url} onFocus={(event) => event.target.select()} /></label><button className="arena-feed-button is-primary" onClick={copy}><FeedIcon name="link" size={18} />Скопировать ссылку</button></div> :
      <form className="arena-feed-form" onSubmit={submit}>
        {tab === "message" && <><label>Найти получателя<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или никнейм" /></label>
          {loading ? <p role="status">Загружаем диалоги…</p> : <div className="arena-feed-recipient-list" role="group" aria-label="Получатель">{filtered.map((person) => <label key={person.id} className={String(person.id) === recipient ? "is-selected" : ""}><input type="radio" name="recipient" value={person.id} checked={String(person.id) === recipient} onChange={(event) => { setRecipient(event.target.value); setNotice(""); }} disabled={busy || person.can_message === false} required /><FeedAvatar author={person} /><span>{nameOf(person)}{person.can_message === false && <small className="arena-feed-muted"> · Личные сообщения закрыты</small>}</span>{String(person.id) === recipient && <FeedIcon name="check" size={18} />}</label>)}{!filtered.length && <p className="arena-feed-muted">Нет подходящих друзей или диалогов. Новые контакты можно найти в разделе «Друзья».</p>}</div>}
          {recipientUnavailable && <p className="arena-feed-muted" role="status">Получатель закрыл личные сообщения. Ваш текст сохранён до закрытия окна.</p>}
        </>}
        <label>{tab === "repost" ? "Ваш комментарий к репосту" : "Сообщение (необязательно)"}<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={tab === "repost" ? 10000 : 2000} rows={3} disabled={busy} placeholder="Почему это стоит посмотреть?" /></label>
        {tab === "repost" && <AudienceSelect value={audience} onChange={value => { setAudience(value); setNotice(""); }} disabled={busy} />}
        <button className="arena-feed-button is-primary" disabled={busy || loading || (tab === "message" && !recipient) || recipientUnavailable || Boolean(notice)}>{busy ? "Отправляем…" : tab === "repost" ? "Опубликовать репост" : "Отправить"}<FeedIcon name="send" size={18} /></button>
      </form>}
  </FeedDialog>;
}
