import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import Icon, { StarAmount } from "../Icon.jsx";
import { WeekBooking } from "../../pages/RoomHub.jsx";
import PeopleSearch from "../../pages/PeopleSearch.jsx";
import { BadgeArt, ProfilePreview, statusLabel, UserAvatar } from "../cosmetics/CosmeticVisual.jsx";
import "../../pages/friends.css";
import "./friends-workspace.css";

const friendshipEvents = ["arena:friends-changed", "arena:notifications-changed", "arena:feed-access-changed"];
const notifyFriendship = () => friendshipEvents.forEach(name => window.dispatchEvent(new CustomEvent(name)));
const notifyRead = () => window.dispatchEvent(new CustomEvent("arena:notifications-changed"));
const visible = () => document.visibilityState !== "hidden";
const nameOf = person => person.display_name || person.username;
const draftKey = (account, peer) => `arena:message-draft:v1:${encodeURIComponent(account)}:${peer}`;
const memoryDrafts = new Map(), outgoingMessages = new Map();
const sendFinished = "arena:message-send-finished";
function readDraft(key) { if (memoryDrafts.has(key)) return memoryDrafts.get(key); try { const value = JSON.parse(sessionStorage.getItem(key)); return value?.version === 1 && typeof value.text === "string" ? value.text : ""; } catch { return ""; } }
function writeDraft(key, text) { memoryDrafts.set(key, text); try { if (text) sessionStorage.setItem(key, JSON.stringify({ version: 1, text })); else sessionStorage.removeItem(key); } catch { /* In-memory drafts still survive SPA navigation. */ } }
function Avatar({ person, small = false }) { return <UserAvatar avatarCode={person.avatar_code} frameCode={person.frame_code} userId={person.id} size={small ? "sm" : "md"} name={`Аватар ${nameOf(person)}`} />; }

export default function FriendsWorkspace({ section = "messages" }) {
  const { user } = useAuth();
  return <Workspace key={user?.username || "anonymous"} account={user?.username || "anonymous"} section={section === "friends" ? "friends" : "messages"} />;
}

function Workspace({ account, section }) {
  const [params, setParams] = useSearchParams();
  const activeId = section === "messages" ? Number(params.get("chat")) || null : null;
  const [view, setView] = useState("list");
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("friends");
  const [profile, setProfile] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false), overviewVersion = useRef(0), profileVersion = useRef(0), actionPending = useRef(false);
  const nav = useNavigate();
  const loadOverview = useCallback(async () => {
    const version = ++overviewVersion.current;
    try {
      const [friends, conversations] = await Promise.all([api("/api/social/friends"), api("/api/social/dialogs")]);
      if (!mounted.current || version !== overviewVersion.current) return;
      setFriendProfiles(friends); setDialogs(conversations); setError("");
    } catch (failure) { if (mounted.current && version === overviewVersion.current) setError(failure.message || "Не удалось загрузить друзей и чаты."); }
    finally { if (mounted.current && version === overviewVersion.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; loadOverview();
    const refresh = () => { if (visible()) loadOverview(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh); window.addEventListener("arena:friends-changed", refresh);
    const timer = window.setInterval(refresh, 10000);
    return () => { mounted.current = false; overviewVersion.current++; profileVersion.current++; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("arena:friends-changed", refresh); };
  }, [loadOverview]);
  useEffect(() => { setView("list"); setQuery(""); setProfile(null); profileVersion.current++; }, [section]);

  const contacts = useMemo(() => {
    const confirmed = new Map(friendProfiles.filter(person => person.relationship === "FRIENDS").map(person => [person.id, person]));
    return [...dialogs.map(person => ({ ...confirmed.get(person.id), ...person })), ...[...confirmed.values()].filter(person => !dialogs.some(dialog => dialog.id === person.id))];
  }, [dialogs, friendProfiles]);
  const active = contacts.find(person => person.id === activeId) || (selectedContact?.id === activeId ? selectedContact : null);
  const matches = person => `${person.display_name || ""} ${person.username} ${person.preview || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const confirmed = friendProfiles.filter(person => person.relationship === "FRIENDS");
  const incoming = friendProfiles.filter(person => person.relationship === "REQUEST_RECEIVED");
  const outgoing = friendProfiles.filter(person => person.relationship === "REQUEST_SENT");
  const friendsShown = (filter === "incoming" ? incoming : filter === "outgoing" ? outgoing : confirmed).filter(matches);
  const changeParams = update => setParams(current => { const next = new URLSearchParams(current); update(next); return next; });
  function openDialog(person) {
    setSelectedContact(person); setView("list"); setProfile(null); profileVersion.current++;
    changeParams(next => { next.set("section", "messages"); next.set("chat", String(person.id)); });
  }
  function closeDialog() { setProfile(null); profileVersion.current++; changeParams(next => { next.set("section", "messages"); next.delete("chat"); }); loadOverview(); }
  async function showProfile(person) {
    const version = ++profileVersion.current;
    try { const result = await api(`/api/social/people/${encodeURIComponent(person.username)}`); if (mounted.current && version === profileVersion.current) setProfile(result); }
    catch (failure) { if (mounted.current && version === profileVersion.current) setError(failure.message); }
  }
  async function changeFriendship(person, action) {
    if (actionPending.current) return;
    actionPending.current = true; setBusyId(person.id); setError(""); setNotice("");
    try {
      await api(`/api/social/friends/${person.id}/${action}`, { method: "POST" });
      if (!mounted.current) { notifyFriendship(); return; }
      setSelectedContact(null); setProfile(null); profileVersion.current++;
      if (action === "block" && activeId === person.id) closeDialog();
      const labels = { accept: "Заявка принята. Теперь вы друзья.", decline: "Заявка отклонена.", remove: "Пользователь удалён из друзей. Чат сохранён.", block: "Пользователь заблокирован.", unblock: "Пользователь разблокирован. Дружбу можно восстановить новой заявкой." };
      setNotice(labels[action] || "Изменения сохранены."); notifyFriendship();
      if (action === "unblock") setBlocked(current => current.filter(item => item.id !== person.id));
      await loadOverview();
    } catch (failure) { if (mounted.current) setError(failure.message || "Не удалось изменить статус дружбы."); }
    finally { actionPending.current = false; if (mounted.current) setBusyId(null); }
  }
  async function showBlocked() {
    setView("blocked"); setBlockedLoading(true); setError("");
    try { const result = await api("/api/social/blocked"); if (mounted.current) setBlocked(result); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setBlockedLoading(false); }
  }
  const searching = view === "discover";
  return <section className={`social-page friends-workspace${active && view === "list" ? " is-chat-open" : ""}`} aria-label={section === "friends" ? "Мои друзья" : "Мои сообщения"}>
    {section === "friends" && <header className="friends-workspace-heading"><div><h2>Друзья</h2><p>Ваши связи, заявки и новые знакомства.</p></div><button type="button" className={`${searching ? "subtle-button" : "primary-button"} social-find-button`} onClick={() => { setView(searching ? "list" : "discover"); setProfile(null); }}><Icon name={searching ? "arrow-left" : "search"} size={16} />{searching ? "Вернуться к списку" : "Найти людей"}</button></header>}
    {error && <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={view === "blocked" ? showBlocked : loadOverview}>Повторить</button><button type="button" onClick={() => setError("")}>Закрыть</button></div>}
    {notice && <p className="friends-workspace-notice" role="status">{notice}</p>}
    {searching ? <div className="social-discover"><PeopleSearch onOpenChat={openDialog} onChange={loadOverview} /></div> : view === "blocked" ? <div className="social-blocked"><button type="button" className="subtle-button" onClick={() => setView("list")}>← Вернуться к списку</button><BlockedList people={blocked} loading={blockedLoading} busyId={busyId} onUnblock={person => changeFriendship(person, "unblock")} /></div> : section === "friends" ? <div className="friends-directory">
      <div className="friends-directory-tools"><div className="friends-directory-tabs" role="group" aria-label="Списки друзей">{[["friends", "Все друзья", confirmed.length], ["incoming", "Входящие", incoming.length], ["outgoing", "Исходящие", outgoing.length]].map(([id, label, count]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{count}</span></button>)}</div><SearchInput query={query} setQuery={setQuery} label="Найти друга или заявку" /></div>
      {loading ? <p className="social-empty-note" role="status">Загружаем друзей…</p> : friendsShown.length ? <div className="friends-directory-list">{friendsShown.map(person => <FriendRow key={person.id} person={person} busy={busyId !== null} onProfile={showProfile} onMessage={openDialog} onAction={changeFriendship} />)}</div> : <div className="social-empty-note"><b>{query ? (filter === "friends" ? "Среди друзей совпадений нет" : "Заявок не найдено") : filter === "incoming" ? "Новых заявок нет" : filter === "outgoing" ? "Вы не отправляли заявок" : "Добавьте первого друга"}</b><p>{query ? (filter === "friends" ? (query.trim().length >= 2 ? "Результаты поиска среди участников Арены — ниже." : "Введите хотя бы два символа для поиска участников Арены.") : "Попробуйте другое имя или ник.") : filter === "friends" ? "Найдите знакомых или партнёров для переговоров." : "Здесь появятся заявки в друзья."}</p>{!query && filter === "friends" && <button type="button" className="primary-button social-find-button" onClick={() => setView("discover")}>Найти людей</button>}</div>}
      {filter === "friends" && query.trim().length >= 2 && <div className="friends-live-discovery"><PeopleSearch searchQuery={query} hideSearch onOpenChat={openDialog} onChange={loadOverview}/></div>}
      <button type="button" className="social-blocked-link" onClick={showBlocked}>Заблокированные пользователи</button>
    </div> : <div className={`social-workspace${active ? " has-chat" : ""}`}>
      <aside className="social-sidebar" aria-label="Друзья и чаты"><div className="social-sidebar-head"><div><strong>Чаты</strong><span>{contacts.length}</span></div><SearchInput query={query} setQuery={setQuery} label="Найти друга или чат" /></div><div className="social-contact-scroll">{loading ? <p className="social-empty-note" role="status">Загружаем чаты…</p> : contacts.filter(matches).length ? contacts.filter(matches).map(person => <ContactRow key={person.id} person={person} selected={activeId === person.id} onClick={() => openDialog(person)} />) : <div className="social-empty-note"><b>{query ? "Никого не найдено" : "Здесь пока нет чатов"}</b><p>{query ? "Попробуйте другое имя." : "Добавьте друга, чтобы начать разговор."}</p></div>}</div><button type="button" className="social-blocked-link" onClick={showBlocked}>Заблокированные пользователи</button></aside>
      <div className="social-conversation">{active ? <Conversation key={`${account}:${active.id}`} account={account} active={active} onClose={closeDialog} onOverview={loadOverview} onProfile={showProfile} onInviteFriend={mode => nav(`/rooms?friend=${active.id}&mode=${mode}`)} onOpenRoom={id => nav(`/room/${id}`)} onOpenRooms={code => nav(typeof code === "string" ? `/rooms?code=${encodeURIComponent(code)}` : "/rooms")} /> : <EmptyConversation loading={loading} missing={Boolean(activeId)} onRetry={loadOverview} />}</div>
      {!active && activeId && !loading && <p className="friends-missing-chat" role="status">Диалог недоступен. Проверьте список друзей или выберите другой чат.</p>}
    </div>}
    {profile && <ProfilePanel key={profile.id} person={profile} busy={busyId !== null} error={error} onClose={() => { profileVersion.current++; setProfile(null); }} onAction={changeFriendship} onMessage={openDialog} />}
  </section>;
}

function SearchInput({ query, setQuery, label }) { return <label className="social-search"><Icon name="search" size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Введите имя или ник" aria-label={label} /></label>; }
function FriendRow({ person, busy, onProfile, onMessage, onAction }) {
  const incoming = person.relationship === "REQUEST_RECEIVED", confirmed = person.relationship === "FRIENDS";
  return <article className="friends-directory-row"><button type="button" className="friends-directory-person" onClick={() => onProfile(person)}><Avatar person={person} small /><span><strong>{nameOf(person)}</strong><small>@{person.username}</small><span>{confirmed ? person.specialization || "Друг на Арене" : incoming ? "Хочет добавить вас в друзья" : "Заявка отправлена · ожидаем ответа"}</span></span></button><div className="friends-directory-actions">{confirmed ? <><button type="button" className="subtle-button" onClick={() => onMessage(person)}>{person.can_message === false ? "Чат" : "Написать"}</button><button type="button" className="subtle-button" onClick={() => onProfile(person)} aria-label={`Действия: ${nameOf(person)}`}><span aria-hidden="true">•••</span></button></> : incoming ? <><button type="button" className="primary-button" disabled={busy} onClick={() => onAction(person, "accept")}>Принять</button><button type="button" className="subtle-button" disabled={busy} onClick={() => onAction(person, "decline")}>Отклонить</button></> : <button type="button" className="subtle-button" onClick={() => onProfile(person)}>Профиль</button>}</div></article>;
}
function BlockedList({ people, loading, busyId, onUnblock }) { return <section className="social-blocked-list"><h2>Заблокированные</h2><p>Эти пользователи не могут писать вам и приглашать в переговоры.</p>{loading ? <p role="status">Загружаем список…</p> : people.map(person => <div key={person.id} className="social-blocked-row"><Avatar person={person} small /><span><strong>{nameOf(person)}</strong><small>@{person.username}</small></span><button type="button" disabled={busyId !== null} onClick={() => onUnblock(person)}>Разблокировать</button></div>)}{!loading && !people.length && <p className="social-empty-note">Список пуст.</p>}</section>; }
function ContactRow({ person, selected, onClick }) { return <button type="button" className={`social-contact${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined} onClick={onClick}><Avatar person={person} small /><span className="social-contact-copy"><span className="social-contact-first"><strong>{nameOf(person)}</strong>{Number(person.unread) > 0 && <span className="friends-unread" aria-label={`Непрочитанных: ${person.unread}`}>{person.unread}</span>}</span><span className="social-contact-meta">@{person.username}</span><span className="social-contact-detail">{person.preview || (person.can_message === false ? "Чат доступен для чтения" : "Написать сообщение")}</span></span><span className="social-contact-arrow" aria-hidden="true">›</span></button>; }
function EmptyConversation({ loading, missing, onRetry }) {
  if (loading) return <div className="social-welcome"><h2 role="status">Загружаем контакты…</h2></div>;
  if (missing) return <div className="social-welcome"><h2>Диалог недоступен</h2><p>Пользователь должен быть вашим другом или участником существующего чата.</p><button type="button" className="social-find-button" onClick={onRetry}>Проверить ещё раз</button></div>;
  return <div className="social-welcome"><Icon name="message-circle" size={44} /><h2>Выберите чат</h2></div>;
}

function Conversation({ account, active, onClose, onOverview, onProfile, onInviteFriend, onOpenRoom, onOpenRooms }) {
  const key = draftKey(account, active.id);
  const [text, setText] = useState(() => readDraft(key));
  const [messages, setMessages] = useState(null), [threadError, setThreadError] = useState(""), [notice, setNotice] = useState("");
  const [sending, setSending] = useState(() => outgoingMessages.has(key));
  const mounted = useRef(false), version = useRef(0), textRef = useRef(text), requests = useRef(new Set());
  const messagesRef = useRef(null), stickToBottom = useRef(true), busyRefresh = useRef(false);
  const denied = active.can_message === false;
  const setDraft = value => { textRef.current = value; setText(value); writeDraft(key, value); };
  const refresh = useCallback(async (force = false) => {
    if (!visible() || !mounted.current || (busyRefresh.current && !force)) return;
    const current = ++version.current; busyRefresh.current = true;
    const valid = () => mounted.current && current === version.current && visible();
    try {
      let result = await api(`/api/social/messages/${active.id}?mark_read=false`);
      if (!valid()) return;
      setMessages(result); setThreadError("");
      if (result.some(message => Number(message.sender_id) === Number(active.id) && !message.is_read)) {
        result = await api(`/api/social/messages/${active.id}?mark_read=true`);
        if (!valid()) return;
        setMessages(result); notifyRead(); onOverview();
      }
    } catch (failure) { if (valid()) { setThreadError(failure.message || "Не удалось открыть чат."); setMessages([]); } }
    finally { if (current === version.current) busyRefresh.current = false; }
  }, [active.id, onOverview]);
  useEffect(() => {
    mounted.current = true;
    const completed = event => {
      if (event.detail.key !== key) return;
      const { original, message, error } = event.detail;
      setSending(false);
      if (error) { setNotice(error); return; }
      if (textRef.current === original) { textRef.current = ""; setText(""); }
      version.current++; busyRefresh.current = false; stickToBottom.current = true;
      setMessages(current => [...(current || []).filter(item => item.id !== message.id), message]);
      onOverview(); refresh(true);
    };
    window.addEventListener(sendFinished, completed); refresh(true);
    const resume = () => { if (visible()) refresh(true); else { version.current++; busyRefresh.current = false; } };
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    const timer = window.setInterval(() => refresh(), 5000);
    return () => { mounted.current = false; version.current++; window.clearInterval(timer); window.removeEventListener(sendFinished, completed); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [key, onOverview, refresh]);
  useEffect(() => { if (stickToBottom.current && messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [messages?.length]);
  async function send() {
    const value = textRef.current.trim();
    if (!value || denied || outgoingMessages.has(key) || messages === null || threadError) return;
    const original = textRef.current; outgoingMessages.set(key, original); setSending(true); setNotice("");
    try {
      const message = await api(`/api/social/messages/${active.id}`, { method: "POST", body: { text: value } });
      if (readDraft(key) === original) writeDraft(key, "");
      outgoingMessages.delete(key);
      window.dispatchEvent(new CustomEvent(sendFinished, { detail: { key, original, message } }));
    } catch (failure) {
      outgoingMessages.delete(key);
      window.dispatchEvent(new CustomEvent(sendFinished, { detail: { key, error: failure.message || "Сообщение не удалось отправить. Текст сохранён." } }));
    }
  }
  async function invitation(message, action) {
    if (requests.current.has(message.id)) return;
    requests.current.add(message.id); setNotice("");
    try {
      const result = await api(`/api/social/invitations/${message.id}/${action}`, { method: "POST" });
      if (!mounted.current) return;
      refresh(true); onOverview(); notifyRead();
      if (action === "accept" && result.room_id) onOpenRoom(result.room_id);
    } catch (failure) { if (mounted.current) setNotice(failure.message || "Не удалось обновить приглашение."); }
    finally { requests.current.delete(message.id); }
  }
  return <section className="friends-chat social-chat" aria-label={`Чат с ${nameOf(active)}`}><header className="social-chat-header"><button type="button" className="social-chat-back" onClick={onClose} aria-label="Назад к чатам">←</button><button type="button" onClick={() => onProfile(active)} className="social-chat-person"><Avatar person={active} small /><span><strong>{nameOf(active)}</strong><small>{active.status_code ? statusLabel(active.status_code) : `@${active.username}`}{active.badge_code && <BadgeArt code={active.badge_code} size={14} />}</small></span></button>{active.relationship === "FRIENDS" && (denied ? <button type="button" className="social-invite-button" disabled>Пригласить</button> : <details className="social-invite-menu"><summary className="social-invite-button">Пригласить <Icon name="chevron-down" size={16}/></summary><div><button type="button" onClick={() => onInviteFriend("human")}><strong>Переговоры</strong><span>Встреча один на один</span></button><button type="button" onClick={() => onInviteFriend("duel")}><strong>Соревнование</strong><span>Трудоустройство с ИИ · 1×1</span></button></div></details>)}</header>
    {notice && <p role="status" className="social-chat-notice">{notice}</p>}
    <div ref={messagesRef} onScroll={event => { const node = event.currentTarget; stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }} className="social-messages" aria-busy={messages === null}>{threadError ? <div className="social-chat-state" role="alert"><strong>Чат не загрузился</strong><p>{threadError}</p><button type="button" onClick={() => refresh(true)}>Попробовать снова</button></div> : messages === null ? <div className="social-chat-state" role="status">Открываем разговор…</div> : messages.map(message => {
      const mine = Number(message.receiver_id) === Number(active.id);
      if (message.type === "POST_SHARE") return <SharedPostMessage key={message.id} message={message} mine={mine} />;
      if (message.type === "ONLINE_INVITE" || message.type === "CHALLENGE_INVITE") return <InvitationCard key={message.id} message={message} mine={mine} onAccept={item => invitation(item, "accept")} onUpdate={invitation} />;
      if (message.type === "ROOM_INVITATION") return <BookedInvitationCard key={message.id} message={message} mine={mine} onOpen={() => mine ? onOpenRoom(message.payload?.room_id) : onOpenRooms(message.payload?.code)} />;
      if (message.type === "ROOM_CREATED") return <RoomCreatedCard key={message.id} message={message} onOpenRoom={onOpenRoom} />;
      if (message.type === "ROOM_REMINDER") return <article key={message.id} className="social-room-reminder" role="status"><span className="social-room-reminder-icon"><Icon name="calendar-days" size={23} /></span><div><small>ВСТРЕЧА ЧЕРЕЗ 15 МИНУТ</small><strong>{message.payload?.title || "Переговоры 1×1"}</strong><p>Лобби открыто для обоих участников.</p>{message.payload?.room_id && <button type="button" onClick={() => onOpenRoom(message.payload.room_id)}>Перейти к встрече →</button>}</div></article>;
      return <div key={message.id} className={`social-message${mine ? " is-mine" : ""}`}><div><p>{message.text}</p><small>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}{mine && message.is_read ? " · Прочитано" : ""}</small></div></div>;
    })}{messages?.length === 0 && !threadError && <div className="social-chat-state"><strong>Пока нет сообщений</strong><p>Напишите первым — разговор появится здесь.</p></div>}</div>
    {denied && <p className="social-chat-notice" id={`message-permission-${active.id}`}>Пользователь ограничил личные сообщения. История чата остаётся доступной.</p>}
    <form className="friends-chat-composer social-composer" onSubmit={event => { event.preventDefault(); send(); }}><textarea aria-label="Сообщение" aria-describedby={denied ? `message-permission-${active.id}` : undefined} disabled={denied} value={text} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} maxLength={2000} placeholder="Написать сообщение…" rows={2} /><button type="submit" disabled={denied || sending || messages === null || !text.trim() || Boolean(threadError)} aria-label="Отправить сообщение"><Icon name={sending ? "hourglass" : "send"} size={20} /></button></form>
  </section>;
}

function SharedPostMessage({ message, mine }) {
  const post = message.payload?.available ? message.payload.post : null;
  return <div className={`social-message${mine ? " is-mine" : ""}`}><article className="social-shared-post">
    {message.text && !["Публикация", "Публикация Арены"].includes(message.text) && <p>{message.text}</p>}
    <span className="social-shared-post-label">Публикация из сообщества</span>
    {post ? <>
      <b>{post.company?.name || post.author?.display_name || post.author?.username || "Автор"}</b>
      <p>{post.body || post.linked_content?.title || "Материал Арены"}</p>
      <Link to={`/feed/post/${post.id}`}>Открыть публикацию →</Link>
    </> : <p>Публикация недоступна</p>}
    <small>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}{mine && message.is_read ? " · Прочитано" : ""}</small>
  </article></div>;
}

function BookedInvitationCard({ message, mine, onOpen }) {
  const [local,setLocal]=useState(null),[notice,setNotice]=useState(""),[choosing,setChoosing]=useState(false),[slots,setSlots]=useState(null),[time,setTime]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>setLocal(null),[message.payload?.status,message.payload?.scheduled_at]);
  const payload=local||message.payload||{},status=payload.status||"pending";
  const labels={pending:"Ожидает принятия",accepted:"Участие подтверждено",declined:"Приглашение отклонено",cancelled:"Встреча отменена",expired:"Время встречи прошло",active:"Встреча идёт",processing:"Готовится разбор",finished:"Встреча завершена",unavailable:"Место уже занято",time_proposed:"Предложено другое время"};
  const terminal=["declined","cancelled","expired","unavailable"].includes(status);
  const when=value=>new Date(value).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})+" московское время";
  async function reply(action){setBusy(true);setNotice("");try{setLocal(await api(`/api/social/booked-invitations/${message.id}/${action}`,{method:"POST",body:{scheduled_at:time||null}}));setChoosing(false);}catch(e){setNotice(e.message);}finally{setBusy(false);}}
  async function chooseTime(){setNotice("");try{setSlots(await api("/api/rooms/availability"));setChoosing(true);}catch(e){setNotice(e.message);}}
  return <article className="social-booked-invite"><div><small>{mine?"ВЫ ПРИГЛАСИЛИ ДРУГА":"ВАС ПРИГЛАСИЛИ"} · {labels[status]}</small><strong>{payload.mode==="duel"?"Трудоустройство с ИИ · 1×1":"Переговоры 1×1"}</strong><p>{payload.title||"Встреча с другом"}</p>{payload.scheduled_at&&<time>{when(payload.scheduled_at)}</time>}{payload.proposed_at&&status==="time_proposed"&&<p>Предложение: {when(payload.proposed_at)}</p>}
    {!terminal&&<button disabled={busy} type="button" onClick={onOpen}>{status==="finished"?"Открыть разбор":mine||status==="accepted"?"Открыть встречу":"Посмотреть условия и принять"} →</button>}
    {!mine&&["pending","time_proposed"].includes(status)&&<div className="practice-actions"><button disabled={busy} onClick={()=>reply("decline")}>Отклонить</button><button disabled={busy} onClick={chooseTime}>Предложить время</button></div>}
    {mine&&status==="time_proposed"&&<button disabled={busy} onClick={()=>reply("accept-time")}>Подтвердить новое время</button>}
    {choosing&&slots&&<div><WeekBooking value={time} duration={payload.mode==="duel"?60:payload.duration_minutes||15} availability={slots} onChange={setTime}/><div className="practice-actions"><button disabled={!time||busy} onClick={()=>reply("propose")}>Отправить предложение</button><button onClick={()=>setChoosing(false)}>Закрыть</button></div></div>}
    {notice&&<p role="alert">{notice}</p>}</div></article>;
}

function InvitationCard({ message, mine, onAccept, onUpdate }) {
  const [busy, setBusy] = useState(false);
  async function act(action) { if (busy) return; setBusy(true); try { if (action === "accept") await onAccept(message); else await onUpdate(message, action); } finally { setBusy(false); } }
  const payload = message.payload || {};
  const title = payload.kind === "challenge" ? "Приглашение на соревнование" : "Приглашение в переговоры";
  const accepted = payload.status === "accepted";
  const pending = payload.status === "pending";
  return <article className="mx-auto max-w-md rounded-2xl border border-lime-300/30 bg-lime-400/10 p-4 text-center">
    <b className="block text-lime-100">{title}</b>
    <div className="mt-3 space-y-1 text-left text-sm text-slate-200"><p><span className="text-slate-400">Формат:</span> {payload.mode === "duel" ? "соревнование с ИИ" : "переговоры 1 на 1"}</p><p><span className="text-slate-400">Условия:</span> {payload.problem}</p><p><span className="text-slate-400">Цель:</span> {payload.goal}</p></div>
    <div className="mt-4 flex flex-wrap justify-center gap-2">{accepted ? <span className="social-invite-status is-accepted">Приглашение принято</span> : pending && mine ? <><span className="text-sm text-slate-400">Ожидаем решения</span><button type="button" disabled={busy} className="subtle-button text-sm" onClick={() => act("cancel")}>Отменить</button></> : pending ? <><button type="button" disabled={busy} className="primary-button text-sm" onClick={() => act("accept")}>{busy ? "Сохраняем…" : "Принять"}</button><button type="button" disabled={busy} className="subtle-button text-sm" onClick={() => act("decline")}>Отклонить</button></> : <span className="text-sm text-slate-400">Статус: {payload.status === "declined" ? "отклонено" : payload.status === "cancelled" ? "отменено" : payload.status}</span>}</div>
    <small className="mt-3 block text-slate-400">{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small>
  </article>;
}

function RoomCreatedCard({ message, onOpenRoom }) {
  return <article className="social-room-ready"><b>Комната создана</b><p>Можно переходить к переговорам.</p><button className="subtle-button" onClick={() => onOpenRoom(message.payload?.room_id)}>Открыть комнату</button></article>;
}

function ProfilePanel({ person, onClose, onAction, onMessage, busy, error }) {
  const close = () => { if (!busy) onClose(); };
  const dialogRef = useDialogFocus(close);
  const [confirmation, setConfirmation] = useState("");
  const name = nameOf(person);
  return createPortal(<div className="friends-profile-backdrop"><article ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="friend-profile-title" className="friends-profile-panel">
    <header><div><h2 id="friend-profile-title">{name}</h2><p>@{person.username}</p></div><button type="button" disabled={busy} aria-label="Закрыть профиль" onClick={close}><Icon name="x" size={20} /></button></header>
    <ProfilePreview equipment={person} username={name} level={person.rank} stars={person.stars} userId={person.id} compact />
    <p>{person.about || "Пользователь ещё не рассказал о себе."}</p>
    <div className="friends-profile-stats"><Info value={person.xp ?? "—"} label="опыт обучения" /><Info value={<StarAmount value={person.stars} />} label="звёзды" /><Info value={person.sessions_total ?? "—"} label="переговоров" /></div>
    {person.specialization && <p>Специализация: {person.specialization}</p>}
    <Link className="friends-profile-link" to={`/people/${encodeURIComponent(person.username)}`}>Открыть полный профиль →</Link>
    {error && <p className="product-error" role="alert">{error}</p>}
    <div className="friends-profile-actions">
      {confirmation ? <><p>{confirmation === "block" ? "Заблокировать пользователя? Новые сообщения и приглашения станут недоступны." : "Удалить из друзей? Доступ к публикациям для друзей изменится. Чат сохранится."}</p><button type="button" disabled={busy} onClick={() => setConfirmation("")}>Отмена</button><button type="button" disabled={busy} onClick={() => onAction(person, confirmation)}>{busy ? "Сохраняем…" : confirmation === "block" ? "Заблокировать" : "Удалить из друзей"}</button></> : <>
        {person.relationship === "FRIENDS" && <><button type="button" onClick={() => onMessage(person)}>Открыть чат</button><button type="button" onClick={() => setConfirmation("remove")}>Удалить из друзей</button></>}
        {person.relationship === "REQUEST_RECEIVED" && <><button type="button" disabled={busy} onClick={() => onAction(person, "accept")}>Принять заявку</button><button type="button" disabled={busy} onClick={() => onAction(person, "decline")}>Отклонить заявку</button></>}
        <button type="button" onClick={() => setConfirmation("block")}>Заблокировать пользователя</button>
      </>}
    </div>
  </article></div>, document.body);
}
function Info({ value, label }) { return <div className="rounded-2xl bg-white/5 p-3"><b className="block text-lime-100">{value}</b><small className="text-slate-400">{label}</small></div>; }

function useDialogFocus(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') || [])];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, []);
  return ref;
}
