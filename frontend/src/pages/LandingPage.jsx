import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useAuth } from "../auth.jsx";
import Login from "./Login.jsx";
import { team } from "./landingContent.js";
import "./landing-gateway.css";

const primaryNavigation = [["description", "Описание"], ["about", "О нас"]];
const roleRows = [
  { role: "Обычный участник", entrance: "Арена переговоров", description: "Личная практика, сценарии, тренировки с ИИ, встречи и собственные отчёты." },
  { role: "Сотрудник компании", entrance: "Арена для бизнеса", description: "Назначенное обучение, задачи, календарь, команда и только свои результаты." },
  { role: "Генеральный директор", entrance: "Арена для бизнеса", description: "Рабочее пространство компании, сотрудники, назначения, аналитика и настройки." },
];

const teamImages = import.meta.glob("../assets/team/*.{jpg,jpeg,png,webp,avif,svg}", { eager: true, query: "?url", import: "default" });

function TeamPortrait({ person }) {
  const [failed, setFailed] = useState(false);
  const placeholder = teamImages[`../assets/team/${person.photo}.svg`];
  const photo = ["jpg", "jpeg", "png", "webp", "avif"].map((extension) => teamImages[`../assets/team/${person.photo}.${extension}`]).find(Boolean);
  return <img className="gateway-team-portrait" src={failed ? placeholder : photo || placeholder} alt={photo && !failed ? person.name : ""} loading="lazy" width="260" height="320" onError={() => setFailed(true)} />;
}

function Brand() {
  return <a className="gateway-brand" href="#top" aria-label="Арена переговоров, наверх"><img src="/assets/arena-owl-logo.png" width="40" height="40" alt="" /><span>Арена переговоров</span></a>;
}

function Header({ activeSection, menuOpen, onToggleMenu, onCloseMenu, onOpenEntry, menuButtonRef }) {
  const links = (className) => primaryNavigation.map(([id, label]) => <a key={id} className={`${className}${activeSection === id ? " is-active" : ""}`} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined} onClick={onCloseMenu}>{label}</a>);
  return <header className="gateway-header">
    <div className="gateway-header-inner">
      <Brand />
      <nav className="gateway-nav" aria-label="Разделы сайта">{links("gateway-nav-link")}</nav>
      <button className="gateway-login-button" type="button" onClick={(event) => onOpenEntry(event.currentTarget)}>Войти <ArrowRightIcon size={16} aria-hidden="true" /></button>
      <button ref={menuButtonRef} className="gateway-menu-button" type="button" aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={menuOpen} aria-controls="gateway-mobile-menu" onClick={onToggleMenu}>{menuOpen ? <XIcon size={22} aria-hidden="true" /> : <ListIcon size={22} aria-hidden="true" />}</button>
    </div>
    {menuOpen && <nav id="gateway-mobile-menu" className="gateway-mobile-menu" aria-label="Мобильная навигация">{links("gateway-mobile-link")}<button type="button" onClick={() => { onCloseMenu(); onOpenEntry(menuButtonRef.current); }}>Войти</button></nav>}
  </header>;
}

function PersonalPreview() {
  return <div className="gateway-personal-preview" aria-hidden="true"><span>Сегодня</span><strong>Разговор о новых условиях</strong><div><i style={{ width: "72%" }} /><small>Прогресс сценария</small></div></div>;
}

function BusinessPreview() {
  return <div className="gateway-business-preview" data-ui aria-hidden="true"><div className="gateway-business-preview-head"><span>Рабочее пространство</span><b>Север</b></div><div className="gateway-business-preview-body"><p>На этой неделе</p><strong>Подготовка к сложному разговору</strong><div className="gateway-business-task"><span>Назначено команде</span><b>18 из 24</b></div><div className="gateway-business-task"><span>Ближайший дедлайн</span><b>Пятница</b></div></div></div>;
}

function ModeStage({ onChoose }) {
  return <section className="gateway-stage" aria-labelledby="gateway-title">
    <div className="gateway-intro"><h1 id="gateway-title"><span className="gateway-line"><span style={{ "--line-order": 0 }}>Две Арены.</span></span><span className="gateway-line"><span style={{ "--line-order": 1 }}>Один вход.</span></span></h1><span data-rise>Выберите, где хотите продолжить. Должность не нужно указывать при входе, права определит ваша компания.</span></div>
    <div className="gateway-mode-split">
      <article className="gateway-mode gateway-mode-personal" data-reveal="panel">
        <picture aria-hidden="true"><source media="(max-width: 700px)" srcSet="/assets/forest2d/hero-mobile.webp" /><img src="/assets/forest2d/hero.webp" alt="" fetchPriority="high" /></picture>
        <div className="gateway-mode-content"><h2>Арена переговоров</h2><p>Для личной практики</p><span>Тренируйте личные и рабочие разговоры, проходите сценарии и получайте разбор своих решений.</span><PersonalPreview /><button type="button" onClick={(event) => onChoose("personal", event.currentTarget)}>Войти или зарегистрироваться <ArrowRightIcon size={17} aria-hidden="true" /></button></div>
      </article>
      <article className="gateway-mode gateway-mode-business" data-reveal="panel" style={{ "--reveal-delay": "90ms" }}>
        <div className="gateway-mode-content"><h2>Арена для бизнеса</h2><p>Для сотрудников и руководителей</p><span>Сотрудники выполняют программы компании. Руководители назначают обучение и видят прогресс команды.</span><BusinessPreview /><button type="button" onClick={(event) => onChoose("company", event.currentTarget)}>Войти или зарегистрироваться <ArrowRightIcon size={17} aria-hidden="true" /></button></div>
      </article>
    </div>
  </section>;
}

function EntryChooser({ dialogRef, onClose, onChoose }) {
  return <div className="gateway-entry-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="gateway-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="gateway-entry-title" aria-describedby="gateway-entry-description" tabIndex={-1}>
    <button className="gateway-entry-close" type="button" aria-label="Закрыть окно" onClick={onClose}><XIcon size={21} aria-hidden="true" /></button>
    <p className="gateway-entry-context"><span aria-hidden="true" />Выбор пространства</p>
    <h2 id="gateway-entry-title">Куда хотите войти?</h2>
    <p id="gateway-entry-description">Один профиль работает в обоих пространствах.</p>
    <div className="gateway-entry-options">
      <button type="button" onClick={(event) => onChoose("personal", event.currentTarget)}>
        <span className="gateway-entry-option-icon"><UserCircleIcon size={25} aria-hidden="true" /></span>
        <span className="gateway-entry-option-copy"><strong>Арена переговоров</strong><small>Личные тренировки, сценарии, ИИ и разборы</small></span>
        <span className="gateway-entry-option-action">Выбрать <ArrowRightIcon size={16} aria-hidden="true" /></span>
      </button>
      <button type="button" onClick={(event) => onChoose("company", event.currentTarget)}>
        <span className="gateway-entry-option-icon"><BuildingsIcon size={25} aria-hidden="true" /></span>
        <span className="gateway-entry-option-copy"><strong>Арена для бизнеса</strong><small>Компания, сотрудники, обучение и встречи</small></span>
        <span className="gateway-entry-option-action">Выбрать <ArrowRightIcon size={16} aria-hidden="true" /></span>
      </button>
    </div>
  </section></div>;
}

export default function LandingPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAuthMode = ["login", "register"].includes(searchParams.get("auth")) ? searchParams.get("auth") : null;
  const requestedNextPath = searchParams.get("next") || "";
  const requestedPortal = searchParams.get("portal") === "company" || requestedNextPath.startsWith("/business") ? "company" : "personal";
  const authenticatedTarget = useRef(requestedPortal === "company" ? "/business/continue" : null);
  const [activeSection, setActiveSection] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(() => Boolean(requestedAuthMode));
  const [entryStage, setEntryStage] = useState(() => requestedAuthMode ? "auth" : "choose");
  const [authMode, setAuthMode] = useState(() => requestedAuthMode || "login");
  const [authPortal, setAuthPortal] = useState(requestedPortal);
  const [authNextPath, setAuthNextPath] = useState(() => requestedNextPath || (requestedPortal === "company" ? "/business/continue" : "/app"));
  const requestedBusinessTarget = useRef(requestedPortal === "company" && requestedNextPath.startsWith("/business/") ? requestedNextPath : null);
  const menuButtonRef = useRef(null);
  const entryDialogRef = useRef(null);
  const entryReturnRef = useRef(null);

  const pushModalState = useCallback(() => {
    if (entryOpen) return;
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.pushState({ ...currentState, arenaEntryModal: true }, "", window.location.href);
  }, [entryOpen]);
  const openEntry = useCallback((trigger = null) => {
    pushModalState();
    if (trigger) entryReturnRef.current = trigger;
    setAuthMode("login"); setEntryStage("choose"); setEntryOpen(true); setMenuOpen(false);
  }, [pushModalState]);
  const chooseArena = useCallback((portal, trigger = null) => {
    pushModalState();
    if (trigger && !entryOpen) entryReturnRef.current = trigger;
    setAuthPortal(portal); setAuthNextPath(portal === "company" ? requestedBusinessTarget.current || "/business/continue" : "/app"); setEntryStage("auth"); setEntryOpen(true);
  }, [entryOpen, pushModalState]);
  const closeEntry = useCallback(() => {
    if (window.history.state?.arenaEntryModal) window.history.back();
    else setEntryOpen(false);
  }, []);

  useEffect(() => { if (ready && !user && requestedAuthMode) navigate("/", { replace: true }); }, [navigate, ready, requestedAuthMode, user]);
  useEffect(() => {
    const onPopState = (event) => setEntryOpen(Boolean(event.state?.arenaEntryModal));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const sections = primaryNavigation.map(([id]) => document.getElementById(id)).filter(Boolean);
    let frame = 0;
    const update = () => { frame = 0; const line = Math.min(220, window.innerHeight * .32); const current = [...sections].reverse().find((section) => section.getBoundingClientRect().top <= line); setActiveSection(current?.id || ""); };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    schedule(); window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); } };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
  useEffect(() => {
    if (!entryOpen || entryStage !== "choose") return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = entryDialogRef.current;
    requestAnimationFrame(() => dialog?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeEntry(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll("button:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")].filter((element) => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === dialog) { event.preventDefault(); first.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow;
      if (!entryOpen) { const returnFocus = entryReturnRef.current || previousFocus; if (returnFocus?.isConnected) returnFocus.focus(); }
    };
  }, [closeEntry, entryOpen, entryStage]);

  useEffect(() => {
    document.documentElement.classList.add("gateway-js");
    const elements = [...document.querySelectorAll("[data-reveal]")];
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return () => document.documentElement.classList.remove("gateway-js");
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("gateway-js");
    };
  }, []);

  useEffect(() => {
    if (!entryOpen) entryReturnRef.current?.focus();
  }, [entryOpen]);

  if (ready && user) return <Navigate to={authenticatedTarget.current || "/app"} replace />;

  return <div className="gateway-page" id="top">
    <a className="gateway-skip" href="#main-content">К содержимому</a>
    <Header activeSection={activeSection} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} onCloseMenu={() => setMenuOpen(false)} onOpenEntry={openEntry} menuButtonRef={menuButtonRef} />
    <main id="main-content">
      <ModeStage onChoose={chooseArena} />
      <section id="description" className="gateway-section gateway-description" aria-labelledby="description-title"><div className="gateway-container">
        <div className="gateway-section-head"><h2 id="description-title" data-reveal>Вход один.<br />Роли разные.</h2><span data-reveal style={{ "--reveal-delay": "80ms" }}>Сотрудник и генеральный директор входят в «Арену для бизнеса» одинаково. Права появляются из подтверждённого членства в компании, а не из отдельной кнопки входа.</span></div>
        <table className="gateway-role-map"><caption>Карта входов и ролей</caption><tbody>{roleRows.map((item, index) => <tr key={item.role} data-reveal="row" style={{ "--reveal-delay": `${index * 65}ms` }}><th scope="row">{item.role}</th><td>{item.entrance}</td><td>{item.description}</td></tr>)}</tbody></table>
        <div className="gateway-no-company"><div data-reveal="side"><h3>Пока без компании?</h3><span>Это не тупик и не регистрация «для директора». После входа вы выбираете нужное действие.</span></div><div className="gateway-no-company-actions" aria-label="Действия пользователя без компании" data-reveal="side" style={{ "--reveal-delay": "90ms" }}><span><b>Найти свою компанию</b><small>Отправить заявку сотрудника</small></span><span><b>Зарегистрировать компанию</b><small>Создать пространство как руководитель</small></span></div></div>
      </div></section>
      <section id="about" className="gateway-section gateway-about" aria-labelledby="about-title"><div className="gateway-container">
        <div className="gateway-about-copy"><h2 id="about-title" data-reveal>Разговоры можно репетировать.</h2><span data-reveal style={{ "--reveal-delay": "80ms" }}>«Арена переговоров» помогает человеку попробовать разные решения и увидеть последствия. Бизнес-версия добавляет общий контекст компании: программы, назначения и понятный прогресс, без смешивания личного профиля с управлением сотрудниками.</span></div>
        <div className="gateway-team" aria-label="Команда проекта">{team.map((person, index) => <article key={person.photo} data-reveal="image" style={{ "--reveal-delay": `${index * 70}ms` }}><TeamPortrait person={person} /><h3>{person.name}</h3></article>)}</div>
      </div></section>
    </main>
    <footer className="gateway-footer"><div className="gateway-container gateway-footer-main"><div><Brand /><p>Тренажёр деловых переговоров для личной практики и команд.</p></div><nav aria-label="Разделы страницы"><a href="#description">Описание</a><a href="#about">О нас</a><Link to="/business">Подробнее для компаний</Link></nav><button type="button" onClick={(event) => openEntry(event.currentTarget)}>Войти <ArrowRightIcon size={17} aria-hidden="true" /></button></div><div className="gateway-container gateway-footer-bottom">© {new Date().getFullYear()} Арена переговоров</div></footer>
    {entryOpen && entryStage === "choose" && <EntryChooser dialogRef={entryDialogRef} onClose={closeEntry} onChoose={chooseArena} />}
    {entryOpen && entryStage === "auth" && <Login portal={authPortal} initialMode={authMode} redirectTo={authNextPath} onClose={closeEntry} onModeChange={setAuthMode} onAuthenticated={(target) => { authenticatedTarget.current = target; }} returnFocusRef={entryReturnRef} />}
  </div>;
}
