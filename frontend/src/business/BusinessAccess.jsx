import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import Login from "../pages/Login.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import { safeBusinessNext } from "./navigation.js";
import "../pages/landing.css";
import "./business.css";

function accessTarget(params) {
  const invitation = params.get("invitation");
  if (invitation) return `/business/workspaces?invitation=${encodeURIComponent(invitation)}`;
  return safeBusinessNext(params.get("next"), "/business/continue");
}

export default function BusinessAccess() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = location.pathname.endsWith("/register") || params.get("mode") === "register" ? "register" : "login";
  const target = accessTarget(params);

  if (ready && user) return <Navigate to={target} replace />;

  return <div className="business-auth-page">
    <a href="#business-auth-main" className="business-skip">К содержимому</a>
    <header className="business-auth-header">
      <BusinessBrand />
      <nav className="business-auth-header-links" aria-label="Выбор кабинета"><Link to="/?auth=login">Личный вход</Link><Link to="/business">О корпоративной Арене</Link></nav>
    </header>
    <main id="business-auth-main" className="business-auth-layout">
      <section className="business-auth-copy" aria-labelledby="business-auth-heading">
        <span className="business-auth-eyebrow">Кабинет компании</span>
        <h1 id="business-auth-heading">Обучайте команду переговорам в одном пространстве.</h1>
        <p>Назначайте практику, отслеживайте прогресс и возвращайтесь к результатам тогда, когда это нужно команде.</p>
        <ul>
          <li><span>01</span> Создайте рабочее пространство</li>
          <li><span>02</span> Пригласите сотрудников</li>
          <li><span>03</span> Назначьте первую практику</li>
        </ul>
      </section>
      <section className="business-auth-form" aria-label={mode === "login" ? "Вход в кабинет компании" : "Создание профиля для кабинета компании"}>
        {!ready && <p className="business-auth-loading" role="status">Открываем кабинет…</p>}
        {ready && <Login
          standalone
          initialMode={mode}
          redirectTo={target}
          brandLabel="КАБИНЕТ КОМПАНИИ"
          loginTitle="Войдите в кабинет компании"
          registerTitle="Создайте профиль администратора"
          description={mode === "login"
            ? "Войдите, чтобы открыть рабочее пространство вашей компании."
            : "Создайте профиль администратора — затем вы сразу настроите рабочее пространство компании."}
          onModeChange={(nextMode) => navigate(`/business/${nextMode === "register" ? "register" : "login"}?${new URLSearchParams({ next: target }).toString()}`, { replace: true })}
        />}
        <p className="business-auth-footnote">Личные тренировки остаются в вашей личной Арене. Компания видит только корпоративные задания и их результаты.</p>
      </section>
    </main>
  </div>;
}
