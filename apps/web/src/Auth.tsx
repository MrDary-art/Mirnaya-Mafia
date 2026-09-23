import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { api } from "./api";

type User = { id: string; email: string };
type Props = { onAuth: (user: User, csrf: string) => void; needsOwner: boolean };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Auth({ onAuth, needsOwner }: Props) {
  const [register, setRegister] = useState(needsOwner);
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const value = identity.trim().toLowerCase();
    if (value === "demo" && !register) {
      setError("Для демо-входа используйте адрес demo@example.com.");
      return;
    }
    if (!value || (register || value.includes("@")) && !emailPattern.test(value)) {
      setError("Введите корректный адрес электронной почты, например demo@example.com.");
      return;
    }
    if (!password) {
      setError("Введите пароль.");
      return;
    }
    if (register && password.length < 12) {
      setError("Пароль для нового аккаунта должен содержать не менее 12 символов.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User; csrf: string }>(
        register ? "/auth/register" : "/auth/login",
        "POST",
        register ? { email: value, password } : { login: value, password },
      );
      onAuth(result.user, result.csrf);
      nav("/today");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-page">
    <header className="public-header">
      <Link className="brand" to="/"><span className="brand-mark">✳</span><span>АРЕНА<br/><b>ПЕРЕГОВОРОВ</b></span></Link>
      <Link to="/" className="text-link"><ChevronLeft size={17}/> На главную</Link>
    </header>
    <div className="auth-layout">
      <div className="auth-intro">
        <span className="kicker">НАЧАЛО ПУТИ</span>
        <h1>Хорошие переговоры<br/>начинаются с практики.</h1>
        <p>Первая короткая миссия уже ждёт вас. Никакой специальной подготовки не требуется.</p>
        <div className="auth-quote">«Ошибаться здесь безопасно. Главное — понять, что попробовать иначе.»</div>
      </div>
      <form className="auth-card" onSubmit={submit} noValidate>
        <span className="card-number">01 — ДОСТУП</span>
        <h2>{needsOwner ? "Создайте владельца" : register ? "Создать аккаунт" : "С возвращением"}</h2>
        <p>{needsOwner ? "Пароль локального владельца создаётся при первом запуске." : register ? "Один шаг до вашей первой тренировки." : "Продолжите с того места, где остановились."}</p>
        <label>{register ? "Электронная почта" : "Электронная почта или логин"}
          <input type={register ? "email" : "text"} value={identity} onChange={event => setIdentity(event.target.value)} autoComplete={register ? "email" : "username"} placeholder={register ? "name@example.com" : "demo@example.com или pinggos"}/>
        </label>
        <label>Пароль
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "Не менее 12 символов" : "Ваш пароль"}/>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy} className="button primary full">{busy ? "Подождите…" : register ? "Создать и начать" : "Войти"}<ArrowRight size={18}/></button>
        {!needsOwner && <button className="switch-auth" type="button" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}</button>}
      </form>
    </div>
  </div>;
}
