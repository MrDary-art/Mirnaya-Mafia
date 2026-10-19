import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { BookOpenTextIcon } from "@phosphor-icons/react/dist/csr/BookOpenText";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import { HandshakeIcon } from "@phosphor-icons/react/dist/csr/Handshake";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { StrategyIcon } from "@phosphor-icons/react/dist/csr/Strategy";
import { TargetIcon } from "@phosphor-icons/react/dist/csr/Target";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useAuth } from "../auth.jsx";
import Login from "./Login.jsx";
import { team } from "./landingContent.js";
import "./landing-gateway.css";

const primaryNavigation = [["description", "Что мы предлагаем"], ["how-it-works", "Как это работает"], ["about", "О нас"]];
const steps = [
  { title: "Сформулируйте цель", description: "Определите, какого результата хотите добиться в разговоре." },
  { title: "Проведите переговоры", description: "Выбирайте стратегию и принимайте решения по ходу беседы." },
  { title: "Разберите результат", description: "Оцените, что сработало, и определите следующий шаг." },
];
const personalFeatures = [
  { icon: TargetIcon, title: "Готовые сценарии", description: "Репетируйте разговоры из жизни и работы." },
  { icon: SparkleIcon, title: "Диалог с ИИ", description: "Пробуйте новые стратегии в безопасной среде." },
  { icon: StrategyIcon, title: "Свои решения", description: "Влияйте на ход переговоров каждым выбором." },
  { icon: ChatCircleTextIcon, title: "Практика в паре", description: "Оттачивайте навыки в живом диалоге." },
  { icon: HandshakeIcon, title: "Разбор переговоров", description: "Понимайте, что сработало и почему." },
  { icon: ChartLineUpIcon, title: "Личный прогресс", description: "Замечайте рост от тренировки к тренировке." },
];
const businessFeatures = [
  { icon: BookOpenTextIcon, title: "Обучение команды", description: "Назначайте практику под задачи бизнеса." },
  { icon: TargetIcon, title: "Реальные ситуации", description: "Стройте обучение вокруг рабочих задач." },
  { icon: UsersThreeIcon, title: "Роли и задачи", description: "Каждый видит свою роль и следующий шаг." },
  { icon: ChatCircleTextIcon, title: "Командные встречи", description: "Обсуждайте решения и фиксируйте договорённости." },
  { icon: StrategyIcon, title: "План развития", description: "Задавайте участникам сроки и ожидаемый результат." },
  { icon: UsersThreeIcon, title: "Результат команды", description: "Находите точки роста в показателях переговоров." },
];
const teamImages = import.meta.glob("../assets/team/*.{jpg,jpeg,png,webp,avif,svg}", { eager: true, query: "?url", import: "default" });

function ForestImage({ scene = "hero", className = "", eager = false }) {
  return <picture className={className} aria-hidden="true">
    <source media="(max-width: 700px)" srcSet={`/assets/forest2d/${scene}-mobile.webp`} />
    <img src={`/assets/forest2d/${scene}.webp`} alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} />
  </picture>;
}

function TeamPortrait({ person }) {
  const [failed, setFailed] = useState(false);
  const placeholder = teamImages[`../assets/team/${person.photo}.svg`];
  const photo = ["jpg", "jpeg", "png", "webp", "avif"].map((extension) => teamImages[`../assets/team/${person.photo}.${extension}`]).find(Boolean);
  return <img className={`gateway-team-portrait${person.photo === "veronika" ? " is-raised" : ""}`} src={failed ? placeholder : photo || placeholder} alt={photo && !failed ? person.name : ""} loading="lazy" width="260" height="320" onError={() => setFailed(true)} />;
}

function Brand() {
  return <a className="gateway-brand" href="#top" aria-label="Арена переговоров, наверх"><img src="/assets/arena-owl-logo.png" width="48" height="48" alt="" /></a>;
}

function StartButton({ onOpenEntry, className = "" }) {
  return <button className={`gateway-start ${className}`} type="button" onClick={(event) => onOpenEntry(event.currentTarget)}>Начать</button>;
}

function Header({ activeSection, menuOpen, onToggleMenu, onCloseMenu, onOpenEntry, menuButtonRef }) {
  const links = (className) => primaryNavigation.map(([id, label]) => <a key={id} className={`${className}${activeSection === id ? " is-active" : ""}`} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined} onClick={onCloseMenu}>{label}</a>);
  return <header className="gateway-header">
    <div className="gateway-header-inner">
      <Brand />
      <nav className="gateway-nav" aria-label="Разделы сайта">{links("gateway-nav-link")}</nav>
      <StartButton onOpenEntry={onOpenEntry} />
      <button ref={menuButtonRef} className="gateway-menu-button" type="button" aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={menuOpen} aria-controls="gateway-mobile-menu" onClick={onToggleMenu}>{menuOpen ? <XIcon size={22} aria-hidden="true" /> : <ListIcon size={22} aria-hidden="true" />}</button>
    </div>
    {menuOpen && <nav id="gateway-mobile-menu" className="gateway-mobile-menu" aria-label="Мобильная навигация">{links("gateway-mobile-link")}<button type="button" onClick={() => { onCloseMenu(); onOpenEntry(menuButtonRef.current); }}>Начать</button></nav>}
  </header>;
}

function Hero({ onOpenEntry }) {
  return <section className="gateway-hero" aria-labelledby="gateway-title">
    <ForestImage className="gateway-hero-forest" eager />
    <div className="gateway-container gateway-hero-content">
      <h1 id="gateway-title">Учитесь<em>договариваться</em></h1>
      <p>Тренируйте сложные разговоры с ИИ и людьми, анализируйте свои решения и развивайте навыки общения.</p>
      <div className="gateway-hero-actions"><StartButton onOpenEntry={onOpenEntry} /><a className="gateway-more" href="#description">Подробнее</a></div>
      <a className="gateway-scroll" href="#description" aria-label="Перейти к тому, что мы предлагаем"><ArrowDownIcon weight="light" aria-hidden="true" /></a>
    </div>
  </section>;
}

function OfferFeatureGrid({ features, className = "" }) {
  return <ul className={`gateway-feature-grid ${className}`}>{features.map(({ icon: Icon, title, description }) => <li className="gateway-feature" key={title}><span className="gateway-feature-icon"><Icon size={18} aria-hidden="true" /></span><span><strong>{title}</strong><small>{description}</small></span></li>)}</ul>;
}

function Offers({ onChoose, onOpenEntry }) {
  return <section id="description" className="gateway-offers" aria-labelledby="description-title"><div className="gateway-container">
    <div className="gateway-section-head"><h2 id="description-title">Сильные переговоры — это навык</h2><StartButton onOpenEntry={onOpenEntry} /></div>
    <div className="gateway-mode-split">
      <article className="gateway-mode gateway-mode-personal">
        <span className="gateway-mode-label">Личная практика</span><h3>Арена переговоров</h3>
        <p>Репетируйте важные разговоры, проверяйте стратегии и учитесь влиять на ход переговоров.</p>
        <div className="gateway-mode-image gateway-personal-image"><img src="/assets/personal-owl-practice.png" alt="Сова тренируется вести переговоры с собеседником на экране ноутбука" loading="lazy" width="1280" height="720" /></div>
        <OfferFeatureGrid features={personalFeatures} />
        <button className="gateway-mode-action" type="button" onClick={(event) => onChoose("personal", event.currentTarget)}>Начать личную практику<span><ArrowUpRightIcon size={17} aria-hidden="true" /></span></button>
      </article>
      <article className="gateway-mode gateway-mode-business">
        <span className="gateway-mode-label">Для компаний</span><h3>Арена для бизнеса</h3>
        <p>Объединяйте обучение и рабочие встречи, чтобы развивать навыки и повышать результативность переговоров.</p>
        <div className="gateway-mode-image gateway-business-image"><img src="/assets/business-owl-meeting.png" alt="Совы в деловых костюмах обсуждают решения за столом переговоров" loading="lazy" width="1280" height="720" /></div>
        <OfferFeatureGrid features={businessFeatures} className="is-business" />
        <button className="gateway-mode-action" type="button" onClick={(event) => onChoose("company", event.currentTarget)}>Развивать команду<span><ArrowUpRightIcon size={17} aria-hidden="true" /></span></button>
      </article>
    </div>
  </div></section>;
}

function HowItWorks({ onOpenEntry }) {
  return <section id="how-it-works" className="gateway-how" aria-labelledby="how-title">
    <ForestImage scene="hero" className="gateway-how-forest" />
    <div className="gateway-container gateway-how-layout">
      <div className="gateway-how-intro"><h2 id="how-title">Как это<br /> работает</h2><StartButton onOpenEntry={onOpenEntry} /></div>
      <ol className="gateway-steps">{steps.map((step, index) => <li key={step.title}><span className="gateway-step-number" aria-hidden="true">0{index + 1}.</span><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
    </div>
  </section>;
}

function About() {
  return <section id="about" className="gateway-about" aria-labelledby="about-title"><div className="gateway-container">
    <div className="gateway-section-head"><h2 id="about-title">О нас</h2></div>
    <div className="gateway-about-copy"><p>Мы развиваем «Арену переговоров», чтобы людям было проще готовиться к сложным разговорам. В сценариях и тренировках можно пробовать разные стратегии, видеть последствия решений и находить свой подход к переговорам.</p><p>Для компаний есть отдельная «Арена для бизнеса»: здесь назначают обучение, проводят встречи и отслеживают прогресс команды. Динамика показателей помогает замечать точки роста, выбирать навыки для развития и постепенно улучшать результаты переговоров.</p></div>
    <div className="gateway-team" aria-label="Команда проекта">{team.map((person) => <article key={person.photo}><TeamPortrait person={person} /><h3>{person.name}</h3></article>)}</div>
  </div></section>;
}

function EntryChooser({ dialogRef, onClose, onChoose }) {
  return <div className="gateway-entry-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="gateway-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="gateway-entry-title" tabIndex={-1}>
    <button className="gateway-entry-close" type="button" aria-label="Закрыть окно" onClick={onClose}><XIcon size={21} aria-hidden="true" /></button>
    <p className="gateway-entry-context"><span aria-hidden="true" />Выбор пространства</p>
    <h2 id="gateway-entry-title">Куда хотите войти?</h2>
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
    if (!entryOpen) entryReturnRef.current?.focus();
  }, [entryOpen]);

  if (ready && user) return <Navigate to={authenticatedTarget.current || "/app"} replace />;

  return <div className="gateway-page" id="top">
    <a className="gateway-skip" href="#main-content">К содержимому</a>
    <Header activeSection={activeSection} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} onCloseMenu={() => setMenuOpen(false)} onOpenEntry={openEntry} menuButtonRef={menuButtonRef} />
    <main id="main-content">
      <Hero onOpenEntry={openEntry} />
      <Offers onChoose={chooseArena} onOpenEntry={openEntry} />
      <HowItWorks onOpenEntry={openEntry} />
      <About />
    </main>
    <footer className="gateway-footer"><div className="gateway-container gateway-footer-main"><div><Brand /><p>Тренажёр деловых переговоров для личной практики и команд.</p></div><nav aria-label="Разделы страницы"><a href="#description">Что мы предлагаем</a><a href="#how-it-works">Как это работает</a><a href="#about">О нас</a><Link to="/business">Подробнее для компаний</Link></nav></div><div className="gateway-container gateway-footer-bottom">© {new Date().getFullYear()} Арена переговоров</div></footer>
    {entryOpen && entryStage === "choose" && <EntryChooser dialogRef={entryDialogRef} onClose={closeEntry} onChoose={chooseArena} />}
    {entryOpen && entryStage === "auth" && <Login portal={authPortal} initialMode={authMode} redirectTo={authNextPath} onClose={closeEntry} onModeChange={setAuthMode} onAuthenticated={(target) => { authenticatedTarget.current = target; }} returnFocusRef={entryReturnRef} />}
  </div>;
}
