import { useMemo, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { api } from "../api.js";
import { useEffect, Loader, Notice } from "./shared.jsx";
import Icon from "../components/Icon.jsx";
import "../pages/friends.css";
import "../components/social/friends-workspace.css";

function chatTitle(chat) {
  if (chat.title) return chat.title;
  return chat.kind === "DIRECT" ? "Личный разговор" : "Командный чат";
}

function employeeSearchText(person) {
  return [person.name, person.username, person.role_label, person.job_title, person.profession, person.specialization, person.department].filter(Boolean).join(" ").toLocaleLowerCase("ru");
}

function EmployeeRow({ person, actionLabel = "Написать", selected = false, onAction }) {
  const specialty = person.profession || person.specialization || "Специальность не указана";
  return <article className={`business-directory-person${person.is_direct_report ? " is-report" : ""}`}>
    <span className="business-directory-person-icon" aria-hidden="true"><Icon name="circle-user-round" size={19}/></span>
    <span className="business-directory-person-copy"><span><strong>{person.name}</strong>{person.is_direct_report && <i>Подчинённый</i>}</span><small>{person.role_label || "Сотрудник"}{person.job_title ? ` · ${person.job_title}` : ""}</small><small>{specialty}{person.department ? ` · ${person.department}` : ""}</small></span>
    <button type="button" className={selected ? "is-selected" : ""} onClick={() => onAction(person)}>{selected ? "Выбран" : actionLabel}</button>
  </article>;
}

export function Messenger({ data }) {
  const companyId = data.company.id;
  const ownMembershipId = data.membership.id;
  const [chats, setChats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState("people");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ kind: "DIRECT", title: "", membership_ids: [] });
  const [newMemberIds, setNewMemberIds] = useState([]);
  const directReportsDisclosure = useRef(null);

  const peopleById = useMemo(() => new Map(employees.map(person => [Number(person.membership_id), person])), [employees]);
  const visibleChats = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return (chats || []).filter(chat => !normalized || [chatTitle(chat), chat.last_message?.text, ...(chat.participants || []).map(item => item.name)].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(normalized));
  }, [chats, query]);
  const visibleEmployees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return employees.filter(person => !normalized || employeeSearchText(person).includes(normalized)).sort((a, b) => Number(b.is_direct_report) - Number(a.is_direct_report) || a.name.localeCompare(b.name, "ru"));
  }, [employees, query]);
  const visibleDirectReports = visibleEmployees.filter(person => person.is_direct_report);
  const visibleColleagues = visibleEmployees.filter(person => !person.is_direct_report);
  const selectableEmployees = useMemo(() => {
    const normalized = memberQuery.trim().toLocaleLowerCase("ru");
    const currentIds = new Set((active?.participants || []).map(item => Number(item.membership_id)));
    return employees.filter(person => (!addingMembers || !currentIds.has(Number(person.membership_id))) && (!normalized || employeeSearchText(person).includes(normalized)));
  }, [employees, memberQuery, addingMembers, active]);
  const directReports = employees.filter(person => person.is_direct_report).length;
  const directReportLabel = directReports % 10 === 1 && directReports % 100 !== 11 ? "сотрудник" : [2, 3, 4].includes(directReports % 10) && ![12, 13, 14].includes(directReports % 100) ? "сотрудника" : "сотрудников";

  async function load() {
    try {
      const [chatRows, people] = await Promise.all([
        api(`/api/company/${companyId}/messenger/chats`),
        api(`/api/company/${companyId}/messenger/directory`),
      ]);
      setChats(chatRows);
      setEmployees(people);
      setError("");
      return { chatRows, people };
    } catch (cause) {
      setError(cause.message);
      throw cause;
    }
  }

  async function openChat(chat) {
    setCreating(false);
    setAddingMembers(false);
    setActive(chat);
    setError("");
    try {
      const result = await api(`/api/company/${companyId}/messenger/chats/${chat.id}/messages`);
      setMessages(result.messages);
      await api(`/api/company/${companyId}/messenger/chats/${chat.id}/read`, { method: "POST" });
      setChats(current => current?.map(item => item.id === chat.id ? { ...item, unread: 0 } : item));
    } catch (cause) {
      setError(cause.message);
    }
  }

  useEffect(() => { load().catch(() => {}); }, [companyId]);
  useEffect(() => {
    if (query.trim() && directReportsDisclosure.current) directReportsDisclosure.current.open = true;
  }, [query, sidebarMode, employees]);

  async function send(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !active || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api(`/api/company/${companyId}/messenger/chats/${active.id}/messages`, { method: "POST", body: { text: value } });
      setMessages(current => [...current, result]);
      setText("");
      setChats(current => current?.map(item => item.id === active.id ? { ...item, last_message: result } : item));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleMember(membershipId) {
    setDraft(current => ({
      ...current,
      membership_ids: current.membership_ids.includes(membershipId)
        ? current.membership_ids.filter(id => id !== membershipId)
        : current.kind === "DIRECT" ? [membershipId] : [...current.membership_ids, membershipId],
    }));
  }

  async function createChat(event) {
    event.preventDefault();
    if (!draft.membership_ids.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const selectedId = draft.membership_ids[0];
      const result = await api(`/api/company/${companyId}/messenger/chats`, {
        method: "POST",
        body: { kind: draft.kind, title: draft.kind === "GROUP" ? draft.title.trim() : "", membership_ids: draft.membership_ids },
      });
      const refreshed = await load();
      const created = refreshed.chatRows.find(item => item.id === result.id) || { ...result, title: draft.kind === "DIRECT" ? peopleById.get(Number(selectedId))?.name : draft.title };
      setDraft({ kind: "DIRECT", title: "", membership_ids: [] });
      setMemberQuery("");
      setCreating(false);
      setSidebarMode("chats");
      await openChat(created);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function startDirect(person) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api(`/api/company/${companyId}/messenger/chats`, { method: "POST", body: { kind: "DIRECT", title: "", membership_ids: [person.membership_id] } });
      const refreshed = await load();
      const chat = refreshed.chatRows.find(item => item.id === result.id) || { ...result, title: person.name, participants: [person] };
      setSidebarMode("chats");
      await openChat(chat);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleNewMember(id) {
    setNewMemberIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  async function addMembers(event) {
    event.preventDefault();
    if (!active || !newMemberIds.length || saving) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/company/${companyId}/messenger/chats/${active.id}/members`, { method: "POST", body: { membership_ids: newMemberIds } });
      const refreshed = await load();
      setActive(refreshed.chatRows.find(item => item.id === active.id) || active);
      setNewMemberIds([]);
      setMemberQuery("");
      setAddingMembers(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  if (!chats) return <Loader error={error} />;
  const showConversation = Boolean(active);
  return <section className="friends-workspace business-company-messenger" aria-label="Сообщения компании">
    <header className="friends-workspace-heading">
      <div><h2>Сообщения</h2><p>Найдите любого сотрудника компании или соберите групповой чат.</p></div>
      <button type="button" className="business-chat-new-button" onClick={() => { setCreating(true); setAddingMembers(false); setDraft({ kind: "GROUP", title: "", membership_ids: [] }); setMemberQuery(""); }} aria-label="Создать групповой чат"><Icon name="plus" size={18}/><span>Новый чат</span></button>
    </header>
    {error && <Notice tone="red">{error}</Notice>}
    <div className={`social-workspace${showConversation ? " has-chat" : ""}`}>
      <aside className="social-sidebar" aria-label="Чаты и сотрудники компании">
        <div className="social-sidebar-head">
          <div className="business-messenger-switch" role="tablist" aria-label="Каталог сообщений"><button type="button" role="tab" aria-selected={sidebarMode === "people"} className={sidebarMode === "people" ? "is-active" : ""} onClick={() => setSidebarMode("people")}>Сотрудники <span>{employees.length}</span></button><button type="button" role="tab" aria-selected={sidebarMode === "chats"} className={sidebarMode === "chats" ? "is-active" : ""} onClick={() => setSidebarMode("chats")}>Чаты <span>{chats.length}</span></button></div>
          <label className="social-search"><Icon name="search" size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={sidebarMode === "people" ? "Имя, роль или специальность" : "Название или участник"} aria-label={sidebarMode === "people" ? "Найти сотрудника" : "Найти чат"}/>{query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск">×</button>}</label>
        </div>
        <div className="social-contact-scroll">
          {sidebarMode === "people" ? <div className="business-directory-list">
            {visibleDirectReports.length > 0 && <details className="business-direct-reports" ref={directReportsDisclosure}>
              <summary className="business-direct-report-note"><Icon name="users" size={16}/><span>{directReports} {directReportLabel} в прямом подчинении</span><CaretDownIcon className="business-direct-reports-caret" size={18} aria-hidden="true"/></summary>
              <div className="business-directory-list">{visibleDirectReports.map(person => <EmployeeRow key={person.membership_id} person={person} onAction={startDirect}/>)}</div>
            </details>}
            {visibleColleagues.map(person => <EmployeeRow key={person.membership_id} person={person} onAction={startDirect}/>)}
            {!visibleEmployees.length && <div className="social-empty-note"><b>Сотрудники не найдены</b><p>Попробуйте имя, роль, должность или специальность.</p></div>}
          </div> : <>{visibleChats.map(chat => <button type="button" key={chat.id} className={`social-contact${active?.id === chat.id ? " is-selected" : ""}`} aria-current={active?.id === chat.id ? "true" : undefined} onClick={() => openChat(chat)}><span className="business-chat-avatar" aria-hidden="true"><Icon name={chat.kind === "DIRECT" ? "circle-user-round" : "users"} size={18}/></span><span className="social-contact-copy"><span className="social-contact-first"><strong>{chatTitle(chat)}</strong>{Number(chat.unread) > 0 && <span className="friends-unread" aria-label={`Непрочитанных: ${chat.unread}`}>{chat.unread}</span>}</span><span className="social-contact-meta">{chat.kind === "DIRECT" ? "Личный чат" : `${chat.member_count || 0} участников`}</span><span className="social-contact-detail">{chat.last_message?.text || "Сообщений пока нет"}</span></span><span className="social-contact-arrow" aria-hidden="true">›</span></button>)}{!visibleChats.length && <div className="social-empty-note"><b>{query ? "Ничего не найдено" : "Чатов пока нет"}</b><p>{query ? "Попробуйте другой запрос." : "Откройте вкладку «Сотрудники» и напишите нужному человеку."}</p></div>}</>}
        </div>
      </aside>
      <div className="social-conversation">
        {active && addingMembers ? <form className="business-chat-create" onSubmit={addMembers}>
          <header><button type="button" className="social-chat-back" onClick={() => setAddingMembers(false)} aria-label="Назад в чат">←</button><div><h3>Добавить участников</h3><p>{chatTitle(active)} · сейчас {active.member_count || active.participants?.length || 0}</p></div></header>
          <label className="business-chat-member-search"><span>Найти сотрудника</span><input value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="Имя, роль, должность или специальность"/></label>
          <fieldset><legend>Выбрано · {newMemberIds.length}</legend><div className="business-chat-people">{selectableEmployees.map(person => <EmployeeRow key={person.membership_id} person={person} actionLabel="Добавить" selected={newMemberIds.includes(person.membership_id)} onAction={() => toggleNewMember(person.membership_id)}/>)}</div></fieldset>
          <button className="primary-button" disabled={saving || !newMemberIds.length}>{saving ? "Добавляем…" : "Добавить в чат"}</button>
        </form> : active ? <section className="friends-chat social-chat" aria-label={`Чат с ${chatTitle(active)}`}>
          <header className="social-chat-header"><button type="button" className="social-chat-back" onClick={() => setActive(null)} aria-label="Назад к списку">←</button><span className="business-chat-avatar" aria-hidden="true"><Icon name={active.kind === "DIRECT" ? "circle-user-round" : "users"} size={18}/></span><span className="social-chat-person"><span><strong>{chatTitle(active)}</strong><small>{active.kind === "DIRECT" ? "Личный чат компании" : `${active.member_count || 0} участников`}</small></span></span>{active.kind !== "DIRECT" && <button type="button" className="business-chat-add-member" onClick={() => { setAddingMembers(true); setNewMemberIds([]); setMemberQuery(""); }}><Icon name="users" size={17}/>Добавить</button>}</header>
          <div className="social-messages">{messages.map(message => { const mine = Number(message.author_membership_id) === Number(ownMembershipId); const author = peopleById.get(Number(message.author_membership_id)); return <div key={message.id} className={`social-message${mine ? " is-mine" : ""}`}><div>{!mine && <b className="business-message-author">{author?.name || "Сотрудник"}</b>}<p>{message.text}</p><small>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></div></div>; })}{messages.length === 0 && <div className="social-chat-state"><strong>Пока нет сообщений</strong><p>Напишите первым — разговор сохранится в компании.</p></div>}</div>
          <form className="friends-chat-composer social-composer" onSubmit={send}><textarea aria-label="Сообщение" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} maxLength={10000} placeholder="Написать сообщение…" rows={2} /><button type="submit" disabled={saving || !text.trim()} aria-label="Отправить сообщение"><Icon name={saving ? "hourglass" : "send"} size={20} /></button></form>
        </section> : <div className="social-welcome"><Icon name="users" size={44}/><h2>Выберите сотрудника</h2><p>В каталоге видны роль, должность и специальность каждого участника компании.</p></div>}
      </div>
    </div>
    {creating && <div className="business-chat-dialog-backdrop" role="presentation"><form className="business-chat-dialog" onSubmit={createChat} role="dialog" aria-modal="true" aria-labelledby="group-chat-title"><header><div><p>Сообщество</p><h3 id="group-chat-title">Новый групповой чат</h3></div><button type="button" className="business-chat-dialog-close" onClick={() => setCreating(false)} aria-label="Закрыть окно"><Icon name="x" size={18}/></button></header><label>Название чата<input required value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Например, Команда продаж" /></label><label className="business-chat-member-search"><span>Найти сотрудника</span><input value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="Имя, роль или должность" /></label><section aria-label="Выбор участников"><div className="business-chat-dialog-members-head"><b>Участники</b><span>Выбрано: {draft.membership_ids.length}</span></div><div className="business-chat-dialog-people">{selectableEmployees.map(person => <EmployeeRow key={person.membership_id} person={person} actionLabel="Выбрать" selected={draft.membership_ids.includes(person.membership_id)} onAction={() => toggleMember(person.membership_id)} />)}{!selectableEmployees.length && <p>Сотрудники не найдены.</p>}</div></section><footer><button type="button" className="subtle-button" onClick={() => setCreating(false)}>Отмена</button><button className="primary-button" disabled={saving || !draft.title.trim() || !draft.membership_ids.length}>{saving ? "Создаём…" : "Создать"}</button></footer></form></div>}
  </section>;
}
