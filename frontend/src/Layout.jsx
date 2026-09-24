import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";

const navigation = [
  ["/", "⌂", "Главная", true],
  ["/ai", "✦", "ИИ-диалог"],
  ["/rooms", "◎", "Онлайн 1 на 1"],
  ["/scenarios", "◫", "Сценарии"],
  ["/training", "↗", "Обучение"],
  ["/history", "◷", "История"],
  ["/people", "♧", "Друзья"],
  ["/profile", "○", "Профиль"],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = user?.is_admin ? [...navigation, ["/admin", "◇", "Админ"]] : navigation;

  function signOut() {
    logout();
    navigate("/login");
  }

  return (
    <div className="arena-shell">
      <aside className="arena-sidebar">
        <button className="arena-brand" onClick={() => navigate("/")} aria-label="На главную">
          <span className="arena-brand-mark">✳</span>
          <span>АРЕНА<br /><b>ПЕРЕГОВОРОВ</b></span>
        </button>
        <nav aria-label="Основная навигация">
          {items.map(([to, icon, label, exact]) => (
            <NavLink key={to} to={to} end={Boolean(exact)} className={({ isActive }) => `arena-nav-item ${isActive ? "active" : ""}`}>
              <span aria-hidden="true">{icon}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="arena-account">
          <NavLink to="/profile" className="arena-avatar" aria-label="Открыть профиль">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
          <NavLink to="/profile" className="arena-account-copy">
            <strong>{user?.username || "Профиль"}</strong>
            <small>★ {user?.stars ?? 0} · уровень {user?.level ?? 1}</small>
          </NavLink>
          <button className="arena-logout" onClick={signOut} title="Выйти" aria-label="Выйти">↪</button>
        </div>
      </aside>
      <div className="arena-main-area">
        <header className="arena-mobile-header">
          <button className="arena-brand" onClick={() => navigate("/")}><span className="arena-brand-mark">✳</span><b>АРЕНА ПЕРЕГОВОРОВ</b></button>
          <NavLink to="/profile" className="arena-avatar">{(user?.username || "А").slice(0, 1).toUpperCase()}</NavLink>
        </header>
        <main className="arena-content"><Outlet /></main>
        <nav className="arena-mobile-nav" aria-label="Мобильная навигация">
          {items.slice(0, 5).map(([to, icon, label, exact]) => (
            <NavLink key={to} to={to} end={Boolean(exact)} className={({ isActive }) => isActive ? "active" : ""}>
              <span>{icon}</span><small>{label}</small>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
