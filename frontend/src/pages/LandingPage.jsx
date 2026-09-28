import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useAuth } from "../auth.jsx";
import Login from "./Login.jsx";
import { howSteps, team } from "./landingContent.js";
import "./landing.css";

const primaryNavigation = [
  ["description", "Описание"],
  ["modes", "Режимы"],
  ["about", "О нас"],
];

const teamImages = import.meta.glob("../assets/team/*.{jpg,jpeg,png,webp,avif,svg}", { eager: true, query: "?url", import: "default" });
function TeamPortrait({ person }) {
  const [failed, setFailed] = useState(false);
  const placeholder = teamImages[`../assets/team/${person.photo}.svg`];
  const photo = ["jpg", "jpeg", "png", "webp", "avif"].map((extension) => teamImages[`../assets/team/${person.photo}.${extension}`]).find(Boolean);
  return <img className="landing-team-portrait" src={failed ? placeholder : photo || placeholder} alt={photo && !failed ? person.name : ""} loading="lazy" width="160" height="160" onError={() => setFailed(true)} />;
}

function Brand() {
  return <a className="landing-brand" href="#top" aria-label="Арена переговоров — наверх">
    <img className="landing-brand-symbol" src="/favicon.svg" width="38" height="38" alt="" />
    <span>АРЕНА<small>ПЕРЕГОВОРОВ</small></span>
  </a>;
}

function LandingHeader({ activeSection, mobileMenuOpen, onToggleMenu, onCloseMenu, onOpenAuth, menuButtonRef }) {
  const sectionLinks = (className = "") => primaryNavigation.map(([id, label]) => <a key={id} className={`${className} ${activeSection === id ? "is-active" : ""}`} href={`#${id}`} onClick={onCloseMenu} aria-current={activeSection === id ? "location" : undefined}>{label}</a>);
  return <header className="landing-header">
    <div className="landing-header-inner">
      <Brand />
      <nav className="landing-header-nav" aria-label="Разделы сайта">{sectionLinks("landing-nav-link")}</nav>
      <button className="landing-header-auth" type="button" onClick={(event) => onOpenAuth("login", event.currentTarget)}>Регистрация / Войти</button>
      <button ref={menuButtonRef} className="landing-mobile-menu-button" type="button" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="landing-mobile-menu" onClick={onToggleMenu}>
        {mobileMenuOpen ? <XIcon size={22} aria-hidden="true" /> : <ListIcon size={22} aria-hidden="true" />}
      </button>
    </div>
    {mobileMenuOpen && <nav id="landing-mobile-menu" className="landing-mobile-menu" aria-label="Мобильная навигация">
      {sectionLinks("landing-mobile-link")}
      <div><button type="button" onClick={() => { onCloseMenu(); onOpenAuth("login", menuButtonRef.current); }}>Войти</button><button type="button" onClick={() => { onCloseMenu(); onOpenAuth("register", menuButtonRef.current); }}>Зарегистрироваться</button></div>
    </nav>}
  </header>;
}

function SectionHeading({ eyebrow, title, description, id }) {
  return <div className="landing-section-heading"><div><span className="landing-eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div></div>;
}

function ModeAction({ path, onOpenAuth, children }) {
  return <button className="landing-mode-action" type="button" onClick={(event) => onOpenAuth("register", event.currentTarget, path)}>{children} <ArrowRightIcon size={16} aria-hidden="true" /></button>;
}

function LandingModes({ onOpenAuth }) {
  return <section id="modes" className="landing-section landing-modes-section" aria-labelledby="modes-title"><div className="landing-container">
    <SectionHeading eyebrow="РЕЖИМЫ" title="Выберите формат" id="modes-title" />
    <div className="landing-mode-grid landing-mode-grid-four">
      <article className="landing-mode-card landing-mode-training"><div className="landing-mode-top"><span>ОБУЧЕНИЕ</span></div><h3>Учитесь на практике</h3><p>Теория и упражнения.</p><div className="landing-mode-visual landing-mode-path" aria-hidden="true"><div><span>01</span><strong>Теория</strong><i /></div><div><span>02</span><strong>Мини-практика</strong><i /></div><div><span>03</span><strong>Сценарий</strong><i /></div></div><ModeAction path="/training" onOpenAuth={onOpenAuth}>Открыть обучение</ModeAction></article>
      <article className="landing-mode-card"><div className="landing-mode-top"><span>ПРАКТИКА С ИИ</span></div><h3>Репетируйте разговор</h3><p>Диалог и разбор ответов.</p><div className="landing-mode-visual landing-mode-chat" aria-hidden="true"><span>ВАША СИТУАЦИЯ</span><div>Что важно для другой стороны?</div><div>Уточним условия.</div></div><ModeAction path="/ai" onOpenAuth={onOpenAuth}>Попробовать</ModeAction></article>
      <article className="landing-mode-card"><div className="landing-mode-top"><span>СЦЕНАРИИ</span></div><h3>Выбирайте решение</h3><p>Развилки и разные исходы.</p><div className="landing-mode-visual landing-mode-scenario" aria-hidden="true"><span>СИТУАЦИЯ</span><i /><span>РЕШЕНИЕ</span><i /><span>ИТОГ</span></div><ModeAction path="/scenarios" onOpenAuth={onOpenAuth}>Выбрать сценарий</ModeAction></article>
      <article className="landing-mode-card"><div className="landing-mode-top"><span>ОНЛАЙН 1×1</span></div><h3>Практикуйтесь вдвоём</h3><p>Живой разговор и разбор.</p><div className="landing-mode-visual landing-mode-pair" aria-hidden="true"><span>А</span><i>↔</i><span>Б</span></div><ModeAction path="/rooms" onOpenAuth={onOpenAuth}>Открыть встречи</ModeAction></article>
    </div>
  </div></section>;
}

export default function LandingPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAuthMode = ["login", "register"].includes(searchParams.get("auth")) ? searchParams.get("auth") : null;
  const [activeSection, setActiveSection] = useState("");
  const [authOpen, setAuthOpen] = useState(() => Boolean(requestedAuthMode));
  const [authMode, setAuthMode] = useState(() => requestedAuthMode || "login");
  const [authNextPath, setAuthNextPath] = useState(() => searchParams.get("next") || "/app");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const authReturnRef = useRef(null);
  const openAuth = useCallback((mode = "login", trigger = null, nextPath = "/app") => {
    if (!authOpen) {
      const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.pushState({ ...currentState, arenaAuthModal: true }, "", window.location.href);
    }
    if (trigger) authReturnRef.current = trigger;
    setAuthMode(mode); setAuthNextPath(nextPath); setAuthOpen(true); setMobileMenuOpen(false);
  }, [authOpen]);
  const closeAuth = useCallback(() => {
    if (window.history.state?.arenaAuthModal) window.history.back();
    else setAuthOpen(false);
  }, []);

  useEffect(() => {
    if (ready && !user && requestedAuthMode) navigate("/", { replace: true });
  }, [ready, user, requestedAuthMode, navigate]);

  useEffect(() => {
    const onPopState = (event) => setAuthOpen(Boolean(event.state?.arenaAuthModal));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const sections = primaryNavigation.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      const activationLine = Math.min(240, window.innerHeight * 0.36);
      const visibleSections = sections.map((section) => ({ section, rect: section.getBoundingClientRect() }))
        .filter(({ rect }) => rect.top <= activationLine && rect.bottom > 88)
        .sort((a, b) => b.rect.top - a.rect.top);
      const current = visibleSections[0];
      if (current) setActiveSection(current.section.id);
    }, { rootMargin: "-88px 0px -64% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") { setMobileMenuOpen(false); menuButtonRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  if (ready && user) return <Navigate to="/app" replace />;

  return <div className="landing" id="top">
    <a className="landing-skip" href="#main-content">К содержимому</a>
    <LandingHeader activeSection={activeSection} mobileMenuOpen={mobileMenuOpen} onToggleMenu={() => setMobileMenuOpen((open) => !open)} onCloseMenu={() => setMobileMenuOpen(false)} onOpenAuth={openAuth} menuButtonRef={menuButtonRef} />
    <main id="main-content">
      <section className="landing-hero" aria-labelledby="landing-title">
        <picture className="landing-forest" aria-hidden="true"><source media="(max-width: 767px)" srcSet="/assets/forest2d/hero-mobile.webp" /><img src="/assets/forest2d/hero.webp" alt="" fetchPriority="high" /></picture>
        <div className="landing-container landing-hero-grid"><div className="landing-hero-copy">
          <span className="landing-eyebrow"><i aria-hidden="true" /> ТРЕНИРОВОЧНАЯ СРЕДА</span>
          <h1 id="landing-title">Сложные разговоры <em>становятся понятнее.</em></h1>
          <p>Тренируйтесь с ИИ или людьми. Разбирайте свои решения.</p>
          <div className="landing-hero-actions"><button className="landing-button landing-button-primary" type="button" onClick={(event) => openAuth("register", event.currentTarget)}>Начать тренировку <ArrowRightIcon size={19} aria-hidden="true" /></button><a className="landing-hero-secondary" href="#modes">Посмотреть режимы <span aria-hidden="true">↓</span></a></div>
        </div></div>
      </section>

      <section id="description" className="landing-section landing-description-section" aria-labelledby="description-title"><div className="landing-container">
        <SectionHeading eyebrow="ОПИСАНИЕ" title="Ситуация. Разговор. Разбор." id="description-title" />
        <div className="landing-how-grid">{howSteps.map((step, index) => <article key={step.number}><span>{String(index + 1).padStart(2, "0")}</span><h3>{["Выберите ситуацию", "Проведите разговор", "Увидьте последствия", "Получите разбор"][index]}</h3></article>)}</div>
      </div></section>

      <LandingModes onOpenAuth={openAuth} />

      <section id="about" className="landing-section landing-about-section" aria-labelledby="about-title"><div className="landing-container landing-about-grid">
        <SectionHeading eyebrow="О НАС" title="Переговоры можно отрепетировать." description="С ИИ, по сценарию или с другим участником." id="about-title" />
        <div className="landing-principles"><article><span>01</span><h3>Пробуйте</h3></article><article><span>02</span><h3>Разбирайте</h3></article><article><span>03</span><h3>Повторяйте</h3></article></div>
      </div></section>

      <section id="team" className="landing-section landing-team-section" aria-labelledby="team-title"><div className="landing-container"><SectionHeading eyebrow="КОМАНДА" title="Команда" id="team-title" /><div className="landing-team-grid">{team.map((person) => <article key={person.photo}><TeamPortrait person={person} /><h3>{person.name}</h3></article>)}</div></div></section>
    </main>

    <footer className="landing-footer"><div className="landing-container landing-footer-grid"><div><Brand /></div><nav aria-label="Разделы страницы"><strong>Разделы</strong><a href="#about">О нас</a><a href="#description">Описание</a><a href="#modes">Режимы</a></nav><nav aria-label="Форматы практики"><strong>Форматы</strong><button type="button" onClick={(event) => openAuth("register", event.currentTarget, "/training")}>Обучение</button><button type="button" onClick={(event) => openAuth("register", event.currentTarget, "/ai")}>Практика с ИИ</button><Link to="/report/example">Пример разбора</Link><Link to="/demo/rooms">Онлайн 1×1</Link></nav><nav aria-label="Аккаунт"><strong>Аккаунт</strong><button type="button" onClick={(event) => openAuth("login", event.currentTarget)}>Войти</button><button type="button" onClick={(event) => openAuth("register", event.currentTarget)}>Зарегистрироваться</button></nav></div><div className="landing-container landing-footer-bottom"><span>© {new Date().getFullYear()} Арена переговоров</span></div></footer>

    {authOpen && <Login initialMode={authMode} redirectTo={authNextPath} onClose={closeAuth} onModeChange={setAuthMode} returnFocusRef={authReturnRef} />}
  </div>;
}
