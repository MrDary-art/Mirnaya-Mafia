import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { CompanySection, Loader } from "../company/index.js";
import { Messenger } from "../company/messenger.jsx";
import { EmployeeCabinet } from "../company/employee-cabinet.jsx";
import { CompanyNotifications } from "../company/notifications.jsx";
import Icon from "../components/Icon.jsx";
import { businessPath, businessSectionLabel, canAccessBusinessSection, canonicalBusinessSection, isCompanyAdmin, navigationFor } from "./navigation.js";
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


export function BusinessWorkspaces() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [code, setCode] = useState(""), [preview, setPreview] = useState(null);
  const location = useLocation(), navigate = useNavigate();
  const invitation = new URLSearchParams(location.search).get("invitation") || "";
  const load = () => api("/api/company/context").then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!invitation) return;
    setCode(invitation);
    api(`/api/company/invitations/${encodeURIComponent(invitation)}`, { auth: false }).then(setPreview).catch(e => setError(e.message));
  }, [invitation]);
  useEffect(() => {
    if (!data || invitation) return;
    const activeCompanies = data.companies?.filter(c => c.status === "ACTIVE") || [];
    if (activeCompanies.length === 1) navigate(businessPath(activeCompanies[0].company_id), { replace: true });
    else if (!activeCompanies.length && !data.pending_invitations?.length) navigate("/business/create", { replace: true });
  }, [data, invitation, navigate]);
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
  return <div className="business-public business-workspaces"><header><BusinessBrand /><Link to="/app">В личную арену <span aria-hidden="true">↗</span></Link></header><main>
    <h1>Выберите компанию</h1><p className="business-lead">Один аккаунт. Отдельные команды, задания и результаты.</p>
    {error && <p className="business-alert" role="alert">{error}</p>}
    {!data ? <Loader error={error} onRetry={load} /> : <div className="business-company-grid">
      {active.map(c => <Link key={c.company_id} className="business-company-card" to={businessPath(c.company_id)}><span className="business-company-monogram">{c.name.slice(0, 1)}</span><div><h2>{c.name}</h2><p>{c.department || "Корпоративное пространство"}</p></div><Icon name="arrow-right" /></Link>)}
      <Link className="business-company-card business-company-create" to="/business/create"><Icon name="arrow-right" /><div><h2>Новая компания</h2><p>Создать пространство и пригласить команду</p></div></Link>
    </div>}
    {data?.pending_invitations?.map(invite => <article className="business-panel" key={invite.membership_id}><span className="business-eyebrow">Приглашение</span><h2>{invite.company.name}</h2><p>{invite.job_title} · {invite.role}</p><div className="business-actions"><button disabled={busy} className="primary-button" onClick={() => respond(invite.membership_id, "accept")}>Присоединиться</button><button disabled={busy} className="subtle-button" onClick={() => respond(invite.membership_id, "decline")}>Отклонить</button></div></article>)}
    <form className="business-panel" onSubmit={acceptLink}><h2>{preview ? `Приглашение в «${preview.company.name}»` : "Есть приглашение?"}</h2><p>{preview ? `${preview.role_label || preview.corporate_role} · ${preview.job_title || "Сотрудник"}` : "Вставьте ссылку или одноразовый код, выданный компанией."}</p><label>Ссылка или код приглашения<input value={code} onChange={e => { setCode(e.target.value); setPreview(null); }} required autoComplete="off" /></label><button disabled={busy} className="primary-button">{busy ? "Проверяем…" : preview ? "Подтвердить вступление" : "Проверить приглашение"}</button></form>
    <p className="business-privacy-note">Личные игры и сообщения доступны только вам. Компания получает результаты корпоративных заданий в пределах выданных прав.</p>
  </main></div>;
}

export function BusinessCreate() {
  const [form, setForm] = useState({ name: "", industry: "", company_size: "" });
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
    <header><BusinessBrand /><Link to="/business/continue">Вернуться в кабинет</Link></header>
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
        <label>Размер команды <span className="business-label-muted">необязательно</span><select value={form.company_size} onChange={event => setForm({ ...form, company_size: event.target.value })}><option value="">Выберите размер</option><option value="1–50">1–50 сотрудников</option><option value="51–200">51–200 сотрудников</option><option value="201–1000">201–1000 сотрудников</option><option value="1000+">Более 1000 сотрудников</option></select></label>
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
  const [data, setData] = useState(null), [error, setError] = useState(""), [menuOpen, setMenuOpen] = useState(false), [chatOpen, setChatOpen] = useState(false), [notificationsOpen, setNotificationsOpen] = useState(false);
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
  useEffect(() => {
    if (!chatOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === "Escape") setChatOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [chatOpen]);
  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const closeOnEscape = event => { if (event.key === "Escape") setNotificationsOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [notificationsOpen]);
  const rawSection = location.pathname.split("/")[3] || "overview";
  const section = canonicalBusinessSection(rawSection);
  if (!data || String(data.company.id) !== String(companyId)) return <div className="business-standalone"><BusinessBrand /><DemoToolbar companyId={companyId}/><Loader error={error} onRetry={() => reload().catch(e => setError(e.message))} /><Link to="/business/continue">Вернуться в кабинет компании</Link></div>;
  const items = navigationFor(data);
  const currentLabel = businessSectionLabel(data, section) || ({onboarding:"Первый запуск",play:"Тренировка",dialogue:"Диалог с ИИ",guide:"Как устроена практика",profile:"Личный кабинет",report:"Разбор"}[section]) || "Рабочее пространство";
  const pageDescriptions = {
    overview: "Ваш следующий шаг, важные задачи и состояние рабочего дня.",
    learning: "Программы, уроки, тесты и практика собраны в единый путь.",
    team: "Структура компании, подразделения и сотрудники.",
    community: "Публикации и опросы вашей компании.",
    growth: "Компетенции, траектория, рекомендации и подтверждённые достижения.",
    assignments: "Создавайте практику, назначайте её командам и отслеживайте сроки.",
    results: "Смотрите динамику только по корпоративным заданиям и их результатам.",
    certificates: "Смотрите выданные сертификаты, открывайте их и скачивайте подтверждения.",
    messenger: "Общайтесь с сотрудниками в личных и групповых чатах компании.",
    news: "Публикации, объявления и короткие опросы для вашей команды.",
    meetings: "Планируйте встречи 1×1 и фиксируйте договорённости.",
    settings: "Профиль компании, доступы, лицензии и правила работы с данными.",
    profile: "Ваши задания, прогресс, результаты и подтверждённые достижения.",
  };
  const pageDescription = pageDescriptions[section] || "Единое пространство для практики и развития команды.";
  const unread = data.inbox.filter(item => !item.read).length;
  const memberIdentity = <><span>{(user.display_name || user.username || "А").slice(0, 1)}</span><span>{user.display_name || user.username}<small>{data.membership.role_label}</small></span></>;
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
          {items.map((item) => <NavLink key={item[0]} to={businessPath(companyId, item[0])} className={({ isActive }) => isActive ? "is-active" : ""}>
            <Icon name={item[2]} size={18}/><span>{item[1]}</span>
          </NavLink>)}
        </nav>
        <div className="business-sidebar-footer">{inDemo ? <button onClick={leaveDemo}><Icon name="arrow-up-right" size={17}/>Завершить демо</button> : <Link to="/app"><Icon name="arrow-up-right" size={17}/>В личную арену</Link>}</div>
      </aside>
      <div className="business-workarea" ref={workareaRef}><header className="business-topbar">
        <button type="button" className="business-menu-toggle" ref={menuButtonRef} onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen} aria-label="Открыть корпоративную навигацию"><Icon name="layout-grid"/></button>
        <nav className="business-breadcrumb" aria-label="Хлебные крошки"><Link to={businessPath(companyId)}>{data.company.name}</Link><span aria-hidden="true">/</span><span aria-current="page">{currentLabel}</span></nav>
        <div className="business-top-actions"><button type="button" className="business-icon-button" aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-label={`Уведомления: ${unread} непрочитанных`} onClick={() => { setChatOpen(false); setNotificationsOpen(value => !value); reload().catch(() => {}); }}><Icon name="bell"/>{unread > 0 && <i/>}</button>{isCompanyAdmin(data) && <Link to={businessPath(companyId,"settings")} className="business-icon-button" aria-label="Настройки компании"><Icon name="shield-check"/></Link>}<Link className="business-user" aria-label="Открыть личный кабинет" to={businessPath(companyId,"profile")}>{memberIdentity}</Link><button className="business-icon-button business-logout" aria-label="Выйти из аккаунта" onClick={() => { if (inDemo) { leaveDemo(); return; } logout(); window.location.replace("/business"); }}><Icon name="log-out"/></button></div>
      </header>
      <main id="business-main" className="business-main">
        <DemoToolbar companyId={companyId}/>
        <div className="business-page-heading"><div><h1>{currentLabel}</h1><p className="business-page-description">{pageDescription}</p></div>{section === "team" && <nav className="business-team-quick-nav" aria-label="Переход по странице компании">{teamSections.map(([id, label]) => <button type="button" key={id} onClick={() => scrollToTeamSection(id)}>{label}</button>)}</nav>}</div>
        {error && <p className="business-alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Скрыть сообщение">×</button></p>}
        <Outlet key={companyId} />
      </main>
      {notificationsOpen && <><button className="business-chat-scrim" aria-label="Закрыть уведомления" onClick={() => setNotificationsOpen(false)} /><aside className="business-notification-drawer" role="dialog" aria-modal="true" aria-label="Уведомления компании"><header><div><h2>Уведомления</h2><p>События вашей работы и команды</p></div><button className="business-icon-button" type="button" onClick={() => setNotificationsOpen(false)} aria-label="Закрыть уведомления"><Icon name="x"/></button></header><CompanyNotifications data={data} reload={reload} compact onNavigate={path => { setNotificationsOpen(false); navigate(path); }}/></aside></>}
      {chatOpen && <><button className="business-chat-scrim" aria-label="Закрыть чат" onClick={() => setChatOpen(false)} /><aside className="business-chat-drawer" role="dialog" aria-modal="true" aria-label="Чат команды"><header><div><h2>Чат команды</h2><p>Рабочие разговоры компании</p></div><button className="business-icon-button" type="button" onClick={() => setChatOpen(false)} aria-label="Закрыть чат"><Icon name="x"/></button></header><Messenger data={data} /></aside></>}
      <button className="business-chat-launch" type="button" onClick={() => { setNotificationsOpen(false); setChatOpen(true); }} aria-haspopup="dialog"><Icon name="message-circle" size={18}/><span>Чат</span></button>
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
  if (section === "profile") return <EmployeeCabinet data={data} start={start} />;
  if (section === "practice") return <><section className="business-practice-intro"><div><h2>Отработайте рабочую ситуацию</h2><p>Корпоративные результаты создаются при запуске назначенного задания. Личную тренировку можно открыть отдельно.</p></div>{data.company.status !== "DEMO" && <Link className="subtle-button" to="/ai">Личная практика с ИИ ↗</Link>}</section><BusinessTrainer data={data} reload={reload} start={start}/><CompanySection tab="learning" data={data} reload={reload} start={start} setTab={setTab}/></>;
  if (!canAccessBusinessSection(data, section)) return <section className="business-panel" role="alert"><h2>Раздел недоступен</h2><p>Этот раздел не входит в вашу область доступа.</p><Link to={businessPath(companyId)}>Перейти к обзору</Link></section>;
  return <div className="business-company-section"><CompanySection tab={section} data={data} reload={reload} start={start} setTab={setTab}/></div>;
}


