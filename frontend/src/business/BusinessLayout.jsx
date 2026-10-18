import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { CompanySection, Loader } from "../company/index.js";
import Icon from "../components/Icon.jsx";
import ProfileWorkspaceMenu from "../components/ProfileWorkspaceMenu.jsx";
import SupportDesk from "../components/SupportDesk.jsx";
import { UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import { businessPath, businessSectionLabel, canAccessBusinessSection, canonicalBusinessSection, navigationFor } from "./navigation.js";
import "./business.css";
import BusinessTrainer from "./BusinessTrainer.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import { DemoToolbar, demoSession, leaveBusinessDemo } from "./BusinessDemo.jsx";

const BusinessContext = createContext(null);
export function useBusiness() { return useContext(BusinessContext); }

export function BusinessGate({ children }) {
  const { user, ready, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!ready) return <div className="business-standalone"><p role="status">Открываем рабочее пространство…</p></div>;
  if (!user && demoSession()) return <div className="business-standalone"><BusinessBrand/><h1>Демонстрация завершена</h1><p>Доступ к учебной компании закончился. Вернитесь к своему аккаунту или откройте новую демонстрацию.</p><button className="primary-button" onClick={() => leaveBusinessDemo(refresh, navigate)}>Вернуться к своему аккаунту</button><Link to="/business/demo">Открыть демонстрацию</Link></div>;
  if (!user) return <Navigate to={`/business/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

function BusinessCompanyApplication({ company, onSubmitted }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(company.application_status === "PENDING");
  const [form, setForm] = useState({ desired_job_title: "", specialization: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef(null);
  const firstFieldRef = useRef(null);
  const statusRef = useRef(null);
  const focusSubmittedStatus = useRef(false);

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (submitted && focusSubmittedStatus.current) {
      statusRef.current?.focus();
      focusSubmittedStatus.current = false;
    }
  }, [submitted]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/company/${company.id}/applications`, { method: "POST", body: form });
      focusSubmittedStatus.current = true;
      setSubmitted(true);
      onSubmitted(company.id);
      setOpen(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return <p ref={statusRef} className="business-search-status" role="status" tabIndex={-1}>Заявка отправлена. Дождитесь решения компании.</p>;
  }

  if (!open) {
    return <button ref={triggerRef} type="button" className="subtle-button" onClick={() => setOpen(true)}>Подать заявку</button>;
  }

  return <form className="business-application-form" onSubmit={submit}>
    <label>
      Желаемая должность
      <input
        ref={firstFieldRef}
        required
        minLength="2"
        maxLength="160"
        value={form.desired_job_title}
        onChange={event => setForm({ ...form, desired_job_title: event.target.value })}
        placeholder="Например, менеджер по продажам"
      />
    </label>
    <label>
      Специализация <span className="business-label-muted">необязательно</span>
      <input
        maxLength="120"
        value={form.specialization}
        onChange={event => setForm({ ...form, specialization: event.target.value })}
        placeholder="Ваше направление работы"
      />
    </label>
    <label>
      Сообщение компании <span className="business-label-muted">необязательно</span>
      <textarea
        rows="3"
        maxLength="1000"
        value={form.message}
        onChange={event => setForm({ ...form, message: event.target.value })}
        placeholder="Как вас узнать и в какой команде вы работаете"
      />
    </label>
    {error && <p className="business-alert" role="alert">{error}</p>}
    <div className="business-actions">
      <button className="primary-button" disabled={busy}>{busy ? "Отправляем…" : "Отправить заявку"}</button>
      <button type="button" className="subtle-button" disabled={busy} onClick={() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }}>Отмена</button>
    </div>
  </form>;
}


export function BusinessWorkspaces() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [code, setCode] = useState(""), [preview, setPreview] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]), [searchError, setSearchError] = useState("");
  const [searchBusy, setSearchBusy] = useState(false), [hasSearched, setHasSearched] = useState(false);
  const searchInputRef = useRef(null), searchTriggerRef = useRef(null), invitationInputRef = useRef(null), inviteTriggerRef = useRef(null);
  const restoreSearchFocusRef = useRef(false), restoreInviteFocusRef = useRef(false);
  const location = useLocation(), navigate = useNavigate();
  const invitation = new URLSearchParams(location.search).get("invitation") || "";
  const [inviteOpen, setInviteOpen] = useState(Boolean(invitation));
  const load = () => api("/api/company/context").then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
    else if (restoreSearchFocusRef.current) {
      restoreSearchFocusRef.current = false;
      searchTriggerRef.current?.focus();
    }
  }, [searchOpen]);
  useEffect(() => { if (inviteOpen && !preview) invitationInputRef.current?.focus(); }, [inviteOpen, preview]);
  useEffect(() => {
    if (inviteOpen || !restoreInviteFocusRef.current) return;
    restoreInviteFocusRef.current = false;
    inviteTriggerRef.current?.focus();
  }, [inviteOpen]);
  useEffect(() => {
    if (!invitation) return;
    setInviteOpen(true);
    setCode(invitation);
    api(`/api/company/invitations/${encodeURIComponent(invitation)}`, { auth: false }).then(setPreview).catch(e => setError(e.message));
  }, [invitation]);
  useEffect(() => {
    if (!data || invitation) return;
    const activeCompanies = data.companies?.filter(c => c.status === "ACTIVE") || [];
    if (activeCompanies.length === 1 && !data.pending_invitations?.length) {
      navigate(businessPath(activeCompanies[0].company_id), { replace: true });
    }
  }, [data, invitation, navigate]);
  function closeCompanySearch() {
    restoreSearchFocusRef.current = true;
    setSearchOpen(false);
  }
  function closeInvitation() {
    restoreInviteFocusRef.current = true;
    setInviteOpen(false);
  }
  async function findCompanies(event) {
    event.preventDefault();
    const query = search.trim();
    setSearchError("");
    if (query.length < 2) {
      setSearchError("Введите хотя бы два символа из названия компании.");
      return;
    }
    setSearchBusy(true);
    try {
      const result = await api(`/api/company/search?q=${encodeURIComponent(query)}`);
      setSearchResults(result);
      setHasSearched(true);
    } catch (cause) {
      setSearchError(cause.message);
    } finally {
      setSearchBusy(false);
    }
  }
  function applicationSubmitted(companyId) {
    setSearchResults(current => current.map(company => company.id === companyId ? { ...company, application_status: "PENDING" } : company));
  }
  async function acceptLink(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const value = code.trim().includes("invitation=") ? new URL(code.trim()).searchParams.get("invitation") : code.trim();
      if (!value) throw new Error("Вставьте ссылку или код приглашения.");
      if (!preview || value !== invitation) {
        const result = await api(`/api/company/invitations/${encodeURIComponent(value)}`, { auth: false });
        setPreview(result); navigate(`/business/workspaces?invitation=${encodeURIComponent(value)}`, { replace: true });
      } else {
        const result = await api(`/api/company/invitations/${encodeURIComponent(value)}/accept`, { method: "POST" });
        navigate(businessPath(result.company_id), { replace: true });
      }
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function respond(id, action) {
    setError(""); setBusy(true);
    try { await api(`/api/company/memberships/${id}/${action}`, { method: "POST" }); await load(); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  const active = data?.companies?.filter(c => c.status === "ACTIVE") || [];
  return <div className="business-public business-workspaces">
    <header><BusinessBrand /></header>
    <main>
      <section className="business-workspaces-intro">
        <h1>{data && active.length === 0 ? "Подключите компанию" : "Ваши компании"}</h1>
        <p className="business-lead">{data && active.length === 0 ? "Присоединитесь к команде или создайте рабочее пространство." : "Выберите рабочее пространство."}</p>
      </section>
      {error && <p className="business-alert" role="alert">{error}</p>}
      {!data ? <Loader error={error} onRetry={load} /> : <>
        {active.length > 0 && <div className="business-company-grid">
          {active.map(c => <Link key={c.company_id} className="business-company-card" to={businessPath(c.company_id)}><span className="business-company-monogram">{c.name.slice(0, 1)}</span><div><h2>{c.name}</h2><p>{c.department || "Корпоративное пространство"}</p></div><Icon name="arrow-right" /></Link>)}
          <Link className="business-company-card business-company-create" to="/business/create"><span className="business-company-monogram"><Icon name="layout-grid" size={22} /></span><div><h2>Создать компанию</h2><p>Новое рабочее пространство</p></div><Icon name="arrow-right" /></Link>
        </div>}

        {data.pending_invitations?.map(invite => <article className="business-panel business-invitation" key={invite.membership_id}><div><h2>Приглашение в «{invite.company.name}»</h2><p>{invite.job_title} · {invite.role}</p></div><div className="business-actions"><button disabled={busy} className="primary-button" onClick={() => respond(invite.membership_id, "accept")}>Присоединиться</button><button disabled={busy} className="subtle-button" onClick={() => respond(invite.membership_id, "decline")}>Отклонить</button></div></article>)}

        {active.length === 0 && <section className="business-entry-choices" aria-label="Подключение компании">
          <article className={`business-entry-option${searchOpen ? " is-active" : ""}`}>
            <span className="business-entry-option-icon"><Icon name="user-round-search" size={24} /></span>
            <div><h2>Присоединиться</h2><p>Найдите компанию и отправьте заявку.</p></div>
            <button ref={searchTriggerRef} type="button" className="primary-button" aria-expanded={searchOpen} aria-controls="business-company-search" onClick={() => setSearchOpen(value => !value)}><span>{searchOpen ? "Скрыть поиск" : "Найти компанию"}</span><Icon name={searchOpen ? "x" : "search"} size={18} /></button>
          </article>
          <article className="business-entry-option">
            <span className="business-entry-option-icon"><Icon name="layout-grid" size={24} /></span>
            <div><h2>Создать компанию</h2><p>Откройте пространство для своей команды.</p></div>
            <Link className="subtle-button" to="/business/create"><span>Создать компанию</span><Icon name="arrow-right" size={18} /></Link>
          </article>
        </section>}

        {active.length === 0 && searchOpen && <section id="business-company-search" className="business-company-search" aria-labelledby="business-search-title">
          <div className="business-company-search-heading">
            <div><h2 id="business-search-title">Найдите компанию</h2><p>Заявку подтвердит администратор.</p></div>
            <button type="button" className="business-search-close" aria-label="Закрыть поиск компании" onClick={closeCompanySearch}><Icon name="x" size={20} /></button>
          </div>
          <form className="business-search-form" onSubmit={findCompanies}>
            <label htmlFor="business-company-query">Название компании</label>
            <div>
              <input id="business-company-query" ref={searchInputRef} minLength="2" maxLength="180" value={search} onChange={event => setSearch(event.target.value)} placeholder="Например, Северная студия" autoComplete="organization" />
              <button className="primary-button" disabled={searchBusy}>{searchBusy ? "Ищем…" : "Искать"}</button>
            </div>
          </form>
          {searchError && <p className="business-alert" role="alert">{searchError}</p>}
          {hasSearched && searchResults.length === 0 && <p className="business-search-empty" role="status">Ничего не найдено. Проверьте название или используйте приглашение.</p>}
          {searchResults.length > 0 && <div className="business-search-results" aria-live="polite">
            {searchResults.map(company => <article key={company.id} className="business-search-result">
              <div className="business-search-result-heading">
                <span className="business-company-monogram" aria-hidden="true">{company.name.slice(0, 1)}</span>
                <div><h3>{company.name}</h3><p>{company.industry || "Отрасль не указана"} · {company.members} участников</p></div>
              </div>
              <BusinessCompanyApplication company={company} onSubmitted={applicationSubmitted} />
            </article>)}
          </div>}
        </section>}
      </>}

      <form className={`business-invitation-code${inviteOpen || preview ? " is-open" : ""}`} onSubmit={acceptLink}>
        <div className="business-invitation-code-summary">
          <span className="business-invitation-code-icon"><Icon name="door-open" size={22} /></span>
          <div><h2>{preview ? `Приглашение в «${preview.company.name}»` : "Есть приглашение?"}</h2><p>{preview ? `${preview.role_label || preview.corporate_role} · ${preview.job_title || "Сотрудник"}` : "Вставьте ссылку или код компании."}</p></div>
          {!inviteOpen && !preview && <button ref={inviteTriggerRef} type="button" className="subtle-button" onClick={() => setInviteOpen(true)}>Ввести код</button>}
        </div>
        {(inviteOpen || preview) && <div className="business-invitation-code-form">
          <label htmlFor="business-invitation-code">Ссылка или код<input id="business-invitation-code" ref={invitationInputRef} value={code} onChange={e => { setCode(e.target.value); setPreview(null); }} required autoComplete="off" placeholder="Вставьте приглашение" /></label>
          <div className="business-actions"><button disabled={busy} className="primary-button">{busy ? "Проверяем…" : preview ? "Присоединиться" : "Проверить"}</button>{!preview && <button type="button" className="subtle-button" disabled={busy} onClick={closeInvitation}>Свернуть</button>}</div>
        </div>}
      </form>
    </main>
  </div>;
}

export function BusinessCreate() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", industry: "", email: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const navigate = useNavigate();
  async function create(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const company = await api("/api/company", { method: "POST", body: form });
      navigate(businessPath(company.id || company.company_id), { replace: true });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="business-public business-create-page">
    <header><BusinessBrand to="/business/workspaces" /><Link to="/business/workspaces">К выбору компании</Link></header>
    <main className="business-create-layout">
      <section className="business-create-intro">
        <span className="business-auth-eyebrow">Новая компания</span>
        <h1>Создайте рабочее пространство команды</h1>
        <p>Начните с основных данных. Сотрудников, отделы и первую практику можно добавить уже внутри кабинета.</p>
        <dl className="business-create-points">
          <div><dt>01</dt><dd>Закрытое пространство компании</dd></div>
          <div><dt>02</dt><dd>Приглашения для команды</dd></div>
          <div><dt>03</dt><dd>Практика и прогресс в одном месте</dd></div>
        </dl>
      </section>
      <form className="business-create-card" onSubmit={create}>
        <div><span className="business-auth-eyebrow">Данные компании</span><h2>Заполните профиль</h2><p>Обязательное поле отмечено звёздочкой.</p></div>
        <label>Название компании *<input required minLength="2" maxLength="180" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Например, Северная студия" autoComplete="organization" /></label>
        <label>Отрасль <span className="business-label-muted">необязательно</span><input maxLength="120" value={form.industry} onChange={event => setForm({ ...form, industry: event.target.value })} placeholder="Например, финансы или образование" /></label>
        {!user?.email && <label>Электронная почта *<input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>}
        <p className="business-create-team-size">Изначально размер команды установлен на 25 человек. Для редактирования перейдите в настройки после регистрации.</p>
        {error && <p className="business-alert" role="alert">{error}</p>}
        <button className="primary-button business-create-submit" disabled={busy}>{busy ? "Создаём пространство…" : "Создать пространство"}<span aria-hidden="true">→</span></button>
        <p className="business-create-privacy">После создания вы станете владельцем пространства и сможете пригласить команду. Личные результаты Arena остаются приватными.</p>
      </form>
    </main>
  </div>;
}

export default function BusinessLayout() {
  const { companyId } = useParams(), location = useLocation(), navigate = useNavigate();
  const { user, logout, refresh } = useAuth();
  const sidebarRef = useRef(null), workareaRef = useRef(null), menuButtonRef = useRef(null);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width:767px)").matches);
  const inDemo = String(demoSession()?.company_id) === String(companyId);
  const leaveDemo = () => leaveBusinessDemo(refresh, navigate);
  const [data, setData] = useState(null), [error, setError] = useState(""), [menuOpen, setMenuOpen] = useState(false);
  const activeCompany = useRef(companyId), requestVersion = useRef(0);
  activeCompany.current = companyId;
  async function reload() {
    const requestedCompany = companyId, version = ++requestVersion.current;
    const value = await api(`/api/company/context?company_id=${encodeURIComponent(companyId)}`);
    if (activeCompany.current !== requestedCompany || requestVersion.current !== version) return value;
    if (!value.has_company || String(value.company.id) !== String(companyId)) throw new Error("У вас нет доступа к этой компании.");
    setData({...value,business_base:businessPath(companyId).replace("/overview","")}); setError(""); return value;
  }
  useEffect(() => {
    let current = true;
    setData(null); setError("");
    api(`/api/company/context?company_id=${encodeURIComponent(companyId)}`).then(value => {
      if (!current) return;
      if (!value.has_company || String(value.company.id) !== String(companyId)) throw new Error("У вас нет доступа к этой компании.");
      setData({...value,business_base:businessPath(companyId).replace("/overview","")});
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [companyId]);
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); const requestedCompany = companyId; if (data && String(data.company.id) === String(companyId)) reload().catch(e => { if (activeCompany.current === requestedCompany) setError(e.message); }); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia("(max-width:767px)");
    const update = () => { setCompact(media.matches); setMenuOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => reload().catch(() => {}), 60000);
    return () => window.clearInterval(timer);
  }, [companyId]);
  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = compact && !menuOpen;
    if (workareaRef.current) workareaRef.current.inert = compact && menuOpen;
    if (!compact || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => [...sidebarRef.current.querySelectorAll('a[href],button,input,select,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    focusables()[0]?.focus();
    const trap = event => {
      if (event.key === "Escape") { setMenuOpen(false); return; }
      if (event.key !== "Tab") return;
      const list = focusables(), first = list[0], last = list.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trap);
      if (workareaRef.current) workareaRef.current.inert = false;
      menuButtonRef.current?.focus();
    };
  }, [compact, menuOpen, !!data]);
  const rawSection = location.pathname.split("/")[3] || "overview";
  const section = canonicalBusinessSection(rawSection);
  if (!data || String(data.company.id) !== String(companyId)) return <div className="business-standalone"><BusinessBrand /><DemoToolbar companyId={companyId}/><Loader error={error} onRetry={() => reload().catch(e => setError(e.message))} /><Link to="/business/continue">Вернуться в кабинет компании</Link></div>;
  const items = navigationFor(data);
  const currentLabel = businessSectionLabel(data, section) || ({onboarding:"Первый запуск",play:"Тренировка",dialogue:"Диалог с ИИ",guide:"Как устроена практика",rooms:"Практика 1×1",profile:"Личный кабинет",report:"Разбор",council:"Совет решений"}[section]) || "Рабочее пространство";
  const pageDescriptions = {
    overview: "Ваш следующий шаг, важные задачи и состояние рабочего дня.",
    learning: "Программы, уроки, тесты и практика собраны в единый путь.",
    team: "Структура компании, подразделения и сотрудники.",
    community: "Публикации, сообщения и опросы вашей компании.",
    assignments: "Создавайте практику, назначайте её командам и отслеживайте сроки.",
    results: "Смотрите динамику только по корпоративным заданиям и их результатам.",
    certificates: "Смотрите выданные сертификаты, открывайте их и скачивайте подтверждения.",
    messenger: "Общайтесь с сотрудниками в личных и групповых чатах компании.",
    news: "Публикации, объявления и короткие опросы для вашей команды.",
    meetings: "Планируйте встречи 1×1 и фиксируйте договорённости.",
    council: "Проводите командные переговоры с закрытыми ролями внутри пространства компании.",
    settings: "Профиль компании, доступы, лицензии и правила работы с данными.",
    profile: "Ваши задания, прогресс, результаты и подтверждённые достижения.",
  };
  const pageDescription = pageDescriptions[section] || "Единое пространство для практики и развития команды.";
  const unread = data.inbox.filter(item => !item.read).length;
  const memberIdentity = <UserAvatar avatarCode={user?.avatar_code} frameCode={user?.frame_code} userId={user?.id} size="xs" name={user?.display_name || user?.username || "Мой профиль"} />;
  async function start(id) {
    try {
      const requestedCompany = companyId;
      const result = await api(`/api/company/${data.company.id}/assignments/${id}/start`, { method: "POST" });
      if (activeCompany.current !== requestedCompany) return;
      navigate(businessPath(companyId, `play/${result.session_id}`), { state: { returnTo: businessPath(companyId, "learning") } });
    } catch(e) { setError(e.message); }
  }
  function scrollToTeamSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }
  const teamSections = [
    ["company-employees", "Сотрудники"],
    ["company-departments", "Подразделения"],
    ...(data.permissions.manage_company ? [["company-applications", "Заявки"]] : []),
  ];
  return <BusinessContext.Provider value={{data,reload,start,setTab:tab => navigate(businessPath(companyId,tab))}}>
    <div className="business-shell">
      <a className="business-skip" href="#business-main">К содержимому</a>
      {menuOpen && <button className="business-nav-scrim" aria-label="Закрыть навигацию" tabIndex={-1} onClick={() => setMenuOpen(false)} />}
      <aside className={`business-sidebar${menuOpen ? " is-open" : ""}`} aria-label="Корпоративная навигация" ref={sidebarRef} role={compact && menuOpen ? "dialog" : undefined} aria-modal={compact && menuOpen ? true : undefined}>
        <button className="business-menu-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><Icon name="x"/></button>
        <BusinessBrand />
        <nav className="business-primary-nav" aria-label="Разделы компании">
          {items.map((item) => <NavLink key={item[0]} to={businessPath(companyId, item[0])} className={({ isActive }) => isActive || (section === "council" && item[0] === "meetings") ? "is-active" : ""}>
            <Icon name={item[2]} size={18}/><span>{item[1]}</span>
          </NavLink>)}
        </nav>
        {data.permissions?.invite_members && data.company.join_code && <p className="business-sidebar-code">Код: <span>{data.company.join_code}</span></p>}
        {inDemo && <div className="business-sidebar-footer"><button onClick={leaveDemo}><Icon name="arrow-up-right" size={17}/>Завершить демо</button></div>}
      </aside>
      <SupportDesk placement="sidebar" />
      <div className="business-workarea" ref={workareaRef}><header className="business-topbar">
        <button type="button" className="business-menu-toggle" ref={menuButtonRef} onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen} aria-label="Открыть корпоративную навигацию"><Icon name="layout-grid"/></button>
        <div className="business-top-actions"><NavLink to={`${businessPath(companyId,"community")}?section=messages`} className="business-icon-button" aria-label="Сообщения сотрудников" title="Сообщения"><Icon name="message-circle"/></NavLink><NavLink to={`${businessPath(companyId,"community")}?section=notifications`} className="business-icon-button" aria-label={`Уведомления: ${unread} непрочитанных`} title="Уведомления"><Icon name="bell"/>{unread > 0 && <i/>}</NavLink><ProfileWorkspaceMenu companyId={companyId} triggerClassName="business-user" allowSwitch={!inDemo} onSignOut={() => { if (inDemo) { leaveDemo(); return; } logout(); window.location.replace("/"); }}>{memberIdentity}</ProfileWorkspaceMenu></div>
      </header>
      <main id="business-main" className="business-main">
        <DemoToolbar companyId={companyId}/>
        {section !== "overview" && <div className="business-page-heading"><div><h1>{currentLabel}</h1>{!["calendar", "profile"].includes(section) && <p className="business-page-description">{pageDescription}</p>}</div>{section === "team" && <nav className="business-team-quick-nav" aria-label="Переход по странице компании">{teamSections.map(([id, label]) => <button type="button" key={id} onClick={() => scrollToTeamSection(id)}>{label}</button>)}</nav>}</div>}
        {error && <p className="business-alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Скрыть сообщение">×</button></p>}
        <Outlet key={companyId} />
      </main>
      <footer className="business-footer"><span>{data.company.name} · {data.membership.department || data.membership.role_label}</span><span>Личная практика остаётся приватной</span></footer></div>
    </div>
  </BusinessContext.Provider>;
}

export function BusinessSectionPage() {
  const { section = "overview", companyId } = useParams();
  const { data, reload, start, setTab } = useBusiness();
  const [step, setStep] = useState(0);
  const canonicalSection = canonicalBusinessSection(section);
  if (canonicalSection !== section) return <Navigate to={businessPath(companyId, canonicalSection)} replace />;
  if (section === "me") return <Navigate to={businessPath(companyId, "profile")} replace />;
  if (section === "onboarding" && data.permissions.manage_company) {
    const steps = [["settings","Компания"],["structure","Структура"],["employees","Сотрудники"],["scenarios","Первый сценарий"],["assignments","Запуск"]];
    return <><div className="business-onboarding-steps" aria-label="Мастер первого запуска">{steps.map(([key,label],i) => <button className={step === i ? "is-active" : ""} key={key} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}><span>{i+1}</span>{label}</button>)}</div><p className="business-muted">Каждый шаг сохраняет изменения в вашей компании. Можно вернуться к нему позже.</p><CompanySection tab={steps[step][0]} data={data} reload={reload} start={start} setTab={setTab}/><div className="business-actions business-onboarding-actions"><button className="subtle-button" disabled={step === 0} onClick={() => setStep(s => s-1)}>Назад</button>{step < 4 ? <button className="primary-button" onClick={() => setStep(s => s+1)}>Следующий шаг →</button> : <Link className="primary-button" to={businessPath(companyId)}>Открыть обзор</Link>}</div></>;
  }
  if (section === "profile") return <CompanySection tab="profile" data={data} reload={reload} start={start} setTab={setTab}/>;
  if (section === "practice") return <><section className="business-practice-intro"><div><h2>Отработайте рабочую ситуацию</h2><p>Корпоративные результаты создаются при запуске назначенного задания. Личную тренировку можно открыть отдельно.</p></div>{data.company.status !== "DEMO" && <Link className="subtle-button" to="/ai">Личная практика с ИИ ↗</Link>}</section><BusinessTrainer data={data} reload={reload} start={start}/><CompanySection tab="learning" data={data} reload={reload} start={start} setTab={setTab}/></>;
  if (!canAccessBusinessSection(data, section)) return <section className="business-panel" role="alert"><h2>Раздел недоступен</h2><p>Этот раздел не входит в вашу область доступа.</p><Link to={businessPath(companyId)}>Перейти к обзору</Link></section>;
  return <div className="business-company-section"><CompanySection tab={section} data={data} reload={reload} start={start} setTab={setTab}/></div>;
}


