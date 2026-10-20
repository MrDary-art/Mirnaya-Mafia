import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { CompanySection, Loader } from "../company/index.js";
import { PilotOnboarding } from "../company/pilot.jsx";
import Icon from "../components/Icon.jsx";
import ProfileWorkspaceMenu from "../components/ProfileWorkspaceMenu.jsx";
import SupportDesk from "../components/SupportDesk.jsx";
import { UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import { businessBackTarget, businessPath, businessSectionLabel, canAccessBusinessSection, canonicalBusinessSection, navigationFor, primaryNavigation } from "./navigation.js";
import "./business.css";
import BusinessTrainer from "./BusinessTrainer.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import { DemoToolbar, demoSession, leaveBusinessDemo } from "./BusinessDemo.jsx";
import BusinessForestBackdrop from "./BusinessForestBackdrop.jsx";
import BusinessProductTour from "./BusinessProductTour.jsx";
import BusinessSectionHeader, { hasBusinessForestHeader } from "./BusinessSectionHeader.jsx";

const BusinessContext = createContext(null);
export function useBusiness() { return useContext(BusinessContext); }

function BusinessMobileNavigation({ companyId, items = [], section, onOpenMenu, workspaces = false }) {
  const visibleItems = items.slice(0, 3);
  return <nav className="business-mobile-nav" aria-label="Мобильная навигация">
    {workspaces
      ? <>
          <Link to="/business/workspaces" className="is-active" aria-current="page"><Icon name="layout-grid" size={19}/><span>Компании</span></Link>
          <Link to="/app"><Icon name="arrow-up-right" size={19}/><span>Арена переговоров</span></Link>
        </>
      : visibleItems.map(([key, label, icon]) => <NavLink key={key} to={businessPath(companyId, key)} className={({ isActive }) => isActive || (section === "council" && key === "meetings") ? "is-active" : ""}>
          <Icon name={icon} size={19}/><span>{label}</span>
        </NavLink>)}
    <button type="button" onClick={onOpenMenu} aria-label="Открыть все разделы">
      <Icon name="layout-grid" size={19}/><span>Разделы</span>
    </button>
  </nav>;
}

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

function BusinessWorkspaceFrame({ children }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width:767px)").matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("arena_business_sidebar_collapsed") === "true");
  const sidebarRef = useRef(null), workareaRef = useRef(null), menuButtonRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width:767px)");
    const update = () => { setCompact(media.matches); setMenuOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("arena_business_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = compact && !menuOpen;
    if (workareaRef.current) workareaRef.current.inert = compact && menuOpen;
    if (!compact || !menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => [...sidebarRef.current.querySelectorAll('a[href],button,[tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
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
  }, [compact, menuOpen]);

  return <div className={`business-shell business-workspaces-shell${sidebarCollapsed && !compact ? " is-sidebar-collapsed" : ""}`}>
    <BusinessForestBackdrop section="onboarding"/>
    <a className="business-skip" href="#business-main">К содержимому</a>
    {menuOpen && <button className="business-nav-scrim" aria-label="Закрыть навигацию" tabIndex={-1} onClick={() => setMenuOpen(false)} />}
    <aside className={`business-sidebar${menuOpen ? " is-open" : ""}`} aria-label="Корпоративная навигация" ref={sidebarRef} role={compact && menuOpen ? "dialog" : undefined} aria-modal={compact && menuOpen ? true : undefined}>
      <button className="business-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><Icon name="x" /></button>
      <div className="business-sidebar-brand-row">
        <BusinessBrand to="/business/workspaces" />
        {!compact && <button type="button" className="business-sidebar-collapse" onClick={() => setSidebarCollapsed(value => !value)} aria-controls="business-primary-navigation" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"} title={sidebarCollapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}>{sidebarCollapsed ? <CaretRightIcon size={18} aria-hidden="true" /> : <CaretLeftIcon size={18} aria-hidden="true" />}</button>}
      </div>
      <nav id="business-primary-navigation" className="business-primary-nav" aria-label="Разделы Арены бизнеса">
        {primaryNavigation.map(([key, label, icon]) => key === "overview"
          ? <Link key={key} to="/business/workspaces" className="is-active" aria-current="page"><Icon name={icon} size={18}/><span>{label}</span></Link>
          : <span key={key} className="business-nav-disabled" aria-disabled="true" title="Сначала подключите компанию"><Icon name={icon} size={18}/><span>{label}</span></span>)}
      </nav>
      <div className="business-sidebar-footer"><Link to="/app"><Icon name="arrow-up-right" size={17}/>Арена переговоров</Link></div>
    </aside>
    <SupportDesk placement="sidebar" />
    <div className="business-workarea" ref={workareaRef}>
      <header className="business-topbar business-account-topbar">
        <Link className="business-topbar-back" to="/business" aria-label="Назад к Арене бизнеса"><Icon name="arrow-left" size={18}/><span className="business-topbar-back-label">Назад</span></Link>
        <button type="button" className="business-menu-toggle" ref={menuButtonRef} onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-label="Открыть корпоративную навигацию"><Icon name="layout-grid"/></button>
        <div className="business-top-actions">
          <button type="button" className="business-icon-button nova-account-messages" disabled aria-label="Сообщения доступны после подключения компании" title="Сообщения доступны после подключения компании"><ChatCircleDotsIcon size={22} aria-hidden="true" /></button>
          <button type="button" className="business-icon-button nova-account-notifications" disabled aria-label="Уведомления доступны после подключения компании" title="Уведомления доступны после подключения компании"><BellIcon size={22} aria-hidden="true" /></button>
          <ProfileWorkspaceMenu businessMode workspaceLabel="Арена бизнеса · без компании" profilePath="/profile" triggerClassName="nova-account-avatar business-user" onSignOut={() => { logout(); window.location.replace("/"); }}><UserAvatar avatarCode={user?.avatar_code} frameCode={user?.frame_code} userId={user?.id} size="xs" name="Мой профиль" /></ProfileWorkspaceMenu>
        </div>
      </header>
      <main id="business-main" className="business-main business-workspaces-main">{children}</main>
      <footer className="business-footer"><span>Арена бизнеса</span><span>Личная практика остаётся приватной</span></footer>
    </div>
    <BusinessMobileNavigation workspaces onOpenMenu={() => setMenuOpen(true)} />
  </div>;
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
    if (activeCompanies.length === 1 && !data.pending_invitations?.length && new URLSearchParams(location.search).get("choose") !== "1") {
      navigate(businessPath(activeCompanies[0].company_id), { replace: true });
    }
  }, [data, invitation, location.search, navigate]);
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
  return <BusinessWorkspaceFrame><div className="business-workspaces">
      <section className="business-workspaces-intro">
        <h1>{data && active.length === 0 ? "Подключитесь к рабочему пространству" : "Ваши компании"}</h1>
        <p className="business-lead">{data && active.length === 0 ? "Найдите свою компанию, используйте приглашение или создайте пространство для команды." : "Выберите рабочее пространство."}</p>
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
            <div><h2>Найти свою компанию</h2><p>Отправьте заявку — её подтвердит администратор.</p></div>
            <button ref={searchTriggerRef} type="button" className="primary-button" aria-expanded={searchOpen} aria-controls="business-company-search" onClick={() => setSearchOpen(value => !value)}><span>{searchOpen ? "Скрыть поиск" : "Найти компанию"}</span><Icon name={searchOpen ? "x" : "search"} size={18} /></button>
          </article>
          <article className="business-entry-option">
            <span className="business-entry-option-icon"><Icon name="layout-grid" size={24} /></span>
            <div><h2>Создать пространство</h2><p>Если вы руководитель, откройте его для команды.</p></div>
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
  </div></BusinessWorkspaceFrame>;
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
        <h1>Создайте рабочее пространство команды</h1>
        <p>Укажите название компании — остальное можно настроить позже. После создания пригласите коллег и начните с первой рабочей ситуации.</p>
      </section>
      <form className="business-create-card" onSubmit={create}>
        <div><h2>Данные компании</h2><p>Обязательные поля отмечены звёздочкой.</p></div>
        <label>Название компании *<input required minLength="2" maxLength="180" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Например, Северная студия" autoComplete="organization" /></label>
        <label>Отрасль <span className="business-label-muted">необязательно</span><input maxLength="120" value={form.industry} onChange={event => setForm({ ...form, industry: event.target.value })} placeholder="Например, финансы или образование" /></label>
        {!user?.email && <label>Электронная почта *<input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="email" /><small>Нужна для рабочего аккаунта и уведомлений компании.</small></label>}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("arena_business_sidebar_collapsed") === "true");
  const [pointerSectionChange, setPointerSectionChange] = useState(false);
  const inDemo = String(demoSession()?.company_id) === String(companyId);
  const leaveDemo = () => leaveBusinessDemo(refresh, navigate);
  const [data, setData] = useState(null), [error, setError] = useState(""), [menuOpen, setMenuOpen] = useState(false), [teamNavOpen, setTeamNavOpen] = useState(false);
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
  useEffect(() => { setMenuOpen(false); window.scrollTo({ top: 0, behavior: "instant" }); const requestedCompany = companyId; if (data && String(data.company.id) === String(companyId)) reload().catch(e => { if (activeCompany.current === requestedCompany) setError(e.message); }); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia("(max-width:767px)");
    const update = () => { setCompact(media.matches); setMenuOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("arena_business_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);
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
  const forestSection = hasBusinessForestHeader(section) && location.pathname.split("/").filter(Boolean).length === 3;
  useEffect(() => { if (section === "team") setTeamNavOpen(true); }, [section]);
  useEffect(() => {
    const nav = sidebarRef.current?.querySelector(".business-primary-nav");
    if (!nav) return undefined;
    const revealActive = () => nav.querySelector("a.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [data?.company?.id, section, teamNavOpen, menuOpen]);
  useEffect(() => {
    if (!pointerSectionChange) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPointerSectionChange(false), reduced ? 0 : 200);
    return () => window.clearTimeout(timer);
  }, [pointerSectionChange, section]);
  if (!data || String(data.company.id) !== String(companyId)) return <div className="business-standalone"><BusinessBrand /><DemoToolbar companyId={companyId}/><Loader error={error} onRetry={() => reload().catch(e => setError(e.message))} /><Link to="/business/continue">Вернуться в кабинет компании</Link></div>;
  const items = navigationFor(data);
  const currentLabel = businessSectionLabel(data, section) || ({onboarding:"Первый запуск",play:"Тренировка",dialogue:"Диалог с ИИ",guide:"Как устроена практика",rooms:"Практика 1×1",profile:"Личный кабинет",report:"Разбор",council:"Совет решений"}[section]) || "Рабочее пространство";
  const pageDescriptions = {
    overview: "Ваш ближайший шаг и состояние работы команды.",
    episodes: "Проведите важный рабочий разговор от подготовки до подтверждённого решения.",
    learning: "Отрепетируйте сложный разговор или выполните назначенную практику до реальной встречи.",
    meetings: "Планируйте созвоны и советы решений, затем фиксируйте понятный итог встречи.",
    team: "Найдите коллег, посмотрите структуру компании и управляйте составом команды.",
    community: "Новости компании, опросы, чаты и уведомления команды — в одном знакомом пространстве.",
    analytics: "Поймите, какие темы команде стоит усилить, по безопасной сводной динамике.",
    calendar: "Соберите встречи, практику и сроки в одном расписании и откройте нужное действие по дате.",
    assignments: "Назначайте практику команде и проверяйте, как сотрудники проходят её в срок.",
    results: "Смотрите результаты корпоративной практики и выбирайте темы для следующего шага.",
    certificates: "Храните подтверждённые достижения и быстро открывайте нужный документ.",
    messenger: "Обсуждайте рабочие вопросы с коллегами в контексте компании.",
    news: "Читайте новости команды, публикуйте важное и отвечайте на опросы.",
    council: "Разберите сложную ситуацию по ролям и найдите решение вместе с командой.",
    settings: "Настройте только то, что влияет на работу всей компании: доступы, правила и общий фокус.",
    profile: "Соберите личные задания, результаты и подтверждённые достижения в одном месте.",
  };
  const isDirector = data.membership?.role === "COMPANY_OWNER";
  const canManageTeam = Boolean(data.permissions?.manage_team);
  const canAssignPractice = Boolean(data.permissions?.manage_assignments || data.permissions?.manage_learning);
  const rolePageDescriptions = {
    episodes: canManageTeam
      ? "Создавайте подготовку к важным событиям, назначайте команду и отслеживайте готовность до даты встречи."
      : "Здесь собраны рабочие ситуации, в которых вы участвуете, и подготовка, назначенная вашей командой.",
    learning: isDirector
      ? "Назначайте практики сотрудникам и настраивайте регулярные правила — личные задания руководителя здесь не показываются."
      : canAssignPractice
        ? "Проходите свои практики и при необходимости назначайте отдельную подготовку сотрудникам своей команды."
        : "Здесь хранятся ваши назначенные практики, сроки и результаты. Новые задания появляются автоматически после назначения.",
    meetings: canManageTeam
      ? "Создавайте рабочие созвоны и Советы решений, а затем проверяйте и публикуйте понятные итоги встреч."
      : "Здесь находятся встречи, в которые вас добавили, их заметки и опубликованные итоги.",
    team: isDirector
      ? "Управляйте сотрудниками, подразделениями и заявками, а также поддерживайте понятную структуру компании."
      : canManageTeam
        ? "Смотрите свою ветку подчинения и состав команды. Управление структурой и приглашениями остаётся у компании."
        : "Смотрите структуру компании и коллег в режиме просмотра. Управление сотрудниками доступно руководителям.",
    analytics: canManageTeam
      ? "Смотрите безопасную сводку по своей команде и выбирайте темы для следующего шага в подготовке."
      : "Смотрите свой прогресс по назначенным практикам без сравнения с коллегами.",
  };
  const pageDescription = rolePageDescriptions[section] || pageDescriptions[section] || "Единое пространство для практики и развития команды.";
  const errorMessage = typeof error === "string" ? error.trim() : "";
  const unread = data.inbox.filter(item => !item.read).length;
  const communicationTab = section === "community" ? new URLSearchParams(location.search).get("tab") || "feed" : "";
  const communicationPath = tab => `${businessPath(companyId, "community")}?tab=${tab}`;
  async function start(id) {
    try {
      const requestedCompany = companyId;
      const result = await api(`/api/company/${data.company.id}/assignments/${id}/start`, { method: "POST" });
      if (activeCompany.current !== requestedCompany) return;
      navigate(businessPath(companyId, `play/${result.session_id}`), { state: { returnTo: businessPath(companyId, "learning") } });
    } catch(e) { setError(typeof e?.message === "string" && e.message.trim() ? e.message : "Не удалось открыть практику. Попробуйте ещё раз."); }
  }
  function scrollToTeamSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }
  function markPointerSectionChange() {
    setPointerSectionChange(true);
  }
  function markKeyboardSectionChange(event) {
    if (event.key === "Enter" || event.key === " ") setPointerSectionChange(false);
  }
  const teamSections = [
    ["company-employees", "Сотрудники"],
    ["company-departments", "Подразделения"],
    ...(data.permissions.manage_company ? [["company-applications", "Заявки"]] : []),
  ];
  const teamQuickNav = section === "team" && <nav className="business-team-quick-nav" aria-label="Переход по странице компании">
    {teamSections.map(([id, label]) => <button type="button" key={id} onClick={() => scrollToTeamSection(id)}>{label}</button>)}
  </nav>;
  return <BusinessContext.Provider value={{data,reload,start,setTab:tab => navigate(businessPath(companyId,tab))}}>
    <div className={`business-shell${forestSection ? " business-sections-forest" : ""}${sidebarCollapsed && !compact ? " is-sidebar-collapsed" : ""}`} data-business-section={section}>
      <BusinessForestBackdrop section={section}/>
      <a className="business-skip" href="#business-main">К содержимому</a>
      {menuOpen && <button className="business-nav-scrim" aria-label="Закрыть навигацию" tabIndex={-1} onClick={() => setMenuOpen(false)} />}
      <aside className={`business-sidebar${menuOpen ? " is-open" : ""}`} aria-label="Корпоративная навигация" ref={sidebarRef} role={compact && menuOpen ? "dialog" : undefined} aria-modal={compact && menuOpen ? true : undefined}>
        <button className="business-menu-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><Icon name="x"/></button>
        <div className="business-sidebar-brand-row">
          <BusinessBrand />
          {!compact && <button type="button" className="business-sidebar-collapse" onClick={() => setSidebarCollapsed(value => !value)} aria-controls="business-primary-navigation" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"} title={sidebarCollapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}>{sidebarCollapsed ? <CaretRightIcon size={18} aria-hidden="true" /> : <CaretLeftIcon size={18} aria-hidden="true" />}</button>}
        </div>
        <nav id="business-primary-navigation" className="business-primary-nav" aria-label="Разделы компании">
          {items.map((item) => item[0] !== "team" ? <NavLink key={item[0]} data-business-tour={`nav-${item[0]}`} to={businessPath(companyId, item[0])} onPointerDown={markPointerSectionChange} onKeyDown={markKeyboardSectionChange} aria-label={sidebarCollapsed && !compact ? item[1] : undefined} title={sidebarCollapsed && !compact ? item[1] : undefined} className={({ isActive }) => isActive || (section === "council" && item[0] === "meetings") ? "is-active" : ""}>
            <Icon name={item[2]} size={18}/><span>{item[1]}</span>
          </NavLink> : <div key="team" className={`business-nav-disclosure${section === "team" ? " is-active" : ""}`}>
            <div className="business-nav-disclosure-head"><NavLink data-business-tour="nav-team" to={businessPath(companyId, "team")} onPointerDown={markPointerSectionChange} onKeyDown={markKeyboardSectionChange} aria-label={sidebarCollapsed && !compact ? "Команда" : undefined} title={sidebarCollapsed && !compact ? "Команда" : undefined} className={({ isActive }) => isActive ? "is-active" : ""}><Icon name="users" size={18}/><span>Команда</span></NavLink><button type="button" className="business-nav-disclosure-toggle" aria-expanded={teamNavOpen} aria-label={teamNavOpen ? "Свернуть раздел команды" : "Развернуть раздел команды"} onClick={() => setTeamNavOpen(value => !value)}><CaretDownIcon size={18} aria-hidden="true" /></button></div>
            {teamNavOpen && <div className="business-nav-submenu"><Link to={`${businessPath(companyId, "team")}#company-structure`}>Сотрудники и иерархия</Link><Link to={`${businessPath(companyId, "team")}#company-departments`}>Подразделения</Link>{data.permissions?.manage_company && <Link to={`${businessPath(companyId, "team")}#company-applications`}>Заявки</Link>}</div>}
          </div>)}
        </nav>
        {inDemo && <div className="business-sidebar-footer"><button onClick={leaveDemo}><Icon name="arrow-up-right" size={17}/>Завершить демо</button></div>}
      </aside>
      <SupportDesk placement="sidebar" />
      <div className="business-workarea" ref={workareaRef}><header className="business-topbar business-account-topbar">
        <Link className="business-topbar-back" to={businessBackTarget(companyId, location.pathname)} aria-label="Назад"><Icon name="arrow-left" size={18}/><span className="business-topbar-back-label">Назад</span></Link>
        <button type="button" className="business-menu-toggle" data-business-tour="menu" ref={menuButtonRef} onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen} aria-label="Открыть корпоративную навигацию"><Icon name="layout-grid"/></button>
        <div className="business-top-actions">
          <NavLink to={communicationPath("messages")} data-business-tour="messages" className={`business-icon-button nova-account-messages${communicationTab === "messages" ? " is-active" : ""}`} aria-current={communicationTab === "messages" ? "page" : undefined} aria-label="Открыть сообщения команды"><ChatCircleDotsIcon size={22} aria-hidden="true" /></NavLink>
          <NavLink to={communicationPath("notifications")} className={`business-icon-button nova-account-notifications${communicationTab === "notifications" ? " is-active" : ""}`} aria-current={communicationTab === "notifications" ? "page" : undefined} aria-label={`Уведомления: ${unread} непрочитанных`}><BellIcon size={22} aria-hidden="true" />{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</NavLink>
          <ProfileWorkspaceMenu companyId={companyId} settingsPath={canAccessBusinessSection(data, "settings") ? businessPath(companyId,"settings") : undefined} triggerClassName="nova-account-avatar business-user" allowSwitch={!inDemo} onSignOut={() => { if (inDemo) { leaveDemo(); return; } logout(); window.location.replace("/"); }}><UserAvatar avatarCode={user?.avatar_code} frameCode={user?.frame_code} userId={user?.id} size="xs" name="Мой профиль" /></ProfileWorkspaceMenu>
        </div>
      </header>
      <main id="business-main" className="business-main">
        <div key={`${companyId}:${section}`} className={`business-section-transition${pointerSectionChange ? " is-pointer-change" : ""}`}>
        <DemoToolbar companyId={companyId}/>
        {forestSection
          ? <BusinessSectionHeader section={section} title={currentLabel} description={pageDescription}>{teamQuickNav}</BusinessSectionHeader>
          : !["overview", "onboarding"].includes(section) && <div className="business-page-heading"><div><h1>{currentLabel}</h1><p className="business-page-description">{pageDescription}</p></div>{teamQuickNav}</div>}
        {errorMessage && <p className="business-alert" role="alert">{errorMessage}<button onClick={() => setError("")} aria-label="Скрыть сообщение">×</button></p>}
        <Outlet key={companyId} />
        </div>
      </main>
      {section !== "overview" && <footer className="business-footer"><span>{data.company.name} · {data.membership.department || data.membership.role_label}</span><span>Личная практика остаётся приватной</span></footer>}</div>
      <BusinessMobileNavigation companyId={companyId} items={items} section={section} onOpenMenu={() => setMenuOpen(true)} />
      <BusinessProductTour companyId={companyId} userId={user?.id} section={section} compact={compact} isManager={Boolean(data.permissions?.manage_company || data.permissions?.manage_team)}/>
    </div>
  </BusinessContext.Provider>;
}

export function BusinessSectionPage() {
  const { section = "overview", companyId } = useParams();
  const { data, reload, start, setTab } = useBusiness();
  const canonicalSection = canonicalBusinessSection(section);
  if (canonicalSection !== section) {
    const communicationTabs = { messenger: "messages", notifications: "notifications", surveys: "surveys", news: "feed", community: "feed" };
    const communicationTab = communicationTabs[section];
    return <Navigate to={`${businessPath(companyId, canonicalSection)}${communicationTab ? `?tab=${communicationTab}` : ""}`} replace />;
  }
  if (section === "me") return <Navigate to={businessPath(companyId, "profile")} replace />;
  if (section === "onboarding" && data.permissions.manage_company) {
    return <PilotOnboarding data={data} reload={reload}/>;
  }
  if (section === "profile") return <CompanySection tab="profile" data={data} reload={reload} start={start} setTab={setTab}/>;
  if (section === "practice") return <><section className="business-practice-intro"><div><h2>Отработайте рабочую ситуацию</h2><p>Корпоративные результаты создаются при запуске назначенного задания. Личную тренировку можно открыть отдельно.</p></div>{data.company.status !== "DEMO" && <Link className="subtle-button" to="/ai">Личная практика с ИИ ↗</Link>}</section><BusinessTrainer data={data} reload={reload} start={start}/><CompanySection tab="learning" data={data} reload={reload} start={start} setTab={setTab}/></>;
  if (!canAccessBusinessSection(data, section)) return <section className="business-panel" role="alert"><h2>Раздел недоступен</h2><p>Этот раздел не входит в вашу область доступа.</p><Link className="subtle-button" to={businessPath(companyId)}>Перейти к обзору</Link></section>;
  return <div className="business-company-section"><CompanySection tab={section} data={data} reload={reload} start={start} setTab={setTab}/></div>;
}


