import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import ExperienceCanvas from "./experience/ExperienceCanvas.jsx";
import ForestBackdrop, { ForestMotionControl } from "./environment2d/ForestBackdrop.jsx";
import { useEnvironmentPreferences } from "./environment2d/backgroundMotionPreferences.js";
import { isFocusedRoute } from "./environment2d/sceneDefinitions.js";
import { sectionIdFromHash } from "./experience/homeWorldModel.js";
import { useAuth } from "./auth.jsx";
import ProductPage from "./design/ProductPage.jsx";
import { api } from "./api.js";
import ViewportNotice from "./components/ViewportNotice.jsx";

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
        if (home && section && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [demoReminder, setDemoReminder] = useState(null);
  const [showReminder, setShowReminder] = useState(false);
  const [activeSection, setActiveSection] = useState(sectionIdFromHash(hash));
  const [forestPreferences, setForestPreferences] = useEnvironmentPreferences();
  const [railCompact, setRailCompact] = useState(() => localStorage.getItem("arena_rail_compact") === "true");
  const restoredLiveBackground = useRef(false);
  const moreButton = useRef(null);
  const sheetClose = useRef(null);
  const sheet = useRef(null);
  const links = user?.is_admin ? [...secondary, { to: "/admin", label: "Админ", Icon: ShieldCheckIcon }] : secondary;
  const home = pathname === "/";
  const notificationCount = unreadMessageCount;

  useEffect(() => { setMoreOpen(false); }, [pathname]);
  useEffect(() => { localStorage.setItem("arena_rail_compact", String(railCompact)); }, [railCompact]);
  useEffect(() => {
    if (restoredLiveBackground.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    restoredLiveBackground.current = true;
    setForestPreferences({ motion: "full" });
  }, [setForestPreferences]);
  useEffect(() => {
    const storageKey = `arena_demo_reminder:${user?.username || "guest"}`;
    try { setDemoReminder(JSON.parse(sessionStorage.getItem(storageKey))); } catch { setDemoReminder(null); }
    setShowReminder(false);
    const receive = (event) => {
      const reminder = { ...event.detail, read: false };
      setDemoReminder(reminder); setShowReminder(true); setNotificationsOpen(false);
      sessionStorage.setItem(storageKey, JSON.stringify(reminder));
    };
    window.addEventListener("arena:demo-reminder", receive);
    return () => window.removeEventListener("arena:demo-reminder", receive);
  }, [user?.username]);
  useEffect(() => {
    if (!user) return undefined;
    const load = async () => {
      try {
        const [items, unread] = await Promise.all([
          api("/api/social/notifications"),
          api("/api/social/unread-count"),
        ]);
        setNotifications(items);
        setUnreadMessageCount(unread.count);
      } catch {}
    };
    load();
    window.addEventListener("arena:notifications-changed", load);
    const timer = window.setInterval(load, 30_000);
    return () => {
      window.removeEventListener("arena:notifications-changed", load);
      window.clearInterval(timer);
    };
  }, [user]);
  useLayoutEffect(() => {
    const previous = priorLocation.current;
    if (previous?.key === key) return;
    if (previous) scrollPositions.current.set(previous.key, window.scrollY);
    priorLocation.current = { key, pathname, hash };
    if (!previous) {
      if (!(pathname === "/" && hash)) window.scrollTo(0, 0);
      return;
    }
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
        const focusable = [...sheet.current.querySelectorAll("a[href], button:not([disabled]), select:not([disabled])")];
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

  function openDemoReminder() {
    setShowReminder(false); setNotificationsOpen(false);
    const reminder = { ...demoReminder, read: true };
    setDemoReminder(reminder);
    sessionStorage.setItem(`arena_demo_reminder:${user?.username || "guest"}`, JSON.stringify(reminder));
    if (pathname === "/rooms/demo") document.getElementById("demo-practice")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    else navigate("/rooms/demo#demo-practice");
  }

  const showForestControl = !isFocusedRoute(pathname);
  const navProps = { home, activeSection, pathname };

  function goHome() {
    if (home) window.dispatchEvent(new CustomEvent("arena:navigate-home", { detail: { sectionId: "hero" } }));
    else navigate("/");
  }

  function goBack() {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/");
  }

  return (
    <div className={`nova-shell${home ? " nova-shell-home" : ""}${railCompact ? " nova-shell--rail-compact" : ""}`}>
      <a className="product-skip-link" href="#main-content">К содержимому</a>
      <ForestBackdrop pathname={pathname} preferences={forestPreferences} />
      <ExperienceCanvas />
      <aside className="nova-rail" aria-label="Главное меню">
        <button className="nova-rail-brand" onClick={goHome} aria-label="Арена переговоров — на главную">A</button>
        <nav className="nova-rail-links" aria-label="Основная навигация">
          {primary.map((item) => <NavigationLink key={item.to} item={item} compact={railCompact} {...navProps} />)}
          <span className="nova-rail-divider" aria-hidden="true" />
          {links.map((item) => <NavigationLink key={item.to} item={item} compact={railCompact} {...navProps} />)}
        </nav>
        <div className="nova-rail-bottom">
          <button className="nova-rail-toggle" onClick={() => setRailCompact((value) => !value)} aria-label={railCompact ? "Развернуть меню" : "Свернуть меню"} title={railCompact ? "Развернуть меню" : "Свернуть меню"}>
            {railCompact ? <CaretRightIcon size={20} /> : <CaretLeftIcon size={20} />}<span>{railCompact ? "Развернуть" : "Свернуть"}</span>
          </button>
        </div>
      </aside>

      <div className="nova-page-wrap">
        <div className="nova-account-actions" aria-label="Профиль">
          <NavLink to="/profile" className="nova-account-avatar" aria-label="Открыть профиль">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
          <button className="nova-account-signout" onClick={signOut} aria-label="Выйти из профиля"><SignOutIcon size={20} /></button>
        </div>
        <main className={`nova-content${home ? " nova-content-home" : ""}`} id="main-content">
          {home ? <Outlet /> : <ProductPage pathname={pathname}>
            <button type="button" className="page-back-button" onClick={goBack}>
              <ArrowLeftIcon size={18} aria-hidden="true" />
              Назад
            </button>
            <Suspense fallback={<div className="p-8 text-slate-300" role="status">Загрузка раздела…</div>}><Outlet /></Suspense>
          </ProductPage>}
        </main>
      </div>

      {home && <button className="nova-home-friends" onClick={() => navigate("/people")} aria-label={notificationCount ? `Друзья, ${notificationCount} новых уведомлений` : "Друзья"}>
        <ChatCircleDotsIcon size={24} weight="regular" aria-hidden="true" />
        {notificationCount > 0 && <span>{notificationCount > 99 ? "99+" : notificationCount}</span>}
      </button>}

      {showReminder && demoReminder && <ViewportNotice onClose={() => setShowReminder(false)} label="Напоминание о демо-встрече"><div role="status"><small>Демо · встреча через 5 минут</small><h3>{demoReminder.title}</h3><p>{demoReminder.meeting}</p><p>Ваше задание готово. Можно присоединяться.</p></div><button className="viewport-notice-action" onClick={openDemoReminder}>К разговору ↗</button></ViewportNotice>}
      {notificationsOpen && <ViewportNotice inbox onClose={() => setNotificationsOpen(false)} label="Уведомления"><h3>Уведомления</h3>{demoReminder && <div className="mt-4"><small>Демонстрация · пример напоминания</small><p>{demoReminder.title}</p><button className="viewport-notice-action" onClick={openDemoReminder}>Открыть демо-встречу</button></div>}<div className="mt-3 space-y-2">{notifications.slice(0, 20).map((item) => <article key={item.id} className="border-b border-white/10 py-3"><b>{({ROOM_ENTRY_OPEN:"Вход во встречу открыт",ROOM_INVITATION:"Приглашение на встречу",ROOM_CANCELLED:"Запись отменена",ROOM_CREATED:"Встреча подготовлена",ONLINE_INVITE:"Новое приглашение в 1×1",FRIEND_REQUEST:"Заявка в друзья"})[item.type] || "Новое событие"}</b>{item.payload?.title && <p>{item.payload.title}</p>}{item.payload?.message && <p>{item.payload.message}</p>}<button className="viewport-notice-action" onClick={async()=>{try {await api(`/api/social/notifications/${item.id}/read`,{method:"POST"});setNotifications(rows=>rows.map(row=>row.id===item.id?{...row,read:true}:row));}catch{} setNotificationsOpen(false);const path=item.payload?.path;navigate(typeof path === "string" && /^\/(?:profile|room\/\d+|rooms\?code=[A-Za-z0-9_-]+)$/.test(path) ? path : item.payload?.room_id ? `/room/${item.payload.room_id}` : "/people");}}>Открыть →</button></article>)}{!notifications.length && !demoReminder && <p>Новых уведомлений нет.</p>}</div></ViewportNotice>}

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
            {showForestControl && <ForestMotionControl id="forest-motion-mode-mobile" preferences={forestPreferences} onChange={setForestPreferences} inMenu />}
            <button className="nova-sheet-logout" onClick={() => { setMoreOpen(false); setShowReminder(false); setNotificationsOpen(true); }}><BellIcon size={20} /> Уведомления{demoReminder && !demoReminder.read ? " · новое" : ""}</button>
            <button className="nova-sheet-logout" onClick={signOut}><SignOutIcon size={20} /> Выйти</button>
          </div>
        </div>
      )}
      {showForestControl && <ForestMotionControl preferences={forestPreferences} onChange={setForestPreferences} />}
    </div>
  );
}
