import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070b14]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button onClick={() => nav("/")} className="text-left">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Симулятор</div>
            <div className="text-lg font-extrabold neon">Арена Переговоров</div>
          </button>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <NavLink to="/" className={({ isActive }) => (isActive ? "text-cyan-300" : "")}>
              Старт
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => (isActive ? "text-cyan-300" : "")}>
              История
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "text-cyan-300" : "")}>
              Кабинет
            </NavLink>
            {user?.is_admin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "text-cyan-300" : "")}>
                Админ
              </NavLink>
            )}
            <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-cyan-200">
              {user?.username} · ★ {user?.stars ?? 0}
            </span>
            <button
              className="text-slate-400 hover:text-white"
              onClick={() => {
                logout();
                nav("/login");
              }}
            >
              Выйти
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
