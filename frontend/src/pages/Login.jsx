import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import LoginWorld from "../design/LoginWorld.jsx";
import { useEnvironmentPreferences } from "../environment2d/backgroundMotionPreferences.js";

function safeReturnPath(value) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin || ["/", "/login", "/register"].includes(target.pathname)) return "/app";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return "/app"; }
}

export default function Login({ initialMode = "login" }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = safeReturnPath(params.get("next") || "/app");
  const authQuery = params.has("next") ? `?next=${encodeURIComponent(nextPath)}` : "";
  const mode = initialMode;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forestPreferences] = useEnvironmentPreferences();

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: { username, password },
        auth: false,
      });
      login(data);
      navigate(data.is_admin ? "/admin" : nextPath, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arena-auth-page">
      <LoginWorld motionMode={forestPreferences.motion} />
      <section className="arena-auth-intro">
        <Link className="arena-auth-home-link" to="/">← На главную</Link>
        <div className="arena-auth-brand"><span>А</span><b>АРЕНА<br />ПЕРЕГОВОРОВ</b></div>
        <span className="arena-kicker">ТРЕНИРОВОЧНАЯ СРЕДА</span>
        <h1>Сложные разговоры<br />становятся понятнее</h1>
        <p>Практикуйте переговоры с человеком или ИИ, замечайте свои решения и получайте предметный разбор.</p>
      </section>
      <form className="arena-auth-card" onSubmit={submit}>
        <span className="arena-kicker">ЛИЧНОЕ ПРОСТРАНСТВО</span>
        <h2>{mode === "login" ? "С возвращением" : "Создайте профиль"}</h2>
        <p>{nextPath !== "/app" ? mode === "register" ? "Создайте профиль — затем откроется выбранный раздел." : "Войдите — затем откроется выбранный раздел." : mode === "login" ? "Войдите, чтобы продолжить тренировку." : "Достаточно имени и пароля — остальное настроите позже."}</p>
        <div className="arena-auth-tabs" role="tablist" aria-label="Способ входа">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => navigate(`/login${authQuery}`)}>Вход</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => navigate(`/register${authQuery}`)}>Регистрация</button>
        </div>
        <label>Логин<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <div className="arena-auth-password-row"><label htmlFor="arena-password">Пароль</label><span className="arena-auth-password"><input id="arena-password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button></span></div>
        {error && <div className="arena-auth-error" role="alert">{error}</div>}
        <button className="arena-auth-submit" disabled={busy} aria-busy={busy}>{busy ? "Проверяем данные…" : mode === "register" ? "Создать профиль" : "Войти"} <span aria-hidden="true">→</span></button>
      </form>
    </div>
  );
}
