import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { StorefrontIcon } from "@phosphor-icons/react/dist/csr/Storefront";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import ExperienceCanvas from "./experience/ExperienceCanvas.jsx";
import { sectionIdFromHash } from "./experience/homeWorldModel.js";
import { useAuth } from "./auth.jsx";
import ProductPage from "./design/ProductPage.jsx";

const primary = [
  { to: "/", section: "hero", label: "Главная", Icon: HouseIcon, end: true },
  { to: "/ai", section: "ai", label: "ИИ-диалог", Icon: SparkleIcon },
  { to: "/rooms", section: "rooms", label: "1×1", Icon: UsersThreeIcon },
  { to: "/scenarios", section: "scenarios", label: "Сценарии", Icon: SquaresFourIcon },
  { to: "/training", section: "learning", label: "Обучение", Icon: BooksIcon },
];

const secondary = [
  { to: "/company", label: "Компания", Icon: BuildingsIcon },
  { to: "/analytics", label: "Аналитика", Icon: ChartLineUpIcon },
  { to: "/history", section: "history", label: "История", Icon: ClockCounterClockwiseIcon },
  { to: "/people", section: "friends", label: "Друзья", Icon: UsersThreeIcon },
  { to: "/profile", section: "profile", label: "Профиль", Icon: UserCircleIcon },
  { to: "/shop", label: "Магазин", Icon: StorefrontIcon },
];

function NavigationLink({ item, onClick, compact = false, home = false, activeSection, pathname }) {
  const { to, section, label, Icon, end } = item;
  const destination = section ? (section === "hero" ? "/" : `/#${section}`) : to;
  return (
    <NavLink
      to={destination}
      end={end}
      onClick={(event) => {
        if (home && section) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("arena:navigate-home", { detail: { sectionId: section } }));
        }
        onClick?.();
      }}
      aria-label={compact ? label : undefined}
      aria-current={home && section && activeSection === section ? "location" : undefined}
      className={({ isActive }) => `nova-nav-link${(home && section ? activeSection === section
        : !home && (isActive || pathname === to || (to !== "/" && pathname.startsWith(`${to}/`)))) ? " is-active" : ""}`}
    >
      <Icon size={22} weight="regular" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const priorLocation = useRef(null);
  const scrollPositions = useRef(new Map());
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(sectionIdFromHash(hash));
  const moreButton = useRef(null);
  const sheetClose = useRef(null);
  const sheet = useRef(null);
  const links = user?.is_admin ? [...secondary, { to: "/admin", label: "Админ", Icon: ShieldCheckIcon }] : secondary;

  useEffect(() => { setMoreOpen(false); }, [pathname]);
  useLayoutEffect(() => {
    const previous = priorLocation.current;
    if (previous?.key === key) return;
    if (previous) scrollPositions.current.set(previous.key, window.scrollY);
    priorLocation.current = { key, pathname, hash };
    if (!previous) return;
    if (pathname === "/" && hash) return; // The existing Home controller owns hash navigation.
    const saved = navigationType === "POP" ? scrollPositions.current.get(key) : undefined;
    window.scrollTo(0, saved ?? 0);
  }, [key, pathname, hash, navigationType]);
  useEffect(() => {
    if (pathname !== "/") return undefined;
    setActiveSection(sectionIdFromHash(hash));
    const onSection = (event) => setActiveSection(event.detail.sectionId);
    window.addEventListener("arena:home-section", onSection);
    return () => window.removeEventListener("arena:home-section", onSection);
  }, [pathname, hash]);
  useEffect(() => {
    if (!moreOpen) return;
    sheetClose.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreButton.current?.focus();
      } else if (event.key === "Tab") {
        const focusable = [...sheet.current.querySelectorAll("a[href], button:not([disabled])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  function signOut() {
    logout();
    navigate("/login");
  }

  const home = pathname === "/";
  const navProps = { home, activeSection, pathname };

  function goHome() {
    if (home) window.dispatchEvent(new CustomEvent("arena:navigate-home", { detail: { sectionId: "hero" } }));
    else navigate("/");
  }

  return (
    <div className={`nova-shell${home ? " nova-shell-home" : ""}`}>
      <a className="product-skip-link" href="#main-content">К содержимому</a>
      <ExperienceCanvas />
      <aside className="nova-rail" aria-label="Главное меню">
        <button className="nova-rail-brand" onClick={goHome} aria-label="Арена переговоров — на главную">A</button>
        <nav className="nova-rail-links" aria-label="Основная навигация">
          {primary.map((item) => <NavigationLink key={item.to} item={item} compact {...navProps} />)}
          <span className="nova-rail-divider" aria-hidden="true" />
          {links.map((item) => <NavigationLink key={item.to} item={item} compact {...navProps} />)}
        </nav>
        <div className="nova-rail-bottom">
          <NavLink to="/profile" className="nova-rail-avatar" aria-label="Открыть профиль">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
          <button className="nova-rail-signout" onClick={signOut} aria-label="Выйти"><SignOutIcon size={20} /></button>
        </div>
      </aside>

      <div className="nova-page-wrap">
        <main className={`nova-content${home ? " nova-content-home" : ""}`} id="main-content">{home ? <Outlet /> : <ProductPage pathname={pathname}><Outlet /></ProductPage>}</main>
      </div>

      <nav className="nova-mobile-nav" aria-label="Мобильная навигация">
        {primary.map((item) => <NavigationLink key={item.to} item={item} {...navProps} />)}
        <button ref={moreButton} className={`nova-nav-link${moreOpen ? " is-active" : ""}`} onClick={() => setMoreOpen(true)} aria-label="Ещё" aria-expanded={moreOpen}>
          <DotsThreeIcon size={24} aria-hidden="true" /><span>Ещё</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="nova-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}>
          <div ref={sheet} className="nova-sheet" role="dialog" aria-modal="true" aria-labelledby="more-title">
            <div className="nova-sheet-top"><h2 id="more-title">Разделы Арены</h2><button ref={sheetClose} onClick={() => { setMoreOpen(false); moreButton.current?.focus(); }} aria-label="Закрыть"><XIcon size={22} /></button></div>
            <nav aria-label="Дополнительные разделы">{links.map((item) => <NavigationLink key={item.to} item={item} onClick={() => setMoreOpen(false)} {...navProps} />)}</nav>
            <button className="nova-sheet-logout" onClick={signOut}><SignOutIcon size={20} /> Выйти</button>
          </div>
        </div>
      )}
    </div>
  );
}
