import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import "./profile-workspace-menu.css";

export default function ProfileWorkspaceMenu({ children, companyId, settingsPath, triggerClassName = "nova-account-avatar", onSignOut, allowSwitch = true, businessMode = Boolean(companyId), workspaceLabel, profilePath }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate(), location = useLocation();
  const [open, setOpen] = useState(false), [workspaces, setWorkspaces] = useState(null), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const root = useRef(null), trigger = useRef(null), skipFocus = useRef(false), closeTimer = useRef(null);
  const menuId = useId();
  function cancelScheduledClose() {
    if (closeTimer.current == null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }
  function openMenu() { cancelScheduledClose(); setOpen(true); }
  function close() { cancelScheduledClose(); setOpen(false); }
  function scheduleClose() {
    cancelScheduledClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      if (!root.current?.contains(document.activeElement)) setOpen(false);
    }, 180);
  }
  useEffect(() => { cancelScheduledClose(); setOpen(false); }, [location.pathname]);
  useEffect(() => () => cancelScheduledClose(), []);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (!open || !user?.id || !allowSwitch) return;
    let active = true;
    setError("");
    api("/api/company/context").then(value => { if (active) setWorkspaces(value); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [open, user?.id, allowSwitch, reload]);
  const companies = (workspaces?.companies || []).filter(company => company.status === "ACTIVE");
  const pendingInvitations = workspaces?.pending_invitations || [];
  function signOut() {
    close();
    if (onSignOut) onSignOut();
    else { logout(); navigate("/", { replace: true }); }
  }
  return <div className={`workspace-profile${businessMode ? " workspace-profile-business" : " nova-account-profile"}`} ref={root}
    onMouseEnter={openMenu} onMouseLeave={scheduleClose}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); skipFocus.current = true; trigger.current?.focus(); skipFocus.current = false; } }}>
    <button type="button" className={triggerClassName} ref={trigger} aria-label="Открыть меню профиля и компаний" aria-expanded={open} aria-controls={menuId}
      onFocus={() => { if (!skipFocus.current) openMenu(); }} onClick={openMenu}>{children}</button>
    {open && <nav className="workspace-profile-dropdown" id={menuId} aria-label="Меню профиля и компаний" onMouseEnter={openMenu}>
      <div className="workspace-profile-identity"><b>{user?.display_name || user?.username}</b><small>{workspaceLabel || (companyId ? "Рабочее пространство компании" : "Личная Арена")}</small></div>
      <Link className="workspace-profile-action" to={profilePath || (companyId ? `/business/${companyId}/profile` : "/profile")} onClick={close}><Icon name="circle-user-round" size={18}/><span>Перейти в профиль</span></Link>
      {settingsPath && <Link className="workspace-profile-action" to={settingsPath} onClick={close}><Icon name="settings" size={18}/><span>Настройки компании</span></Link>}
      {allowSwitch && <div className="workspace-profile-spaces"><span className="workspace-profile-label">Переключить пространство</span>
        <Link className="workspace-profile-action" to="/app" aria-current={!businessMode ? "page" : undefined} onClick={close}><Icon name="layout-grid" size={18}/><span>Личная Арена</span>{!businessMode && <Icon name="check" size={16}/>}</Link>
        {(!workspaces || !companies.length) && <Link className="workspace-profile-action" to="/business/continue" aria-current={businessMode && !companyId ? "page" : undefined} onClick={close}><Icon name="users" size={18}/><span>Арена для бизнеса</span>{businessMode && !companyId && <Icon name="check" size={16}/>}</Link>}
        {companies.map(company => <Link className="workspace-profile-action" key={company.company_id} to={`/business/${company.company_id}/overview`} aria-current={String(company.company_id) === String(companyId) ? "page" : undefined} onClick={close}><Icon name="users" size={18}/><span>{company.name}<small>{company.role_label || "Компания"}</small></span>{String(company.company_id) === String(companyId) && <Icon name="check" size={16}/>}</Link>)}
        {!workspaces && !error && <p role="status">Загружаем компании…</p>}
        {workspaces && !companies.length && <p>Активных компаний пока нет.</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" className="workspace-profile-action" onClick={() => setReload(value => value + 1)}>Повторить загрузку компаний</button></div>}
        {pendingInvitations.length > 0 && <div className="workspace-profile-invitations"><span className="workspace-profile-label">Приглашения</span>{pendingInvitations.map(invite => <Link key={invite.membership_id} className="workspace-profile-action workspace-profile-invitation" to="/business/workspaces?choose=1" onClick={close}><Icon name="bell" size={18}/><span><b>«{invite.company?.name || "Компания"}»</b><small>{[invite.job_title, invite.role].filter(Boolean).join(" · ") || "Ожидает вашего решения"}</small></span><em>Новое</em></Link>)}</div>}
      </div>}
      <button className="workspace-profile-action workspace-profile-signout" type="button" onClick={signOut}><Icon name="log-out" size={18}/><span>Выйти из аккаунта</span></button>
    </nav>}
  </div>;
}
