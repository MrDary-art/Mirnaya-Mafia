import { Suspense, useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import Icon from "../components/Icon.jsx";
import {api} from "../api.js";
import "./admin-shell.css";

const sections = [
  ["/admin/analytics", "Пользователи"],
  ["/admin/operations", "Поддержка"],
  ["/admin/council", "Совет решений"],
  ["/admin/settings", "Настройки"],
];
const supportTabs = [["/admin/stories", "Модерация"], ["/admin/operations", "Обращения"]];
const userTabs = [["/admin/analytics?view=users", "Пользователи"], ["/admin/analytics?view=overview", "Аналитика"], ["/admin/analytics?view=sessions", "Сессии и отчёты"], ["/admin/companies", "Компании"], ["/admin/business-leads", "Корпоративные заявки"]];

export default function AdminShell() {
  const { user, ready, logout } = useAuth();
  const { pathname, search } = useLocation();
  const [developerNotice,setDeveloperNotice]=useState(null);
  const [securityCount,setSecurityCount]=useState(0);
  useEffect(()=>{if(!user?.is_admin||user.must_change_password)return;let active=true;const load=()=>api("/api/admin/security/alerts").then(v=>active&&setSecurityCount(v.total)).catch(()=>{});load();const timer=setInterval(load,60000);return()=>{active=false;clearInterval(timer);};},[user?.id,user?.must_change_password]);
  useEffect(()=>{if(user?.is_admin&&!user.must_change_password&&pathname!=="/admin/settings")api("/api/admin/activity",{method:"POST",body:{path:pathname,view:new URLSearchParams(search).get("view")||""}}).catch(()=>{});},[pathname,search,user?.id,user?.must_change_password]);
  useEffect(()=>{if(!user?.is_admin||user.must_change_password)return;let active=true;const load=()=>api("/api/admin/support/developer-notifications").then(v=>active&&setDeveloperNotice(v)).catch(()=>{});load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer);};},[user?.is_admin,user?.must_change_password]);
  useEffect(() => { window.scrollTo({top:0,left:0,behavior:"instant"}); }, [pathname, search]);
  const support = supportTabs.some(([path]) => path === pathname);
  const users = ["/admin/analytics", "/admin/companies", "/admin/business-leads"].includes(pathname);
  const activeSection = support ? "/admin/operations" : users ? "/admin/analytics" : pathname;
  const view = new URLSearchParams(search).get("view") || "users";
  if (!ready) return <p role="status">Загружаем администрирование…</p>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  if (!user.is_admin) return <Navigate to="/app" replace />;
  if (user.must_change_password && pathname !== "/admin/settings") return <Navigate to="/admin/settings" replace />;
  return <div className="admin-shell">
    <a className="admin-skip" href="#admin-content">К содержимому</a>
    <header className="admin-masthead"><Link to="/admin" className="admin-brand" title="Дашборд · состояние сервера"><Icon name="shield-check" size={24}/><span>Арена<span>Администрирование</span></span></Link>{!user.must_change_password && <Link className="admin-dashboard-home" to="/admin" aria-current={pathname === "/admin" ? "page" : undefined}><Icon name="layout-grid" size={18}/>Дашборд</Link>}<div className="admin-account">{securityCount>0&&<Link className="admin-security-notice" to="/admin/settings?tab=security">Безопасность: {securityCount}</Link>}{developerNotice?.waiting>0&&<Link className="admin-developer-notice" to="/admin/operations?queue=developer"><Icon name="bell" size={15}/>Разработчику: {developerNotice.waiting}{developerNotice.count>0?" · новое":""}</Link>}<span>{user.username}</span><button type="button" onClick={async () => { try { await api("/api/admin/activity",{method:"POST",body:{path:pathname,view:"logout"}}); } finally { logout(); window.location.assign("/"); } }}>Выйти<Icon name="log-out" size={16}/></button></div></header>
    <nav className="admin-topnav" aria-label="Разделы администратора">{sections.filter(([path]) => !user.must_change_password || path === "/admin/settings").map(([path, title]) => <Link key={path} to={path} target={path === "/admin" ? undefined : "_blank"} rel={path === "/admin" ? undefined : "noopener"} aria-current={activeSection === path ? "page" : undefined}>{title}{path !== "/admin" && <Icon name="arrow-up-right" size={13}/>}</Link>)}</nav>
    {(support || users) && <nav className="admin-subnav" aria-label={support ? "Разделы поддержки" : "Разделы пользователей"}>{(support ? supportTabs : userTabs).map(([path, title]) => { const [base, query] = path.split("?"); const active = pathname === base && (!query || new URLSearchParams(query).get("view") === view); return <Link key={path} to={path} aria-current={active ? "page" : undefined}>{title}</Link>; })}</nav>}
    <div className="admin-content" id="admin-content" tabIndex={-1}><Suspense fallback={<p className="admin-loading" role="status">Загружаем раздел…</p>}><Outlet /></Suspense></div>
    <footer className="admin-footer">Арена переговоров · Панель администратора<span>Разделы открываются в новых вкладках</span></footer>
  </div>;
}
