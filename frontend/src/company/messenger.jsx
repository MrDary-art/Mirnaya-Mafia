import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Loader, Notice } from "./shared.jsx";

export function Messenger({ data }) {
  const companyId = data.company.id;
  const myMembershipId = data.membership.id;
  const [chats, setChats] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState("");
  const [newChat, setNewChat] = useState({ kind: "DIRECT", title: "", membership_ids: [] });
  const [taskFor, setTaskFor] = useState(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [error, setError] = useState("");

  async function loadChats() {
    try {
      const [chatRows, people] = await Promise.all([
        api(`/api/company/${companyId}/messenger/chats`),
        api(`/api/company/${companyId}/directory`),
      ]);
      setChats(chatRows);
      setDirectory(people.filter(item => item.membership_id !== myMembershipId));
    } catch (cause) { setError(cause.message); }
  }

  async function openChat(chat) {
    setActive(chat); setError("");
    try {
      const result = await api(`/api/company/${companyId}/messenger/chats/${chat.id}/messages`);
      setMessages(result.messages);
      await api(`/api/company/${companyId}/messenger/chats/${chat.id}/read`, { method: "POST" });
      setChats(current => current?.map(item => item.id === chat.id ? { ...item, unread: 0 } : item));
    } catch (cause) { setError(cause.message); }
  }

  useEffect(() => { loadChats(); }, [companyId]);

  async function createChat(event) {
    event.preventDefault(); setError("");
    try {
      const created = await api(`/api/company/${companyId}/messenger/chats`, { method: "POST", body: newChat });
      setNewChat({ kind: "DIRECT", title: "", membership_ids: [] });
      await loadChats();
      await openChat(created);
    } catch (cause) { setError(cause.message); }
  }

  function toggleMember(id) {
    setNewChat(current => ({ ...current, membership_ids: current.membership_ids.includes(id)
      ? current.membership_ids.filter(value => value !== id)
      : [...current.membership_ids, id] }));
  }

  async function send(event) {
    event.preventDefault();
    if (!text.trim() || !active) return;
    try {
      const attachments = attachment.trim() ? [{ url: attachment.trim(), name: attachment.trim().split("/").pop() || "Вложение" }] : [];
      const result = await api(`/api/company/${companyId}/messenger/chats/${active.id}/messages`, { method: "POST", body: { text, attachments } });
      setMessages(current => [...current, { ...result, reactions: [], tasks: [] }]);
      setText(""); setAttachment("");
    } catch (cause) { setError(cause.message); }
  }

  async function react(message, reaction) {
    const mine = message.reactions?.some(item => item.membership_id === myMembershipId && item.reaction === reaction);
    try {
      await api(`/api/company/${companyId}/messenger/messages/${message.id}/reaction`, { method: "POST", body: { reaction, active: !mine } });
      await openChat(active);
    } catch (cause) { setError(cause.message); }
  }

  async function createTask(event) {
    event.preventDefault();
    try {
      await api(`/api/company/${companyId}/messenger/messages/${taskFor}/task`, { method: "POST", body: { title: taskTitle } });
      setTaskFor(null); setTaskTitle(""); await openChat(active);
    } catch (cause) { setError(cause.message); }
  }

  if (!chats) return <Loader error={error} />;
  return <section className="space-y-5">
    <div><div className="eyebrow">КОРПОРАТИВНЫЙ МЕССЕНДЖЕР</div><h2 className="mt-1 text-3xl font-bold text-slate-900">Командные разговоры</h2><p className="mt-2 max-w-2xl text-slate-600">Личные и групповые чаты доступны только их участникам внутри компании. После увольнения корпоративный доступ закрывается.</p></div>
    {error && <Notice tone="red">{error}</Notice>}
    <form className="glass grid gap-3 rounded-3xl p-5 lg:grid-cols-[150px_1fr_2fr_auto]" onSubmit={createChat}>
      <select className="company-input" value={newChat.kind} onChange={event => setNewChat({...newChat, kind:event.target.value, membership_ids:[]})}><option value="DIRECT">Личный чат</option><option value="GROUP">Группа</option><option value="TEAM">Команда</option></select>
      <input className="company-input" value={newChat.title} onChange={event => setNewChat({...newChat,title:event.target.value})} placeholder="Название группы" disabled={newChat.kind === "DIRECT"} />
      <div className="flex flex-wrap gap-2">{directory.map(person => <label className="rounded-xl border border-slate-200 px-3 py-2 text-xs" key={person.membership_id}><input className="mr-2" type={newChat.kind === "DIRECT" ? "radio" : "checkbox"} name="chat-members" checked={newChat.membership_ids.includes(person.membership_id)} onChange={() => { if (newChat.kind === "DIRECT") setNewChat(current => ({...current,membership_ids:[person.membership_id]})); else toggleMember(person.membership_id); }} />{person.name}</label>)}</div>
      <button className="primary-button" disabled={!newChat.membership_ids.length}>Создать</button>
    </form>
    <div className="grid min-h-[560px] gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="glass rounded-3xl p-3">{chats.map(chat => <button key={chat.id} className={`w-full rounded-2xl p-4 text-left transition ${active?.id === chat.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => openChat(chat)}><span className="block font-semibold">{chat.title || (chat.kind === "DIRECT" ? "Личный чат" : "Командный чат")}</span><span className={`mt-1 block text-xs ${active?.id === chat.id ? "text-white/70" : "text-slate-500"}`}>{chat.unread ? `${chat.unread} непрочитанных` : chat.last_message?.text || "Нет сообщений"}</span></button>)}{!chats.length && <p className="p-4 text-sm text-slate-500">Чатов пока нет.</p>}</aside>
      <article className="glass flex min-h-[560px] flex-col rounded-3xl p-5">{active ? <><header className="border-b border-slate-200 pb-4"><div className="eyebrow">{active.kind === "DIRECT" ? "ЛИЧНЫЙ ДИАЛОГ" : "ГРУППОВОЙ ЧАТ"}</div><h3 className="mt-1 text-xl font-bold text-slate-900">{active.title || "Корпоративный чат"}</h3></header><div className="flex-1 space-y-3 overflow-y-auto py-4">{messages.map(message => <div className={`max-w-[88%] rounded-2xl p-3 ${message.author_membership_id === myMembershipId ? "ml-auto bg-lime-50" : "bg-slate-100"}`} key={message.id}><p className="text-sm text-slate-800">{message.text}</p>{message.attachments?.map((item,index) => <a className="mt-2 block text-xs font-semibold text-emerald-700 underline" href={item.url} target="_blank" rel="noreferrer" key={`${message.id}-${index}`}>{item.name || "Вложение"}</a>)}{message.tasks?.map(task => <div key={task.id} className="mt-2 rounded-xl border border-slate-200 bg-white/70 p-2 text-xs"><b>Задача:</b> {task.title} · {task.status}</div>)}<div className="mt-2 flex flex-wrap items-center gap-1"><button className="rounded-lg px-2 py-1 text-xs hover:bg-white" onClick={() => react(message,"👍")}>👍 {message.reactions?.filter(item => item.reaction === "👍").length || ""}</button><button className="rounded-lg px-2 py-1 text-xs hover:bg-white" onClick={() => react(message,"✅")}>✅ {message.reactions?.filter(item => item.reaction === "✅").length || ""}</button><button className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white" onClick={() => {setTaskFor(message.id);setTaskTitle(message.text.slice(0,120));}}>Создать задачу</button><time className="ml-auto text-[11px] text-slate-500">{new Date(message.created_at).toLocaleString()}</time></div></div>)}</div>{taskFor && <form className="mb-3 flex gap-2 rounded-2xl bg-slate-50 p-3" onSubmit={createTask}><input className="company-input" required minLength="2" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="Название задачи" /><button className="subtle-button">Создать</button><button type="button" className="subtle-button" onClick={() => setTaskFor(null)}>Отмена</button></form>}<form onSubmit={send} className="grid gap-2 border-t border-slate-200 pt-4 md:grid-cols-[1fr_220px_auto]"><input className="company-input" value={text} onChange={event => setText(event.target.value)} placeholder="Напишите сообщение" maxLength={10000} /><input className="company-input" value={attachment} onChange={event => setAttachment(event.target.value)} placeholder="Ссылка на вложение" type="url" /><button className="primary-button">Отправить</button></form></> : <div className="m-auto text-center text-slate-500"><b className="text-slate-900">Выберите чат</b><p className="mt-2 text-sm">Здесь будут сообщения вашей компании.</p></div>}</article>
    </div>
  </section>;
}
