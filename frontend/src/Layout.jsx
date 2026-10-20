import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { FlaskIcon } from "@phosphor-icons/react/dist/csr/Flask";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { NewspaperIcon } from "@phosphor-icons/react/dist/csr/Newspaper";
import ForestBackdrop from "./environment2d/ForestBackdrop.jsx";
import { useEnvironmentPreferences } from "./environment2d/backgroundMotionPreferences.js";
import { useAuth } from "./auth.jsx";
import ProductPage from "./design/ProductPage.jsx";
import { api } from "./api.js";
import { UserAvatar } from "./components/cosmetics/CosmeticVisual.jsx";
import { communitySection } from "./components/social/communityNavigation.js";
import SupportDesk from "./components/SupportDesk.jsx";
import ProfileWorkspaceMenu from "./components/ProfileWorkspaceMenu.jsx";
import MessagesOverlay from "./components/social/MessagesOverlay.jsx";
import NotificationsOverlay from "./components/social/NotificationsOverlay.jsx";
import "./pages/stories.css";

const primary = [
  { to: "/app", label: "Практика", Icon: HouseIcon, end: true },
  { to: "/training", label: "Обучение", Icon: BooksIcon },
  { to: "/lab", label: "Игровая лаборатория", mobileLabel: "Игровая лаборатория", Icon: FlaskIcon },
  { to: "/feed", label: "Сообщество", mobileLabel: "Сообщество", Icon: NewspaperIcon },
];

const modeNavigation = [
  { to: "/ai", label: "Практика с ИИ", Icon: SparkleIcon },
  { to: "/rooms", label: "1×1", mobileLabel: "1 на 1", Icon: UsersThreeIcon },
  { to: "/scenarios", label: "Сценарии", Icon: SquaresFourIcon },
];

const secondary = [
  { to: "/analytics", label: "Аналитика", Icon: ChartLineUpIcon },
];

const navigationGroups = [
  { item: primary[0], children: modeNavigation },
  { item: primary[1], children: [
    { to: "/theory", label: "Теория", Icon: BooksIcon },
    { to: "/training/path", label: "Программа", Icon: SquaresFourIcon },
  ] },
  { item: primary[2], children: [
    { to: "/serials", label: "После слов", Icon: BooksIcon },
    { to: "/lab/red-zone", label: "Красная зона", Icon: ShieldCheckIcon },
    { to: "/lab/echo", label: "Эхо", Icon: ChatCircleDotsIcon },
  ] },
  { item: primary[3], children: [
    { to: "/feed?section=posts", label: "Публикации", Icon: NewspaperIcon },
    { to: "/feed?section=messages", label: "Сообщения", Icon: ChatCircleDotsIcon },
    { to: "/feed?section=friends", label: "Друзья", Icon: UsersThreeIcon },
    { to: "/feed?section=collections", label: "Подборки", Icon: SquaresFourIcon },
    { to: "/feed?section=notifications", label: "Уведомления", Icon: BellIcon },
  ] },
];

function matchesPath(item, pathname) {
  const paths = [item.to.split("?")[0], ...(item.activePaths || [])];
  return paths.some((path) => pathname === path || (path !== "/app" && pathname.startsWith(`${path}/`)));
}

function NavigationLink({ item, onClick, compact = false, mobile = false, pathname, search, groupChildren }) {
  const { to, label, Icon, end } = item;
  const visibleLabel = mobile ? item.mobileLabel || label : label;
  const [targetPath, targetSearch] = to.split("?");
  const queryActive = targetSearch ? pathname === targetPath && communitySection(search) === communitySection(targetSearch) : null;
  const pathActive = matchesPath(item, pathname);
  const active = groupChildren ? pathname === targetPath : queryActive !== null ? queryActive : pathActive;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={(event) => {
        onClick?.();
      }}
      aria-label={compact ? label : undefined}
      aria-current={active ? "page" : false}
      className={`nova-nav-link${active ? " is-active" : ""}`}
    >
      <Icon size={22} weight="regular" aria-hidden="true" />
      <span>{visibleLabel}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const priorLocation = useRef(null);
  const scrollPositions = useRef(new Map());
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadSocialCount, setUnreadSocialCount] = useState(0);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [forestPreferences, setForestPreferences] = useEnvironmentPreferences();
  const [railCompact, setRailCompact] = useState(() => localStorage.getItem("arena_rail_compact") === "true");
  const [expandedGroup, setExpandedGroup] = useState(() => navigationGroups.find(group => group.children.some(item => matchesPath(item, window.location.pathname)))?.item.to || null);
  const restoredLiveBackground = useRef(false);
  const messagesButtonRef = useRef(null);
  const notificationsButtonRef = useRef(null);
  const links = user?.is_admin ? [...secondary, { to: "/admin", label: "Админ", Icon: ShieldCheckIcon }] : secondary;
  const home = pathname === "/app";
  const stories = pathname === "/stories" || pathname.startsWith("/stories/");
  const community = pathname === "/feed" || pathname.startsWith("/feed/") || pathname === "/saved" || pathname.startsWith("/collections");
  const serialSection = pathname.startsWith("/serials");
  const serialReading = pathname.startsWith("/serials/play/");
  const notificationCount = unreadMessageCount;
  const labSection = pathname.startsWith("/lab");
  const labPlaying = pathname.startsWith("/lab/red-zone/play/") || pathname.startsWith("/lab/echo/play/");
  const mobilePrimary = [...primary, secondary[0]];

  useEffect(() => {
    document.documentElement.classList.toggle("nova-home-scrollbar-hidden", home);
    return () => document.documentElement.classList.remove("nova-home-scrollbar-hidden");
  }, [home]);
  useEffect(() => { localStorage.setItem("arena_rail_compact", String(railCompact)); }, [railCompact]);
  useEffect(() => {
    if (restoredLiveBackground.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    restoredLiveBackground.current = true;
    setForestPreferences({ motion: "full" });
  }, [setForestPreferences]);
  useEffect(() => {
    let cancelled = false, version = 0;
    setUnreadMessageCount(0); setUnreadSocialCount(0);
    if (!user) return undefined;
    const load = async () => {
      if (document.hidden) return;
      const current = ++version;
      const [messages, social] = await Promise.allSettled([api("/api/social/unread-count"), api("/api/social/notifications/unread-count")]);
      if (cancelled || current !== version) return;
      if (messages.status === "fulfilled") setUnreadMessageCount(messages.value.count || 0);
      if (social.status === "fulfilled") setUnreadSocialCount(social.value.count || 0);
    };
    load();
    window.addEventListener("arena:notifications-changed", load);
    document.addEventListener("visibilitychange", load);
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true; version++;
      window.removeEventListener("arena:notifications-changed", load);
      document.removeEventListener("visibilitychange", load);
      window.clearInterval(timer);
    };
  }, [user]);
  useLayoutEffect(() => {
    const previous = priorLocation.current;
    if (previous?.key === key) return;
    if (previous) scrollPositions.current.set(previous.key, window.scrollY);
    priorLocation.current = { key, pathname, hash };
    if (!previous) {
      window.scrollTo(0, 0);
      return;
    }
    const saved = navigationType === "POP" ? scrollPositions.current.get(key) : undefined;
    window.scrollTo(0, saved ?? 0);
  }, [key, pathname, hash, navigationType]);
  function signOut() {
    logout();
    window.location.replace("/");
  }
  const closeMessages = useCallback(() => {
    setMessagesOpen(false);
    window.requestAnimationFrame(() => messagesButtonRef.current?.focus({ preventScroll: true }));
  }, []);
  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
    window.requestAnimationFrame(() => notificationsButtonRef.current?.focus({ preventScroll: true }));
  }, []);

  const navProps = { pathname, search };

  function goHome() {
    if (home) window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    else navigate("/app");
  }

  return (
    <div className={`nova-shell${home ? " nova-shell-home" : ""}${stories ? " nova-shell-stories" : ""}${community ? " nova-shell-community" : ""}${pathname === "/profile" ? " nova-shell-profile" : ""}${serialSection ? " nova-shell--serial-section" : ""}${serialReading ? " nova-shell--serial-player" : ""}${labSection ? " nova-shell--lab-section" : ""}${labPlaying ? " nova-shell--lab-player" : ""}${railCompact ? " nova-shell--rail-compact" : ""}`}>
      <a className="product-skip-link" href="#main-content">К содержимому</a>
      <ForestBackdrop pathname={pathname} preferences={forestPreferences} />
      <aside className="nova-rail" aria-label="Главное меню">
        <div className="nova-rail-brand-row">
          <button className="nova-rail-brand" onClick={goHome} aria-label="Арена переговоров — на главную">
            <img className="nova-rail-brand-symbol" src="/assets/arena-owl-logo.png?v=owl-suit" width="40" height="40" alt="" />
            {!railCompact && <span className="nova-rail-brand-name">Арена<br />переговоров</span>}
          </button>
          <button className="nova-rail-collapse" type="button" onClick={() => setRailCompact((value) => !value)} aria-controls="arena-primary-navigation" aria-expanded={!railCompact} aria-label={railCompact ? "Развернуть боковую панель" : "Свернуть боковую панель"} title={railCompact ? "Развернуть боковую панель" : "Свернуть боковую панель"}>
            {railCompact
              ? <CaretRightIcon size={18} aria-hidden="true" />
              : <CaretLeftIcon size={18} aria-hidden="true" />}
          </button>
        </div>
        <nav className="nova-rail-links" id="arena-primary-navigation" aria-label="Основная навигация">
          {railCompact ? primary.map((item) => <NavigationLink key={item.to} item={item} compact {...navProps} />) : navigationGroups.map(({ item, children }) => {
            const open = expandedGroup === item.to;
            const sectionId = `arena-rail-submenu-${item.to.slice(1)}`;
            return <div className={`nova-rail-group${open ? " is-open" : ""}`} key={item.to}>
              <div className="nova-rail-group-heading">
                <NavigationLink item={item} groupChildren={children} {...navProps} />
                <button className="nova-rail-group-toggle" type="button" aria-label={`${open ? "Свернуть" : "Развернуть"} раздел «${item.label}»`} aria-expanded={open} aria-controls={sectionId} onClick={() => setExpandedGroup(open ? null : item.to)}>
                  <CaretDownIcon size={17} aria-hidden="true" />
                </button>
              </div>
              {open && <div className="nova-rail-submenu" id={sectionId}>{children.map(child => <NavigationLink key={child.to} item={child} {...navProps} />)}</div>}
            </div>;
          })}
          <span className="nova-rail-divider" aria-hidden="true" />
          {links.map((item) => <NavigationLink key={item.to} item={item} compact={railCompact} {...navProps} />)}
        </nav>
      </aside>
      <SupportDesk placement="sidebar" />

      <div className="nova-page-wrap">
        <div className="nova-account-actions" aria-label="Профиль">
          <NavLink to="/feed?section=messages" className="nova-account-messages" aria-current={pathname === "/feed" && communitySection(search) === "messages" ? "page" : false} aria-label={unreadMessageCount ? `Сообщения: ${unreadMessageCount} непрочитанных` : "Сообщения"} title="Сообщения"><ChatCircleDotsIcon size={22} aria-hidden="true" />{unreadMessageCount > 0 && <span>{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>}</NavLink>
          <NavLink to="/feed?section=notifications" className="nova-account-notifications" aria-label={unreadSocialCount ? `Уведомления сообщества: ${unreadSocialCount} непрочитанных` : "Уведомления сообщества"}><BellIcon size={22} aria-hidden="true" />{unreadSocialCount > 0 && <span>{unreadSocialCount > 99 ? "99+" : unreadSocialCount}</span>}</NavLink>
          <ProfileWorkspaceMenu onSignOut={signOut}>
            <UserAvatar avatarCode={user?.avatar_code} frameCode={user?.frame_code} userId={user?.id} size="xs" name="Мой профиль" />
          </ProfileWorkspaceMenu>
        </div>
        {messagesOpen && <MessagesOverlay onClose={closeMessages} />}
        {notificationsOpen && <NotificationsOverlay onClose={closeNotifications} />}
        <main className={`nova-content${home ? " nova-content-home" : ""}${stories ? " nova-content-stories" : ""}${community ? " nova-content-community" : ""}`} id="main-content">
          {home || stories || community ? <Suspense fallback={<div className="p-8 text-slate-300" role="status">Загрузка раздела…</div>}><Outlet /></Suspense> : <ProductPage pathname={pathname}>
            <Suspense fallback={<div className="p-8 text-slate-300" role="status">Загрузка раздела…</div>}><Outlet /></Suspense>
          </ProductPage>}
        </main>
      </div>

      <nav className="nova-mobile-nav" aria-label="Мобильная навигация">
        {mobilePrimary.map((item) => <NavigationLink key={item.to} item={item} mobile {...navProps} />)}
      </nav>
    </div>
  );
}
