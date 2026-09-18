import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import PeopleSearch from "./PeopleSearch.jsx";

function Avatar({ person, small = false }) {
  const name = person.display_name || person.username;
  return <span className={`profile-avatar !rounded-xl ${small ? "!h-10 !w-10 !text-xs" : "!h-12 !w-12 !text-sm"}`}>{name.slice(0, 2).toUpperCase()}</span>;
}

export default function Friends() {
  const [tab, setTab] = useState("friends");
  const [dialogs, setDialogs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [profile, setProfile] = useState(null);

  const loadDialogs = useCallback(async () => {
    const friends = (await api("/api/social/friends")).filter((item) => item.relationship === "FRIENDS");
    const items = await Promise.all(friends.map(async (friend) => {
      const conversation = await api(`/api/social/messages/${friend.id}?mark_read=false`);
      const last = conversation.at(-1);
      const unread = conversation.filter((message) => message.sender_id === friend.id && !message.is_read).length;
      return { ...friend, preview: last?.text || "Нет сообщений", time: last?.created_at || "", unread, conversation };
    }));
    setDialogs(items.sort((a, b) => b.time.localeCompare(a.time)));
  }, []);

  const openDialog = useCallback(async (dialog) => {
    setActive(dialog);
    setMessages(await api(`/api/social/messages/${dialog.id}`));
  }, []);

  useEffect(() => { loadDialogs().catch((error) => alert(error.message)); }, [loadDialogs]);
  useEffect(() => {
    if (!active) return undefined;
    const refresh = () => api(`/api/social/messages/${active.id}`).then(setMessages).catch(() => {});
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [active]);

  async function send() {
    const value = text.trim();
    if (!value || !active) return;
    await api(`/api/social/messages/${active.id}`, { method: "POST", body: { text: value } });
    setText("");
    await openDialog(active);
    await loadDialogs();
  }
  async function inviteToSession() {
    await api("/api/social/rooms", { method: "POST", body: { guest_id: active.id, scenario_id: "sales_discount_01", creator_role: "Продавец", guest_role: "Клиент" } });
    return "Приглашение в переговоры отправлено";
  }
  async function inviteToChallenge() {
    await api("/api/social/challenges", { method: "POST", body: { receiver_id: active.id, scenario_id: "sales_discount_01" } });
    return "Приглашение к соревнованию отправлено";
  }
  async function showProfile(friend) {
    try { setProfile(await api(`/api/social/people/${friend.username}`)); }
    catch (error) { alert(error.message); }
  }

  const filtered = useMemo(() => dialogs.filter((dialog) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${dialog.display_name} ${dialog.username} ${dialog.preview} ${dialog.conversation.map((message) => message.text).join(" ")}`.toLowerCase().includes(needle);
  }), [dialogs, query]);

  if (active) return <>
    <ChatScreen active={active} messages={messages} text={text} setText={setText} onClose={() => setActive(null)} onSend={send} onProfile={showProfile} onSession={inviteToSession} onChallenge={inviteToChallenge} />
    {profile && <ProfilePanel person={profile} onClose={() => setProfile(null)} />}
  </>;

  return <section className="space-y-6">
    <div><div className="eyebrow">СООБЩЕСТВО</div><h1 className="mt-1 text-3xl font-extrabold">Друзья</h1></div>
    <div className="flex gap-2 border-b border-white/10">
      <button onClick={() => setTab("friends")} className={`px-4 py-3 ${tab === "friends" ? "border-b-2 border-cyan-300 text-cyan-200" : "text-slate-400"}`}>Мои друзья</button>
      <button onClick={() => setTab("search")} className={`px-4 py-3 ${tab === "search" ? "border-b-2 border-cyan-300 text-cyan-200" : "text-slate-400"}`}>Поиск</button>
    </div>
    {tab === "search" ? <PeopleSearch /> : <DialogList dialogs={filtered} query={query} setQuery={setQuery} onOpen={openDialog} />}
    {profile && <ProfilePanel person={profile} onClose={() => setProfile(null)} />}
  </section>;
}

function DialogList({ dialogs, query, setQuery, onOpen, compact = false, activeId }) {
  return <div className={`glass overflow-hidden rounded-3xl ${compact ? "rounded-none bg-transparent" : ""}`}>
    <div className="border-b border-white/10 p-5"><b>💬 Сообщения</b><input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-3 w-full rounded-xl bg-white/5 p-3" placeholder="🔍 Поиск по чатам и сообщениям" /></div>
    {dialogs.map((dialog) => <button key={dialog.id} onClick={() => onOpen(dialog)} className={`flex w-full items-center gap-4 border-b border-white/5 p-4 text-left hover:bg-white/5 ${activeId === dialog.id ? "bg-cyan-400/10" : ""}`}>
      <Avatar person={dialog} small={compact} /><span className="min-w-0 flex-1"><b className="block">{dialog.display_name || dialog.username}</b><small className="block">@{dialog.username}</small><span className="block truncate text-sm text-slate-400">{dialog.preview}</span></span>
      <span className="flex flex-col items-end gap-1"><small className="text-slate-500">{dialog.time ? new Date(dialog.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}</small>{dialog.unread > 0 && <i className="rounded-full bg-cyan-300 px-2 text-xs not-italic text-slate-950">{dialog.unread}</i>}</span>
    </button>)}
    {!dialogs.length && <p className="p-5 text-slate-400">Подтверждённых друзей пока нет.</p>}
  </div>;
}

function ChatScreen({ active, messages, text, setText, onClose, onSend, onProfile, onSession, onChallenge }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);
  async function sendMessage() {
    try { setSending(true); setNotice(""); await onSend(); }
    catch (error) { setNotice(error.message || "Сообщение не удалось отправить"); }
    finally { setSending(false); }
  }
  async function runInvitation(action) {
    try { setNotice(await action()); }
    catch (error) { setNotice(error.message || "Не удалось отправить приглашение"); }
  }
  return <section className="flex min-h-0 flex-col overflow-hidden bg-[#070b14]" style={{ height: "calc(100dvh - 8rem)" }}>
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="relative flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 p-4">
        <button className="subtle-button" onClick={onClose}>← <span className="hidden sm:inline">К чатам</span></button>
        <button onClick={() => onProfile(active)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Avatar person={active} small /><span className="min-w-0"><b className="block truncate">{active.display_name || active.username}</b><small className="text-emerald-300">В сети недавно</small></span></button>
        <button className="subtle-button text-sm" onClick={() => runInvitation(onSession)}>Пригласить в переговоры</button>
        <button className="subtle-button text-sm" onClick={() => runInvitation(onChallenge)}>Пригласить на соревнование</button>
        <button className="subtle-button" onClick={() => setMenuOpen((open) => !open)}>Ещё ▾</button>
        {menuOpen && <div className="absolute right-4 top-[4.5rem] z-10 grid min-w-52 rounded-xl border border-white/10 bg-slate-950 p-2 shadow-2xl"><button className="rounded-lg px-3 py-2 text-left hover:bg-white/5" onClick={() => { setMenuOpen(false); onProfile(active); }}>Открыть профиль</button><button className="rounded-lg px-3 py-2 text-left hover:bg-white/5" onClick={onClose}>Вернуться к чатам</button></div>}
      </header>
      {notice && <p className="shrink-0 border-b border-white/10 bg-cyan-400/10 px-5 py-2 text-sm text-cyan-100">{notice}</p>}
      <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">{messages.map((message) => {
        if (message.type === "ONLINE_INVITE" || message.type === "CHALLENGE_INVITE") return <div key={message.id} className="mx-auto max-w-md rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 text-center"><b className="block text-cyan-100">{message.type === "ONLINE_INVITE" ? "⚔ Приглашение в переговоры" : "🏆 Приглашение на соревнование"}</b><p className="mt-1 text-sm text-slate-300">{message.text}</p><small className="mt-2 block text-slate-400">{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></div>;
        const mine = Number(message.receiver_id) === Number(active.id);
        return <div key={message.id} className="flex" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}><div className={`max-w-[80%] rounded-2xl p-3 ${mine ? "bg-cyan-400/15" : "bg-white/5"}`}><p>{message.text}</p><small className="mt-1 block text-right text-slate-500">{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}{mine ? " ✓✓" : ""}</small></div></div>;
      })}{!messages.length && <p className="text-slate-400">Начните диалог.</p>}</div>
      <form className="flex shrink-0 gap-3 border-t border-white/10 bg-[#070b14] p-4" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><button type="button" className="subtle-button" onClick={() => setText(`${text} 🙂`)}>🙂</button><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} className="min-h-12 flex-1 resize-none rounded-xl bg-white/5 p-3" placeholder="Введите сообщение…" /><button type="submit" className="primary-button" disabled={sending || !text.trim()}>{sending ? "Отправляем…" : "Отправить"}</button></form>
    </main>
  </section>;
}

function ProfilePanel({ person, onClose }) {
  return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4"><article className="glass w-full max-w-lg rounded-3xl p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><Avatar person={person} /><div><div className="eyebrow">ПРОФИЛЬ ДРУГА</div><h2 className="text-2xl font-bold">{person.display_name || person.username}</h2><p className="text-cyan-200">@{person.username}</p></div></div><button className="subtle-button" onClick={onClose}>×</button></div><p className="mt-5 text-slate-300">{person.about || "Пользователь ещё не рассказал о себе."}</p><div className="mt-5 grid grid-cols-3 gap-3 text-center"><Info value={person.xp} label="опыт обучения" /><Info value={`★ ${person.stars}`} label="звёзды" /><Info value={person.sessions_total} label="переговоров" /></div><p className="mt-5 text-sm text-slate-400">{person.title} · {person.rank_name}</p>{person.specialization && <p className="mt-2 text-sm text-slate-400">Специализация: {person.specialization}</p>}</article></div>;
}
function Info({ value, label }) { return <div className="rounded-2xl bg-white/5 p-3"><b className="block text-cyan-100">{value}</b><small className="text-slate-400">{label}</small></div>; }
