import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { StorefrontIcon } from "@phosphor-icons/react/dist/csr/Storefront";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import ExperienceCanvas from "./experience/ExperienceCanvas.jsx";
import { useAuth } from "./auth.jsx";

const primary = [
  { to: "/", label: "Главная", Icon: HouseIcon, end: true },
  { to: "/ai", label: "ИИ-диалог", Icon: SparkleIcon },
  { to: "/rooms", label: "1×1", Icon: UsersThreeIcon },
  { to: "/scenarios", label: "Сценарии", Icon: SquaresFourIcon },
  { to: "/training", label: "Обучение", Icon: BooksIcon },
];

const secondary = [
  { to: "/history", label: "История", Icon: ClockCounterClockwiseIcon },
  { to: "/people", label: "Друзья", Icon: UsersThreeIcon },
  { to: "/profile", label: "Профиль", Icon: UserCircleIcon },
  { to: "/shop", label: "Магазин", Icon: StorefrontIcon },
];

function NavigationLink({ item, onClick, compact = false }) {
  const { to, label, Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      aria-label={compact ? label : undefined}
      className={({ isActive }) => `nova-nav-link${isActive ? " is-active" : ""}`}
    >
      <Icon size={22} weight="regular" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef(null);
  const sheetClose = useRef(null);
  const sheet = useRef(null);
  const links = user?.is_admin ? [...secondary, { to: "/admin", label: "Админ", Icon: ShieldCheckIcon }] : secondary;

  useEffect(() => { setMoreOpen(false); }, [pathname]);
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

  return (
    <div className={`nova-shell${home ? " nova-shell-home" : ""}`}>
      <ExperienceCanvas />
      <aside className="nova-rail" aria-label="Главное меню">
        <button className="nova-rail-brand" onClick={() => navigate("/")} aria-label="Арена переговоров — на главную">A</button>
        <nav className="nova-rail-links" aria-label="Основная навигация">
          {primary.map((item) => <NavigationLink key={item.to} item={item} compact />)}
          <span className="nova-rail-divider" aria-hidden="true" />
          {links.map((item) => <NavigationLink key={item.to} item={item} compact />)}
        </nav>
        <div className="nova-rail-bottom">
          <NavLink to="/profile" className="nova-rail-avatar" aria-label="Открыть профиль">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
          <button className="nova-rail-signout" onClick={signOut} aria-label="Выйти"><SignOutIcon size={20} /></button>
        </div>
      </aside>

      <div className="nova-page-wrap">
        <main className={`nova-content${home ? " nova-content-home" : ""}`} id="main-content"><Outlet /></main>
      </div>

      <nav className="nova-mobile-nav" aria-label="Мобильная навигация">
        {primary.map((item) => <NavigationLink key={item.to} item={item} />)}
        <button ref={moreButton} className={`nova-nav-link${moreOpen ? " is-active" : ""}`} onClick={() => setMoreOpen(true)} aria-label="Ещё" aria-expanded={moreOpen}>
          <DotsThreeIcon size={24} aria-hidden="true" /><span>Ещё</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="nova-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}>
          <div ref={sheet} className="nova-sheet" role="dialog" aria-modal="true" aria-labelledby="more-title">
            <div className="nova-sheet-top"><h2 id="more-title">Разделы Арены</h2><button ref={sheetClose} onClick={() => { setMoreOpen(false); moreButton.current?.focus(); }} aria-label="Закрыть"><XIcon size={22} /></button></div>
            <nav aria-label="Дополнительные разделы">{links.map((item) => <NavigationLink key={item.to} item={item} onClick={() => setMoreOpen(false)} />)}</nav>
            <button className="nova-sheet-logout" onClick={signOut}><SignOutIcon size={20} /> Выйти</button>
          </div>
        </div>
      )}
    </div>
  );
}
