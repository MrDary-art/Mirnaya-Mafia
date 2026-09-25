import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import LoginWorld from "../design/LoginWorld.jsx";

const START_AVATARS = [["avatar_analyst", "Аналитик"], ["avatar_diplomat", "Дипломат"], ["avatar_manager", "Менеджер"], ["avatar_researcher", "Исследователь"], ["avatar_mediator", "Медиатор"], ["avatar_beginner", "Стратег-новичок"]];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [avatarCode, setAvatarCode] = useState("avatar_analyst");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "login" ? { username, password } : { username, password, avatar_code: avatarCode },
        auth: false,
      });
      login(data);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arena-auth-page">
      <LoginWorld />
      <section className="arena-auth-intro">
        <div className="arena-auth-brand"><span>✳</span><b>АРЕНА<br />ПЕРЕГОВОРОВ</b></div>
        <span className="arena-kicker">ТРЕНИРОВОЧНАЯ СРЕДА</span>
        <h1>Сложные разговоры<br />становятся понятнее</h1>
        <p>Практикуйте переговоры с человеком или ИИ, замечайте свои решения и получайте предметный разбор.</p>
        <div className="arena-auth-points"><span>✓ Комнаты 1 на 1</span><span>✓ Голос и видео</span><span>✓ Отчёт после встречи</span></div>
      </section>
      <form className="arena-auth-card" onSubmit={submit}>
        <span className="arena-kicker">ЛИЧНОЕ ПРОСТРАНСТВО</span>
        <h2>{mode === "login" ? "С возвращением" : "Создайте профиль"}</h2>
        <p>{mode === "login" ? "Войдите, чтобы продолжить тренировку." : "Достаточно имени и пароля — остальное настроите позже."}</p>
        <div className="arena-auth-tabs" role="tablist" aria-label="Способ входа">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Вход</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Регистрация</button>
        </div>
        <label>Логин<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <div className="arena-auth-password-row"><label htmlFor="arena-password">Пароль</label><span className="arena-auth-password"><input id="arena-password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button></span></div>
        {mode === "register" && <label>Стартовый профиль<select value={avatarCode} onChange={(event) => setAvatarCode(event.target.value)}>{START_AVATARS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>}
        {error && <div className="arena-auth-error" role="alert">{error}</div>}
        <button className="arena-auth-submit" disabled={busy} aria-busy={busy}>{busy ? "Проверяем данные…" : "Продолжить"} <span aria-hidden="true">→</span></button>
        <small>Демодоступ для просмотра: demo / demo</small>
      </form>
    </div>
  );
}
