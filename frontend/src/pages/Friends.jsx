import PageHeader from "../design/PageHeader.jsx";
import Icon, { StarAmount } from "../components/Icon.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { WeekBooking } from "./RoomHub.jsx";
import PeopleSearch from "./PeopleSearch.jsx";
import { BadgeArt, badgeLabel, ProfilePreview, statusLabel, UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import "./friends.css";

function Avatar({ person, small = false }) {
  const name = person.display_name || person.username;
  return <UserAvatar avatarCode={person.avatar_code} frameCode={person.frame_code} userId={person.id} size={small ? "sm" : "md"} name={`Аватар ${name}`} />;
}

export default function Friends() {
  const [params, setParams] = useSearchParams();
  const activeId = Number(params.get("chat")) || null;
  const [view, setView] = useState("inbox");
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [messages, setMessages] = useState(null);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [profile, setProfile] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [error, setError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const nav = useNavigate();

  const loadOverview = useCallback(async () => {
    const [friends, conversations] = await Promise.all([api("/api/social/friends"), api("/api/social/dialogs")]);
    setFriendProfiles(friends);
    setDialogs(conversations);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOverview().catch((failure) => { setError(failure.message); setLoading(false); });
    const onFocus = () => loadOverview().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadOverview]);

  const contacts = useMemo(() => {
    const confirmed = new Map(friendProfiles.filter((person) => person.relationship === "FRIENDS").map((person) => [person.id, person]));
    const withMessages = dialogs.map((dialog) => ({ ...confirmed.get(dialog.id), ...dialog }));
    return [...withMessages, ...[...confirmed.values()].filter((person) => !dialogs.some((dialog) => dialog.id === person.id))];
  }, [dialogs, friendProfiles]);
  const requests = friendProfiles.filter((person) => person.relationship === "REQUEST_RECEIVED" || person.relationship === "REQUEST_SENT");
  const activeContact = contacts.find((person) => person.id === activeId);
  const active = activeProfile?.id === activeId ? { ...activeContact, ...activeProfile } : activeContact;
  const filtered = contacts.filter((person) => `${person.display_name || ""} ${person.username} ${person.preview || ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!activeId || !activeContact) { setMessages(null); setThreadError(""); return undefined; }
    let cancelled = false;
    let lastMessageCount = -1;
    setMessages(null); setThreadError(""); setActiveProfile(null);
    const refresh = async (initial = false) => {
      try {
        const [conversation, currentProfile] = await Promise.all([
          api(`/api/social/messages/${activeId}`, { method: "GET" }),
          api(`/api/social/people/${activeContact.username}`).catch(() => null),
        ]);
        if (cancelled) return;
        setMessages(conversation);
        if (initial || conversation.length !== lastMessageCount) window.dispatchEvent(new CustomEvent("arena:notifications-changed"));
        lastMessageCount = conversation.length;
        if (currentProfile) setActiveProfile(currentProfile);
        setThreadError("");
        if (initial) loadOverview().catch(() => {});
      } catch (failure) {
        if (!cancelled && initial) { setThreadError(failure.message || "Не удалось открыть переписку."); setMessages([]); }
      }
    };
    refresh(true);
    const interval = window.setInterval(() => refresh(), 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeId, activeContact?.username, retryKey, loadOverview]);

  function openDialog(person) { setView("inbox"); setProfile(null); if (activeId === person.id) setRetryKey((value) => value + 1); else setParams({ chat: String(person.id) }); }
  function closeDialog() { setParams({}, { replace: true }); setProfile(null); setActiveProfile(null); loadOverview().catch(() => {}); }
  async function reloadConversation() {
    if (!activeId) return;
    setMessages(await api(`/api/social/messages/${activeId}`));
    window.dispatchEvent(new CustomEvent("arena:notifications-changed"));
    await loadOverview();
  }

  async function send() {
    const value = text.trim();
    if (!value || !active) return;
    await api(`/api/social/messages/${active.id}`, { method: "POST", body: { text: value } });
    setText("");
    await reloadConversation();
  }
  async function acceptInvitation(message) {
    const result = await api(`/api/social/invitations/${message.id}/accept`, { method: "POST" });
    await reloadConversation();
    return result.room_id;
  }
  async function showProfile(friend) {
    try { setProfile(await api(`/api/social/people/${friend.username}`)); }
    catch (failure) { setError(failure.message); }
  }
  async function updateInvitation(message, action) {
    await api(`/api/social/invitations/${message.id}/${action}`, { method: "POST" });
    await reloadConversation();
  }
  async function blockPerson(person) {
    await api(`/api/social/friends/${person.id}/block`, { method: "POST" });
    closeDialog();
    await loadOverview();
  }
  async function unblockPerson(person) {
    await api(`/api/social/friends/${person.id}/unblock`, { method: "POST" });
    setBlocked(await api("/api/social/blocked"));
    await loadOverview();
  }
  async function acceptRequest(person) {
    try { await api(`/api/social/friends/${person.id}/accept`, { method: "POST" }); await loadOverview(); }
    catch (failure) { setError(failure.message); }
  }
  async function showBlocked() {
    setView("blocked");
    try { setBlocked(await api("/api/social/blocked")); setError(""); }
    catch (failure) { setError(failure.message); }
  }

  return <section className={`social-page${active && view === "inbox" ? " is-chat-open" : ""}`}>
    <PageHeader className="social-heading" eyebrow="Сообщество" title="Друзья и сообщения" description="Выберите человека, чтобы продолжить разговор." aside={<button type="button" className="subtle-button" onClick={() => { closeDialog(); setView(view === "discover" ? "inbox" : "discover"); }}>{view === "discover" ? "← К друзьям" : "Найти людей →"}</button>} />
    {error && <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={() => loadOverview().catch((failure) => setError(failure.message))}>Повторить</button></div>}
    {view === "discover" ? <div className="social-discover"><PeopleSearch onOpenChat={openDialog} onChange={loadOverview} /></div> : view === "blocked" ? <div className="social-blocked"><button type="button" onClick={() => setView("inbox")}>← К друзьям</button><BlockedList people={blocked} onUnblock={unblockPerson} /></div> : <div className={`social-workspace${active ? " has-chat" : ""}`}>
      <aside className="social-sidebar" aria-label="Друзья и переписки">
        <div className="social-sidebar-head"><div><strong>Ваши люди</strong><span>{contacts.length}</span></div><label className="social-search"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти в списке" aria-label="Найти друга или переписку" /></label></div>
        <div className="social-contact-scroll">
          {loading ? <p className="social-empty-note" role="status">Загружаем друзей…</p> : filtered.length ? filtered.map((person) => <ContactRow key={person.id} person={person} selected={activeId === person.id} onClick={() => openDialog(person)} />) : <div className="social-empty-note"><b>{query ? "Никого не найдено" : "Здесь пока никого нет"}</b><p>{query ? "Попробуйте другое имя." : "Найдите партнёра и начните общение."}</p></div>}
          {requests.length > 0 && !query && <div className="social-requests"><h2>Заявки <span>{requests.length}</span></h2>{requests.map((person) => <div className="social-request" key={person.id}><Avatar person={person} small /><div><strong>{person.display_name || person.username}</strong><small>{person.relationship === "REQUEST_RECEIVED" ? "Хочет добавить вас в друзья" : "Ожидаем ответа"}</small></div>{person.relationship === "REQUEST_RECEIVED" && <button type="button" onClick={() => acceptRequest(person)}>Принять</button>}</div>)}</div>}
        </div>
        <button type="button" className="social-blocked-link" onClick={showBlocked}>Заблокированные пользователи</button>
      </aside>
      <div className="social-conversation">{active ? <ChatScreen active={active} messages={messages} threadError={threadError} text={text} setText={setText} onClose={closeDialog} onRetry={() => setRetryKey((value) => value + 1)} onSend={send} onProfile={showProfile} onBookWithFriend={() => nav(`/rooms?friend=${active.id}`)} onAcceptInvitation={acceptInvitation} onUpdateInvitation={updateInvitation} onOpenRoom={(id) => nav(`/room/${id}`)} onOpenRooms={(code) => nav(typeof code === "string" ? `/rooms?code=${encodeURIComponent(code)}` : "/rooms")} /> : <EmptyConversation loading={loading} missing={Boolean(activeId)} />}</div>
    </div>}
    {profile && <ProfilePanel person={profile} onClose={() => setProfile(null)} onBlock={blockPerson} />}
  </section>;
}

function BlockedList({ people, onUnblock }) {
  return <section className="social-blocked-list"><h2>Заблокированные</h2><p>Эти пользователи не могут писать вам и приглашать в переговоры.</p>{people.map((person) => <div key={person.id} className="social-blocked-row"><Avatar person={person} small /><span><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span><button type="button" onClick={() => onUnblock(person)}>Разблокировать</button></div>)}{!people.length && <p className="social-empty-note">Список пуст.</p>}</section>;
}

function ContactRow({ person, selected, onClick }) {
  const name = person.display_name || person.username;
  return <button type="button" className={`social-contact${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined} onClick={onClick}>
    <Avatar person={person} small />
    <span className="social-contact-copy"><span className="social-contact-first"><strong>{name}</strong></span><span className="social-contact-meta">Уровень {person.rank || 1}{person.stars != null && <> · <StarAmount value={person.stars} /></>}{person.xp != null ? ` · ${person.xp} опыта` : ""}</span><span className="social-contact-detail">{person.status_code ? statusLabel(person.status_code) : person.preview || (person.relationship === "FRIENDS" ? "Написать сообщение" : "Продолжить диалог")}{person.badge_code && <BadgeArt code={person.badge_code} size={13} />}</span></span>
    <span className="social-contact-arrow" aria-hidden="true">›</span>
  </button>;
}

function EmptyConversation({ loading, missing }) {
  return <div className="social-welcome"><div className="social-welcome-mark" aria-hidden="true"><Icon name="message-circle" size={62} /></div><div className="eyebrow">РАЗГОВОРЫ НА АРЕНЕ</div><h2>{loading ? "Загружаем контакты…" : missing ? "Не удалось открыть чат" : "Начните разговор"}</h2><p>{missing ? "Проверьте, что пользователь есть в списке переписок или друзей." : "Выберите друга слева или найдите нового собеседника."}</p></div>;
}

function ChatScreen({ active, messages, threadError, text, setText, onClose, onRetry, onSend, onProfile, onBookWithFriend, onAcceptInvitation, onUpdateInvitation, onOpenRoom, onOpenRooms }) {
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);
  const stickToBottom = useRef(true);
  useEffect(() => { stickToBottom.current = true; if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [active.id]);
  useEffect(() => { if (stickToBottom.current && messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [messages?.length]);
  async function sendMessage() {
    if (sending || !text.trim()) return;
    try { setSending(true); setNotice(""); await onSend(); } catch (error) { setNotice(error.message || "Сообщение не удалось отправить"); } finally { setSending(false); }
  }
  async function accept(message) {
    try { setNotice(""); const roomId = await onAcceptInvitation(message); setNotice("Комната создана. Вы можете приступить к переговорам."); onOpenRoom(roomId); } catch (error) { setNotice(error.message || "Не удалось принять приглашение"); }
  }
  return <section className="friends-chat social-chat">
      <header className="social-chat-header">
        <button type="button" className="social-chat-back" onClick={onClose} aria-label="Назад к друзьям">←</button>
        <button type="button" onClick={() => onProfile(active)} className="social-chat-person"><Avatar person={active} small /><span><strong>{active.display_name || active.username}</strong><small>{active.status_code ? statusLabel(active.status_code) : `@${active.username}`}{active.badge_code && <BadgeArt code={active.badge_code} size={14} />}</small></span></button>
        {active.relationship === "FRIENDS" && <button type="button" className="social-invite-button" onClick={onBookWithFriend}>1 на 1 <span aria-hidden="true">↗</span></button>}
      </header>
      {notice && <p role="status" className="social-chat-notice">{notice}</p>}
      <div ref={messagesRef} onScroll={(event) => { const node = event.currentTarget; stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }} className="social-messages">{threadError ? <div className="social-chat-state" role="alert"><strong>Чат не загрузился</strong><p>{threadError}</p><button type="button" onClick={onRetry}>Попробовать снова</button></div> : messages === null ? <div className="social-chat-state" role="status">Открываем разговор…</div> : messages.map((message) => {
        const mine = Number(message.receiver_id) === Number(active.id);
        if (message.type === "ONLINE_INVITE" || message.type === "CHALLENGE_INVITE") return <InvitationCard key={message.id} message={message} mine={mine} onAccept={accept} onUpdate={onUpdateInvitation} />;
        if (message.type === "ROOM_INVITATION") return <BookedInvitationCard key={message.id} message={message} mine={mine} onOpen={() => mine ? onOpenRoom(message.payload?.room_id) : onOpenRooms(message.payload?.code)} />;
        if (message.type === "ROOM_CREATED") return <RoomCreatedCard key={message.id} message={message} onOpenRoom={onOpenRoom} />;
        if (message.type === "ROOM_REMINDER") return <article key={message.id} className="social-room-reminder" role="status">
          <span className="social-room-reminder-icon"><Icon name="calendar-days" size={23} /></span>
          <div><small>ВСТРЕЧА ЧЕРЕЗ 15 МИНУТ</small><strong>{message.payload?.title || "Переговоры 1×1"}</strong><p>Лобби открыто для обоих участников.</p>
            {message.payload?.room_id && <button type="button" onClick={() => onOpenRoom(message.payload.room_id)}>Перейти к встрече →</button>}
          </div>
        </article>;
        return <div key={message.id} className={`social-message${mine ? " is-mine" : ""}`}><div><p>{message.text}</p><small>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}{mine && message.is_read ? " · Прочитано" : ""}</small></div></div>;
      })}{messages?.length === 0 && !threadError && <div className="social-chat-state"><strong>Пока нет сообщений</strong><p>Напишите первым — разговор появится здесь.</p></div>}</div>
      <form className="friends-chat-composer social-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><textarea aria-label="Сообщение" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} placeholder="Написать сообщение…" rows={1} /><button type="submit" disabled={sending || messages === null || !text.trim() || Boolean(threadError)} aria-label="Отправить сообщение"><Icon name={sending ? "hourglass" : "send"} size={20} /></button></form>
  </section>;
}

function BookedInvitationCard({ message, mine, onOpen }) {
  const [local,setLocal]=useState(null),[notice,setNotice]=useState(""),[choosing,setChoosing]=useState(false),[slots,setSlots]=useState(null),[time,setTime]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>setLocal(null),[message.payload?.status,message.payload?.scheduled_at]);
  const payload=local||message.payload||{},status=payload.status||"pending";
  const labels={pending:"Ожидает принятия",accepted:"Участие подтверждено",declined:"Приглашение отклонено",cancelled:"Встреча отменена",expired:"Время встречи прошло",active:"Встреча идёт",processing:"Готовится разбор",finished:"Встреча завершена",unavailable:"Место уже занято",time_proposed:"Предложено другое время"};
  const terminal=["declined","cancelled","expired","unavailable"].includes(status);
  const when=value=>new Date(value).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})+" МСК";
  async function reply(action){setBusy(true);setNotice("");try{setLocal(await api(`/api/social/booked-invitations/${message.id}/${action}`,{method:"POST",body:{scheduled_at:time||null}}));setChoosing(false);}catch(e){setNotice(e.message);}finally{setBusy(false);}}
  async function chooseTime(){setNotice("");try{setSlots(await api("/api/rooms/availability"));setChoosing(true);}catch(e){setNotice(e.message);}}
  return <article className="social-booked-invite"><div><small>{mine?"ВЫ ПРИГЛАСИЛИ ДРУГА":"ВАС ПРИГЛАСИЛИ"} · {labels[status]}</small><strong>{payload.mode==="duel"?"Два интервью с ИИ":"Переговоры 1×1"}</strong><p>{payload.title||"Встреча с другом"}</p>{payload.scheduled_at&&<time>{when(payload.scheduled_at)}</time>}{payload.proposed_at&&status==="time_proposed"&&<p>Предложение: {when(payload.proposed_at)}</p>}
    {!terminal&&<button disabled={busy} type="button" onClick={onOpen}>{status==="finished"?"Открыть разбор":mine||status==="accepted"?"Открыть встречу":"Посмотреть условия и принять"} →</button>}
    {!mine&&["pending","time_proposed"].includes(status)&&<div className="practice-actions"><button disabled={busy} onClick={()=>reply("decline")}>Отклонить</button><button disabled={busy} onClick={chooseTime}>Предложить время</button></div>}
    {mine&&status==="time_proposed"&&<button disabled={busy} onClick={()=>reply("accept-time")}>Подтвердить новое время</button>}
    {choosing&&slots&&<div><WeekBooking value={time} duration={payload.mode==="duel"?60:payload.duration_minutes||15} availability={slots} onChange={setTime}/><div className="practice-actions"><button disabled={!time||busy} onClick={()=>reply("propose")}>Отправить предложение</button><button onClick={()=>setChoosing(false)}>Закрыть</button></div></div>}
    {notice&&<p role="alert">{notice}</p>}</div></article>;
}

function InvitationCard({ message, mine, onAccept, onUpdate }) {
  const payload = message.payload || {};
  const title = payload.kind === "challenge" ? "Приглашение на соревнование" : "Приглашение в переговоры";
  const accepted = payload.status === "accepted";
  const pending = payload.status === "pending";
  return <article className="mx-auto max-w-md rounded-2xl border border-lime-300/30 bg-lime-400/10 p-4 text-center">
    <b className="block text-lime-100">{title}</b>
    <div className="mt-3 space-y-1 text-left text-sm text-slate-200"><p><span className="text-slate-400">Формат:</span> {payload.mode === "duel" ? "соревнование с ИИ" : "переговоры 1 на 1"}</p><p><span className="text-slate-400">Условия:</span> {payload.problem}</p><p><span className="text-slate-400">Цель:</span> {payload.goal}</p></div>
    <div className="mt-4 flex flex-wrap justify-center gap-2">{accepted ? <span className="text-sm text-emerald-200">Приглашение принято</span> : pending && mine ? <><span className="text-sm text-slate-400">Ожидаем решения</span><button className="subtle-button text-sm" onClick={() => onUpdate(message, "cancel")}>Отменить</button></> : pending ? <><button className="primary-button text-sm" onClick={() => onAccept(message)}>Принять</button><button className="subtle-button text-sm" onClick={() => onUpdate(message, "decline")}>Отклонить</button></> : <span className="text-sm text-slate-400">Статус: {payload.status === "declined" ? "отклонено" : payload.status === "cancelled" ? "отменено" : payload.status}</span>}</div>
    <small className="mt-3 block text-slate-400">{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small>
  </article>;
}

function RoomCreatedCard({ message, onOpenRoom }) {
  return <article className="mx-auto max-w-md rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-center"><b className="block text-emerald-100">Комната создана</b><p className="mt-1 text-sm text-slate-200">Вы можете приступить к переговорам.</p><button className="subtle-button mt-3 text-sm" onClick={() => onOpenRoom(message.payload?.room_id)}>Открыть комнату</button></article>;
}

function ProfilePanel({ person, onClose, onBlock }) {
  const dialogRef = useDialogFocus(onClose);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockError, setBlockError] = useState("");
  const name = person.display_name || person.username;
  return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4"><article ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="friend-profile-title" className="glass max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl p-6"><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">ПРОФИЛЬ</div><h2 id="friend-profile-title" className="mt-1 text-2xl font-bold">{name}</h2><p className="text-lime-200">@{person.username}</p></div><button className="subtle-button" aria-label="Закрыть профиль" onClick={onClose}><Icon name="x" size={18} /></button></div><div className="mt-5"><ProfilePreview equipment={person} username={name} level={person.rank} stars={person.stars} userId={person.id} compact /></div><p className="mt-5 text-slate-300">{person.about || "Пользователь ещё не рассказал о себе."}</p><div className="mt-5 grid grid-cols-3 gap-3 text-center"><Info value={person.xp ?? "—"} label="опыт обучения" /><Info value={<StarAmount value={person.stars} />} label="звёзды" /><Info value={person.sessions_total} label="переговоров" /></div>{person.specialization && <p className="mt-5 text-sm text-slate-400">Специализация: {person.specialization}</p>}{blockError && <p className="mt-3 text-sm text-rose-200" role="alert">{blockError}</p>}<div className="mt-6 border-t border-white/10 pt-4">{confirmBlock ? <div className="flex flex-wrap items-center gap-3"><span className="mr-auto text-sm text-rose-200">Заблокировать пользователя?</span><button type="button" className="subtle-button" onClick={() => setConfirmBlock(false)}>Отмена</button><button type="button" className="text-sm text-rose-200" onClick={() => onBlock(person).catch((failure) => setBlockError(failure.message))}>Заблокировать</button></div> : <button type="button" className="text-xs text-slate-500 hover:text-rose-200" onClick={() => setConfirmBlock(true)}>Заблокировать пользователя</button>}</div></article></div>;
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
