import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Icon from "./components/Icon.jsx";

const navigation = [
  ["/", "house", "Главная", true],
  ["/ai", "bot", "ИИ-диалог"],
  ["/rooms", "users", "Онлайн 1 на 1"],
  ["/scenarios", "layout-grid", "Сценарии"],
  ["/training", "graduation-cap", "Обучение"],
  ["/analytics", "brain", "Аналитика"],
  ["/history", "history", "История"],
  ["/people", "user-round-search", "Друзья"],
  ["/profile", "circle-user-round", "Профиль"],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = user?.is_admin ? [...navigation, ["/admin", "shield-check", "Админ"]] : navigation;

  function signOut() {
    logout();
    navigate("/login");
  }

  return (
    <div className="arena-shell">
      <aside className="arena-sidebar">
        <button className="arena-brand" onClick={() => navigate("/")} aria-label="На главную">
          <span className="arena-brand-mark"><Icon name="sparkles" size={24} /></span>
          <span>АРЕНА<br /><b>ПЕРЕГОВОРОВ</b></span>
        </button>
        <nav aria-label="Основная навигация">
          {items.map(([to, icon, label, exact]) => (
            <NavLink key={to} to={to} end={Boolean(exact)} className={({ isActive }) => `arena-nav-item ${isActive ? "active" : ""}`}>
              <span aria-hidden="true"><Icon name={icon} size={19} /></span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="arena-account">
          <NavLink to="/profile" className="arena-avatar" aria-label="Открыть профиль">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
          <NavLink to="/profile" className="arena-account-copy">
            <strong>{user?.username || "Профиль"}</strong>
            <small><Icon name="star" size={11} /> {user?.stars ?? 0} · уровень {user?.level ?? 1}</small>
          </NavLink>
          <button className="arena-logout" onClick={signOut} title="Выйти" aria-label="Выйти"><Icon name="log-out" size={18} /></button>
        </div>
      </aside>
      <div className="arena-main-area">
        <header className="arena-mobile-header">
          <button className="arena-brand" onClick={() => navigate("/")}><span className="arena-brand-mark"><Icon name="sparkles" size={24} /></span><b>АРЕНА ПЕРЕГОВОРОВ</b></button>
          <NavLink to="/profile" className="arena-avatar">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
        </header>
        <main className="arena-content"><Outlet /></main>
        <nav className="arena-mobile-nav" aria-label="Мобильная навигация">
          {items.slice(0, 5).map(([to, icon, label, exact]) => (
            <NavLink key={to} to={to} end={Boolean(exact)} className={({ isActive }) => isActive ? "active" : ""}>
              <span><Icon name={icon} size={19} /></span><small>{label}</small>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
