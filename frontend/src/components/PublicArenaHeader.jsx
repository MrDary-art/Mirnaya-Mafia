import { Link } from "react-router-dom";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import "../pages/public-arena-header.css";

function ArenaMark({ audience }) {
  return <Link className="public-arena-brand" to={audience === "business" ? "/business" : "/"} aria-label="Арена переговоров — главная">
    <img src="/assets/arena-owl-logo.png" width="38" height="38" alt="" />
    <span>АРЕНА<small>ПЕРЕГОВОРОВ</small></span>
  </Link>;
}

function AudienceSwitch({ audience, onNavigate }) {
  return <nav className="public-arena-switch" aria-label="Выбор пространства">
    <Link className={audience === "personal" ? "is-active" : ""} to="/" aria-current={audience === "personal" ? "page" : undefined} onClick={onNavigate}>Для себя</Link>
    <Link className={audience === "business" ? "is-active" : ""} to="/business" aria-current={audience === "business" ? "page" : undefined} onClick={onNavigate}>Для компаний</Link>
  </nav>;
}

function AccountActions({ audience, onOpenAuth, onNavigate, mobile = false }) {
  const open = (mode) => (event) => {
    onNavigate?.();
    onOpenAuth?.(mode, event.currentTarget);
  };
  const className = mobile ? "public-arena-mobile-actions" : "public-arena-account-actions";
  return <div className={className}>
    {audience === "personal" ? <>
      <button type="button" className="public-arena-login" onClick={open("login")}>Войти</button>
      <button type="button" className="public-arena-register" onClick={open("register")}>Создать аккаунт</button>
    </> : <>
      <Link className="public-arena-login" to="/business/login" onClick={onNavigate}>Войти</Link>
      <Link className="public-arena-register" to="/business/register?next=%2Fbusiness%2Fcreate" onClick={onNavigate}>Создать компанию</Link>
    </>}
  </div>;
}

export default function PublicArenaHeader({
  audience,
  sections = [],
  activeSection = "",
  mobileMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenAuth,
  menuButtonRef,
}) {
  const sectionLinks = (className) => sections.map(({ id, label }) => <a key={id} className={`${className}${activeSection === id ? " is-active" : ""}`} href={`#${id}`} onClick={onCloseMenu} aria-current={activeSection === id ? "location" : undefined}>{label}</a>);
  const menuLabel = mobileMenuOpen ? "Закрыть меню" : "Открыть меню";

  return <header className="public-arena-header">
    <div className="public-arena-header-inner">
      <ArenaMark audience={audience} />
      <AudienceSwitch audience={audience} onNavigate={onCloseMenu} />
      {sections.length > 0 && <nav className="public-arena-section-nav" aria-label="Разделы страницы">{sectionLinks("public-arena-section-link")}</nav>}
      <AccountActions audience={audience} onOpenAuth={onOpenAuth} />
      <button ref={menuButtonRef} className="public-arena-menu-button" type="button" aria-label={menuLabel} aria-expanded={mobileMenuOpen} aria-controls="public-arena-mobile-menu" onClick={onToggleMenu}>
        {mobileMenuOpen ? <XIcon size={21} aria-hidden="true" /> : <ListIcon size={21} aria-hidden="true" />}
      </button>
    </div>
    {mobileMenuOpen && <nav id="public-arena-mobile-menu" className="public-arena-mobile-menu" aria-label="Мобильная навигация">
      <AudienceSwitch audience={audience} onNavigate={onCloseMenu} />
      {sections.length > 0 && <div className="public-arena-mobile-sections">{sectionLinks("public-arena-mobile-link")}</div>}
      <AccountActions audience={audience} onOpenAuth={onOpenAuth} onNavigate={onCloseMenu} mobile />
    </nav>}
  </header>;
}
