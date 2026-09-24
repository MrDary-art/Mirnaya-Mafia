import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Icon from "../components/Icon.jsx";

const START_AVATARS = [["avatar_analyst", "Аналитик"], ["avatar_diplomat", "Дипломат"], ["avatar_manager", "Менеджер"], ["avatar_researcher", "Исследователь"], ["avatar_mediator", "Медиатор"], ["avatar_beginner", "Стратег-новичок"]];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [avatarCode, setAvatarCode] = useState("avatar_analyst");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
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
    }
  }

  return (
    <div className="arena-auth-page">
      <section className="arena-auth-intro">
        <div className="arena-auth-brand"><span><Icon name="sparkles" size={26} /></span><b>АРЕНА<br />ПЕРЕГОВОРОВ</b></div>
        <span className="arena-kicker">ТРЕНИРОВОЧНАЯ СРЕДА</span>
        <h1>Сложные разговоры<br />становятся понятнее</h1>
        <p>Практикуйте переговоры с человеком или ИИ, замечайте свои решения и получайте предметный разбор.</p>
        <div className="arena-auth-points"><span className="ui-icon-label"><Icon name="check" size={16} />Комнаты 1 на 1</span><span className="ui-icon-label"><Icon name="check" size={16} />Голос и видео</span><span className="ui-icon-label"><Icon name="check" size={16} />Отчёт после встречи</span></div>
      </section>
      <form className="arena-auth-card" onSubmit={submit}>
        <span className="arena-kicker">ЛИЧНОЕ ПРОСТРАНСТВО</span>
        <h2>{mode === "login" ? "С возвращением" : "Создайте профиль"}</h2>
        <p>{mode === "login" ? "Войдите, чтобы продолжить тренировку." : "Достаточно имени и пароля — остальное настроите позже."}</p>
        <div className="arena-auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Вход</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Регистрация</button>
        </div>
        <label>Логин<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {mode === "register" && <label>Стартовый профиль<select value={avatarCode} onChange={(event) => setAvatarCode(event.target.value)}>{START_AVATARS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>}
        {error && <div className="arena-auth-error">{error}</div>}
        <button className="arena-auth-submit">Продолжить <span>→</span></button>
        <small>Для просмотра: demo / demo · администратор: admin / admin</small>
      </form>
    </div>
  );
}
